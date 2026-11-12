import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { lerPfx } from '../certificados/certificado-pfx';
import { CertificadosService } from '../certificados/certificados.service';
import { assinarDeclaracaoDctfweb } from './dctfweb-assinatura';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { MailService } from '../mail/mail.service';
import { completarParametros, GRUPOS, OBRIGACOES, SERVICO_POR_CHAVE, SERVICOS, Servico, servicosParaEmpresa } from './catalogo';
import { Credenciais, ErroIntegra, Identificacao, IntegraCliente, Modo, MODOS, Resposta } from './integra.cliente';
import { extrairArquivos, interpretar, Nivel, Resumo } from './interpretar';
import { termoAssinado, vigenciaPadrao } from './termo-autorizacao';
import { PdfService } from '../pdf/pdf.service';
import { ConsultaParaRelatorio, excelDaConsulta, pdfDaConsulta } from './relatorio-consulta';
import { LeituraSitfis, lerRelatorioSitfis, resumoDoSitfis } from './sitfis-leitura';
import { textoDoPdf } from '../pre-analise/leitor-certidoes';
import { ContratoIntegraService, CredenciaisContrato } from './contrato.service';

type Usuario = { email?: string; role?: string; sub?: string; id?: string } | undefined;
type Alvo = { empresaId?: string; pessoaFisicaId?: string };
export type ConfigRotina = { ativa: boolean; dias: Record<string, number>; guias: { ativa: boolean; dia: number; enviar_email: boolean } };

const CHAVE_MODO = 'integra_contador_modo';
const CHAVE_ROTINA = 'monitoramento_rotina';
const ROTINA_PADRAO: ConfigRotina = { ativa: false, dias: { situacao: 1, declaracoes: 21, guias: 0, mensagens: 1, parcelamentos: 5, mei: 5, procuracoes: 1, processos: 0 }, guias: { ativa: false, dia: 10, enviar_email: false } };
const PESO: Record<Nivel, number> = { CRITICO: 3, ATENCAO: 2, OK: 1, INFO: 0 };
const MAX_LOTE = 2000;
const so = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const pior = (a: Nivel | undefined, b: Nivel): Nivel => (!a || PESO[b] > PESO[a] ? b : a);

/** Respostas oficiais do ambiente de demonstração do Serpro (guardadas em 11/11/2026), usadas quando o trial limita ou cai. */
let RESERVA: Record<string, { status: number; mensagens: { codigo: string; texto: string }[]; dados: string }> | null = null;
function reserva() {
  if (!RESERVA) {
    RESERVA = {};
    for (const caminho of [join(__dirname, '__fixtures__', 'demonstracao.json'), join(process.cwd(), 'src', 'monitoramento', '__fixtures__', 'demonstracao.json')]) {
      try { RESERVA = JSON.parse(readFileSync(caminho, 'utf8')); break; } catch { /* tenta o próximo caminho */ }
    }
  }
  return RESERVA!;
}

export { credenciaisDoAmbiente } from './contrato.service';

