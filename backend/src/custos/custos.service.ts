import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SERVICO_POR_CHAVE } from '../monitoramento/catalogo';

type Usuario = { email?: string; role?: string } | undefined;
const CHAVE = 'custos_externos';
export const ROTINA = 'Rotinas automáticas';

/** Itens cobrados por chamada. O preço de cada um é o do contrato do escritório (Administração > Custos). */
export const ITENS = [
  { id: 'INTEGRA_CONSULTAR', rotulo: 'Integra Contador: consultas', fornecedor: 'Serpro', integracao: 'Integra Contador' },
  { id: 'INTEGRA_EMITIR', rotulo: 'Integra Contador: emissões (guias, relatórios, certidões)', fornecedor: 'Serpro', integracao: 'Integra Contador' },
  { id: 'INTEGRA_DECLARAR', rotulo: 'Integra Contador: declarações e transmissões', fornecedor: 'Serpro', integracao: 'Integra Contador' },
  { id: 'INTEGRA_APOIAR', rotulo: 'Integra Contador: serviços de apoio', fornecedor: 'Serpro', integracao: 'Integra Contador' },
  { id: 'INTEGRA_MONITORAR', rotulo: 'Integra Contador: eventos de atualização', fornecedor: 'Serpro', integracao: 'Integra Contador' },
  { id: 'SERPRO_CONSULTA_NFE', rotulo: 'Consulta NF-e por chave', fornecedor: 'Serpro', integracao: 'Consulta NF-e' },
  { id: 'SERPRO_CND', rotulo: 'Consulta CND (certidão federal)', fornecedor: 'Serpro', integracao: 'Consulta CND' },
  { id: 'SERPRO_DIVIDA', rotulo: 'Consulta Dívida Ativa', fornecedor: 'Serpro', integracao: 'Consulta Dívida Ativa' },
  { id: 'INFOSIMPLES_CNDT', rotulo: 'CNDT (TST) pela Infosimples', fornecedor: 'Infosimples', integracao: 'Infosimples' },
  { id: 'INFOSIMPLES_CRF', rotulo: 'CRF do FGTS pela Infosimples', fornecedor: 'Infosimples', integracao: 'Infosimples' },
  { id: 'INFOSIMPLES_ESTADUAL', rotulo: 'Certidão estadual pela Infosimples', fornecedor: 'Infosimples', integracao: 'Infosimples' },
  { id: 'INFOSIMPLES_MUNICIPAL', rotulo: 'Certidão municipal pela Infosimples', fornecedor: 'Infosimples', integracao: 'Infosimples' },
  { id: 'INFOSIMPLES_MONITORAMENTO', rotulo: 'Monitoramento pela Infosimples (SEFAZ, prefeituras, e-CAC)', fornecedor: 'Infosimples', integracao: 'Infosimples' },
] as const;
/** Integrações na ordem da barra lateral e da Administração. */
export const INTEGRACOES = ['Integra Contador', 'Consulta CND', 'Consulta Dívida Ativa', 'Consulta NF-e', 'Infosimples'] as const;
export type ItemCusto = (typeof ITENS)[number]['id'];
type Precos = { precos: Record<string, number>; fixos: { rotulo: string; valor: number }[] };

/**
 * Tabelas oficiais (lidas em 12/11/2026 nas páginas públicas de preço). Serpro: o volume do mês do escritório define a faixa e o
 * preço dela vale para todas as chamadas do tipo. Infosimples: preço base em cascata (cada fatia na sua faixa) + adicional por
 * consulta, com franquia mínima de R$ 100,00 por mês.
 */
