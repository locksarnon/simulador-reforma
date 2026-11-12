import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CnpjService } from '../cnpj/cnpj.service';
import { PdfService, SecaoPdf } from '../pdf/pdf.service';
import { lerPfx } from '../certificados/certificado-pfx';
import { CertificadosService } from '../certificados/certificados.service';
import { ContratoIntegraService } from '../monitoramento/contrato.service';
import { MonitoramentoService } from '../monitoramento/monitoramento.service';
import { interpretarCertidao, textoDoPdf, TipoCertidao } from './leitor-certidoes';
import { ChaveProcesso, DEFINICAO, Processo, PROCESSOS, processoInicial, ROTULO_STATUS, situacaoGeral } from './processos';
import { ConsultaCccHttp, ResultadoCcc } from './ccc.http';
import { SerproCertidoes } from './serpro-certidoes';
import { InfosimplesService, ResultadoCertidao } from '../infosimples/infosimples.service';
import { DividaAtivaService } from '../divida-ativa/divida-ativa.service';

type Usuario = { email?: string; role?: string } | undefined;
const so = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const agoraIso = () => new Date().toISOString();
const dataBr = (iso: string | Date | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
const fmtCnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

/**
 * Pré-análise por CNPJ: sete consultas com status próprio (Consulta Empresa, Consulta CCC, Certificado CCC, PGFN, Trabalhista, FGTS e
 * Dívida Ativa) e relatório detalhado em PDF. Roda em segundo plano; a tela acompanha o andamento. Onde o órgão não oferece API
 * (portais com verificação humana), a consulta fica "Aguardando certidão" com o link oficial e o InTAX lê o PDF anexado.
 */
@Injectable()
export class PreAnaliseService {
  private readonly log = new Logger(PreAnaliseService.name);
  private readonly emAndamento = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly cnpj: CnpjService,
    private readonly pdf: PdfService,
    private readonly contrato: ContratoIntegraService,
    private readonly monitoramento: MonitoramentoService,
    private readonly ccc: ConsultaCccHttp,
    private readonly serpro: SerproCertidoes,
    private readonly certificados: CertificadosService,
    private readonly infosimples: InfosimplesService,
    private readonly dividaAtiva: DividaAtivaService,
  ) {}

  listar(cnpj?: string) {
    const d = so(cnpj);
    return this.prisma.preAnalise.findMany({ where: d ? { cnpj: d } : {}, orderBy: { createdAt: 'desc' }, take: 200 }).then((l) => l.map((p) => this.visao(p)));
  }

  async obter(id: string) {
    const p = await this.prisma.preAnalise.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Pré-análise não encontrada.');
    return this.visao(p);
  }

  private visao(p: { id: string; cnpj: string; razao_social: string | null; uf: string | null; empresa_id: string | null; processos: unknown; criado_por: string | null; concluida_em: Date | null; createdAt: Date; updatedAt: Date }) {
    const processos = (p.processos as Processo[]) ?? [];
    return { ...p, processos, geral: situacaoGeral(processos), definicoes: PROCESSOS };
  }

  /** Cria a pré-análise e dispara as consultas em segundo plano. */
  async criar(cnpjInformado: string, usuario: Usuario, aguardar = false) {
    const cnpj = so(cnpjInformado);
    if (cnpj.length !== 14) throw new BadRequestException('Informe um CNPJ com 14 dígitos.');
    const empresa = await this.prisma.empresa.findFirst({ where: { cnpj_cpf: { in: [cnpj, fmtCnpj(cnpj)] } }, select: { id: true, razao_social: true } }).catch(() => null);
    const p = await this.prisma.preAnalise.create({
      data: { cnpj, razao_social: empresa?.razao_social ?? null, empresa_id: empresa?.id ?? null, processos: PROCESSOS.map((d) => processoInicial(d.chave)) as never, criado_por: usuario?.email ?? null },
    });
    const tarefa = this.executar(p.id);
    if (aguardar) await tarefa; else tarefa.catch((e) => this.log.error(`Pré-análise ${p.id}: ${(e as Error).message}`));
    return this.obter(p.id);
  }

  /** Refaz as consultas automáticas (as certidões anexadas continuam). */
  async reprocessar(id: string, aguardar = false) {
    const p = await this.prisma.preAnalise.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Pré-análise não encontrada.');
    if (this.emAndamento.has(id)) return this.obter(id);
    const atuais = (p.processos as Processo[]) ?? [];
    const novos = atuais.map((x) => (x.arquivo?.enviado_por ? x : processoInicial(x.chave)));
    await this.prisma.preAnalise.update({ where: { id }, data: { processos: novos as never, concluida_em: null } });
    const tarefa = this.executar(id);
    if (aguardar) await tarefa; else tarefa.catch((e) => this.log.error(`Pré-análise ${id}: ${(e as Error).message}`));
    return this.obter(id);
  }

  private async gravar(id: string, chave: ChaveProcesso, dados: Partial<Processo>, extra: Record<string, unknown> = {}) {
    const p = await this.prisma.preAnalise.findUnique({ where: { id } });
    if (!p) return;
    const processos = ((p.processos as Processo[]) ?? []).map((x) => (x.chave === chave ? { ...x, ...dados } : x));
    await this.prisma.preAnalise.update({ where: { id }, data: { processos: processos as never, ...extra } });
  }

  private pendente(p: Processo[], chave: ChaveProcesso) {
    return p.find((x) => x.chave === chave)?.status === 'PROCESSANDO';
  }

  async executar(id: string) {
    if (this.emAndamento.has(id)) return;
    this.emAndamento.add(id);
    try {
      const reg = await this.prisma.preAnalise.findUnique({ where: { id } });
      if (!reg) return;
      const cnpj = reg.cnpj;
      const fila = (reg.processos as Processo[]) ?? [];
      const passo = async (chave: ChaveProcesso, fn: () => Promise<Partial<Processo>>) => {
        if (!this.pendente(fila, chave)) return;
        let r: Partial<Processo>;
        try { r = await fn(); } catch (e) { r = { status: 'INDISPONIVEL', resumo: `Não foi possível consultar agora: ${(e as Error).message}`, detalhes: [] }; }
        await this.gravar(id, chave, { ...r, consultado_em: agoraIso() });
      };

      // 1. Consulta Empresa
      let uf = reg.uf ?? '';
      await passo('EMPRESA', async () => {
        const d = await this.cnpj.consultar(cnpj);
        uf = d.uf;
        await this.prisma.preAnalise.update({ where: { id }, data: { razao_social: d.razao_social || reg.razao_social, uf: d.uf || null } });
        const ativa = /ATIVA/i.test(d.situacao) && !/INATIVA/i.test(d.situacao);
        return {
          status: ativa ? 'CONCLUIDO' : 'IRREGULAR',
          resumo: `Situação cadastral: ${d.situacao || 'não informada'}${d.opcao_pelo_simples ? '; optante do Simples Nacional' : ''}${d.opcao_pelo_mei ? ' (MEI)' : ''}.`,
          detalhes: [
            { rotulo: 'Razão social', valor: d.razao_social }, { rotulo: 'Nome fantasia', valor: d.nome_fantasia },
            { rotulo: 'Situação cadastral', valor: d.situacao }, { rotulo: 'Matriz ou filial', valor: d.matriz_filial },
            { rotulo: 'Município/UF', valor: `${d.municipio}/${d.uf}` }, { rotulo: 'Natureza jurídica', valor: d.natureza_juridica },
            { rotulo: 'Porte', valor: d.porte }, { rotulo: 'Início de atividade', valor: String(d.data_inicio_atividade || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1') },
            { rotulo: 'Capital social', valor: d.capital_social === null ? '' : d.capital_social.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
            { rotulo: 'Simples Nacional', valor: d.opcao_pelo_simples === null ? 'não informado' : d.opcao_pelo_simples ? 'optante' : 'não optante' },
            { rotulo: 'MEI', valor: d.opcao_pelo_mei === null ? 'não informado' : d.opcao_pelo_mei ? 'sim' : 'não' },
            { rotulo: 'CNAE principal', valor: `${d.cnae_codigo} ${d.cnae_descricao}` },
            ...d.cnaes_secundarios.slice(0, 15).map((c: { codigo: string; descricao: string }, i: number) => ({ rotulo: i === 0 ? 'CNAEs secundários' : '', valor: `${c.codigo} ${c.descricao}` })),
            ...d.socios.map((s: { nome: string; qualificacao: string }, i: number) => ({ rotulo: i === 0 ? 'Quadro societário' : '', valor: `${s.nome} (${s.qualificacao})` })),
          ].filter((l) => l.valor),
        };
      });
      if (!uf) uf = (await this.prisma.preAnalise.findUnique({ where: { id }, select: { uf: true } }))?.uf ?? '';

      // 2 e 3. Consulta CCC e Certificado CCC
      let ccc: ResultadoCcc | null = null;
      await passo('CCC', async () => {
        if (!uf) return { status: 'INDISPONIVEL', resumo: 'Sem a UF do CNPJ (a Consulta Empresa não respondeu).', detalhes: [] };
        // A SEFAZ só responde a certificado de emitente de NF-e: primeiro o A1 do próprio cliente (cofre), depois o do escritório.
        const tentativas: { de: string; m: () => Promise<{ keyPem: string; certPem: string; cadeiaPem?: string[] }> }[] = [];
        if (reg.empresa_id) tentativas.push({ de: 'certificado do cliente', m: () => this.certificados.material(reg.empresa_id!, 'USO_CONSULTA_CADASTRO', reg.criado_por ?? 'pré-análise', 'Consulta ao cadastro do ICMS (pré-análise)') });
        const cred = await this.contrato.credenciais();
        if (cred) tentativas.push({ de: 'certificado do escritório', m: async () => lerPfx(cred.pfx, cred.senha) });
        if (!tentativas.length) return { status: 'INDISPONIVEL', resumo: 'Sem certificado para consultar a SEFAZ: guarde o A1 do cliente no cofre (Captura de XML) ou configure o do escritório em Administração > Integrações.', detalhes: [] };
        let ultimo: ResultadoCcc | null = null;
        for (const t of tentativas) {
          let material;
          try { material = await t.m(); } catch { continue; }
          ultimo = await this.ccc.consultar({ cnpj, uf, keyPem: material.keyPem, certPem: material.certPem, cadeiaPem: material.cadeiaPem, certificadoDe: t.de });
          if (ultimo.consultado || ultimo.cStat !== '257') break;
        }
        if (!ultimo) return { status: 'INDISPONIVEL', resumo: 'O certificado do cliente não pôde ser usado e não há certificado do escritório configurado.', detalhes: [] };
        ccc = ultimo;
        const p = this.processoDoCcc(ultimo);
        return { ...p, detalhes: [...(p.detalhes ?? []), { rotulo: 'Consultado com', valor: ultimo.certificadoDe ?? '' }] };
      });
      await passo('CERTIFICADO_CCC', async () => {
        const r = ccc as ResultadoCcc | null;
        if (!r || !r.consultado) return { status: 'INDISPONIVEL', resumo: 'Depende da Consulta CCC, que não foi feita.', detalhes: [] };
        const nome = `Comprovante CCC ${fmtCnpj(cnpj)}.pdf`;
        const key = `pre-analise/${id}/certificado-ccc.pdf`;
        await this.storage.guardar(key, await this.comprovanteCcc(cnpj, r), 'application/pdf');
        const base = this.processoDoCcc(r);
        return { status: base.status, resumo: `Comprovante gerado com o retorno da SEFAZ ${r.uf} (protocolo da consulta em ${dataBr(r.dataConsulta)}).`, detalhes: base.detalhes, arquivo: { key, nome } };
      });

      // 4 a 7. Certidões e dívida ativa
      const modo = await this.monitoramento.modo();
      await passo('PGFN', async () => {
        const r = await this.serpro.certidaoFederal(cnpj, modo);
        if (!r) return this.aguardando('PGFN');
        let arquivo: Processo['arquivo'] = null;
        if (r.pdf) { const key = `pre-analise/${id}/pgfn.pdf`; await this.storage.guardar(key, r.pdf, 'application/pdf'); arquivo = { key, nome: `Certidão federal ${fmtCnpj(cnpj)}.pdf` }; }
        return { status: r.status, resumo: r.resumo, detalhes: r.detalhes, demonstracao: r.demonstracao, arquivo };
      });
      await passo('TRABALHISTA', async () => this.daInfosimples(id, 'TRABALHISTA', cnpj, await this.infosimples.cndt(cnpj)));
      await passo('FGTS', async () => this.daInfosimples(id, 'FGTS', cnpj, await this.infosimples.crf(cnpj)));
      await passo('DIVIDA_ATIVA', async () => {
        const r = await this.serpro.dividaAtiva(cnpj, modo);
        if (r) return { status: r.status, resumo: r.resumo, detalhes: r.detalhes, demonstracao: r.demonstracao };
        return this.daBaseAberta(cnpj);
      });
      await this.prisma.preAnalise.update({ where: { id }, data: { concluida_em: new Date() } });
    } finally {
      this.emAndamento.delete(id);
    }
  }

  /** CNDT ou CRF pela Infosimples (null = não configurada: fica aguardando o PDF). */
  private async daInfosimples(id: string, chave: 'TRABALHISTA' | 'FGTS', cnpj: string, r: ResultadoCertidao | null): Promise<Partial<Processo>> {
    if (!r) return this.aguardando(chave);
    let arquivo: Processo['arquivo'] = null;
    if (r.comprovante) {
      const key = `pre-analise/${id}/${chave.toLowerCase()}.${r.comprovante.extensao}`;
      await this.storage.guardar(key, r.comprovante.buffer, r.comprovante.tipo);
      arquivo = { key, nome: `${DEFINICAO.get(chave)!.rotulo} ${fmtCnpj(cnpj)}.${r.comprovante.extensao}` };
    }
    return { status: r.status, resumo: r.resumo, detalhes: [...r.detalhes, { rotulo: 'Emitida por', valor: 'Infosimples, no portal oficial' }], arquivo };
  }

  /** Dívida Ativa pela base aberta da PGFN (fim do trimestre publicado), por raiz do CNPJ. */
  private async daBaseAberta(cnpj: string): Promise<Partial<Processo>> {
    const r = await this.dividaAtiva.consultar(cnpj);
    if (!r) return this.aguardando('DIVIDA_ATIVA');
    const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const tri = r.trimestre.replace(/^(\d{4})_trimestre_0?(\d)$/, '$2º trimestre de $1');
    const fonte = { rotulo: 'Fonte', valor: `Base aberta da PGFN, posição do ${tri}` };
    if (!r.inscricoes.length) return { status: 'CONCLUIDO', resumo: `Nenhuma inscrição em Dívida Ativa da União para a raiz do CNPJ (base da PGFN do ${tri}).`, detalhes: [fonte] };
    return {
      status: 'DEBITOS',
      resumo: `${r.inscricoes.length} inscrição(ões) em Dívida Ativa da União, total de ${brl(r.total)}${r.ajuizadas ? `, ${r.ajuizadas} ajuizada(s)` : ''} (base da PGFN do ${tri}).`,
      detalhes: [fonte, ...r.inscricoes.slice(0, 200).map((x) => ({ rotulo: `${x.numero} (${x.origem})`, valor: `${brl(x.valor)} · ${x.receita} · ${x.situacao}${x.ajuizado ? ' · ajuizada' : ''} · inscrita em ${x.data}${x.cnpj !== cnpj ? ` · CNPJ ${fmtCnpj(x.cnpj)}` : ''}${x.tipo_devedor && x.tipo_devedor !== 'Principal' ? ` · ${x.tipo_devedor}` : ''}` }))],
    };
  }

  private aguardando(chave: ChaveProcesso): Partial<Processo> {
    const d = DEFINICAO.get(chave)!;
    return {
      status: 'MANUAL',
      resumo: d.como,
      detalhes: d.portal ? [{ rotulo: 'Portal oficial', valor: d.portal }] : [],
    };
  }

  processoDoCcc(r: ResultadoCcc): Partial<Processo> {
    if (!r.consultado) return { status: 'INDISPONIVEL', resumo: r.mensagem, detalhes: [] };
    if (!r.inscricoes.length) return { status: 'CONCLUIDO', resumo: `Sem inscrição estadual na SEFAZ ${r.uf} (${r.mensagem}).`, detalhes: [{ rotulo: 'Retorno da SEFAZ', valor: `${r.cStat} ${r.mensagem}` }] };
    const habilitadas = r.inscricoes.filter((i) => i.habilitada);
    const detalhes = r.inscricoes.flatMap((i, n) => [
      { rotulo: r.inscricoes.length > 1 ? `Inscrição ${n + 1}` : 'Inscrição estadual', valor: `${i.ie} (${i.uf}): ${i.habilitada ? 'habilitada' : 'não habilitada'}` },
      ...(i.regime ? [{ rotulo: 'Regime de apuração', valor: i.regime }] : []),
      ...(i.credenciamentoNFe ? [{ rotulo: 'Credenciamento NF-e', valor: i.credenciamentoNFe }] : []),
      ...(i.inicioAtividade ? [{ rotulo: 'Início da atividade', valor: i.inicioAtividade }] : []),
      ...(i.dataSituacao ? [{ rotulo: 'Data da situação', valor: i.dataSituacao }] : []),
      ...(i.dataBaixa ? [{ rotulo: 'Data da baixa', valor: i.dataBaixa }] : []),
      ...(i.endereco ? [{ rotulo: 'Endereço', valor: i.endereco }] : []),
    ]);
    return {
      status: habilitadas.length ? 'CONCLUIDO' : 'IRREGULAR',
      resumo: `${r.inscricoes.length} inscrição(ões) na SEFAZ ${r.uf}; ${habilitadas.length} habilitada(s).`,
      detalhes,
    };
  }

  private comprovanteCcc(cnpj: string, r: ResultadoCcc) {
    const b = this.processoDoCcc(r);
    return this.pdf.gerar({
      marca: 'Pré-análise por CNPJ',
      titulo: 'Comprovante de consulta ao Cadastro Centralizado de Contribuintes (CCC)',
      subtitulo: `CNPJ ${fmtCnpj(cnpj)} · SEFAZ ${r.uf} · ${dataBr(r.dataConsulta)}`,
      secoes: [
        { titulo: 'Resultado', paragrafos: [b.resumo ?? ''] },
        { titulo: 'Inscrições estaduais', tabela: { cabecalho: ['Campo', 'Valor'], larguras: [0.3, 0.7], linhas: (b.detalhes ?? []).map((d) => [d.rotulo, d.valor]) } },
        { titulo: 'Retorno da SEFAZ', paragrafos: [`Código ${r.cStat}: ${r.mensagem}. Consulta feita pelo web service oficial de Consulta Cadastro (NF-e) com o certificado do escritório.`] },
      ],
      aviso: 'Comprovante emitido pelo InTAX com o retorno do web service da SEFAZ. Não substitui documento emitido pelo órgão.',
    });
  }

  /** Anexa a certidão baixada no portal oficial (CNDT, CRF do FGTS ou certidão federal) e lê situação e validade do PDF. */
  async anexarCertidao(id: string, chave: string, pdf: Buffer | undefined, usuario: Usuario) {
    const d = DEFINICAO.get(chave as ChaveProcesso);
    if (!d || !d.aceitaCertidao) throw new BadRequestException('Esta consulta não recebe certidão anexada.');
    if (!pdf?.length) throw new BadRequestException('Envie o PDF da certidão.');
    const p = await this.prisma.preAnalise.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Pré-análise não encontrada.');
    let texto: string;
    try { texto = await textoDoPdf(pdf); } catch (e) { throw new BadRequestException(`Não consegui ler o PDF: ${(e as Error).message}`); }
    const l = interpretarCertidao(chave as TipoCertidao, texto, p.cnpj);
    const key = `pre-analise/${id}/${chave.toLowerCase()}.pdf`;
    await this.storage.guardar(key, pdf, 'application/pdf');
    await this.gravar(id, chave as ChaveProcesso, {
      status: l.status, resumo: l.resumo, consultado_em: agoraIso(), demonstracao: false,
      detalhes: [
        { rotulo: 'Situação', valor: l.situacao }, { rotulo: 'Validade', valor: l.validade ?? 'não lida' },
        ...(l.emissao ? [{ rotulo: 'Emissão', valor: l.emissao }] : []), ...(l.numero ? [{ rotulo: 'Número/código', valor: l.numero }] : []),
        { rotulo: 'CNPJ na certidão', valor: l.documento ? `${fmtCnpj(l.documento)}${l.confere ? '' : ' (diferente do CNPJ analisado)'}` : 'não lido' },
      ],
      arquivo: { key, nome: `${d.rotulo} ${fmtCnpj(p.cnpj)}.pdf`, enviado_por: usuario?.email ?? 'usuário' },
    });
    return this.obter(id);
  }

  async arquivo(id: string, chave: string) {
    const p = await this.obter(id);
    const x = p.processos.find((y) => y.chave === chave);
    if (!x?.arquivo) throw new NotFoundException('Esta consulta não tem arquivo.');
    return { nome: x.arquivo.nome, tipo: /\.html$/i.test(x.arquivo.nome) ? 'text/html; charset=utf-8' : 'application/pdf', buffer: await this.storage.getObjectBuffer(x.arquivo.key) };
  }

  async excluir(id: string, usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new BadRequestException('Só administradores excluem pré-análises.');
    const p = await this.obter(id);
    for (const x of p.processos) if (x.arquivo?.key) await this.storage.removeObject(x.arquivo.key).catch(() => undefined);
    await this.prisma.preAnalise.delete({ where: { id } });
    return { ok: true };
  }

  /** Relatório detalhado em PDF, com o logo, a situação geral e cada consulta com status, fonte, data e detalhes. */
  async relatorio(id: string) {
    const p = await this.obter(id);
    const g = p.geral;
    const secoes: SecaoPdf[] = [
      {
        titulo: 'Resumo',
        destaques: [
          { rotulo: 'Situação geral', valor: ROTULO_STATUS[g.status], detalhe: g.texto },
          { rotulo: 'Consultas concluídas', valor: `${p.processos.filter((x) => x.status === 'CONCLUIDO').length} de ${p.processos.length}` },
          { rotulo: 'Pontos de atenção', valor: String(p.processos.filter((x) => x.status === 'IRREGULAR' || x.status === 'DEBITOS').length) },
        ],
        tabela: { cabecalho: ['Consulta', 'Status', 'Resultado'], larguras: [0.2, 0.2, 0.6], linhas: p.processos.map((x) => [DEFINICAO.get(x.chave)!.rotulo, ROTULO_STATUS[x.status], x.resumo]) },
      },
      ...p.processos.map((x): SecaoPdf => {
        const d = DEFINICAO.get(x.chave)!;
        return {
          titulo: `${d.rotulo}: ${ROTULO_STATUS[x.status]}${x.demonstracao ? ' (demonstração)' : ''}`,
          paragrafos: [x.resumo, `Fonte: ${d.fonte}.${x.consultado_em ? ` Consultado em ${dataBr(x.consultado_em)}.` : ''}${x.arquivo ? ` Documento: ${x.arquivo.nome}${x.arquivo.enviado_por ? `, anexado por ${x.arquivo.enviado_por}` : ''}.` : ''}`],
          ...(x.detalhes.length ? { tabela: { cabecalho: ['Campo', 'Informação'], larguras: [0.3, 0.7], linhas: x.detalhes.map((l) => [l.rotulo, l.valor]) } } : {}),
        };
      }),
    ];
    const demo = p.processos.some((x) => x.demonstracao);
    const buffer = await this.pdf.gerar({
      marca: 'Pré-análise por CNPJ',
      titulo: `Pré-análise: ${p.razao_social || fmtCnpj(p.cnpj)}`,
      subtitulo: `CNPJ ${fmtCnpj(p.cnpj)}${p.uf ? ` · ${p.uf}` : ''} · ${dataBr(p.createdAt)}${p.criado_por ? ` · por ${p.criado_por}` : ''}`,
      secoes,
      aviso: `Relatório gerado pelo InTAX com consultas a fontes oficiais na data indicada em cada item. As situações podem mudar depois da consulta; confira a validade de cada certidão.${demo ? ' Itens marcados como demonstração usam dados fictícios do ambiente de demonstração oficial do Serpro.' : ''}`,
    });
    return { nome: `Pré-análise ${fmtCnpj(p.cnpj).replace(/\//g, '-')}.pdf`, buffer };
  }
}
