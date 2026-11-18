import { BadRequestException, ForbiddenException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { readFile, stat, writeFile, rename } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { lerTabelasOficiais } from './tabelas-oficiais';
import { compararTabelas } from './comparar-tabelas';
import { ConferenciaOperacao, EntradaOperacao, lerConferencia, pedidoDaOperacao } from './conferir-operacao';

type Usuario = { email?: string; role?: string } | undefined;
const URL_PADRAO = 'http://reforma-calculadora-rfb:8080/api/calculadora';
const REPO = 'ReceitaFederal/calculadora-rtc-regime-regular';
const P_TABELAS = 'calculadora_rfb_tabelas';
const P_GITHUB = 'calculadora_rfb_github';
const P_COMPARACAO = 'calculadora_rfb_comparacao';
const lerJson = async (f: string) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return null; } };
const lerTexto = async (f: string) => { try { return (await readFile(f, 'utf8')).trim(); } catch { return null; } };

/**
 * Calculadora oficial da Receita (CBS/IBS/IS, código aberto MIT) rodando ao lado do backend, só na rede interna.
 * Régua de conferência do InTAX: as tabelas oficiais são copiadas a cada versão para o Postgres (RfbClassTrib e
 * RfbNomenclaturaVinculo) e o cálculo é pedido à API. Nunca sobrescreve as tabelas do InTAX (a tabela cClassTrib da SVRS
 * é mais nova que o banco da calculadora em parte das classes): divergência vira apontamento.
 */
@Injectable()
export class CalculadoraRfbService implements OnApplicationBootstrap {
  private readonly log = new Logger(CalculadoraRfbService.name);
  constructor(private readonly prisma: PrismaService) {}

  get url() { return (process.env.CALCULADORA_RFB_URL || URL_PADRAO).replace(/\/$/, ''); }
  private get dados() { return process.env.CALCULADORA_RFB_DADOS || '/calculadora-rfb'; }
  private get controle() { return process.env.CALCULADORA_RFB_CONTROLE || '/calculadora-rfb-controle'; }

  onApplicationBootstrap() {
    setTimeout(() => { this.importarSeMudou().catch((e) => this.log.warn(`Tabelas oficiais: ${(e as Error).message}`)); }, 20_000).unref?.();
  }

