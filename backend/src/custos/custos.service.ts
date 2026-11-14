import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SERVICO_POR_CHAVE } from '../monitoramento/catalogo';

type Usuario = { email?: string; role?: string } | undefined;
const CHAVE = 'custos_externos';
export const ROTINA = 'Rotinas automáticas';

/** Itens cobrados por chamada. O preço de cada um é o do contrato do escritório (Administração > Custos). */
export const ITENS = [
  { id: 'INTEGRA_CONSULTAR', rotulo: 'Integra Contador: consultas', fornecedor: 'Serpro' },
  { id: 'INTEGRA_EMITIR', rotulo: 'Integra Contador: emissões (guias, relatórios, certidões)', fornecedor: 'Serpro' },
  { id: 'INTEGRA_DECLARAR', rotulo: 'Integra Contador: declarações e transmissões', fornecedor: 'Serpro' },
  { id: 'INTEGRA_APOIAR', rotulo: 'Integra Contador: serviços de apoio', fornecedor: 'Serpro' },
  { id: 'INTEGRA_MONITORAR', rotulo: 'Integra Contador: eventos de atualização', fornecedor: 'Serpro' },
  { id: 'SERPRO_CONSULTA_NFE', rotulo: 'Consulta NF-e por chave', fornecedor: 'Serpro' },
  { id: 'SERPRO_CND', rotulo: 'Consulta CND (certidão federal)', fornecedor: 'Serpro' },
  { id: 'SERPRO_DIVIDA', rotulo: 'Consulta Dívida Ativa', fornecedor: 'Serpro' },
  { id: 'INFOSIMPLES_CNDT', rotulo: 'CNDT (TST) pela Infosimples', fornecedor: 'Infosimples' },
  { id: 'INFOSIMPLES_CRF', rotulo: 'CRF do FGTS pela Infosimples', fornecedor: 'Infosimples' },
  { id: 'INFOSIMPLES_ESTADUAL', rotulo: 'Certidão estadual pela Infosimples', fornecedor: 'Infosimples' },
  { id: 'INFOSIMPLES_MUNICIPAL', rotulo: 'Certidão municipal pela Infosimples', fornecedor: 'Infosimples' },
  { id: 'INFOSIMPLES_MONITORAMENTO', rotulo: 'Monitoramento pela Infosimples (SEFAZ, prefeituras, e-CAC)', fornecedor: 'Infosimples' },
] as const;
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
const SERPRO_DIVIDA: Faixa[] = [[999, 0.6591], [9999, 0.5649], [49999, 0.3557], [99999, 0.2616], [249999, 0.1779], [499999, 0.1569], [999999, 0.1465], [1499999, 0.136], [2999999, 0.1151], [4499999, 0.0732], [9999999, 0.0523], [Infinity, 0.0314]];
// Tabela da conta do escritório (Área do cliente da Infosimples, 13/11/2026): menor que a do site público.
const INFOSIMPLES_BASE: Faixa[] = [[500, 0.2], [2000, 0.16], [5000, 0.14], [10000, 0.13], [30000, 0.11], [50000, 0.1], [80000, 0.09], [100000, 0.07], [Infinity, 0.05]];
// CRF +0,06 (tabela da conta); CNDT +0,04 (site); SEFAZ: MS +0,04, demais sem adicional; prefeituras variam (0 a 0,06): usado 0.
// Monitoramento: o adicional varia por consulta (0 a 0,06): usado 0, não confirmado por consulta.
const INFOSIMPLES_ADICIONAL: Record<string, number> = { INFOSIMPLES_CNDT: 0.04, INFOSIMPLES_CRF: 0.06, INFOSIMPLES_ESTADUAL: 0, INFOSIMPLES_MUNICIPAL: 0, INFOSIMPLES_MONITORAMENTO: 0 };
export const INFOSIMPLES_MINIMO = 100;
export const FONTES_PRECO = {
  serpro_integra: 'https://loja.serpro.gov.br/integracontador',
  serpro_cnd: 'https://loja.serpro.gov.br/consultacnd',
  serpro_divida: 'https://loja.serpro.gov.br/consulta-divida-ativa',
  infosimples: 'https://infosimples.com/consultas/precos/',
};
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

  /** Contagem do mês por usuário e item. */
  private async contagem(de: Date, ate: Date) {
    const mapa = new Map<string, Map<string, number>>();
    const somar = (usuario: string | null | undefined, item: string, n = 1) => {
      const quem = ehRotina(usuario) ? ROTINA : usuario!.toLowerCase();
      const m = mapa.get(quem) ?? new Map<string, number>();
      m.set(item, (m.get(item) ?? 0) + n);
      mapa.set(quem, m);
    };
    const consultas = await this.prisma.consultaFiscal.findMany({ where: { createdAt: { gte: de, lt: ate }, simulado: false, NOT: { sistema: 'INFOSIMPLES' } }, select: { chave: true, sistema: true, solicitado_por: true, status: true } });
    for (const c of consultas) {
      if (c.status === null) continue; // não chegou ao Serpro
      const s = SERVICO_POR_CHAVE.get(c.chave);
      const endpoint = (s?.endpoint ?? 'Consultar').toUpperCase();
      // O relatório de situação fiscal são duas chamadas: o pedido (Apoiar) e a emissão.
      if (c.sistema === 'SITFIS') { somar(c.solicitado_por, 'INTEGRA_APOIAR'); somar(c.solicitado_por, 'INTEGRA_EMITIR'); continue; }
      somar(c.solicitado_por, `INTEGRA_${endpoint === 'DECLARAR' ? 'DECLARAR' : endpoint === 'EMITIR' ? 'EMITIR' : endpoint === 'APOIAR' ? 'APOIAR' : endpoint === 'MONITORAR' ? 'MONITORAR' : 'CONSULTAR'}`);
    }
    const usos = await this.prisma.usoExterno.findMany({ where: { createdAt: { gte: de, lt: ate } }, select: { servico: true, usuario: true } });
    for (const u of usos) somar(u.usuario, u.servico);
    return mapa;
  }

  private linhas(m: Map<string, number> | undefined, precos: Record<string, number>) {
    const itens = ITENS.map((i) => {
      const quantidade = m?.get(i.id) ?? 0;
      const preco = precos[i.id] ?? 0;
      return { id: i.id, rotulo: i.rotulo, fornecedor: i.fornecedor, quantidade, preco, subtotal: Math.round(quantidade * preco * 100) / 100 };
    });
    return { itens, total: Math.round(itens.reduce((s, i) => s + i.subtotal, 0) * 100) / 100, chamadas: itens.reduce((s, i) => s + i.quantidade, 0) };
  }

  /** O custo do mês do usuário logado (barra lateral). */
  async meu(email: string | undefined, mesInformado?: string) {
    const { mes, de, ate } = mesValido(mesInformado);
    const [mapa, p] = await Promise.all([this.contagem(de, ate), this.precos()]);
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

  /** Administração: o mês por usuário, rotinas, fixos e total do escritório. */
  async geral(mesInformado: string | undefined, usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores veem os custos de todos.');
    const { mes, de, ate } = mesValido(mesInformado);
    const [mapa, p] = await Promise.all([this.contagem(de, ate), this.precos()]);
    const efetivos = this.efetivos(mapa, p.precos);
    const usuarios = [...mapa.keys()].sort((a, b) => (a === ROTINA ? 1 : b === ROTINA ? -1 : a.localeCompare(b))).map((u) => ({ usuario: u, ...this.linhas(mapa.get(u), efetivos) }));
    const variavel = Math.round(usuarios.reduce((s, u) => s + u.total, 0) * 100) / 100;
    // Franquia mínima da Infosimples: se o consumo do mês não chegar a R$ 100,00, a diferença também é cobrada.
    const gastoInfos = usuarios.reduce((s, u) => s + u.itens.filter((i) => i.fornecedor === 'Infosimples').reduce((x, i) => x + i.subtotal, 0), 0);
    const infosimplesAtiva = gastoInfos > 0 || !!(await this.prisma.integracaoSegredo.findUnique({ where: { id: 'infosimples' } }).catch(() => null));
    const franquia = infosimplesAtiva ? Math.max(0, Math.round((INFOSIMPLES_MINIMO - gastoInfos) * 100) / 100) : 0;
    const fixos = [...p.fixos, ...(franquia ? [{ rotulo: 'Infosimples: complemento da franquia mínima (R$ 100/mês)', valor: franquia, automatico: true }] : [])];
    const fixo = Math.round(fixos.reduce((s, f) => s + f.valor, 0) * 100) / 100;
    return { mes, itens: ITENS, precos: p.precos, oficiais: efetivos, fontes: FONTES_PRECO, fixos: p.fixos, fixos_do_mes: fixos, usuarios, variavel, fixo, total: Math.round((variavel + fixo) * 100) / 100 };
  }
}