type Faixa = [ate: number, preco: number];
const SERPRO_CONSULTA: Faixa[] = [[300, 0.24], [1000, 0.21], [3000, 0.18], [7000, 0.16], [15000, 0.14], [23000, 0.11], [30000, 0.09], [Infinity, 0.06]];
const SERPRO_EMISSAO: Faixa[] = [[500, 0.32], [5000, 0.29], [10000, 0.26], [15000, 0.22], [25000, 0.19], [35000, 0.16], [50000, 0.12], [Infinity, 0.08]];
const SERPRO_DECLARACAO: Faixa[] = [[100, 0.4], [500, 0.36], [1000, 0.32], [3000, 0.28], [5000, 0.24], [8000, 0.2], [10000, 0.16], [Infinity, 0.12]];
const SERPRO_CND: Faixa[] = [[5000, 0.8788], [10000, 0.8265], [15000, 0.7951], [30000, 0.7533], [50000, 0.7219], [75000, 0.6905], [100000, 0.6486], [500000, 0.6173], [1000000, 0.5336], [2000000, 0.4394], [4000000, 0.3662], [10000000, 0.3139], [Infinity, 0.2511]];
// Dívida Ativa: Anexo I do contrato Serpro 630584 (16/11/2026), "alocado na faixa" (conferida faixa a faixa).
const SERPRO_DIVIDA: Faixa[] = [[999, 0.6591], [9999, 0.5649], [49999, 0.3557], [99999, 0.2616], [249999, 0.1779], [499999, 0.1569], [999999, 0.1465], [1499999, 0.136], [2999999, 0.1151], [4499999, 0.0732], [9999999, 0.0523], [Infinity, 0.0314]];
// Consulta NF-e: Anexo I do contrato Serpro 630467 (16/11/2026), "alocado na faixa": o volume do ciclo define a faixa e o preço dela vale para todas.
const SERPRO_NFE: Faixa[] = [[999, 0.6591], [9999, 0.5649], [49999, 0.3557], [99999, 0.2616], [249999, 0.1779], [499999, 0.1569], [999999, 0.1465], [1499999, 0.136], [2999999, 0.1151], [4499999, 0.0732], [9999999, 0.0523], [16999999, 0.0314], [19999999, 0.03], [24999999, 0.029], [29999999, 0.028], [Infinity, 0.027]];
// Tabela da conta do escritório (Área do cliente da Infosimples, 13/11/2026): menor que a do site público.
const INFOSIMPLES_BASE: Faixa[] = [[500, 0.2], [2000, 0.16], [5000, 0.14], [10000, 0.13], [30000, 0.11], [50000, 0.1], [80000, 0.09], [100000, 0.07], [Infinity, 0.05]];
// CRF +0,06 (tabela da conta); CNDT +0,04 (site); SEFAZ: MS +0,04, demais sem adicional; prefeituras variam (0 a 0,06): usado 0.
// Monitoramento: o adicional varia por consulta (0 a 0,06): usado 0, não confirmado por consulta.
const INFOSIMPLES_ADICIONAL: Record<string, number> = { INFOSIMPLES_CNDT: 0.04, INFOSIMPLES_CRF: 0.06, INFOSIMPLES_ESTADUAL: 0, INFOSIMPLES_MUNICIPAL: 0, INFOSIMPLES_MONITORAMENTO: 0 };
export const INFOSIMPLES_MINIMO = 100;
export const FONTES_PRECO = {
  serpro_integra: 'https://loja.serpro.gov.br/integracontador',
  serpro_cnd: 'Contrato Serpro 630434 (Consulta CND), Anexo I',
  serpro_divida: 'Contrato Serpro 630584 (Consulta Dívida Ativa), Anexo I',
  serpro_nfe: 'Contrato Serpro 630467 (Consulta NF-e), Anexo I',
  infosimples: 'https://infosimples.com/consultas/precos/',
};
/**
 * Tabela de cada contrato, serviço a serviço e faixa a faixa (Anexo I de cada contrato), para a tela de Custos. O volume do mês
 * marca a faixa em que o escritório está. Infosimples não tem contrato: tabela da conta do escritório.
 */
