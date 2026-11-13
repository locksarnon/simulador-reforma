import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MonitoramentoService } from './monitoramento.service';
import { extrairArquivos } from './interpretar';
import { ESCRITURACOES, pesquisarAno, porCompetenciaBaixados } from '../receitanetbx/sped';
import { SpedDownloadService } from '../receitanetbx/sped-download.service';
import { servicosBx } from '../receitanetbx/receitanetbx.cliente';
import { caiHoje } from './agenda';

/** Mês de Brasília (1 a 12). */
const mesDeBrasilia = (d: Date) => Number(new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: 'America/Sao_Paulo' }).format(d));

const PJ9 = { numero: '99999999999999', tipo: 2 as const };
const PJ100 = { numero: '00000000000100', tipo: 2 as const };
const PJ101 = { numero: '00000000000101', tipo: 2 as const };
const PF11 = { numero: '00000000011', tipo: 1 as const };
const j = JSON.stringify;
const so = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lerDados = (d: unknown) => { if (typeof d !== 'string') return d; try { return JSON.parse(d); } catch { return d; } };

/**
 * Eventos de atualização (Integra Contador, Mapa dos Eventos, conferido em 12/11/2026): a Receita avisa a data da última novidade
 * de cada cliente, nos últimos 60 dias. Exige procuração eletrônica do escritório para cada cliente (vigente até D-1).
 */
export const EVENTOS = [
  { id: 'E0301', rotulo: 'DCTFWeb: declaração transmitida ou apuração recebida (Reinf, eSocial)', consulta: 'dctfweb-recibo' },
  { id: 'E0601', rotulo: 'Caixa postal: mensagem nova', consulta: 'caixa-postal' },
  { id: 'E0701', rotulo: 'Pagamentos: documento novo ou alterado', consulta: 'pagamentos' },
] as const;

/** Protocolo e tempo de espera da solicitação; aceita o JSON malformado que o ambiente de demonstração devolve (sem a chave final). */
export function protocoloDe(dados: unknown): { protocolo?: string; TempoEsperaMedioEmMs?: number } {
  const d = lerDados(dados);
  if (d && typeof d === 'object') return d as { protocolo?: string; TempoEsperaMedioEmMs?: number };
  const t = String(dados ?? '');
  const prot = t.match(/"protocolo"\s*:\s*"([^"]+)"/);
  const esp = t.match(/"TempoEsperaMedioEmMs"\s*:\s*(\d+)/);
  return { protocolo: prot?.[1], TempoEsperaMedioEmMs: esp ? Number(esp[1]) : undefined };
}

/** "230417" (AAMMDD) → Date; vazio, "x" ou inválido → null. */
export function dataDoEvento(s: unknown): Date | null {
  const m = String(s ?? '').match(/^(\d{2})(\d{2})(\d{2})$/);
  return m ? new Date(`20${m[1]}-${m[2]}-${m[3]}T12:00:00Z`) : null;
}

type MemoriaSped = { consultado_em: string; certificados: string[]; escrituracoes: Record<string, { encontrados: number; erro: string | null }> };
const chaveSped = (empresaId: string, ano: number) => `sped_consulta:${empresaId}:${ano}`;

@Injectable()
export class EscritorioService {
  private readonly log = new Logger(EscritorioService.name);
  pausaMs = 1;

  constructor(private readonly prisma: PrismaService, private readonly m: MonitoramentoService, @Optional() private readonly downloads?: SpedDownloadService) {}

