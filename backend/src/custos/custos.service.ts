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
  { id: 'SERPRO_CND', rotulo: 'Consulta CND (certidão federal)', fornecedor: 'Serpro' },
  { id: 'SERPRO_DIVIDA', rotulo: 'Consulta Dívida Ativa', fornecedor: 'Serpro' },
  { id: 'INFOSIMPLES_CNDT', rotulo: 'CNDT (TST) pela Infosimples', fornecedor: 'Infosimples' },
  { id: 'INFOSIMPLES_CRF', rotulo: 'CRF do FGTS pela Infosimples', fornecedor: 'Infosimples' },
] as const;
export type ItemCusto = (typeof ITENS)[number]['id'];
type Precos = { precos: Record<string, number>; fixos: { rotulo: string; valor: number }[] };

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
    const consultas = await this.prisma.consultaFiscal.findMany({ where: { createdAt: { gte: de, lt: ate }, simulado: false }, select: { chave: true, sistema: true, solicitado_por: true, status: true } });
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
    const l = this.linhas(mapa.get(String(email ?? '').toLowerCase()), p.precos);
    return { mes, ...l, precos_definidos: Object.values(p.precos).some((v) => v > 0) };
  }

  /** Administração: o mês por usuário, rotinas, fixos e total do escritório. */
  async geral(mesInformado: string | undefined, usuario: Usuario) {
    if (usuario?.role !== 'admin') throw new ForbiddenException('Só administradores veem os custos de todos.');
    const { mes, de, ate } = mesValido(mesInformado);
    const [mapa, p] = await Promise.all([this.contagem(de, ate), this.precos()]);
    const usuarios = [...mapa.keys()].sort((a, b) => (a === ROTINA ? 1 : b === ROTINA ? -1 : a.localeCompare(b))).map((u) => ({ usuario: u, ...this.linhas(mapa.get(u), p.precos) }));
    const variavel = Math.round(usuarios.reduce((s, u) => s + u.total, 0) * 100) / 100;
    const fixo = Math.round(p.fixos.reduce((s, f) => s + f.valor, 0) * 100) / 100;
    return { mes, itens: ITENS, precos: p.precos, fixos: p.fixos, usuarios, variavel, fixo, total: Math.round((variavel + fixo) * 100) / 100 };
  }
}