type TabelaServico = { nome: string; unidade: string; itens: string[]; faixas: Faixa[]; nota?: string };
const TABELAS: { integracao: string; contrato: string | null; regra: string; servicos: TabelaServico[] }[] = [
  { integracao: 'Integra Contador', contrato: '626671', regra: 'O volume do ciclo (dia 21 ao dia 20) define a faixa; o preço dela vale para todas as requisições do tipo.', servicos: [
    { nome: 'Consulta', unidade: 'Requisição', itens: ['INTEGRA_CONSULTAR', 'INTEGRA_APOIAR', 'INTEGRA_MONITORAR'], faixas: SERPRO_CONSULTA, nota: 'Serviços de apoio e eventos de atualização não têm linha própria no contrato: contados como consulta (não confirmado).' },
    { nome: 'Emissão', unidade: 'Requisição', itens: ['INTEGRA_EMITIR'], faixas: SERPRO_EMISSAO },
    { nome: 'Declaração', unidade: 'Requisição', itens: ['INTEGRA_DECLARAR'], faixas: SERPRO_DECLARACAO },
  ] },
  { integracao: 'Consulta CND', contrato: '630434', regra: 'O volume do ciclo (dia 21 ao dia 20) define a faixa; o preço dela vale para todas as requisições.', servicos: [
    { nome: 'Consulta CND', unidade: 'Requisição', itens: ['SERPRO_CND'], faixas: SERPRO_CND },
  ] },
  { integracao: 'Consulta Dívida Ativa', contrato: '630584', regra: 'Alocado na faixa: o volume do ciclo (dia 21 ao dia 20) define a faixa; o preço dela vale para todas as transações.', servicos: [
    { nome: 'Consulta Dívida Ativa', unidade: 'Transação', itens: ['SERPRO_DIVIDA'], faixas: SERPRO_DIVIDA },
  ] },
  { integracao: 'Consulta NF-e', contrato: '630467', regra: 'Alocado na faixa: o volume do ciclo (dia 21 ao dia 20) define a faixa; o preço dela vale para todas as transações. Nota não encontrada (404) e chave inválida (400) não são cobradas.', servicos: [
    { nome: 'Consulta NF-e', unidade: 'Transação', itens: ['SERPRO_CONSULTA_NFE'], faixas: SERPRO_NFE },
  ] },
  { integracao: 'Infosimples', contrato: null, regra: 'Preço base em cascata (cada fatia do volume do mês paga a sua faixa), somando todas as consultas, mais o adicional de cada consulta. Franquia mínima de R$ 100,00 por mês.', servicos: [
    { nome: 'Preço base (todas as consultas)', unidade: 'Consulta', itens: ['INFOSIMPLES_CNDT', 'INFOSIMPLES_CRF', 'INFOSIMPLES_ESTADUAL', 'INFOSIMPLES_MUNICIPAL', 'INFOSIMPLES_MONITORAMENTO'], faixas: INFOSIMPLES_BASE },
    { nome: 'Adicional CNDT (TST)', unidade: 'Consulta', itens: ['INFOSIMPLES_CNDT'], faixas: [[Infinity, 0.04]] },
    { nome: 'Adicional CRF do FGTS', unidade: 'Consulta', itens: ['INFOSIMPLES_CRF'], faixas: [[Infinity, 0.06]] },
    { nome: 'Adicional certidões estadual e municipal e monitoramento', unidade: 'Consulta', itens: ['INFOSIMPLES_ESTADUAL', 'INFOSIMPLES_MUNICIPAL', 'INFOSIMPLES_MONITORAMENTO'], faixas: [[Infinity, 0]], nota: 'Varia de R$ 0,00 a R$ 0,06 conforme a consulta; o sistema usa R$ 0,00 (não confirmado por consulta). SEFAZ MS: + R$ 0,04.' },
  ] },
];

/** As tabelas com as faixas em linhas (de, até, preço) e a faixa atual pelo volume do mês. */
export function tabelasDeContrato(volumes: Map<string, number>) {
  return TABELAS.map((tb) => ({
    ...tb,
    servicos: tb.servicos.map((sv) => {
      const volume = sv.itens.reduce((n, id) => n + (volumes.get(id) ?? 0), 0);
      let de = 1;
      const faixas = sv.faixas.map(([ate, preco], i) => { const l = { faixa: i + 1, de, ate: Number.isFinite(ate) ? ate : null, preco }; de = Number.isFinite(ate) ? ate + 1 : de; return l; });
      const atual = faixas.find((x) => x.ate === null || Math.max(volume, 1) <= x.ate)?.faixa ?? null;
      return { nome: sv.nome, unidade: sv.unidade, nota: sv.nota ?? null, volume, faixa_atual: atual, faixas };
    }),
  }));
}