  // ── Redesim (vínculos do escritório como contador) ──────────────────
  /** CNPJs em que o escritório é o contador responsável na Receita (todas as páginas), marcando os que já são clientes. */
  async vinculos() {
    const todos: Record<string, unknown>[] = [];
    let ultimo: string | undefined;
    let demonstracao = false;
    for (let pagina = 0; pagina < 40; pagina++) {
      const dados = j({ pagination: { size: 50, ...(ultimo ? { lastCnpj: ultimo } : {}) } });
      const r = await this.m.chamarDoEscritorio({ sistema: 'PNRCONTADOR', servico: 'CONSVINCULOS261', versao: '1.0', endpoint: 'Consultar', dados, demo: { contratante: PJ101, contribuinte: PJ101, dados: j({ pagination: { size: 50 } }) } });
      demonstracao = r.demonstracao;
      if (r.status !== 200) throw new BadRequestException(r.mensagens.map((x) => x.texto).join(' ') || `O Serpro respondeu ${r.status ?? r.http}.`);
      const d = (lerDados(r.dados) ?? {}) as { cnpjs?: Record<string, unknown>[]; totalInTheDatabase?: number };
      const lote = d.cnpjs ?? [];
      todos.push(...lote);
      if (r.demonstracao || lote.length < 50) break;
      ultimo = String(lote[lote.length - 1].cnpj ?? '');
      if (!ultimo) break;
    }
    const empresas = await this.prisma.empresa.findMany({ select: { id: true, razao_social: true, cnpj_cpf: true, arquivado_em: true } });
    const porCnpj = new Map(empresas.map((e) => [so(e.cnpj_cpf), e]));
    return {
      demonstracao,
      vinculos: todos.map((v) => {
        const cnpj = so(v.cnpj);
        const e = porCnpj.get(cnpj);
        const sit = v.situacaoCadastral as { descricao?: string } | undefined;
        return { cnpj, tipo: v.tipoEstabelecimento ?? '', situacao: sit?.descricao ?? '', uf: v.uf ?? '', municipio: v.nomeMunicipio ?? v.codigoMunicipio ?? '', cliente: e ? { id: e.id, razao_social: e.razao_social, arquivado: !!e.arquivado_em } : null };
      }),
    };
  }

  async renuncias(de?: string, ate?: string) {
    const fim = ate && /^\d{4}-\d{2}-\d{2}$/.test(ate) ? ate : new Date().toISOString().slice(0, 10);
    const ini = de && /^\d{4}-\d{2}-\d{2}$/.test(de) ? de : new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    const r = await this.m.chamarDoEscritorio({ sistema: 'PNRCONTADOR', servico: 'CONSRENUNCIA263', versao: '1.0', endpoint: 'Consultar', dados: j({ page: 0, pageSize: 100, dtInicio: ini, dtFim: fim }), demo: { contratante: PJ101, contribuinte: PJ101, dados: j({ page: 0, pageSize: 10, dtInicio: '2000-01-30', dtFim: '2000-01-30' }) } });
    if (r.status !== 200) throw new BadRequestException(r.mensagens.map((x) => x.texto).join(' ') || `O Serpro respondeu ${r.status ?? r.http}.`);
    const d = (lerDados(r.dados) ?? {}) as { content?: Record<string, unknown>[] };
    return {
      demonstracao: r.demonstracao,
      renuncias: (d.content ?? []).map((x) => ({ id: x.id, cnpj: so(x.cnpjRenunciada), data: x.dataRenuncia ? new Date(Number(x.dataRenuncia)).toISOString() : null, situacao: x.situacao ?? x.status ?? '', solicitante: x.cpfSolicitante ?? x.cnpjSolicitante ?? '' })),
    };
  }

  async comprovanteRenuncia(id: string) {
    if (!/^\d+$/.test(id)) throw new BadRequestException('Número da renúncia inválido.');
    const r = await this.m.chamarDoEscritorio({ sistema: 'PNRCONTADOR', servico: 'COMPRENUNCIA264', versao: '1.0', endpoint: 'Emitir', dados: j({ idRenuncia: Number(id) }), demo: { contratante: PJ100, contribuinte: PJ100, dados: j({ idRenuncia: 2558 }) } });
    const ex = extrairArquivos(lerDados(r.dados), 'renuncia');
    if (r.status !== 200 || !ex.arquivos.length) throw new BadRequestException(r.mensagens.map((x) => x.texto).join(' ') || 'O Serpro não devolveu o comprovante.');
    return { nome: `Comprovante de renúncia ${id}.pdf`, buffer: Buffer.from(ex.arquivos[0].base64, 'base64') };
  }

  async situacaoSolicitacao(id: string) {
    if (!/^[\w-]{6,80}$/.test(id)) throw new BadRequestException('Número da solicitação inválido.');
    const r = await this.m.chamarDoEscritorio({ sistema: 'PNRCONTADOR', servico: 'SITSOLICRENUNCIA265', versao: '1.0', endpoint: 'Consultar', dados: j({ idSolicitacao: id }), demo: { contratante: PJ100, contribuinte: PJ100, dados: j({ idSolicitacao: 'PNRCONTADOR-20250212-af81730aeb29c9fdac15' }) } });
    if (r.status !== 200) throw new BadRequestException(r.mensagens.map((x) => x.texto).join(' ') || `O Serpro respondeu ${r.status ?? r.http}.`);
    return { demonstracao: r.demonstracao, ...((lerDados(r.dados) ?? {}) as Record<string, unknown>) };
  }

