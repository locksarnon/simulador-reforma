import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { limparDocumento } from '../certificados/certificado-pfx';
import { CertificadosService, MaterialCertificado } from '../certificados/certificados.service';
import { UF_CODIGOS } from '../importacao-xml/shared/xml-utils';
import { PrismaService } from '../prisma/prisma.service';
import { RepositorioXmlService } from '../repositorio-xml/repositorio-xml.service';
import { dentroDaJanela, descreverPeriodo, janelaDoPeriodo, PeriodoBusca, periodoDe, periodoValido, proximaAbertura } from './captura-janela';
import { decidirPasso, ESPERA_SEFAZ, esperaAposFalha, HORA, liberadoEm, normalizarNsu, nsuMaior, nsuValido, Passo } from './captura-regras';
import { Ambiente, DistribuicaoDfeCliente, ErroDeComunicacao, TipoCaptura } from './distribuicao-dfe.cliente';
import { ErroCienciaParcial, ManifestacaoCliente, ResultadoCiencia } from './manifestacao.cliente';

/** Documentos que o coletor já sabe buscar. O MDF-e entra depois. */
export const TIPOS_DISPONIVEIS: TipoCaptura[] = ['NFE', 'CTE', 'NFSE'];

const MAX_LOTES_POR_EXECUCAO = 60;
const TRAVA_MS = 30 * 60_000;
const MAX_CONFIGS_POR_RODADA = 40;
const ZEROS = '000000000000000';
/** A Ciência só cabe até 10 dias da autorização da NF-e (Ajuste SINIEF 07/05, cláusula 15-C, § 4º); 1 dia de folga contra rejeição 596. */
const PRAZO_CIENCIA_MS = 9 * 24 * HORA;
const MAX_CIENCIAS_POR_EXECUCAO = 100;
const NOVA_TENTATIVA_CIENCIA_MS = 6 * HORA;

const UF_POR_SIGLA: Record<string, string> = Object.fromEntries(Object.entries(UF_CODIGOS).map(([cod, sigla]) => [sigla, cod]));

const resumoDocs = (novos: number, completados: number, recebidos: number, ignorados = 0, motivoIgnorado?: string) => {
  const partes: string[] = [];
  if (novos || !completados) partes.push(`${novos} novo(s)`);
  if (completados) partes.push(`${completados} completado(s) com o XML`);
  const repetidos = recebidos - novos - completados - ignorados;
  if (repetidos > 0) partes.push(`${repetidos} já existiam`);
  // Documento que o repositório não reconhece não pode passar por "já existia": a pessoa precisa ver que ficou de fora.
  if (ignorados > 0) partes.push(`${ignorados} ignorado(s) (${motivoIgnorado || 'não reconhecido'})`);
  return `${partes.join(', ')}.`;
};

/** Mensagem curta para a tela: o erro do Prisma traz argumentos e detalhes internos, que ficam só no log do servidor. */
const mensagemSegura = (e: unknown): string => {
  if (/^PrismaClient/.test(String((e as { name?: string })?.name ?? ''))) return 'erro ao gravar os dados (detalhes no log do servidor)';
  return String((e as { message?: string })?.message ?? 'erro desconhecido').replace(/\s+/g, ' ').trim().slice(0, 240);
};

const hhmm = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

/**
 * Coletor da Distribuição de DF-e: consulta a SEFAZ com o certificado A1 de cada cliente, respeita as janelas de espera do serviço,
 * guarda os XML no repositório da empresa e controla o último NSU de cada empresa e tipo de documento.
 * Só roda com certificado ativo e captura ativada por um administrador.
 */