/** Tipo de cobrança do Integra Contador (apoio e eventos não têm linha própria na tabela: cobrados como consulta, não confirmado). */
const GRUPO_INTEGRA: Record<string, 'CONSULTA' | 'EMISSAO' | 'DECLARACAO'> = { INTEGRA_CONSULTAR: 'CONSULTA', INTEGRA_APOIAR: 'CONSULTA', INTEGRA_MONITORAR: 'CONSULTA', INTEGRA_EMITIR: 'EMISSAO', INTEGRA_DECLARAR: 'DECLARACAO' };
const precoDaFaixa = (t: Faixa[], volume: number) => (t.find(([ate]) => volume <= ate) ?? t[t.length - 1])[1];
function custoCascata(t: Faixa[], volume: number) {
  let resto = volume, inicio = 0, total = 0;
  for (const [ate, preco] of t) { const n = Math.min(resto, ate - inicio); if (n <= 0) break; total += n * preco; resto -= n; inicio = ate; }
  return total;
}

/** Preço unitário oficial de cada item no mês, pelo volume total do escritório. */
export function precosOficiais(volumes: Map<string, number>) {
  const v = (ids: string[]) => ids.reduce((s, id) => s + (volumes.get(id) ?? 0), 0);
  const consulta = v(['INTEGRA_CONSULTAR', 'INTEGRA_APOIAR', 'INTEGRA_MONITORAR']);
  const infos = v(['INFOSIMPLES_CNDT', 'INFOSIMPLES_CRF', 'INFOSIMPLES_ESTADUAL', 'INFOSIMPLES_MUNICIPAL', 'INFOSIMPLES_MONITORAMENTO']);
  const baseInfos = infos ? custoCascata(INFOSIMPLES_BASE, infos) / infos : INFOSIMPLES_BASE[0][1];
  const p: Record<string, number> = {};
  for (const [id, g] of Object.entries(GRUPO_INTEGRA)) p[id] = g === 'CONSULTA' ? precoDaFaixa(SERPRO_CONSULTA, consulta) : g === 'EMISSAO' ? precoDaFaixa(SERPRO_EMISSAO, v(['INTEGRA_EMITIR'])) : precoDaFaixa(SERPRO_DECLARACAO, v(['INTEGRA_DECLARAR']));
  p.SERPRO_CND = precoDaFaixa(SERPRO_CND, v(['SERPRO_CND']));
  p.SERPRO_DIVIDA = precoDaFaixa(SERPRO_DIVIDA, v(['SERPRO_DIVIDA']));
  p.SERPRO_CONSULTA_NFE = precoDaFaixa(SERPRO_NFE, v(['SERPRO_CONSULTA_NFE']));
  for (const [id, adicional] of Object.entries(INFOSIMPLES_ADICIONAL)) p[id] = Math.round((baseInfos + adicional) * 10000) / 10000;
  return p;
}

const ehRotina = (u: string | null | undefined) => !u || !u.includes('@');
const mesValido = (m?: string) => {
  const mes = m && /^\d{4}-\d{2}$/.test(m) ? m : new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 7);
  const [a, b] = mes.split('-').map(Number);
  if (b < 1 || b > 12) throw new BadRequestException('Mês inválido (AAAA-MM).');
  // Mês de Brasília: 03:00 UTC do dia 1 até 03:00 UTC do dia 1 do mês seguinte.
  return { mes, de: new Date(Date.UTC(a, b - 1, 1, 3)), ate: new Date(Date.UTC(a, b, 1, 3)) };
};

/**
 * Ciclo de faturamento do Serpro (cl. 7.3 dos contratos): do dia 21 do mês anterior ao dia 20 do mês. O mês "AAAA-MM" dos
 * itens do Serpro conta esse ciclo; os da Infosimples, o mês do calendário.
 */