  /**
   * Redesim: pede a renúncia do escritório como contador responsável por um cliente (SOLICRENUNCIA262). Só com as declarações
   * aceitas pelo usuário (cienciaDeclaracoes). Devolve o número da solicitação, acompanhado depois em SITSOLICRENUNCIA265.
   */
  async solicitarRenuncia(e: { empresaId?: string; cnpj?: string; cpfContador?: string; cpfPreenchedor?: string; ciencia?: boolean }) {
    if (e.ciencia !== true) throw new BadRequestException('Leia e aceite as declarações da renúncia antes de enviar.');
    const cpfContador = so(e.cpfContador), cpfPreenchedor = so(e.cpfPreenchedor);
    if (cpfContador.length !== 11) throw new BadRequestException('Informe o CPF do contador responsável (11 dígitos).');
    if (cpfPreenchedor.length !== 11) throw new BadRequestException('Informe o CPF de quem preenche o pedido (11 dígitos).');
    const empresa = e.empresaId ? await this.prisma.empresa.findUnique({ where: { id: e.empresaId }, select: { cnpj_cpf: true, razao_social: true } }) : null;
    const cnpj = so(empresa?.cnpj_cpf ?? e.cnpj);
    if (cnpj.length !== 14) throw new BadRequestException('Escolha a empresa (com CNPJ) da qual o escritório vai renunciar.');
    const escritorio = (await this.m.cnpjDoEscritorio()) ?? '';
    const r = await this.m.chamarDoEscritorio({
      sistema: 'PNRCONTADOR', servico: 'SOLICRENUNCIA262', versao: '1.0', endpoint: 'Declarar', contribuinte: { numero: cpfContador, tipo: 1 },
      dados: j({ solicitacaoRenunciaContador: { cnpj, cpfContador, cnpjEmpresaContabil: escritorio, cpfPreenchedor }, cienciaDeclaracoes: true }),
      demo: { contratante: PJ100, contribuinte: PF11, dados: j({ solicitacaoRenunciaContador: { cnpj: '99999999999999', cpfContador: '00000000011', cnpjEmpresaContabil: '00000000000100', cpfPreenchedor: '00000000011' }, cienciaDeclaracoes: false }) },
    });
    if (r.status !== 200) throw new BadRequestException(r.mensagens.map((x) => x.texto).join(' ') || `O Serpro respondeu ${r.status ?? r.http}.`);
    const d = (lerDados(r.dados) ?? {}) as { idSolicitacao?: string };
    this.log.log(`Renúncia pedida na Redesim para ${empresa?.razao_social ?? cnpj}: ${d.idSolicitacao ?? '(sem número)'}`);
    return { demonstracao: r.demonstracao, idSolicitacao: d.idSolicitacao ?? null, mensagens: r.mensagens };
  }