  /** POST na API oficial (JSON). Erro de rede vira exceção com mensagem clara. */
  async post<T = unknown>(caminho: string, corpo: unknown, timeoutMs = 60_000): Promise<{ http: number; json: T | null }> {
    let r: Response;
    try {
      r = await fetch(this.url + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new BadRequestException('A calculadora oficial da Receita não respondeu agora. Tente em alguns minutos.');
    }
    return { http: r.status, json: (await r.json().catch(() => null)) as T | null };
  }

  /** Validação de um XML (grupo IBS/CBS ou nota inteira) contra o XSD oficial. */
  async validarXml(tipo: string, subtipo: 'grupo' | 'nota', xml: string): Promise<{ valido: boolean; mensagem: string | null }> {
    let r: Response;
    try {
      r = await fetch(`${this.url}/xml/validate?tipo=${encodeURIComponent(tipo)}&subtipo=${subtipo}`, { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: xml, signal: AbortSignal.timeout(60_000) });
    } catch {
      throw new BadRequestException('A calculadora oficial da Receita não respondeu agora. Tente em alguns minutos.');
    }
    if (r.ok) return { valido: true, mensagem: null };
    const j = (await r.json().catch(() => null)) as { detail?: string; title?: string } | null;
    return { valido: false, mensagem: j?.detail ?? j?.title ?? `HTTP ${r.status}` };
  }

  /** Conferência de uma operação do simulador (saída): o que a calculadora oficial calcula para os mesmos dados. */
  async conferirOperacao(e: EntradaOperacao): Promise<ConferenciaOperacao & { versao: { versaoApp: string; versaoDb: string } | null }> {
    const versao = await this.versaoServico();
    if (e.semAlcance) return { estado: 'FORA_DO_ALCANCE', motivo: e.semAlcance, erros: [], oficial: null, versao };
    if (!e.cst || !e.cClassTrib || !(e.valorBruto > 0)) return { estado: 'FORA_DO_ALCANCE', motivo: 'Informe o CST e o cClassTrib da operação para conferir com a calculadora oficial.', erros: [], oficial: null, versao };
    const r = await this.post<{ objetos?: { nObj: number; estadoItem: string }[] }>('/observabilidade/regime-geral', pedidoDaOperacao(e), 30_000);
    return { ...lerConferencia(r.json?.objetos?.[0] as never), versao };
  }

  async versaoServico(): Promise<{ versaoApp: string; versaoDb: string; dataVersaoDb: string } | null> {
    try {
      const r = await fetch(`${this.url}/dados-abertos/versao`, { signal: AbortSignal.timeout(5_000) });
      return r.ok ? ((await r.json()) as { versaoApp: string; versaoDb: string; dataVersaoDb: string }) : null;
    } catch { return null; }
  }

  private async parametro<T>(chave: string): Promise<T | null> {
    const p = await this.prisma.parametroSistema.findUnique({ where: { chave } });
    try { return p ? (JSON.parse(p.valor) as T) : null; } catch { return null; }
  }
  private async gravarParametro(chave: string, valor: unknown, descricao: string) {
    const v = JSON.stringify(valor);
    await this.prisma.parametroSistema.upsert({ where: { chave }, update: { valor: v }, create: { chave, valor: v, descricao } });
  }

  /** Copia as tabelas oficiais para o Postgres quando o banco publicado pelo serviço muda de versão (de hora em hora e ao subir). */
  @Cron('25 * * * *', { timeZone: 'America/Sao_Paulo' })
  async importarSeMudou(forcar = false) {
    const arquivo = join(this.dados, 'calculadora-pro.db');
    let info;
    try { info = await stat(arquivo); } catch { return { importado: false, motivo: 'banco oficial não publicado (serviço da calculadora fora do ar ou sem a pasta compartilhada)' }; }
    const commit = await lerTexto(join(this.dados, 'COMMIT'));
    const atual = await this.parametro<{ versao_db: string; commit: string | null; tamanho: number }>(P_TABELAS);
    if (!forcar && atual && atual.commit === commit && atual.tamanho === info.size) return { importado: false, motivo: 'já importado' };
    const t = lerTabelasOficiais(arquivo);
    if (!t.versao_db || t.classes.length < 100 || t.vinculos.length < 500) throw new Error(`banco oficial incompleto (${t.classes.length} classes, ${t.vinculos.length} vínculos)`);
    await this.prisma.$transaction([
      this.prisma.rfbClassTrib.deleteMany({}),
      this.prisma.rfbNomenclaturaVinculo.deleteMany({}),
      this.prisma.rfbClassTrib.createMany({ data: t.classes.map((c) => ({ ...c, versao_db: t.versao_db })) }),
      this.prisma.rfbNomenclaturaVinculo.createMany({ data: t.vinculos.map((v) => ({ ...v, versao_db: t.versao_db })) }),
    ]);
    const registro = { versao_db: t.versao_db, data_db: t.data_db, commit, tamanho: info.size, classes: t.classes.length, vinculos: t.vinculos.length, importado_em: new Date().toISOString() };
    await this.gravarParametro(P_TABELAS, registro, 'Tabelas oficiais da calculadora da Receita copiadas para o InTAX');
    this.log.log(`Tabelas oficiais da calculadora: ${t.versao_db} (${t.classes.length} classes, ${t.vinculos.length} vínculos)`);
    await this.compararComIntax();
    return { importado: true, ...registro };
  }

  /** Compara as tabelas copiadas da calculadora com as do InTAX (cClassTrib, reduções, CST e correlação NCM x anexos) e guarda o resultado. Só aponta; nunca corrige. */
  async compararComIntax() {
    const [oficial, intax, vinculos, correlacao] = await Promise.all([
      this.prisma.rfbClassTrib.findMany(), this.prisma.classTrib.findMany({ select: { c_class_trib: true, cst: true, pct_reducao_cbs: true, pct_reducao_ibs: true, status: true, vigencia_fim: true } }),
      this.prisma.rfbNomenclaturaVinculo.findMany(), this.prisma.correlacaoNcm.findMany({ select: { ncm: true, c_class_trib: true, anexo: true, item_lei: true, excecao: true } }),
    ]);
    const versao = oficial[0]?.versao_db ?? null;
    const r = compararTabelas({ oficial, intax, vinculos, correlacao });
    const registro = { ...r, versao_db: versao, comparado_em: new Date().toISOString() };
    await this.gravarParametro(P_COMPARACAO, registro, 'Comparação das tabelas do InTAX com as da calculadora oficial da Receita');
    return registro;
  }

  /** Refaz a comparação quando as tabelas do InTAX mudam (a cada 6 horas); as da calculadora já refazem a cada versão. */
  @Cron('50 */6 * * *', { timeZone: 'America/Sao_Paulo' })
  async recompararAgendado() {
    if (!(await this.prisma.rfbClassTrib.count())) return;
    await this.compararComIntax();
  }

  /** Toda segunda às 06:40: confere no GitHub da Receita se saiu versão nova (só avisa; a troca é pelo administrador). */
  @Cron('40 6 * * 1', { timeZone: 'America/Sao_Paulo' })
  async verificarGithub() {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, { headers: { 'User-Agent': 'InTAX', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
      const j = (await r.json()) as { sha: string; commit: { committer: { date: string }; message: string } };
      const v = { commit: j.sha.slice(0, 7), data: j.commit.committer.date, mensagem: j.commit.message.split('\n')[0].slice(0, 200), verificado_em: new Date().toISOString(), erro: null };
      await this.gravarParametro(P_GITHUB, v, 'Última versão da calculadora da Receita no GitHub');
      return v;
    } catch (e) {
      const anterior = await this.parametro<Record<string, unknown>>(P_GITHUB);
      const v = { ...(anterior ?? {}), verificado_em: new Date().toISOString(), erro: (e as Error).message };
      await this.gravarParametro(P_GITHUB, v, 'Última versão da calculadora da Receita no GitHub');
      return v;
    }
  }

  async estado() {
    const [servico, commit, tabelas, github, situacao, pedido, comparacao] = await Promise.all([
      this.versaoServico(), lerTexto(join(this.dados, 'COMMIT')), this.parametro<Record<string, unknown>>(P_TABELAS),
      this.parametro<{ commit?: string; data?: string; mensagem?: string; verificado_em?: string; erro?: string | null }>(P_GITHUB),
      lerJson(join(this.controle, 'situacao.json')), lerJson(join(this.controle, 'pedido.json')),
      this.parametro<Record<string, unknown>>(P_COMPARACAO),
    ]);
    const alvo = (pedido?.commit as string | undefined) ?? (situacao?.commit as string | undefined);
    const bateria = alvo ? await lerJson(join(this.controle, `bateria-${alvo}.json`)) : null;
    return {
      no_ar: !!servico, versao: servico, commit, tabelas, github, comparacao,
      versao_nova: !!(github?.commit && commit && github.commit !== commit),
      atualizacao: { situacao, pedido, bateria: bateria ? { ...bateria, lista: (bateria.lista ?? []).slice(0, 100) } : null },
      fonte: `https://github.com/${REPO}`,
    };
  }

  /** "Aplicar versão nova": grava o pedido para o servidor construir, conferir e (sem diferença ou com confirmação) trocar. */
  async pedirAtualizacao(usuario: Usuario, confirmar = false) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores atualizam a calculadora oficial.');
    const e = await this.estado();
    const pedido = e.atualizacao.pedido as { commit?: string } | null;
    if (confirmar) {
      if (!pedido?.commit || (e.atualizacao.situacao as { etapa?: string } | null)?.etapa !== 'AGUARDANDO_CONFIRMACAO') throw new BadRequestException('Não há troca aguardando confirmação.');
      await this.escreverPedido({ ...pedido, confirmado: true, confirmado_por: usuario?.email ?? null, confirmado_em: new Date().toISOString() });
      return this.estado();
    }
    if (!e.github?.commit) throw new BadRequestException('Ainda não há versão do GitHub conferida. Clique em "Conferir no GitHub".');
    if (!e.versao_nova) throw new BadRequestException('A versão em uso já é a mais recente do GitHub.');
    if (pedido?.commit) throw new BadRequestException('Já há uma atualização em andamento.');
    await this.escreverPedido({ commit: e.github.commit, pedido_por: usuario?.email ?? null, pedido_em: new Date().toISOString(), confirmado: false });
    return this.estado();
  }

  private async escreverPedido(p: Record<string, unknown>) {
    const f = join(this.controle, 'pedido.json');
    try {
      await writeFile(`${f}.tmp`, JSON.stringify(p));
      await rename(`${f}.tmp`, f);
    } catch {
      throw new BadRequestException('A pasta de controle da calculadora não está disponível neste servidor.');
    }
  }
}