export function cicloSerpro(mes: string) {
  const [a, b] = mes.split('-').map(Number);
  return { de: new Date(Date.UTC(a, b - 2, 21, 3)), ate: new Date(Date.UTC(a, b - 1, 21, 3)) };
}
/** Mês do ciclo do Serpro em que cai uma data (a partir do dia 21, já é o ciclo do mês seguinte). */
export function mesDoCicloSerpro(d = new Date()) {
  const br = new Date(d.getTime() - 3 * 3_600_000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth() + (br.getUTCDate() >= 21 ? 1 : 0), 1)).toISOString().slice(0, 7);
}
const ehSerpro = (item: string) => ITENS.find((i) => i.id === item)?.fornecedor === 'Serpro';

/** Registra uma chamada paga (não falha a operação principal se o registro falhar). */
export async function registrarUso(prisma: PrismaService | undefined, servico: ItemCusto, usuario?: string | null, empresaId?: string | null, referencia?: string) {
  try {
    await prisma?.usoExterno?.create({ data: { servico, usuario: usuario ?? null, empresa_id: empresaId ?? null, referencia: referencia ?? null } });
  } catch { /* o registro de custo nunca derruba a operação */ }
}

/**
 * Custos das ferramentas externas no mês: chamadas pagas ao Integra Contador (pelas consultas registradas, só produção),
 * à Consulta CND, à Dívida Ativa e à Infosimples, multiplicadas pelo preço do contrato. Por usuário (quem pediu) e o que as
 * rotinas automáticas fizeram; os custos fixos do mês (mensalidades) entram no total do escritório.
 */
@Injectable()
export class CustosService {
  private readonly log = new Logger(CustosService.name);
  constructor(private readonly prisma: PrismaService) {}

  async precos(): Promise<Precos> {
    const p = await this.prisma.parametroSistema.findUnique({ where: { chave: CHAVE } }).catch(() => null);
    try {
      const v = p ? (JSON.parse(p.valor) as Partial<Precos>) : {};
      return { precos: v.precos ?? {}, fixos: Array.isArray(v.fixos) ? v.fixos : [] };
    } catch { return { precos: {}, fixos: [] }; }
  }

  async salvarPrecos(b: Partial<Precos>, usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores mudam os preços.');
    const precos = Object.fromEntries(ITENS.map((i) => [i.id, Math.max(0, Number(b.precos?.[i.id] ?? 0) || 0)]));
    const fixos = (b.fixos ?? []).map((f) => ({ rotulo: String(f.rotulo ?? '').trim().slice(0, 120), valor: Math.max(0, Number(f.valor) || 0) })).filter((f) => f.rotulo);
    const valor = JSON.stringify({ precos, fixos });
    await this.prisma.parametroSistema.upsert({ where: { chave: CHAVE }, update: { valor }, create: { chave: CHAVE, valor, descricao: 'Preços das ferramentas externas (custos)' } });
    return this.precos();
  }