  /**
   * SPED transmitido no ano (EFD ICMS/IPI e EFD-Contribuições), pelo ReceitanetBX-Serviço com o certificado do escritório:
   * como procurador do cliente (procuração eletrônica no e-CAC) ou como contribuinte, quando é o CNPJ do próprio escritório.
   */
  /**
   * SPED e EFD do cliente no ano. Sem `consultar`, mostra o que já está guardado no InTAX (sem ir à Receita); com `consultar`,
   * pergunta ao ReceitanetBX, pede os arquivos novos e guarda o resultado da consulta.
   */
  async sped(empresaId: string, anoInformado?: string, usuario?: { email?: string }, consultar = false) {
    const ano = Number(anoInformado) || new Date().getFullYear();
    if (ano < 2009 || ano > new Date().getFullYear()) throw new BadRequestException('Ano inválido.');
    if (!consultar) return this.spedGuardado(empresaId, ano);
    const e = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { cnpj_cpf: true } });
    const cnpj = so(e?.cnpj_cpf);
    if (cnpj.length !== 14) throw new BadRequestException('O cliente não tem CNPJ válido no cadastro.');
    const proprio = cnpj === (await this.m.cnpjDoEscritorio());
    // Pergunta aos dois serviços (escritório e sócio) e junta: vale a procuração que existir. Serviço fora do ar é ignorado.
    const escrituracoes = [];
    const usados = new Set<string>();
    for (const esc of ESCRITURACOES) {
      const arquivos = new Map<string, Awaited<ReturnType<typeof pesquisarAno>>[number]>();
      const erros: string[] = [];
      let respondeu = false;
      let algumOk = false;
      for (const s of servicosBx()) {
        try {
          const achados = await pesquisarAno(esc, cnpj, ano, proprio && s.id === 'primario', s.url);
          respondeu = true;
          algumOk = true;
          if (achados.length) usados.add(s.rotulo);
          for (const a of achados) arquivos.set(a.id || `${s.id}-${arquivos.size}`, { ...a, servico: s.id });
        } catch (err) {
          const m = (err as Error).message;
          if (!/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(m)) { respondeu = true; erros.push(`${s.rotulo}: ${m}`); }
        }
      }
      const lista = [...arquivos.values()];
      // Basta um certificado responder sem erro (achou ou não achou nada): o erro de procuração do outro não interessa.
      const erro = !respondeu ? 'O serviço do ReceitanetBX não respondeu.' : lista.length || algumOk ? null : erros.join(' · ') || null;
      // A pesquisa só devolve o id de cada arquivo: o InTAX pede todos e lê o período de dentro de cada um quando chega.
      if (this.downloads && lista.length) await this.downloads.pedirTodos(empresaId, esc.id, lista.map((a) => ({ id: a.id, servico: a.servico })), proprio, usuario).catch((e) => this.log.warn(`Pedido dos arquivos: ${(e as Error).message}`));
      const baixados = await this.prisma.spedDownload.findMany({ where: { empresa_id: empresaId, escrituracao: esc.id } });
      const ids = new Set(lista.map((a) => a.id));
      const naFila = baixados.filter((b) => ['SOLICITADO', 'PROCESSANDO', 'DISPONIVEL'].includes(b.situacao) && (ids.has(b.arquivo_receita) || !lista.length)).length;
      escrituracoes.push({
        id: esc.id, rotulo: esc.rotulo, anual: esc.anual, erro, encontrados: lista.length, na_fila: naFila,
        baixados: baixados.filter((b) => b.situacao === 'GUARDADO' && ids.has(b.arquivo_receita)).length,
        meses: respondeu ? porCompetenciaBaixados(esc, ano, baixados, naFila) : [],
      });
    }
    const consultado_em = new Date();
    const memoria: MemoriaSped = { consultado_em: consultado_em.toISOString(), certificados: [...usados], escrituracoes: Object.fromEntries(escrituracoes.map((x) => [x.id, { encontrados: x.encontrados, erro: x.erro }])) };
    await this.prisma.parametroSistema.upsert({ where: { chave: chaveSped(empresaId, ano) }, update: { valor: JSON.stringify(memoria) }, create: { chave: chaveSped(empresaId, ano), valor: JSON.stringify(memoria), descricao: 'SPED e EFD: última consulta à Receita' } }).catch(() => undefined);
    return { ...(await this.spedGuardado(empresaId, ano)), perfil: proprio ? 'contribuinte' : 'procurador', proprio, escrituracoes_consultadas: escrituracoes.length };
  }

  /** O que já está no InTAX: arquivos guardados e a última consulta à Receita daquele ano (sem chamar a Receita). */
  async spedGuardado(empresaId: string, ano: number) {
    const p = await this.prisma.parametroSistema.findUnique({ where: { chave: chaveSped(empresaId, ano) } }).catch(() => null);
    let memoria: MemoriaSped | null = null;
    try { memoria = p ? (JSON.parse(p.valor) as MemoriaSped) : null; } catch { memoria = null; }
    const escrituracoes = [];
    for (const esc of ESCRITURACOES) {
      const baixados = await this.prisma.spedDownload.findMany({ where: { empresa_id: empresaId, escrituracao: esc.id } });
      const doAno = baixados.filter((b) => !b.periodo_inicio || b.periodo_inicio.slice(0, 4) <= String(ano) && (b.periodo_fim ?? '').slice(0, 4) >= String(ano));
      const naFila = doAno.filter((b) => ['SOLICITADO', 'PROCESSANDO', 'DISPONIVEL'].includes(b.situacao)).length;
      const m = memoria?.escrituracoes?.[esc.id];
      const meses = porCompetenciaBaixados(esc, ano, baixados, naFila).map((x) => (!memoria && x.situacao === 'NAO_ENCONTRADA' ? { ...x, situacao: 'SEM_CONSULTA' } : x));
      escrituracoes.push({
        id: esc.id, rotulo: esc.rotulo, anual: esc.anual, erro: m?.erro ?? null, encontrados: m?.encontrados ?? 0, na_fila: naFila,
        baixados: new Set(doAno.filter((b) => b.situacao === 'GUARDADO').map((b) => b.arquivo_receita)).size, meses,
      });
    }
    // Arquivos guardados antes de o tamanho ser anotado: lê do cadastro de arquivos.
    type Arq = { id: string; nome: string; tipo: string; tamanho?: number };
    const semTamanho = escrituracoes.flatMap((x) => x.meses.flatMap((mm) => (Array.isArray(mm.ultima?.arquivos) ? (mm.ultima!.arquivos as Arq[]) : []))).filter((a) => a.tamanho === undefined);
    if (semTamanho.length) {
      const t = new Map((await this.prisma.arquivoEmpresa.findMany({ where: { id: { in: semTamanho.map((a) => a.id) } }, select: { id: true, tamanho: true } })).map((a) => [a.id, a.tamanho]));
      for (const a of semTamanho) a.tamanho = t.get(a.id);
    }
    return { ano, consultado_em: memoria?.consultado_em ?? null, certificados: memoria?.certificados ?? [], escrituracoes, guardado: true };
  }

  /**
   * Todo dia às 05:40 (Brasília), em produção: se a agenda do SPED cai hoje, consulta na Receita o ano corrente (e o anterior até
   * julho, quando ainda chegam ECD e ECF) de cada cliente do BPO e pede os arquivos novos.
   */
  @Cron('40 5 * * *', { timeZone: 'America/Sao_Paulo' })
  async rotinaSped(hoje = new Date()) {
    if (String(process.env.MONITORAMENTO_AGENDADOR ?? '').toLowerCase() === 'off' || process.env.NODE_ENV !== 'production') return { rodou: false };
    const cfg = await this.m.configRotina();
    if (!cfg.ativa || !caiHoje(cfg.documentos.sped, hoje)) return { rodou: false };
    const bpo = await this.prisma.servicoContratado.findMany({ where: { tipo: 'BPO_FISCAL', situacao: 'ATIVO' }, select: { empresa_id: true } });
    const anoAtual = Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(hoje));
    const anos = mesDeBrasilia(hoje) <= 7 ? [anoAtual, anoAtual - 1] : [anoAtual];
    let feitas = 0;
    for (const empresaId of [...new Set(bpo.map((b) => b.empresa_id))]) {
      for (const ano of anos) {
        try { await this.sped(empresaId, String(ano), { email: 'rotina' }, true); feitas++; } catch (err) { this.log.warn(`SPED ${ano} de ${empresaId}: ${(err as Error).message}`); }
      }
    }
    return { rodou: true, feitas };
  }

  // ── Eventos de atualização ───────────────────────────────────────────
  /** Pede ao Serpro a data da última novidade de cada evento para os CNPJs (lotes de até 1.000) e devolve CNPJ → data. */
  async eventosDoLote(cnpjs: string[], evento: string): Promise<{ datas: Map<string, Date | null>; demonstracao: boolean }> {
    const datas = new Map<string, Date | null>();
    let demonstracao = false;
    for (let i = 0; i < cnpjs.length; i += 1000) {
      const lote = cnpjs.slice(i, i + 1000);
      const sol = await this.m.chamarDoEscritorio({
        sistema: 'EVENTOSATUALIZACAO', servico: 'SOLICEVENTOSPJ132', versao: '1.0', endpoint: 'Monitorar', dados: j({ evento }), contribuinte: { numero: lote.join(','), tipo: 4 },
        demo: { contratante: PJ9, contribuinte: { numero: '00000000000000,11111111111111,22222222222222,33333333333333', tipo: 4 }, dados: j({ evento: 'E0301' }) },
      });
      demonstracao = sol.demonstracao;
      const p = protocoloDe(sol.dados);
      if (sol.status !== 200 || !p.protocolo) throw new BadRequestException(sol.mensagens.map((x) => x.texto).join(' ') || 'O Serpro não devolveu o protocolo dos eventos.');
      let espera = Math.min(Math.max(Number(p.TempoEsperaMedioEmMs) || 1000, 300), 60_000);
      for (let t = 0; t < 10; t++) {
        await esperar(this.pausaMs === 1 ? espera : this.pausaMs);
        const ob = await this.m.chamarDoEscritorio({
          sistema: 'EVENTOSATUALIZACAO', servico: 'OBTEREVENTOSPJ134', versao: '1.0', endpoint: 'Monitorar', dados: j({ protocolo: p.protocolo, evento }), contribuinte: { numero: '', tipo: 4 },
          demo: { contratante: PJ9, contribuinte: { numero: '', tipo: 4 }, dados: j({ protocolo: 'q90n3455-fa91-419c-c0ad-a4ms50215acl', evento: 'E0301' }) },
        });
        if (ob.http === 202 || ob.status === 202) { espera = Math.min(espera * 2, 60_000); continue; }
        if (ob.status !== 200) throw new BadRequestException(ob.mensagens.map((x) => x.texto).join(' ') || 'O Serpro não devolveu os eventos.');
        const matriz = lerDados(ob.dados);
        for (const linha of Array.isArray(matriz) ? matriz : []) if (Array.isArray(linha)) datas.set(so(linha[0]), dataDoEvento(linha[1]));
        break;
      }
    }
    return { datas, demonstracao };
  }

  /**
   * Todo dia às 06:10 (Brasília), em produção: pede os eventos dos clientes do BPO e, para cada novidade mais nova que a última consulta
   * do assunto, consulta de novo sozinho (recibo da DCTFWeb, caixa postal, pagamentos). Nada é digitado.
   */
  @Cron('10 6 * * *', { timeZone: 'America/Sao_Paulo' })
  async rotinaEventos() {
    if (String(process.env.MONITORAMENTO_AGENDADOR ?? '').toLowerCase() === 'off') return { rodou: false, motivo: 'desligado no servidor' };
    if ((await this.m.modo()) !== 'PRODUCAO') return { rodou: false, motivo: 'só em produção' };
    return this.atualizarEventos(true);
  }

  async atualizarEventos(consultarNovidades: boolean) {
    const ids = await this.m.empresasDoBpoPublico();
    const empresas = await this.prisma.empresa.findMany({ where: { id: { in: ids }, arquivado_em: null }, select: { id: true, cnpj_cpf: true } });
    const pj = empresas.filter((e) => so(e.cnpj_cpf).length === 14);
    const porCnpj = new Map(pj.map((e) => [so(e.cnpj_cpf), e.id]));
    let novidades = 0;
    let consultas = 0;
    for (const ev of EVENTOS) {
      let r;
      try { r = await this.eventosDoLote([...porCnpj.keys()], ev.id); } catch (e) { this.log.warn(`Eventos ${ev.id}: ${(e as Error).message}`); continue; }
      if (r.demonstracao) continue; // exemplo fictício: não grava em cliente nenhum
      for (const [cnpj, data] of r.datas) {
        const empresaId = porCnpj.get(cnpj);
        if (!empresaId || !data) continue;
        const antes = await this.prisma.eventoReceita.findUnique({ where: { empresa_id_evento: { empresa_id: empresaId, evento: ev.id } } });
        if (antes && antes.data_evento.getTime() >= data.getTime()) continue;
        await this.prisma.eventoReceita.upsert({ where: { empresa_id_evento: { empresa_id: empresaId, evento: ev.id } }, update: { data_evento: data, consultado_em: new Date(), atendido_em: null }, create: { empresa_id: empresaId, evento: ev.id, data_evento: data } });
        novidades++;
        if (consultarNovidades) {
          try { await this.m.consultarPelaRotina(empresaId, ev.consulta); consultas++; await this.prisma.eventoReceita.update({ where: { empresa_id_evento: { empresa_id: empresaId, evento: ev.id } }, data: { atendido_em: new Date() } }); } catch (e) { this.log.warn(`Consulta ${ev.consulta} de ${empresaId}: ${(e as Error).message}`); }
        }
      }
    }
    return { rodou: true, clientes: porCnpj.size, novidades, consultas };
  }

  /** Últimas novidades da Receita de um cliente (para o topo da tela do monitoramento). */
  async novidades(empresaId: string) {
    const l = await this.prisma.eventoReceita.findMany({ where: { empresa_id: empresaId }, orderBy: { data_evento: 'desc' } });
    return l.map((e) => ({ ...e, rotulo: EVENTOS.find((x) => x.id === e.evento)?.rotulo ?? e.evento }));
  }

  /** Teste no ambiente de demonstração: devolve a matriz oficial de exemplo, sem gravar nada. */
  async testarEventos() {
    const r = await this.eventosDoLote(['00000000000000'], 'E0301');
    return { demonstracao: r.demonstracao, linhas: [...r.datas.entries()].map(([cnpj, data]) => ({ cnpj, data })) };
  }
}