const lerEtag = (etag: string | undefined, campo: string) => {
  const m = String(etag ?? '').replace(/^W\//, '').replace(/^"|"$/g, '').match(new RegExp(`^${campo}:(.+)$`));
  return m ? m[1] : undefined;
};

/**
 * Relatório de situação fiscal, SITFIS versão 2.0 (a 1.0 foi descontinuada em 01/04/2024):
 * 1. Apoiar SOLICITARPROTOCOLO91 → 200 com protocoloRelatorio (e tempoEspera em ms), ou 304 com o protocolo no ETag
 *    (pedido repetido no mesmo dia), ou 503 com tempoEspera;
 * 2. Emitir RELATORIOSITFIS92 com o protocolo → 200 com o PDF, 202 (ainda processando, tempoEspera no corpo) ou 204 (sem corpo,
 *    ETag "tempoEspera:4000"). Espera o tempo indicado e tenta de novo.
 */
export async function relatorioSitfis(chamar: (servico: string, endpoint: Servico['endpoint'], dados: string) => Promise<Resposta>, esperar = (ms: number) => new Promise((r) => setTimeout(r, ms)), tentativas = 8): Promise<Resposta> {
  let prot = await chamar('SOLICITARPROTOCOLO91', 'Apoiar', '');
  let d = (prot.dados ?? {}) as { protocoloRelatorio?: string; tempoEspera?: number };
  let protocolo = d.protocoloRelatorio || lerEtag(prot.etag, 'protocoloRelatorio');
  for (let i = 0; !protocolo && (prot.http === 503 || prot.status === 503) && i < 3; i += 1) {
    await esperar(Math.min(Number(d.tempoEspera) || 3000, 20_000));
    prot = await chamar('SOLICITARPROTOCOLO91', 'Apoiar', '');
    d = (prot.dados ?? {}) as typeof d;
    protocolo = d.protocoloRelatorio || lerEtag(prot.etag, 'protocoloRelatorio');
  }
  if (!protocolo) return prot;
  let espera = Number(d.tempoEspera) || 3000;
  let r: Resposta = prot;
  for (let i = 0; i < tentativas; i += 1) {
    await esperar(Math.min(Math.max(espera, 1000), 20_000));
    r = await chamar('RELATORIOSITFIS92', 'Emitir', JSON.stringify({ protocoloRelatorio: protocolo }));
    const corpo = (r.dados ?? {}) as { pdf?: string; tempoEspera?: number };
    if ((r.status === 200 || r.http === 200) && corpo.pdf) return { ...r, status: 200 };
    if (r.http === 202 || r.status === 202 || r.http === 204 || r.status === 204) {
      espera = Number(corpo.tempoEspera) || Number(lerEtag(r.etag, 'tempoEspera')) || 4000;
      continue;
    }
    return r;
  }
  return { ...r, mensagens: r.mensagens.length ? r.mensagens : [{ codigo: 'TEMPO', texto: 'O relatório ainda está sendo gerado pela Receita. Consulte de novo em alguns minutos (o protocolo vale até o fim do dia).' }] };
}

@Injectable()
export class MonitoramentoService {
  private readonly log = new Logger(MonitoramentoService.name);
  private modoAtual: Modo | null = null;
  private readonly cliente: IntegraCliente;
  /** Contrato em uso, relido a cada consulta (cache de 1 minuto no ContratoIntegraService). */
  private cred: CredenciaisContrato | null = null;
  private readonly lotes = new Map<string, { id: string; total: number; feitas: number; erros: number; iniciado: Date; fim?: Date; por?: string }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly certificados: CertificadosService,
    private readonly notificacoes: NotificacoesService,
    private readonly mail: MailService,
    private readonly contrato: ContratoIntegraService,
    private readonly pdf: PdfService,
  ) {
    this.cliente = new IntegraCliente(() => this.modoAtual ?? 'DESLIGADO', () => this.cred);
  }

  // ── Modo e estado ──────────────────────────────────────────────────────────
  async modo(): Promise<Modo> {
    const p = await this.prisma.parametroSistema.findUnique({ where: { chave: CHAVE_MODO } });
    const salvo = p?.valor as Modo | undefined;
    this.cred = await this.contrato.credenciais();
    const padrao: Modo = (process.env.INTEGRA_CONTADOR_MODO as Modo) || (this.cred ? 'PRODUCAO' : 'DESLIGADO');
    this.modoAtual = salvo && MODOS.includes(salvo) ? salvo : MODOS.includes(padrao) ? padrao : 'DESLIGADO';
    if (this.modoAtual === 'PRODUCAO' && !this.cred) this.modoAtual = 'DESLIGADO';
    return this.modoAtual;
  }

  async estado() {
    const modo = await this.modo();
    const c = this.cred;
    const desde = new Date(Date.now() - 86_400_000);
    const [hoje, ultima] = await Promise.all([
      this.prisma.consultaFiscal.count({ where: { createdAt: { gte: desde } } }),
      this.prisma.consultaFiscal.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true, simulado: true } }),
    ]);
    return {
      modo, contrato: !!c, contratante: c ? { cnpj: c.contratante, nome: c.nome } : null,
      consultas_24h: hoje, ultima_consulta: ultima?.createdAt ?? null,
      grupos: GRUPOS, obrigacoes: OBRIGACOES,
      servicos: SERVICOS.map((s) => ({ chave: s.chave, rotulo: s.rotulo, grupo: s.grupo, alvo: s.alvo, para: s.para ?? null, rotina: !!s.rotina, acao: s.acao ?? null, descricao: s.descricao, parametros: s.parametros.map((p) => ({ nome: p.nome, rotulo: p.rotulo, tipo: p.tipo, padrao: p.padrao ? p.padrao(new Date()) : '', obrigatorio: !!p.obrigatorio, opcoes: p.opcoes ?? null })) })),
    };
  }

  async definirModo(modo: string, usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores mudam o modo do monitoramento.');
    if (!MODOS.includes(modo as Modo)) throw new BadRequestException('Modo inválido.');
    if (modo === 'PRODUCAO' && !(await this.contrato.credenciais())) throw new BadRequestException('Falta o contrato do Integra Contador: configure o certificado e as chaves em Administração > Integrações.');
    await this.prisma.parametroSistema.upsert({ where: { chave: CHAVE_MODO }, update: { valor: modo }, create: { chave: CHAVE_MODO, valor: modo, descricao: 'Modo do monitoramento fiscal (Integra Contador)' } });
    this.modoAtual = modo as Modo;
    return this.estado();
  }

  /**
   * Chamada em nome do próprio escritório (Redesim, eventos de atualização): contratante e autor são o escritório; o contribuinte é o
   * escritório ou o lote informado. Na demonstração, usa o pedido oficial de exemplo (o trial só responde a ele) e marca `demonstracao`.
   */
  async chamarDoEscritorio(p: { sistema: string; servico: string; versao: string; endpoint: Servico['endpoint']; dados: string; contribuinte?: Identificacao; demo: { contratante: Identificacao; contribuinte: Identificacao; dados: string } }): Promise<Resposta & { demonstracao: boolean }> {
    const modo = await this.modo();
    if (modo === 'DESLIGADO') throw new BadRequestException('O monitoramento está desligado. Um administrador liga em Administração > Integrações.');
    if (modo === 'DEMONSTRACAO') {
      const r = await this.cliente.chamar({ endpoint: p.endpoint, contratante: p.demo.contratante, autorPedidoDados: p.demo.contratante, contribuinte: p.demo.contribuinte, idSistema: p.sistema, idServico: p.servico, versaoSistema: p.versao, dados: p.demo.dados });
      return { ...r, demonstracao: true };
    }
    const c = (this.cred = await this.contrato.credenciais());
    if (!c) throw new BadRequestException('Falta o contrato do Integra Contador: configure em Administração > Integrações.');
    const escritorio: Identificacao = { numero: c.contratante, tipo: 2 };
    const r = await this.cliente.chamar({ endpoint: p.endpoint, contratante: escritorio, autorPedidoDados: escritorio, contribuinte: p.contribuinte ?? escritorio, idSistema: p.sistema, idServico: p.servico, versaoSistema: p.versao, dados: p.dados });
    return { ...r, demonstracao: false };
  }

  /** CNPJ do escritório (contratante do Integra Contador), ou null sem contrato. */
  async cnpjDoEscritorio(): Promise<string | null> {
    return (await this.contrato.credenciais())?.contratante ?? null;
  }

  /** Executa uma consulta do catálogo para o cliente, como a rotina (usado pelos eventos de atualização). */
  consultarPelaRotina(empresaId: string, chave: string) {
    return this.consultar({ empresaId }, chave, {}, { email: 'rotina (evento da Receita)' }, 'ROTINA');
  }

  async empresasDoBpoPublico() {
    return this.empresasDoBpo();
  }

  // ── Consulta ──────────────────────────────────────────────────────────────
  private async contribuinte(alvo: Alvo): Promise<{ id: Identificacao; nome: string; regime: string | null; pf: boolean }> {
    if (alvo.empresaId) {
      const e = await this.prisma.empresa.findUnique({ where: { id: alvo.empresaId } });
      if (!e) throw new NotFoundException('Cliente não encontrado.');
      const d = so(e.cnpj_cpf);
      if (d.length !== 14 && d.length !== 11) throw new BadRequestException(`${e.razao_social} não tem CNPJ/CPF válido no cadastro. Corrija na ficha do cliente.`);
      return { id: { numero: d, tipo: d.length === 14 ? 2 : 1 }, nome: e.razao_social, regime: e.regime_atual, pf: d.length === 11 };
    }
    if (alvo.pessoaFisicaId) {
      const p = await this.prisma.pessoaFisica.findUnique({ where: { id: alvo.pessoaFisicaId } });
      if (!p) throw new NotFoundException('Pessoa física não encontrada.');
      const d = so(p.cpf);
      if (d.length !== 11) throw new BadRequestException(`${p.nome} não tem CPF válido.`);
      return { id: { numero: d, tipo: 1 }, nome: p.nome, regime: null, pf: true };
    }
    throw new BadRequestException('Escolha a empresa ou a pessoa física.');
  }

  /** Token do Autentica Procurador com o A1 do próprio cliente (guardado no cofre); null se o cliente não tem certificado ativo. */
  private async tokenDoCliente(empresaId: string, contribuinte: Identificacao, nome: string, contratante: { cnpj: string; nome: string }, usuario: string): Promise<string | null> {
    const guardado = await this.prisma.tokenIntegraContador.findUnique({ where: { documento: contribuinte.numero } });
    if (guardado && guardado.expira_em.getTime() > Date.now() + 60_000) return guardado.token;
    let material;
    try { material = await this.certificados.material(empresaId, 'USO_INTEGRA_CONTADOR', usuario, 'Termo de autorização do Integra Contador'); } catch { return null; }
    const agora = new Date();
    const xml = termoAssinado({ destinatario: { numero: contratante.cnpj, nome: contratante.nome }, assinadoPor: { numero: contribuinte.numero, nome }, dataAssinatura: agora, vigencia: vigenciaPadrao(agora) }, material);
    const r = await this.cliente.chamar({
      endpoint: 'Apoiar', contratante: { numero: contratante.cnpj, tipo: 2 }, autorPedidoDados: contribuinte, contribuinte,
      idSistema: 'AUTENTICAPROCURADOR', idServico: 'ENVIOXMLASSINADO81', versaoSistema: '1.0', dados: JSON.stringify({ xml: Buffer.from(xml, 'utf8').toString('base64') }),
    });
    const d = (r.dados ?? {}) as { autenticar_procurador_token?: string; data_hora_expiracao?: string };
    if (r.status !== 200 || !d.autenticar_procurador_token) {
      this.log.warn(`Autentica Procurador recusou o termo de ${contribuinte.numero}: ${r.mensagens.map((m) => m.texto).join(' ')}`);
      return null;
    }
    const expira = d.data_hora_expiracao ? new Date(`${d.data_hora_expiracao}-03:00`) : new Date(Date.now() + 12 * 3_600_000);
    await this.prisma.tokenIntegraContador.upsert({ where: { documento: contribuinte.numero }, update: { token: d.autenticar_procurador_token, expira_em: expira }, create: { documento: contribuinte.numero, token: d.autenticar_procurador_token, expira_em: expira } });
    return d.autenticar_procurador_token;
  }

  /** Uma chamada ao Integra Contador para o serviço, no modo atual. Na demonstração, usa os exemplos oficiais e a reserva quando o trial falha. */
  private async chamarServico(s: Servico, contribuinte: Identificacao, params: Record<string, string>, ctx: { empresaId?: string; nome: string; usuario: string }): Promise<{ r: Resposta; reserva: boolean; autorCliente?: boolean }> {
    const modo = this.modoAtual ?? (await this.modo());
    if (modo === 'DEMONSTRACAO') {
      const id = s.demo.contribuinte;
      const contratante = s.demo.contratante ?? id;
      try {
        const r = await this.cliente.chamar({ endpoint: s.endpoint, contratante, autorPedidoDados: s.demo.autor ?? contratante, contribuinte: id, idSistema: s.sistema, idServico: s.servico, versaoSistema: s.versao, dados: s.demo.dados });
        if (r.http < 500 && r.status !== null) return { r, reserva: false };
      } catch (e) {
        if (!(e instanceof ErroIntegra) || !['LIMITE', 'COMUNICACAO', 'TEMPO'].includes(e.codigo)) throw e;
      }
      const f = reserva()[s.servico];
      if (!f) throw new ErroIntegra('O ambiente de demonstração do Serpro não respondeu a este serviço agora. Tente em alguns minutos.', 'COMUNICACAO');
      return { r: { http: 200, status: f.status, dados: (() => { try { return JSON.parse(f.dados); } catch { return f.dados; } })(), mensagens: f.mensagens, bruto: '' }, reserva: true };
    }
    const c = (this.cred = await this.contrato.credenciais());
    if (!c) throw new ErroIntegra('Falta o contrato do Integra Contador: configure em Administração > Integrações.', 'SEM_CONTRATO');
    const contratante: Identificacao = { numero: c.contratante, tipo: 2 };
    const token = ctx.empresaId ? await this.tokenDoCliente(ctx.empresaId, contribuinte, ctx.nome, { cnpj: c.contratante, nome: c.nome }, ctx.usuario) : null;
    const autor = token ? contribuinte : contratante;
    const dados = s.chave === 'procuracao'
      ? JSON.stringify({ outorgante: contribuinte.numero, tipoOutorgante: String(contribuinte.tipo), outorgado: c.contratante, tipoOutorgado: '2' })
      : s.dados(params);
    return { r: await this.cliente.chamar({ endpoint: s.endpoint, contratante, autorPedidoDados: autor, contribuinte, idSistema: s.sistema, idServico: s.servico, versaoSistema: s.versao, dados, tokenProcurador: token }), reserva: false, autorCliente: !!token };
  }

  /**
   * Transmissão da DCTFWeb (TRANSDECLARACAO310): baixa o XML em andamento (CONSXMLDECLARACAO38), assina com o certificado do autor do
   * pedido (o A1 do cliente quando o pedido sai em nome dele; senão o e-CNPJ do escritório, do contrato) e transmite.
   */
  private async transmitirDctfweb(s: Servico, contribuinte: Identificacao, params: Record<string, string>, ctx: { empresaId?: string; nome: string; usuario: string }): Promise<Resposta> {
    const consulta = SERVICO_POR_CHAVE.get('dctfweb-xml')!;
    const x = await this.chamarServico(consulta, contribuinte, params, ctx);
    if (x.r.status !== 200) return x.r;
    const bruto = x.r.dados as { XMLStringBase64?: string } | string;
    const b64 = typeof bruto === 'string' ? (() => { try { return JSON.parse(bruto).XMLStringBase64; } catch { return undefined; } })() : bruto?.XMLStringBase64;
    if (!b64) throw new ErroIntegra('A Receita não devolveu o XML da DCTFWeb desta competência (não há declaração em andamento?).', 'COMUNICACAO');
    let chave: { keyPem: string; certPem: string };
    if (x.autorCliente && ctx.empresaId) {
      chave = await this.certificados.material(ctx.empresaId, 'USO_INTEGRA_CONTADOR', ctx.usuario, 'Assinatura da DCTFWeb para transmissão');
    } else {
      const c = await this.contrato.credenciais();
      if (!c) throw new ErroIntegra('Falta o contrato do Integra Contador: configure em Administração > Integrações.', 'SEM_CONTRATO');
      chave = lerPfx(c.pfx, c.senha);
    }
    const assinado = assinarDeclaracaoDctfweb(Buffer.from(b64, 'base64').toString('utf8'), chave.keyPem, chave.certPem);
    const dados = s.dados({ ...params, xmlAssinadoBase64: Buffer.from(assinado, 'utf8').toString('base64') });
    return (await this.chamarServico({ ...s, dados: () => dados }, contribuinte, params, ctx)).r;
  }

  async consultar(alvo: Alvo, chave: string, parametros: Record<string, unknown> | undefined, usuario: Usuario, origem: 'MANUAL' | 'ROTINA' | 'LOTE' = 'MANUAL') {
    const s = SERVICO_POR_CHAVE.get(chave);
    if (!s) throw new BadRequestException('Serviço de monitoramento desconhecido.');
    const modo = await this.modo();
    if (modo === 'DESLIGADO') throw new BadRequestException('O monitoramento está desligado. Um administrador liga em Administração > Integrações (modo demonstração ou produção).');
    const quem = await this.contribuinte(alvo);
    if (s.alvo === 'PJ' && quem.pf) throw new BadRequestException('Este serviço é só para empresas (CNPJ).');
    let params: Record<string, string>;
    // Confere os parâmetros e monta os dados antes de chamar o Serpro: entrada errada vira mensagem clara, não consulta cobrada.
    try { params = completarParametros(s, parametros ?? {}); s.dados(params); } catch (e) { throw new BadRequestException((e as Error).message); }
    // Ações mudam dados na Receita: só pela tela, uma a uma, com a confirmação do usuário.
    if (s.acao) {
      if (origem !== 'MANUAL') throw new BadRequestException('Esta ação não roda em lote nem na rotina.');
      if (params.confirmar !== 'sim') throw new BadRequestException(`Confirme a ação: ${s.acao}`);
    }
    const inicio = Date.now();
    const usuarioEmail = usuario?.email ?? 'rotina';
    let sucesso = false;
    let status: number | null = null;
    let resumo: Resumo;
    let dadosGuardados: unknown = null;
    let mensagens: { codigo: string; texto: string }[] = [];
    let arquivosBrutos: { campo: string; nome: string; base64: string }[] = [];
    let usouReserva = false;
    try {
      const ctx = { empresaId: alvo.empresaId, nome: quem.nome, usuario: usuarioEmail };
      let r: Resposta;
      let rsv = false;
      if (s.servico === 'TRANSDECLARACAO310' && modo === 'PRODUCAO') {
        r = await this.transmitirDctfweb(s, quem.id, params, ctx);
      } else if (s.sistema === 'SITFIS' && modo === 'PRODUCAO') {
        r = await relatorioSitfis(
          async (servico, endpoint, dados) => (await this.chamarServico({ ...s, servico, endpoint, dados: () => dados }, quem.id, params, ctx)).r,
        );
      } else {
        ({ r, reserva: rsv } = await this.chamarServico(s, quem.id, params, ctx));
      }
      usouReserva = rsv;
      status = r.status;
      mensagens = r.mensagens;
      sucesso = r.status === 200;
      if (sucesso) {
        const ex = extrairArquivos(r.dados, s.chave);
        arquivosBrutos = ex.arquivos;
        dadosGuardados = ex.dados;
        resumo = interpretar(s.sistema, s.servico, ex.dados, ex.arquivos, s.rotulo);
        // Relatório de situação fiscal: lê o PDF e guarda pendências, parcelamentos, inscrições, omissões e a certidão emitida.
        if (s.sistema === 'SITFIS' && ex.arquivos.length) {
          try {
            const leitura = lerRelatorioSitfis(await textoDoPdf(Buffer.from(ex.arquivos[0].base64, 'base64')));
            const r2 = resumoDoSitfis(leitura);
            dadosGuardados = { leitura };
            resumo = {
              nivel: r2.nivel, titulo: r2.titulo,
              destaques: [
                ...(leitura.certidao ? [{ rotulo: 'Certidão', valor: `${leitura.certidao.tipo}${leitura.certidao.validade ? `, válida até ${leitura.certidao.validade}` : ''}` }] : []),
                { rotulo: 'Pendências', valor: String(leitura.secoes.filter((x) => x.tipo === 'PENDENCIA').length) },
                { rotulo: 'Exigibilidade suspensa', valor: String(leitura.secoes.filter((x) => x.tipo === 'SUSPENSO').length) },
                { rotulo: 'Omissões de declaração', valor: String(leitura.secoes.filter((x) => x.tipo === 'OMISSAO').length) },
              ],
              tabela: { colunas: [{ chave: 'orgao', rotulo: 'Órgão' }, { chave: 'titulo', rotulo: 'Seção do relatório' }, { chave: 'itens', rotulo: 'Linhas' }], linhas: leitura.secoes.map((x) => ({ orgao: x.orgao === 'PGFN' ? 'PGFN' : 'Receita Federal', titulo: x.titulo, itens: Math.max(0, x.linhas.length - 1) })) },
            };
          } catch (e) { this.log.warn(`Leitura do relatório de situação fiscal: ${(e as Error).message}`); }
        }
      } else {
        resumo = { nivel: 'ATENCAO', titulo: r.mensagens.map((m) => m.texto).filter(Boolean).join(' ') || `O Serpro respondeu ${r.status ?? r.http}.`, destaques: [] };
      }
    } catch (e) {
      if (e instanceof ErroIntegra) resumo = { nivel: 'ATENCAO', titulo: e.message, destaques: [] };
      else throw e;
    }
    if (modo === 'DEMONSTRACAO') resumo.destaques.unshift({ rotulo: 'Dados', valor: usouReserva ? 'Exemplo oficial do Serpro (guardado no InTAX)' : 'Exemplo oficial do Serpro (ambiente de demonstração)' });

    const registro = await this.prisma.consultaFiscal.create({
      data: {
        empresa_id: alvo.empresaId ?? null, pessoa_fisica_id: alvo.pessoaFisicaId ?? null, chave: s.chave, sistema: s.sistema, servico: s.servico,
        parametros: params as never, sucesso, status, nivel: resumo.nivel, resumo: resumo as never, dados: (dadosGuardados ?? null) as never, mensagens: mensagens as never,
        simulado: modo === 'DEMONSTRACAO', origem, solicitado_por: usuario?.email ?? null, duracao_ms: Date.now() - inicio,
      },
    });
    if (arquivosBrutos.length) {
      const pasta = alvo.empresaId ? `monitoramento/empresa/${alvo.empresaId}` : `monitoramento/pf/${alvo.pessoaFisicaId}`;
      const arquivos = [];
      for (const [i, a] of arquivosBrutos.entries()) {
        const buf = Buffer.from(a.base64, 'base64');
        const key = `${pasta}/${registro.id}-${i + 1}.pdf`;
        await this.storage.guardar(key, buf, 'application/pdf');
        arquivos.push({ nome: a.nome, key, tamanho: buf.length });
      }
      await this.prisma.consultaFiscal.update({ where: { id: registro.id }, data: { arquivos: arquivos as never } });
      (registro as { arquivos: unknown }).arquivos = arquivos;
    }
    if (origem !== 'MANUAL' && resumo.nivel === 'CRITICO' && alvo.empresaId) {
      await this.notificacoes.criarParaAdmins({ tipo: 'FISCAL', titulo: `${quem.nome}: ${s.rotulo}`, mensagem: resumo.titulo, link: `/bpo/monitoramento/${alvo.empresaId}`, chave: `fiscal:${alvo.empresaId}:${s.chave}:${new Date().toISOString().slice(0, 10)}` }).catch(() => undefined);
    }
    return this.publico(registro);
  }

  private publico(c: { id: string; arquivos?: unknown; dados?: unknown } & Record<string, unknown>, comDados = false) {
    const arquivos = Array.isArray(c.arquivos) ? (c.arquivos as { nome: string; tamanho: number }[]).map((a, i) => ({ indice: i, nome: a.nome, tamanho: a.tamanho })) : [];
    const { dados, ...resto } = c;
    return { ...resto, arquivos, ...(comDados ? { dados } : {}) };
  }

  async consulta(id: string) {
    const c = await this.prisma.consultaFiscal.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Consulta não encontrada.');
    return this.publico(c as never, true);
  }

  /** Relatório da consulta em PDF ou Excel (toda consulta, com ou sem PDF oficial do Serpro). */
  async relatorio(id: string, formato: 'pdf' | 'xlsx') {
    const c = await this.prisma.consultaFiscal.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Consulta não encontrada.');
    const s = SERVICO_POR_CHAVE.get(c.chave);
    const rotulo = s?.rotulo ?? c.chave;
    let cliente = { nome: '', documento: '' };
    if (c.empresa_id) { const e = await this.prisma.empresa.findUnique({ where: { id: c.empresa_id }, select: { razao_social: true, cnpj_cpf: true } }); cliente = { nome: e?.razao_social ?? '', documento: so(e?.cnpj_cpf) }; }
    else if (c.pessoa_fisica_id) { const p = await this.prisma.pessoaFisica.findUnique({ where: { id: c.pessoa_fisica_id }, select: { nome: true, cpf: true } }); cliente = { nome: p?.nome ?? '', documento: so(p?.cpf) }; }
    const base = `${rotulo} ${cliente.nome} ${c.createdAt.toISOString().slice(0, 10)}`.replace(/[\\/:*?"<>|]/g, '-').trim();
    if (formato === 'xlsx') return { nome: `${base}.xlsx`, tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await excelDaConsulta(c as unknown as ConsultaParaRelatorio, rotulo, cliente) };
    return { nome: `${base}.pdf`, tipo: 'application/pdf', buffer: await pdfDaConsulta(this.pdf, c as unknown as ConsultaParaRelatorio, rotulo, cliente) };
  }

  /**
   * Leitura do relatório de situação fiscal mais recente do cliente (pendências, parcelamentos, inscrições, omissões e certidão).
   * Relatório antigo, ainda sem leitura, é lido do PDF guardado e a leitura passa a ficar na consulta.
   */
  async leituraSitfis(empresaId: string) {
    const c = await this.prisma.consultaFiscal.findFirst({ where: { empresa_id: empresaId, chave: 'sitfis', sucesso: true }, orderBy: { createdAt: 'desc' } });
    if (!c) return null;
    let leitura = (c.dados as { leitura?: LeituraSitfis } | null)?.leitura ?? null;
    const arquivos = Array.isArray(c.arquivos) ? (c.arquivos as { nome: string; key: string }[]) : [];
    if (!leitura && arquivos[0]) {
      try {
        leitura = lerRelatorioSitfis(await textoDoPdf(await this.storage.getObjectBuffer(arquivos[0].key)));
        await this.prisma.consultaFiscal.update({ where: { id: c.id }, data: { dados: { leitura } as never } });
      } catch (e) { this.log.warn(`Leitura do relatório ${c.id}: ${(e as Error).message}`); }
    }
    return { consulta_id: c.id, consultado_em: c.createdAt, simulado: c.simulado, arquivo: arquivos[0] ? { indice: 0, nome: arquivos[0].nome } : null, leitura };
  }

  async arquivo(id: string, indice: number) {
    const c = await this.prisma.consultaFiscal.findUnique({ where: { id } });
    const a = Array.isArray(c?.arquivos) ? (c!.arquivos as { nome: string; key: string }[])[indice] : undefined;
    if (!a) throw new NotFoundException('Arquivo não encontrado.');
    return { nome: a.nome, buffer: await this.storage.getObjectBuffer(a.key) };
  }

  /** Última consulta de cada serviço do cliente, e o histórico de um serviço (as 30 mais recentes). */
  async daEmpresa(alvo: Alvo, chave?: string) {
    const where = alvo.empresaId ? { empresa_id: alvo.empresaId } : { pessoa_fisica_id: alvo.pessoaFisicaId };
    if (chave) {
      const h = await this.prisma.consultaFiscal.findMany({ where: { ...where, chave }, orderBy: { createdAt: 'desc' }, take: 30 });
      return h.map((c) => this.publico(c as never));
    }
    const todas = await this.prisma.consultaFiscal.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
    const ultima = new Map<string, unknown>();
    for (const c of todas) if (!ultima.has(c.chave)) ultima.set(c.chave, this.publico(c as never));
    const dispensas = alvo.empresaId ? await this.prisma.obrigacaoDispensada.findMany({ where: { empresa_id: alvo.empresaId } }) : [];
    let quem = null;
    try { quem = await this.contribuinte(alvo); } catch { /* sem documento: a tela avisa */ }
    const servicos = quem ? servicosParaEmpresa(quem.regime, quem.pf).map((s) => s.chave) : SERVICOS.map((s) => s.chave);
    return { ultimas: Object.fromEntries(ultima), dispensas, servicos_indicados: servicos };
  }

  /** Painel da carteira: por empresa, o pior nível de cada grupo nas últimas consultas e a data da mais recente. */
  async painel(empresaIds?: string[]) {
    const consultas = await this.prisma.consultaFiscal.findMany({
      // Consulta que falhou (o Serpro não respondeu) não entra na nota: vale a última que trouxe resultado.
      where: { empresa_id: empresaIds?.length ? { in: empresaIds } : { not: null }, sucesso: true },
      orderBy: { createdAt: 'desc' }, take: 20000,
      select: { empresa_id: true, chave: true, nivel: true, createdAt: true, simulado: true, resumo: true },
    });
    // Só contam os serviços que valem para o regime do cadastro (um Presumido não é avaliado pelo DAS do MEI).
    const empresas = await this.prisma.empresa.findMany({ where: { id: { in: [...new Set(consultas.map((c) => c.empresa_id!))] } }, select: { id: true, regime_atual: true, cnpj_cpf: true } });
    const valem = new Map(empresas.map((e) => [e.id, new Set(servicosParaEmpresa(e.regime_atual, so(e.cnpj_cpf).length === 11).map((s) => s.chave))]));
    const visto = new Set<string>();
    const porEmpresa = new Map<string, { empresa_id: string; grupos: Record<string, Nivel>; atualizado: Date; simulado: boolean; alertas: { chave: string; nivel: Nivel; titulo: string }[] }>();
    for (const c of consultas) {
      const k = `${c.empresa_id}:${c.chave}`;
      if (visto.has(k)) continue;
      visto.add(k);
      const s = SERVICO_POR_CHAVE.get(c.chave);
      if (!s || !valem.get(c.empresa_id!)?.has(c.chave)) continue;
      const e = porEmpresa.get(c.empresa_id!) ?? { empresa_id: c.empresa_id!, grupos: {}, atualizado: c.createdAt, simulado: c.simulado, alertas: [] };
      e.grupos[s.grupo] = pior(e.grupos[s.grupo], c.nivel as Nivel);
      if (c.createdAt > e.atualizado) e.atualizado = c.createdAt;
      if (c.nivel === 'CRITICO' || c.nivel === 'ATENCAO') e.alertas.push({ chave: c.chave, nivel: c.nivel as Nivel, titulo: String((c.resumo as { titulo?: string })?.titulo ?? '') });
      porEmpresa.set(c.empresa_id!, e);
    }
    // Parcelamentos da PGFN (registrados à mão, sem API oficial): entram no assunto Parcelamentos.
    const pgfn = await this.prisma.parcelamentoPgfn.findMany({ where: empresaIds?.length ? { empresa_id: { in: empresaIds } } : {} });
    for (const pp of pgfn) {
      const nivel = nivelPgfn(pp);
      if (nivel === 'INFO') continue;
      const e = porEmpresa.get(pp.empresa_id) ?? { empresa_id: pp.empresa_id, grupos: {}, atualizado: pp.updatedAt, simulado: false, alertas: [] };
      e.grupos.parcelamentos = pior(e.grupos.parcelamentos, nivel);
      if (nivel !== 'OK') e.alertas.push({ chave: 'pgfn', nivel, titulo: tituloPgfn(pp) });
      porEmpresa.set(pp.empresa_id, e);
    }
    return [...porEmpresa.values()].map((e) => ({ ...e, score: pontuacao(e.grupos) }));
  }

  /** Clientes > Procurações e certificados: para cada empresa, o A1 no cofre (com a validade) e a última consulta da procuração. */
  async procuracoes() {
    const [empresas, certs, consultas] = await Promise.all([
      this.prisma.empresa.findMany({ select: { id: true, razao_social: true, cnpj_cpf: true, regime_atual: true }, orderBy: { razao_social: 'asc' } }),
      this.prisma.certificadoDigital.findMany({ where: { status: 'ATIVO' }, select: { empresa_id: true, valido_ate: true, titular: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.consultaFiscal.findMany({ where: { chave: 'procuracao', empresa_id: { not: null } }, orderBy: { createdAt: 'desc' }, select: { empresa_id: true, nivel: true, resumo: true, createdAt: true, simulado: true } }),
    ]);
    const cert = new Map<string, { valido_ate: Date; titular: string }>();
    for (const c of certs) if (!cert.has(c.empresa_id)) cert.set(c.empresa_id, c);
    const proc = new Map<string, (typeof consultas)[number]>();
    for (const c of consultas) if (!proc.has(c.empresa_id!)) proc.set(c.empresa_id!, c);
    return empresas.map((e) => {
      const c = cert.get(e.id);
      const p = proc.get(e.id);
      const dias = c ? Math.ceil((c.valido_ate.getTime() - Date.now()) / 86_400_000) : null;
      return {
        empresa_id: e.id, razao_social: e.razao_social, cnpj_cpf: e.cnpj_cpf, regime_atual: e.regime_atual,
        certificado: c ? { valido_ate: c.valido_ate, dias, situacao: dias! < 0 ? 'VENCIDO' : dias! <= 30 ? 'VENCENDO' : 'VALIDO' } : null,
        procuracao: p ? { nivel: p.nivel, titulo: (p.resumo as { titulo?: string })?.titulo ?? '', consultado_em: p.createdAt, simulado: p.simulado } : null,
        caminho: c && dias! >= 0 ? 'TERMO_A1' : p?.nivel === 'OK' ? 'PROCURACAO' : 'SEM_ACESSO',
      };
    });
  }

  // ── Lote e rotina ─────────────────────────────────────────────────────────
  iniciarLote(empresaIds: string[], chaves: string[] | undefined, usuario: Usuario, origem: 'LOTE' | 'ROTINA' = 'LOTE') {
    const ids = [...new Set(empresaIds ?? [])];
    if (!ids.length) throw new BadRequestException('Escolha pelo menos uma empresa.');
    const id = `lote-${Date.now().toString(36)}`;
    const estado = { id, total: 0, feitas: 0, erros: 0, iniciado: new Date(), por: usuario?.email };
    this.lotes.set(id, estado);
    void (async () => {
      const empresas = await this.prisma.empresa.findMany({ where: { id: { in: ids } }, select: { id: true, regime_atual: true, cnpj_cpf: true } });
      const dispensas = await this.prisma.obrigacaoDispensada.findMany({ where: { empresa_id: { in: ids } } });
      const tarefas: { empresaId: string; chave: string }[] = [];
      for (const e of empresas) {
        const pf = so(e.cnpj_cpf).length === 11;
        const indicados = servicosParaEmpresa(e.regime_atual, pf).filter((s) => !s.acao && (chaves?.length ? chaves.includes(s.chave) : s.rotina));
        for (const s of indicados) {
          if (s.obrigacao && dispensas.some((d) => d.empresa_id === e.id && d.obrigacao === s.obrigacao)) continue;
          tarefas.push({ empresaId: e.id, chave: s.chave });
        }
      }
      estado.total = Math.min(tarefas.length, MAX_LOTE);
      for (const t of tarefas.slice(0, MAX_LOTE)) {
        try { await this.consultar({ empresaId: t.empresaId }, t.chave, {}, usuario, origem); } catch (e) { estado.erros += 1; this.log.warn(`Lote ${id}: ${t.chave} de ${t.empresaId}: ${(e as Error).message}`); }
        estado.feitas += 1;
      }
      (estado as { fim?: Date }).fim = new Date();
    })().catch((e) => this.log.error(`Lote ${id} parou: ${(e as Error).message}`));
    return estado;
  }

  lote(id: string) {
    const l = this.lotes.get(id);
    if (!l) throw new NotFoundException('Atualização não encontrada (o servidor pode ter reiniciado).');
    return l;
  }

  async configRotina(): Promise<ConfigRotina> {
    const p = await this.prisma.parametroSistema.findUnique({ where: { chave: CHAVE_ROTINA } });
    try { const v = JSON.parse(p?.valor ?? '{}'); return { ...ROTINA_PADRAO, ...v, dias: { ...ROTINA_PADRAO.dias, ...(v.dias ?? {}) }, guias: { ...ROTINA_PADRAO.guias, ...(v.guias ?? {}) } }; } catch { return ROTINA_PADRAO; }
  }

  async salvarRotina(c: Partial<ConfigRotina>, usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores mudam as rotinas.');
    const atual = await this.configRotina();
    const dias: Record<string, number> = { ...atual.dias };
    for (const [g, d] of Object.entries(c.dias ?? {})) {
      if (!GRUPOS.some((x) => x.id === g)) continue;
      const n = Number(d);
      if (!Number.isInteger(n) || n < 0 || n > 28) throw new BadRequestException('O dia vai de 1 a 28 (0 desliga).');
      dias[g] = n;
    }
    const guias = { ...atual.guias, ...(c.guias ?? {}) };
    if (!Number.isInteger(Number(guias.dia)) || guias.dia < 1 || guias.dia > 28) throw new BadRequestException('O dia do envio de guias vai de 1 a 28.');
    const nova: ConfigRotina = { ativa: c.ativa ?? atual.ativa, dias, guias: { ativa: !!guias.ativa, dia: Number(guias.dia), enviar_email: !!guias.enviar_email } };
    await this.prisma.parametroSistema.upsert({ where: { chave: CHAVE_ROTINA }, update: { valor: JSON.stringify(nova) }, create: { chave: CHAVE_ROTINA, valor: JSON.stringify(nova), descricao: 'Rotina automática do monitoramento fiscal' } });
    return nova;
  }

  /** Empresas com BPO fiscal ativo e com o módulo de monitoramento (ou sem módulos marcados, que valem todos). */
  private async empresasDoBpo(): Promise<string[]> {
    const s = await this.prisma.servicoContratado.findMany({ where: { tipo: 'BPO_FISCAL', situacao: 'ATIVO' }, select: { empresa_id: true, modulos: true } });
    return [...new Set(s.filter((x) => !x.modulos?.length || x.modulos.includes('MONITORAMENTO')).map((x) => x.empresa_id))];
  }

  /** Todo dia às 06:30 (Brasília): roda os grupos cujo dia do mês é hoje e, no dia das guias, gera e envia as guias. */
  @Cron('30 6 * * *', { timeZone: 'America/Sao_Paulo' })
  async rotinaDiaria(hoje = new Date()) {
    if (String(process.env.MONITORAMENTO_AGENDADOR ?? '').toLowerCase() === 'off') return { rodou: false, motivo: 'desligado no servidor' };
    const cfg = await this.configRotina();
    const modo = await this.modo();
    if (!cfg.ativa || modo === 'DESLIGADO') return { rodou: false, motivo: 'rotina ou monitoramento desligado' };
    const dia = Number(new Intl.DateTimeFormat('pt-BR', { day: 'numeric', timeZone: 'America/Sao_Paulo' }).format(hoje));
    const grupos = Object.entries(cfg.dias).filter(([, d]) => d === dia).map(([g]) => g);
    const empresas = await this.empresasDoBpo();
    let lote = null;
    if (grupos.length && empresas.length) {
      const chaves = SERVICOS.filter((s) => s.rotina && grupos.includes(s.grupo)).map((s) => s.chave);
      lote = this.iniciarLote(empresas, chaves, { email: 'rotina' }, 'ROTINA');
    }
    let guias = null;
    if (cfg.guias.ativa && cfg.guias.dia === dia && empresas.length) guias = await this.enviarGuias(empresas, cfg.guias.enviar_email);
    return { rodou: true, grupos, lote, guias };
  }

  /** Gera o DAS (Simples), o DAS do MEI ou o DARF da DCTFWeb da competência anterior e, se pedido, manda ao e-mail do cliente. */
  async enviarGuias(empresaIds: string[], enviarEmail: boolean, usuario: Usuario = { email: 'rotina' }) {
    const empresas = await this.prisma.empresa.findMany({ where: { id: { in: empresaIds } } });
    let geradas = 0;
    let enviadas = 0;
    const falhas: string[] = [];
    for (const e of empresas) {
      const r = String(e.regime_atual || '').toLowerCase();
      const chave = r.includes('mei') ? 'das-mei' : r.includes('simples') ? 'das' : r ? 'dctfweb-guia' : null;
      if (!chave) continue;
      try {
        const c = (await this.consultar({ empresaId: e.id }, chave, {}, usuario, 'ROTINA')) as unknown as { id: string; arquivos: { indice: number; nome: string }[]; sucesso: boolean };
        if (!c.sucesso || !c.arquivos.length) { falhas.push(`${e.razao_social}: guia não gerada`); continue; }
        geradas += 1;
        if (enviarEmail && e.email_contato && this.mail.configurado) {
          const anexos = [];
          for (const a of c.arquivos) { const f = await this.arquivo(c.id, a.indice); anexos.push({ filename: f.nome, content: f.buffer, contentType: 'application/pdf' }); }
          const res = await this.mail.enviar({ to: e.email_contato, subject: `Guia de pagamento - ${e.razao_social}`, html: `<p>Olá,</p><p>Segue a guia de pagamento de ${e.razao_social}, gerada pelo escritório.</p><p>Qualquer dúvida, responda este e-mail.</p>`, attachments: anexos });
          await this.prisma.envioEmail.create({ data: { origem: 'GUIA', origem_id: c.id, empresa_id: e.id, destinatario: e.email_contato, assunto: `Guia de pagamento - ${e.razao_social}`, status: res.enviado ? 'ENVIADO' : 'FALHA', erro: res.enviado ? null : res.motivo ?? null } });
          if (res.enviado) enviadas += 1;
        }
      } catch (err) { falhas.push(`${e.razao_social}: ${(err as Error).message}`); }
    }
    return { geradas, enviadas, falhas };
  }

  // ── Parcelamentos da PGFN (Sispar) ────────────────────────────────────────
  async pgfnDaEmpresa(empresaId: string) {
    const l = await this.prisma.parcelamentoPgfn.findMany({ where: { empresa_id: empresaId }, orderBy: [{ situacao: 'asc' }, { proximo_vencimento: 'asc' }] });
    return l.map((p) => ({ ...p, nivel: nivelPgfn(p), resumo: tituloPgfn(p) }));
  }

  async salvarPgfn(empresaId: string, id: string | null, b: Record<string, unknown>, usuario: Usuario) {
    const numero = String(b.numero ?? '').trim();
    if (!numero) throw new BadRequestException('Informe o número do parcelamento (ou da negociação).');
    if (b.orgao !== undefined && !ORGAOS_PARCELAMENTO.includes(String(b.orgao))) throw new BadRequestException('Órgão inválido.');
    if (b.situacao !== undefined && !SITUACOES_PGFN.includes(String(b.situacao))) throw new BadRequestException('Situação inválida.');
    const num = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));
    const inteiro = (v: unknown) => (v === '' || v === null || v === undefined ? null : Math.trunc(Number(v)));
    const textoOuNulo = (v: unknown, max: number) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
    const venc = b.proximo_vencimento ? new Date(String(b.proximo_vencimento)) : null;
    if (venc && Number.isNaN(venc.getTime())) throw new BadRequestException('Data de vencimento inválida.');
    const dados = {
      orgao: String(b.orgao ?? 'PGFN'), numero: numero.slice(0, 40), modalidade: textoOuNulo(b.modalidade, 160), situacao: String(b.situacao ?? 'EM_DIA'),
      valor_consolidado: num(b.valor_consolidado), parcelas_total: inteiro(b.parcelas_total), parcelas_pagas: inteiro(b.parcelas_pagas),
      valor_parcela: num(b.valor_parcela), proximo_vencimento: venc, debito_automatico: !!b.debito_automatico,
      observacao: textoOuNulo(b.observacao, 2000), atualizado_por: usuario?.email ?? null,
    };
    if (id) {
      const atual = await this.prisma.parcelamentoPgfn.findUnique({ where: { id } });
      if (!atual || atual.empresa_id !== empresaId) throw new NotFoundException('Parcelamento não encontrado.');
      return this.prisma.parcelamentoPgfn.update({ where: { id }, data: dados });
    }
    return this.prisma.parcelamentoPgfn.create({ data: { empresa_id: empresaId, ...dados } });
  }

  async excluirPgfn(id: string, usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores apagam um registro de parcelamento.');
    const atual = await this.prisma.parcelamentoPgfn.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Parcelamento não encontrado.');
    await this.prisma.parcelamentoPgfn.delete({ where: { id } });
    return { ok: true };
  }

  /** Todo dia às 07:15 (Brasília): avisa no sino a parcela da PGFN que vence em até 5 dias ou que atrasou. */
  @Cron('15 7 * * *', { timeZone: 'America/Sao_Paulo' })
  async avisarPgfn(hoje = new Date()) {
    if (String(process.env.MONITORAMENTO_AGENDADOR ?? '').toLowerCase() === 'off') return 0;
    const lista = await this.prisma.parcelamentoPgfn.findMany({ where: { situacao: { in: ['EM_DIA', 'EM_ATRASO', 'RESCINDIDO'] } } });
    const empresas = new Map((await this.prisma.empresa.findMany({ where: { id: { in: lista.map((p) => p.empresa_id) } }, select: { id: true, razao_social: true, arquivado_em: true } })).map((e) => [e.id, e]));
    let n = 0;
    for (const p of lista) {
      const e = empresas.get(p.empresa_id);
      if (!e || e.arquivado_em) continue;
      const nivel = nivelPgfn(p, hoje);
      if (nivel !== 'CRITICO' && nivel !== 'ATENCAO') continue;
      await this.notificacoes.criarParaAdmins({ tipo: 'FISCAL', titulo: `${e.razao_social}: parcelamento ${ORGAO_ROTULO[p.orgao ?? 'PGFN'] ?? ''} ${p.numero}`, mensagem: tituloPgfn(p, hoje), link: `/bpo/monitoramento/${e.id}`, chave: `pgfn:${p.id}:${hoje.toISOString().slice(0, 10)}` }).catch(() => undefined);
      n += 1;
    }
    return n;
  }

  // ── Obrigações dispensadas ────────────────────────────────────────────────
  async dispensar(empresaId: string, obrigacao: string, motivo: string | undefined, usuario: Usuario) {
    if (!OBRIGACOES.some((o) => o.id === obrigacao)) throw new BadRequestException('Obrigação desconhecida.');
    return this.prisma.obrigacaoDispensada.upsert({ where: { empresa_id_obrigacao: { empresa_id: empresaId, obrigacao } }, update: { motivo: motivo ?? null, criado_por: usuario?.email ?? null }, create: { empresa_id: empresaId, obrigacao, motivo: motivo ?? null, criado_por: usuario?.email ?? null } });
  }

  async voltarObrigacao(empresaId: string, obrigacao: string) {
    await this.prisma.obrigacaoDispensada.deleteMany({ where: { empresa_id: empresaId, obrigacao } });
    return { ok: true };
  }
}

export const SITUACOES_PGFN = ['EM_DIA', 'EM_ATRASO', 'LIQUIDADO', 'RESCINDIDO'];
/** Parcelamentos fora do Simples e do MEI não têm API oficial (o Integra Contador só cobre Simples e MEI): o registro é manual, por órgão. */
export const ORGAOS_PARCELAMENTO = ['PGFN', 'RFB', 'ESTADO', 'MUNICIPIO'];
const ORGAO_ROTULO: Record<string, string> = { PGFN: 'PGFN', RFB: 'Receita Federal', ESTADO: 'Estado', MUNICIPIO: 'Município' };
const SIT_PGFN: Record<string, string> = { EM_DIA: 'em dia', EM_ATRASO: 'em atraso', LIQUIDADO: 'liquidado', RESCINDIDO: 'rescindido' };
type Pgfn = { numero: string; situacao: string; proximo_vencimento: Date | null; valor_parcela: number | null; modalidade?: string | null; orgao?: string | null };

/** Dias até a data (negativo = já passou), contados pelo dia civil. */
function diasAte(d: Date, hoje: Date): number {
  return Math.floor((new Date(new Date(d).toISOString().slice(0, 10)).getTime() - new Date(hoje.toISOString().slice(0, 10)).getTime()) / 86_400_000);
}

/** Nível do parcelamento da PGFN: rescindido, em atraso ou parcela vencida é crítico; parcela vencendo em até 5 dias pede atenção; liquidado é informativo. */
export function nivelPgfn(p: Pgfn, hoje = new Date()): Nivel {
  if (p.situacao === 'LIQUIDADO') return 'INFO';
  if (p.situacao === 'RESCINDIDO' || p.situacao === 'EM_ATRASO') return 'CRITICO';
  if (!p.proximo_vencimento) return 'OK';
  const dias = diasAte(p.proximo_vencimento, hoje);
  if (dias < 0) return 'CRITICO';
  return dias <= 5 ? 'ATENCAO' : 'OK';
}

/** Frase do parcelamento para o painel e o sino. */
export function tituloPgfn(p: Pgfn, hoje = new Date()): string {
  const venc = p.proximo_vencimento ? new Date(p.proximo_vencimento).toISOString().slice(0, 10).split('-').reverse().join('/') : null;
  const valor = typeof p.valor_parcela === 'number' ? p.valor_parcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null;
  const vencida = p.proximo_vencimento ? diasAte(p.proximo_vencimento, hoje) < 0 : false;
  const partes = [`${ORGAO_ROTULO[p.orgao ?? 'PGFN'] ?? p.orgao} ${p.numero}${p.modalidade ? ` (${p.modalidade})` : ''}: ${SIT_PGFN[p.situacao] ?? p.situacao}`];
  if (venc) partes.push(`${vencida ? 'parcela vencida em' : 'próxima parcela em'} ${venc}${valor ? ` (${valor})` : ''}`);
  return partes.join('; ') + '.';
}

/** Nota de 0 a 100 da saúde fiscal: começa em 100 e perde 25 por grupo crítico e 8 por grupo em atenção. */
export function pontuacao(grupos: Record<string, Nivel>): number {
  const n = Object.values(grupos).reduce((s, g) => s - (g === 'CRITICO' ? 25 : g === 'ATENCAO' ? 8 : 0), 100);
  return Math.max(0, n);
}