  /** Contagem do mês por usuário e item; com `porCliente`, também por cliente (empresa) e item. */
  private async contagem(de: Date, ate: Date, mes?: string, porCliente?: Map<string, Map<string, number>>) {
    const ciclo = mes ? cicloSerpro(mes) : { de, ate };
    const mapa = new Map<string, Map<string, number>>();
    const somar = (usuario: string | null | undefined, item: string, n = 1, empresaId?: string | null) => {
      const quem = ehRotina(usuario) ? ROTINA : usuario!.toLowerCase();
      const m = mapa.get(quem) ?? new Map<string, number>();
      m.set(item, (m.get(item) ?? 0) + n);
      mapa.set(quem, m);
      if (porCliente) {
        const c = porCliente.get(empresaId ?? '') ?? new Map<string, number>();
        c.set(item, (c.get(item) ?? 0) + n);
        porCliente.set(empresaId ?? '', c);
      }
    };
    const consultas = await this.prisma.consultaFiscal.findMany({ where: { createdAt: { gte: ciclo.de, lt: ciclo.ate }, simulado: false, NOT: { sistema: 'INFOSIMPLES' } }, select: { chave: true, sistema: true, solicitado_por: true, status: true, empresa_id: true } });
    for (const c of consultas) {
      if (c.status === null) continue; // não chegou ao Serpro
      const s = SERVICO_POR_CHAVE.get(c.chave);
      const endpoint = (s?.endpoint ?? 'Consultar').toUpperCase();
      // O relatório de situação fiscal são duas chamadas: o pedido (Apoiar) e a emissão.
      if (c.sistema === 'SITFIS') { somar(c.solicitado_por, 'INTEGRA_APOIAR', 1, c.empresa_id); somar(c.solicitado_por, 'INTEGRA_EMITIR', 1, c.empresa_id); continue; }
      somar(c.solicitado_por, `INTEGRA_${endpoint === 'DECLARAR' ? 'DECLARAR' : endpoint === 'EMITIR' ? 'EMITIR' : endpoint === 'APOIAR' ? 'APOIAR' : endpoint === 'MONITORAR' ? 'MONITORAR' : 'CONSULTAR'}`, 1, c.empresa_id);
    }
    const inicio = new Date(Math.min(de.getTime(), ciclo.de.getTime()));
    const fim = new Date(Math.max(ate.getTime(), ciclo.ate.getTime()));
    const usos = await this.prisma.usoExterno.findMany({ where: { createdAt: { gte: inicio, lt: fim } }, select: { servico: true, usuario: true, createdAt: true, empresa_id: true } });
    for (const u of usos) {
      const j = ehSerpro(u.servico) ? ciclo : { de, ate };
      if (!u.createdAt || (u.createdAt >= j.de && u.createdAt < j.ate)) somar(u.usuario, u.servico, 1, u.empresa_id);
    }
    return mapa;
  }

  private linhas(m: Map<string, number> | undefined, precos: Record<string, number>) {
    const itens = ITENS.map((i) => {
      const quantidade = m?.get(i.id) ?? 0;
      const preco = precos[i.id] ?? 0;
      return { id: i.id, rotulo: i.rotulo, fornecedor: i.fornecedor, integracao: i.integracao, quantidade, preco, subtotal: Math.round(quantidade * preco * 100) / 100 };
    });
    const por_integracao = INTEGRACOES.map((nome) => {
      const d = itens.filter((i) => i.integracao === nome);
      return { integracao: nome, chamadas: d.reduce((s, i) => s + i.quantidade, 0), total: Math.round(d.reduce((s, i) => s + i.subtotal, 0) * 100) / 100 };
    });
    return { itens, por_integracao, total: Math.round(itens.reduce((s, i) => s + i.subtotal, 0) * 100) / 100, chamadas: itens.reduce((s, i) => s + i.quantidade, 0) };
  }

  /** O custo do mês do usuário logado (barra lateral). */
  async meu(email: string | undefined, mesInformado?: string) {
    const { mes, de, ate } = mesValido(mesInformado);
    const [mapa, p] = await Promise.all([this.contagem(de, ate, mes), this.precos()]);
    const l = this.linhas(mapa.get(String(email ?? '').toLowerCase()), this.efetivos(mapa, p.precos));
    return { mes, ...l };
  }

  /** Preço de cada item: o informado na Administração (quando maior que zero) ou o oficial pela faixa do volume do mês. */
  private efetivos(mapa: Map<string, Map<string, number>>, informados: Record<string, number>) {
    const volumes = new Map<string, number>();
    for (const m of mapa.values()) for (const [id, n] of m) volumes.set(id, (volumes.get(id) ?? 0) + n);
    const oficiais = precosOficiais(volumes);
    return Object.fromEntries(ITENS.map((i) => [i.id, informados[i.id] > 0 ? informados[i.id] : oficiais[i.id] ?? 0]));
  }

  /**
   * Preço unitário vigente: o informado na Administração (maior que zero) ou o oficial pela faixa do volume do ciclo atual
   * somado às chamadas que se vai fazer (estimativa antes de autorizar um lote).
   */
  async precoVigente(item: ItemCusto, aMais = 0) {
    const p = await this.precos();
    if (p.precos[item] > 0) return p.precos[item];
    const { de, ate } = cicloSerpro(mesDoCicloSerpro());
    const ja = ehSerpro(item) ? await this.prisma.usoExterno.count({ where: { servico: item, createdAt: { gte: de, lt: ate } } }).catch(() => 0) : 0;
    return precosOficiais(new Map([[item, ja + aMais]]))[item] ?? 0;
  }