@Injectable()
export class CapturaXmlService {
  private readonly logger = new Logger(CapturaXmlService.name);
  /** Pausa entre consultas seguidas da mesma execução (gentileza com o serviço da SEFAZ). Os testes zeram. */
  pausaEntreConsultasMs = 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly certificados: CertificadosService,
    private readonly repositorio: RepositorioXmlService,
    private readonly cliente: DistribuicaoDfeCliente,
    private readonly manifestacao: ManifestacaoCliente,
  ) {}

  private pausa = (ms = this.pausaEntreConsultasMs) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

  private async empresa(empresaId: string) {
    const e = await this.prisma.empresa.findUnique({ where: { id: empresaId } }).catch(() => null);
    if (!e) throw new NotFoundException('Empresa não localizada.');
    return e;
  }

  // ── Estado e configuração ───────────────────────────────────────────

  async status(empresaId: string) {
    const empresa = await this.empresa(empresaId);
    const agora = new Date();
    const [cert, cfgEmpresa, cfgs, execucoes] = await Promise.all([
      this.prisma.certificadoDigital.findFirst({ where: { empresa_id: empresaId, status: 'ATIVO' }, orderBy: { createdAt: 'desc' }, select: { valido_ate: true, documento: true } }),
      this.prisma.xmlEmpresaConfig.findUnique({ where: { empresa_id: empresaId } }),
      this.prisma.capturaXmlConfig.findMany({ where: { empresa_id: empresaId } }),
      this.prisma.capturaXmlExecucao.findMany({ where: { empresa_id: empresaId }, orderBy: { iniciado_em: 'desc' }, take: 10 }),
    ]);
    const periodo = periodoDe(cfgEmpresa?.periodo_busca);
    const janela = janelaDoPeriodo(periodo);
    const [semCiencia, comCiencia, naoAplicaveis] = await Promise.all([
      this.prisma.documentoXml.count({ where: { empresa_id: empresaId, tipo: 'NFE', conteudo: 'RESUMO', ciencia_status: null } }),
      this.prisma.documentoXml.count({ where: { empresa_id: empresaId, ciencia_status: { in: ['REGISTRADA', 'JA_REGISTRADA'] } } }),
      this.prisma.documentoXml.count({ where: { empresa_id: empresaId, ciencia_status: 'NAO_APLICAVEL' } }),
    ]);
    return {
      ciencia: {
        ativa: !!cfgEmpresa?.manifestar_ciencia,
        consentida_em: cfgEmpresa?.manifestacao_consentida_em ?? null,
        consentida_por: cfgEmpresa?.manifestacao_consentida_por ?? null,
        resumos_sem_ciencia: semCiencia,
        registradas: comCiencia,
        nao_aplicaveis: naoAplicaveis,
      },
      ambiente: cfgEmpresa?.ambiente ?? 'PRODUCAO',
      uf_autor: cfgEmpresa?.uf_autor ?? (empresa.uf ? UF_POR_SIGLA[empresa.uf.toUpperCase()] ?? null : null),
      requisitos: { certificado_ativo: !!cert && cert.valido_ate.getTime() > agora.getTime() },
      documento_certificado: cert?.documento ?? null,
      agendador_ativo: CapturaXmlService.agendadorLigado(),
      // Quando a busca automática pode consultar esta empresa. O botão "Capturar agora" não depende disso.
      periodo: {
        atual: periodo,
        texto: descreverPeriodo(periodo),
        aberto_agora: dentroDaJanela(agora, janela),
        opcoes: (['NOTURNO', 'DIURNO'] as PeriodoBusca[]).map((valor) => ({ valor, texto: descreverPeriodo(valor) })),
      },
      tipos: TIPOS_DISPONIVEIS.map((tipo) => {
        const c = cfgs.find((x) => x.tipo === tipo);
        const liberado = c ? liberadoEm(c, agora) : null;
        return {
          tipo,
          ativo: !!c?.ativo,
          ultimo_nsu: c?.ultimo_nsu ?? ZEROS,
          max_nsu: c?.max_nsu ?? null,
          proxima_consulta_em: c?.proxima_consulta_em ?? null,
          bloqueado_ate: c?.bloqueado_ate ?? null,
          ultima_consulta_em: c?.ultima_consulta_em ?? null,
          ultimo_cstat: c?.ultimo_cstat ?? null,
          ultimo_motivo: c?.ultimo_motivo ?? null,
          em_execucao: !!c?.em_execucao_ate && c.em_execucao_ate.getTime() > agora.getTime(),
          liberado_em: liberado,
          // Quando a rotina automática volta a consultar: a espera da SEFAZ e o período da empresa, o que vier por último.
          proxima_automatica_em: CapturaXmlService.agendadorLigado() && c?.ativo ? proximaAbertura(liberado ?? agora, janela) : null,
        };
      }),
      execucoes,
    };
  }

  /** Período da busca automática desta empresa: NOTURNO (18:00 às 05:59) ou DIURNO (06:00 às 17:59), horário de Brasília. */
  async configurarPeriodo(empresaId: string, periodo: string, usuario: string) {
    await this.empresa(empresaId);
    if (!periodoValido(periodo)) throw new BadRequestException('Período inválido. Use NOTURNO ou DIURNO.');
    await this.prisma.$transaction([
      this.prisma.xmlEmpresaConfig.upsert({
        where: { empresa_id: empresaId },
        create: { empresa_id: empresaId, periodo_busca: periodo },
        update: { periodo_busca: periodo },
      }),
      this.prisma.auditoriaCertificado.create({ data: { empresa_id: empresaId, acao: 'CAPTURA_PERIODO', usuario, detalhe: descreverPeriodo(periodo) } }),
    ]);
    return this.status(empresaId);
  }

  /** Ambiente (produção ou homologação) e UF do interessado. Trocar o ambiente zera os NSU, que são independentes em cada ambiente, e desativa a captura. */
  async configurarAmbiente(empresaId: string, ambiente: Ambiente, ufAutor: string | undefined, usuario: string) {
    const empresa = await this.empresa(empresaId);
    if (!['PRODUCAO', 'HOMOLOGACAO'].includes(ambiente)) throw new BadRequestException('Ambiente inválido.');
    const uf = ufAutor ? String(ufAutor).trim() : null;
    if (uf && !Object.prototype.hasOwnProperty.call(UF_CODIGOS, uf)) throw new BadRequestException('UF do interessado inválida (use o código IBGE, por exemplo 51 para MT).');
    const atual = await this.prisma.xmlEmpresaConfig.findUnique({ where: { empresa_id: empresaId } });
    const trocou = (atual?.ambiente ?? 'PRODUCAO') !== ambiente;
    await this.prisma.$transaction([
      this.prisma.xmlEmpresaConfig.upsert({
        where: { empresa_id: empresaId },
        create: { empresa_id: empresaId, ambiente, uf_autor: uf ?? (empresa.uf ? UF_POR_SIGLA[empresa.uf.toUpperCase()] ?? null : null) },
        update: { ambiente, ...(uf ? { uf_autor: uf } : {}) },
      }),
      ...(trocou
        ? [this.prisma.capturaXmlConfig.updateMany({ where: { empresa_id: empresaId }, data: { ativo: false, ultimo_nsu: ZEROS, max_nsu: null, proxima_consulta_em: null, bloqueado_ate: null, ultimo_cstat: null, ultimo_motivo: 'Ambiente trocado: o NSU recomeça do zero e a captura foi desativada.' } })]
        : []),
      this.prisma.auditoriaCertificado.create({ data: { empresa_id: empresaId, acao: 'CAPTURA_AMBIENTE', usuario, detalhe: `${ambiente}${uf ? ` · UF ${uf}` : ''}${trocou ? ' · NSU zerado' : ''}` } }),
    ]);
    return this.status(empresaId);
  }

  async configurarTipo(empresaId: string, tipo: TipoCaptura, ativo: boolean, confirmaSemConcorrente: boolean, usuario: string) {
    const empresa = await this.empresa(empresaId);
    if (!TIPOS_DISPONIVEIS.includes(tipo)) throw new BadRequestException('Este tipo de documento ainda não está disponível para captura.');
    if (ativo) {
      const st = await this.status(empresaId);
      if (!st.requisitos.certificado_ativo) throw new BadRequestException('Envie um certificado válido do cliente antes de ativar a captura.');
      // O ADN (NFS-e) não usa a UF do interessado.
      if (tipo !== 'NFSE' && !st.uf_autor) throw new BadRequestException('Informe a UF do cliente (cadastro da empresa ou configuração da captura).');
      if (tipo === 'CTE' && /[A-Z]/.test(st.documento_certificado ?? '')) {
        throw new BadRequestException('O CT-e ainda não aceita CNPJ alfanumérico na Distribuição de DF-e: para o CT-e deste cliente use o envio de arquivos.');
      }
      // Manual do ADN e esquema vigente da NFS-e (v1.01) tratam o CNPJ como 14 dígitos; a NT 009 muda o campo para caractere, sem cronograma publicado.
      if (tipo === 'NFSE' && [st.documento_certificado, empresa.cnpj_cpf].some((d) => /[A-Z]/.test(limparDocumento(d)))) {
        throw new BadRequestException('A NFS-e Nacional ainda não aceita CNPJ alfanumérico na consulta ao ADN: para a NFS-e deste cliente use o envio de arquivos.');
      }
      if (!confirmaSemConcorrente) {
        throw new BadRequestException('Confirme que nenhum outro sistema (ERP, outro captador) consulta a Distribuição de DF-e deste CNPJ: consultas concorrentes causam bloqueio da SEFAZ para os dois.');
      }
    }
    await this.prisma.$transaction([
      this.prisma.capturaXmlConfig.upsert({
        where: { empresa_id_tipo: { empresa_id: empresaId, tipo } },
        create: { empresa_id: empresaId, tipo, ativo, ultimo_motivo: ativo ? 'Captura ativada.' : null },
        // A janela de espera da SEFAZ (proxima_consulta_em e bloqueado_ate) sobrevive a desativar e ativar de novo: reativar não a apaga.
        update: { ativo, ...(ativo ? { ultimo_motivo: 'Captura ativada.' } : {}) },
      }),
      this.prisma.auditoriaCertificado.create({ data: { empresa_id: empresaId, acao: ativo ? 'CAPTURA_ATIVADA' : 'CAPTURA_DESATIVADA', usuario, detalhe: ativo ? `${tipo} · confirmado: sem outro consumidor do mesmo CNPJ` : tipo } }),
    ]);
    return this.status(empresaId);
  }

  /**
   * Ciência da Operação automática (opcional, por empresa): libera o XML completo das NF-e recebidas. É um ato do cliente, assinado com o
   * certificado dele, e cria o dever de manifestação conclusiva em 90 dias (Ajuste SINIEF 07/05, cláusula 15-C); por isso exige o
   * consentimento expresso de um administrador. O InTAX registra só a Ciência, nunca Confirmação, Desconhecimento ou Operação não Realizada.
   */
  async configurarCiencia(empresaId: string, ativo: boolean, confirmou: boolean, usuario: string) {
    await this.empresa(empresaId);
    if (ativo) {
      if (!confirmou) {
        throw new BadRequestException('Confirme que o cliente autorizou o registro automático da Ciência da Operação em nome do CNPJ dele e que a manifestação conclusiva continua sendo dele.');
      }
    }
    const agora = new Date();
    const dados = { manifestar_ciencia: ativo, manifestacao_consentida_em: ativo ? agora : null, manifestacao_consentida_por: ativo ? usuario : null };
    await this.prisma.$transaction([
      this.prisma.xmlEmpresaConfig.upsert({ where: { empresa_id: empresaId }, create: { empresa_id: empresaId, ...dados }, update: dados }),
      this.prisma.auditoriaCertificado.create({
        data: { empresa_id: empresaId, acao: ativo ? 'CIENCIA_ATIVADA' : 'CIENCIA_DESATIVADA', usuario, detalhe: ativo ? 'Registro automático da Ciência da Operação; a manifestação conclusiva continua com o cliente.' : null },
      }),
    ]);
    return this.status(empresaId);
  }

  /** Registra a Ciência dos resumos de NF-e autorizadas há menos de 9 dias, ainda sem Ciência; guarda o resultado de cada nota. Nunca interrompe a captura. */
  private async registrarCiencias(empresaId: string, ambiente: Ambiente, destinatario: string, material: MaterialCertificado, usuario: string) {
    const cfg = await this.prisma.xmlEmpresaConfig.findUnique({ where: { empresa_id: empresaId } });
    const nada = { registradas: 0 as number, falha: undefined as string | undefined, recusadas: undefined as string | undefined };
    if (!cfg?.manifestar_ciencia || !cfg.manifestacao_consentida_em) return nada;
    const agora = Date.now();
    const candidatos = await this.prisma.documentoXml.findMany({
      where: {
        // Só vale o resumo que veio da própria SEFAZ (captura): um resumo enviado por arquivo não prova que o cliente é o destinatário.
        empresa_id: empresaId, tipo: 'NFE', conteudo: 'RESUMO', situacao: 'AUTORIZADA', origem: 'CAPTURA',
        autorizada_em: { gte: new Date(agora - PRAZO_CIENCIA_MS), lte: new Date(agora) },
        OR: [{ ciencia_status: null }, { ciencia_status: 'REJEITADA', ciencia_em: { lt: new Date(agora - NOVA_TENTATIVA_CIENCIA_MS) } }],
      },
      orderBy: { autorizada_em: 'asc' },
      take: MAX_CIENCIAS_POR_EXECUCAO,
      select: { id: true, chave: true },
    });
    if (!candidatos.length) return nada;

    const idPorChave = new Map(candidatos.map((d) => [d.chave, d.id]));
    let resultados: ResultadoCiencia[] = [];
    let falha: string | undefined;
    try {
      resultados = await this.manifestacao.registrarCiencia({ ambiente, documentoDestinatario: destinatario, chaves: [...idPorChave.keys()] }, material);
    } catch (e) {
      if (e instanceof ErroCienciaParcial) resultados = e.resultados;
      falha = e instanceof ErroDeComunicacao ? `Falha de comunicação ao registrar a Ciência: ${(e as Error).message}` : `Ciência interrompida: ${(e as Error).message}`;
      if (!(e instanceof ErroDeComunicacao)) this.logger.warn(`Ciência da empresa ${empresaId}: ${(e as Error).message}`);
    }
    const quando = new Date();
    for (const r of resultados) {
      const id = idPorChave.get(r.chave);
      if (id) await this.prisma.documentoXml.update({ where: { id }, data: { ciencia_status: r.status, ciencia_em: quando, ciencia_protocolo: r.protocolo } });
    }
    const registradas = resultados.filter((r) => r.status === 'REGISTRADA' || r.status === 'JA_REGISTRADA').length;
    await this.prisma.auditoriaCertificado.create({
      data: { empresa_id: empresaId, acao: 'USO_MANIFESTACAO', usuario, detalhe: `Ciência da Operação (${ambiente}): ${registradas} registrada(s) de ${candidatos.length} nota(s).` },
    });
    // A recusa que não é de prazo ou de situação da nota (por exemplo, certificado ou autor) precisa aparecer, senão a Ciência falha em silêncio.
    const recusadas = resultados.filter((r) => r.status === 'REJEITADA');
    return {
      registradas,
      falha,
      recusadas: recusadas.length ? `${recusadas.length} nota(s) recusada(s) pela SEFAZ na Ciência (${recusadas[0].cStat}: ${recusadas[0].xMotivo}).` : undefined,
    };
  }

  // ── Execução ────────────────────────────────────────────────────────

  /** Uma execução de captura (várias consultas seguidas, até esgotar os documentos ou o limite). Nunca burla as janelas de espera da SEFAZ. */
  async executar(empresaId: string, tipo: TipoCaptura, origem: 'AGENDADOR' | 'MANUAL', usuario?: string) {
    const agora = new Date();
    const cfg = await this.prisma.capturaXmlConfig.findUnique({ where: { empresa_id_tipo: { empresa_id: empresaId, tipo } } });
    if (!cfg || !cfg.ativo) throw new BadRequestException('A captura deste tipo de documento não está ativa.');
    const libera = liberadoEm(cfg, agora);
    if (libera) throw new BadRequestException(`A SEFAZ só permite nova consulta a partir de ${hhmm(libera)}. Consultar antes bloquearia o CNPJ do cliente.`);

    const trava = await this.prisma.capturaXmlConfig.updateMany({
      where: {
        id: cfg.id,
        // A janela de espera é conferida na própria operação da trava: outra rodada pode ter gravado uma janela nova depois da leitura acima.
        AND: [
          { OR: [{ em_execucao_ate: null }, { em_execucao_ate: { lt: agora } }] },
          { OR: [{ proxima_consulta_em: null }, { proxima_consulta_em: { lte: agora } }] },
          { OR: [{ bloqueado_ate: null }, { bloqueado_ate: { lte: agora } }] },
        ],
      },
      data: { em_execucao_ate: new Date(agora.getTime() + TRAVA_MS) },
    });
    if (trava.count === 0) {
      const atual = await this.prisma.capturaXmlConfig.findUnique({ where: { id: cfg.id } });
      const aberta = atual ? liberadoEm(atual, new Date()) : null;
      if (aberta) throw new BadRequestException(`A SEFAZ só permite nova consulta a partir de ${hhmm(aberta)}. Consultar antes bloquearia o CNPJ do cliente.`);
      throw new BadRequestException('Já há uma captura em andamento para esta empresa.');
    }

    const exec = await this.prisma.capturaXmlExecucao.create({ data: { empresa_id: empresaId, tipo, origem, usuario: usuario ?? null } });
    let consultas = 0, recebidos = 0, novos = 0, completados = 0, ignorados = 0;
    let motivoIgnorado: string | undefined;
    let desativar = false;
    let ultimoCstat: string | null = null;
    let passo: Passo | null = null;
    let mensagem = '';
    let proxima: Date | null = null;
    let bloqueadoAte: Date | null = null;
    try {
      const st = await this.status(empresaId);
      const material = await this.certificados.material(empresaId, 'USO_CAPTURA', usuario ?? 'agendador', `Captura ${tipo} (${st.ambiente})`);
      // Consulta-se o CNPJ da empresa, não o do titular do certificado: o e-CNPJ vale para toda a raiz (matriz e filiais).
      const consultado = limparDocumento((await this.empresa(empresaId)).cnpj_cpf);
      if (!consultado) throw new Error('Cadastre o CNPJ ou CPF da empresa para consultar a SEFAZ.');
      let ultNSU = normalizarNsu(cfg.ultimo_nsu || ZEROS);
      while (consultas < MAX_LOTES_POR_EXECUCAO) {
        consultas += 1;
        const r = await this.cliente.consultar({ tipo, ambiente: st.ambiente as Ambiente, documento: consultado, ufAutor: st.uf_autor ?? '', ultNSU }, material);
        ultimoCstat = r.cStat;
        passo = decidirPasso(tipo, r, new Date());
        // Resposta que manda continuar mas não avança o NSU: repetir a consulta só repetiria o lote (e martelaria o serviço).
        if (passo.continuarAgora && !passo.reiniciarNsu && !(nsuValido(r.ultNSU) && nsuMaior(r.ultNSU, ultNSU))) {
          passo = { ...passo, continuarAgora: false, proximaConsultaEm: new Date(Date.now() + ESPERA_SEFAZ), mensagem: `${passo.mensagem} O NSU não avançou: nova consulta daqui a 1 hora.` };
        }
        if (passo.reiniciarNsu) ultNSU = ZEROS;
        if (passo.situacao === 'COM_DOCUMENTOS') {
          for (const d of r.documentos) {
            const reg = await this.repositorio.registrar(empresaId, Buffer.from(d.xml, 'utf8'), { origem: 'CAPTURA', nsu: d.nsu, nomeOriginal: d.schema });
            recebidos += 1;
            if (reg.resultado === 'NOVO') novos += 1;
            else if (reg.resultado === 'ATUALIZADO') completados += 1;
            else if (reg.resultado === 'IGNORADO') {
              ignorados += 1;
              motivoIgnorado ??= reg.motivo;
              // Só o NSU, o tipo do arquivo e o motivo: nunca o conteúdo do XML.
              this.logger.warn(`Captura ${tipo} da empresa ${empresaId}: documento do NSU ${d.nsu} (${d.schema || 'sem tipo'}) ignorado: ${reg.motivo}`);
            }
          }
        }
        // O NSU só avança depois de os documentos do lote estarem guardados; repetir um lote não duplica nada.
        if (!passo.reiniciarNsu && nsuValido(r.ultNSU) && nsuMaior(r.ultNSU, ultNSU)) ultNSU = normalizarNsu(r.ultNSU);
        await this.prisma.capturaXmlConfig.update({
          where: { id: cfg.id },
          data: {
            ultimo_nsu: ultNSU,
            ...(passo.reiniciarNsu ? { max_nsu: null } : nsuValido(r.maxNSU) ? { max_nsu: normalizarNsu(r.maxNSU) } : {}),
            ultima_consulta_em: new Date(), ultimo_cstat: r.cStat, ultimo_motivo: passo.mensagem,
            // A janela de espera vale desde já (se a execução cair antes do fim, a próxima rodada não consulta dentro dela) e a trava se renova.
            proxima_consulta_em: passo.continuarAgora ? null : passo.proximaConsultaEm, bloqueado_ate: passo.bloqueadoAte,
            em_execucao_ate: new Date(Date.now() + TRAVA_MS),
          },
        });
        if (!passo.continuarAgora) break;
        await this.pausa();
      }
      if (passo?.continuarAgora) {
        // limite de consultas da execução: o resto fica para a próxima rodada, sem espera da SEFAZ
        proxima = new Date(Date.now() + 2 * 60_000);
        mensagem = `${resumoDocs(novos, completados, recebidos, ignorados, motivoIgnorado)} Ainda há mais para buscar.`;
      } else {
        proxima = passo?.proximaConsultaEm ?? null;
        bloqueadoAte = passo?.bloqueadoAte ?? null;
        mensagem = passo?.situacao === 'COM_DOCUMENTOS' ? resumoDocs(novos, completados, recebidos, ignorados, motivoIgnorado) : passo?.mensagem ?? '';
        if (passo?.desativar) {
          desativar = true;
          this.logger.warn(`Captura ${tipo} da empresa ${empresaId} desativada: SEFAZ ${ultimoCstat}`);
        }
      }
      if (tipo === 'NFE' && !desativar) {
        await this.prisma.capturaXmlConfig.update({ where: { id: cfg.id }, data: { em_execucao_ate: new Date(Date.now() + TRAVA_MS) } }); // a Ciência pode demorar
        const c = await this.registrarCiencias(empresaId, st.ambiente as Ambiente, consultado, material, usuario ?? 'agendador');
        if (c.registradas) mensagem += ` Ciência da Operação registrada em ${c.registradas} nota(s).`;
        if (c.recusadas) mensagem += ` ${c.recusadas}`;
        if (c.falha) mensagem += ` ${c.falha}`;
      }
    } catch (e) {
      const comunicacao = e instanceof ErroDeComunicacao;
      // Sem detalhes que possam carregar segredos: só a mensagem do erro conhecido.
      mensagem = comunicacao ? `Falha de comunicação com a SEFAZ: ${(e as Error).message}` : `Captura interrompida: ${mensagemSegura(e)}`;
      proxima = comunicacao ? esperaAposFalha(new Date()) : new Date(Date.now() + 60 * 60_000);
      if (!comunicacao) this.logger.warn(`Captura ${tipo} da empresa ${empresaId}: ${(e as Error).message}`);
    }

    await this.prisma.capturaXmlConfig.update({
      where: { id: cfg.id },
      data: {
        proxima_consulta_em: proxima, bloqueado_ate: bloqueadoAte, em_execucao_ate: null, ultimo_motivo: mensagem,
        ...(desativar ? { ativo: false } : {}), ...(ultimoCstat ? {} : { ultima_consulta_em: new Date() }),
      },
    });
    if (desativar) {
      await this.prisma.auditoriaCertificado.create({ data: { empresa_id: empresaId, acao: 'CAPTURA_DESATIVADA', usuario: 'sistema', detalhe: `${tipo} · SEFAZ ${ultimoCstat}: ${mensagem}`.slice(0, 480) } });
    }
    await this.prisma.capturaXmlExecucao.update({
      where: { id: exec.id },
      data: { finalizado_em: new Date(), consultas, docs_recebidos: recebidos, docs_novos: novos, ultimo_cstat: ultimoCstat, mensagem },
    });
    return { consultas, docs_recebidos: recebidos, docs_novos: novos, docs_completados: completados, ultimo_cstat: ultimoCstat, mensagem };
  }

  /**
   * O agendador só roda quando CAPTURA_XML_AGENDADOR=on (servidor de produção). Fora dele fica desligado de propósito: dois
   * consumidores do mesmo CNPJ (por exemplo um computador de desenvolvimento com cópia dos dados) fazem a SEFAZ bloquear o cliente.
   */
  static agendadorLigado(): boolean {
    return String(process.env.CAPTURA_XML_AGENDADOR ?? '').trim().toLowerCase() === 'on';
  }

  /**
   * Rodada do agendador (a cada 10 minutos): executa as capturas ativas cuja espera da SEFAZ já passou E cuja empresa está dentro do
   * período dela (Noturno das 18:00 às 05:59, Diurno das 06:00 às 17:59, horário de Brasília). Empresa sem período escolhido é noturna.
   */
  @Cron('*/10 * * * *', { timeZone: 'America/Sao_Paulo' })
  async rodarPendentes() {
    if (!CapturaXmlService.agendadorLigado()) return;
    const agora = new Date();
    const prontas = await this.prisma.capturaXmlConfig.findMany({
      where: {
        ativo: true, tipo: { in: TIPOS_DISPONIVEIS },
        AND: [
          { OR: [{ proxima_consulta_em: null }, { proxima_consulta_em: { lte: agora } }] },
          { OR: [{ bloqueado_ate: null }, { bloqueado_ate: { lte: agora } }] },
          { OR: [{ em_execucao_ate: null }, { em_execucao_ate: { lt: agora } }] },
        ],
      },
      orderBy: [{ ultima_consulta_em: 'asc' }],
    });
    if (!prontas.length) return;
    // O período é da empresa, não do tipo: o filtro vem antes do limite da rodada, para quem está fora do período não ocupar vaga de quem está dentro.
    const periodos = new Map(
      (await this.prisma.xmlEmpresaConfig.findMany({ where: { empresa_id: { in: [...new Set(prontas.map((c) => c.empresa_id))] } }, select: { empresa_id: true, periodo_busca: true } }))
        .map((x) => [x.empresa_id, periodoDe(x.periodo_busca)] as const),
    );
    const devidas = prontas
      .filter((c) => dentroDaJanela(agora, janelaDoPeriodo(periodos.get(c.empresa_id) ?? periodoDe(undefined))))
      .slice(0, MAX_CONFIGS_POR_RODADA);
    for (const c of devidas) {
      try {
        await this.executar(c.empresa_id, c.tipo as TipoCaptura, 'AGENDADOR');
      } catch (e) {
        this.logger.warn(`Captura ${c.tipo} da empresa ${c.empresa_id} não executou: ${(e as Error).message}`);
      }
      await this.pausa();
    }
  }
}