  /** Preço que vale para cada item no mês (o informado ou o oficial pela faixa): a estimativa do lote usa, sem abrir os custos de todos. */
  async precosEfetivos(mesInformado?: string) {
    const { mes, de, ate } = mesValido(mesInformado);
    const [mapa, p] = await Promise.all([this.contagem(de, ate, mes), this.precos()]);
    return this.efetivos(mapa, p.precos);
  }

  /** Administração: o mês por usuário, rotinas, fixos e total do escritório. */
  async geral(mesInformado: string | undefined, usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores veem os custos de todos.');
    const { mes, de, ate } = mesValido(mesInformado);
    const mapaClientes = new Map<string, Map<string, number>>();
    const [mapa, p] = await Promise.all([this.contagem(de, ate, mes, mapaClientes), this.precos()]);
    const efetivos = this.efetivos(mapa, p.precos);
    // Por cliente: quem mais gerou chamadas pagas no mês (para cobrar adicionais). Sem cliente = pré-análise de prospect e afins.
    const ids = [...mapaClientes.keys()].filter(Boolean);
    const empresas = new Map((ids.length ? await this.prisma.empresa.findMany({ where: { id: { in: ids } }, select: { id: true, razao_social: true, cnpj_cpf: true } }).catch(() => []) : []).map((e) => [e.id, e]));
    const clientes = [...mapaClientes.entries()].map(([id, m]) => ({ empresa_id: id || null, cliente: id ? empresas.get(id)?.razao_social ?? 'Cliente excluído' : 'Sem cliente vinculado (pré-análise de prospect)', documento: id ? empresas.get(id)?.cnpj_cpf ?? '' : '', ...this.linhas(m, efetivos) }))
      .sort((a, b) => b.total - a.total || a.cliente.localeCompare(b.cliente));
    const usuarios = [...mapa.keys()].sort((a, b) => (a === ROTINA ? 1 : b === ROTINA ? -1 : a.localeCompare(b))).map((u) => ({ usuario: u, ...this.linhas(mapa.get(u), efetivos) }));
    const variavel = Math.round(usuarios.reduce((s, u) => s + u.total, 0) * 100) / 100;
    // Franquia mínima da Infosimples: se o consumo do mês não chegar a R$ 100,00, a diferença também é cobrada.
    const gastoInfos = usuarios.reduce((s, u) => s + u.itens.filter((i) => i.fornecedor === 'Infosimples').reduce((x, i) => x + i.subtotal, 0), 0);
    const infosimplesAtiva = gastoInfos > 0 || !!(await this.prisma.integracaoSegredo.findUnique({ where: { id: 'infosimples' } }).catch(() => null));
    const franquia = infosimplesAtiva ? Math.max(0, Math.round((INFOSIMPLES_MINIMO - gastoInfos) * 100) / 100) : 0;
    const fixos = [...p.fixos, ...(franquia ? [{ rotulo: 'Infosimples: complemento da franquia mínima (R$ 100/mês)', valor: franquia, automatico: true }] : [])];
    const fixo = Math.round(fixos.reduce((s, f) => s + f.valor, 0) * 100) / 100;
    const volumes = new Map<string, number>();
    for (const m of mapa.values()) for (const [id, n] of m) volumes.set(id, (volumes.get(id) ?? 0) + n);
    return { mes, tabelas: tabelasDeContrato(volumes), ciclo_serpro: cicloSerpro(mes), itens: ITENS, integracoes: INTEGRACOES, precos: p.precos, oficiais: efetivos, fontes: FONTES_PRECO, fixos: p.fixos, fixos_do_mes: fixos, usuarios, clientes, variavel, fixo, total: Math.round((variavel + fixo) * 100) / 100 };
  }
}
