/**
 * Resolução das regras por grupo: uma regra efetiva por grupo e aspecto. Precedência: regra do grupo e subgrupo > regra do grupo > "Todos os
 * grupos" (o padrão, que vale também para grupos novos). Sobreposição = duas regras do mesmo aspecto no MESMO nível para o mesmo grupo
 * (ou o mesmo par grupo/subgrupo): bloqueia aplicar até a transferência ser confirmada. Funções puras.
 */
import { SINONIMOS } from '../importacao/mapeamento';
import { simplificar } from '../importacao/normalizacao';
import type { ParametrosMotor } from '../motor/contexto';
import { SEM_GRUPO } from './conteudo-regra';
import { ASPECTOS, type Abrangencia, type Aspecto, type ConteudoRegra } from './tipos';

/** A regra como a resolução e o motor a enxergam (conteúdo já mesclado). */
export type RegraResolvivel = {
  id: string;
  codigo: string;
  nome: string;
  aspecto: Aspecto;
  abrangencia: Abrangencia;
  conteudo: ConteudoRegra;
  aprovada: boolean;
  /** Convertida dos parâmetros antigos e não editada: o motor usa `parametrosLegados` exatamente como antes. */
  legado?: boolean;
  parametrosLegados?: ParametrosMotor | null;
};

/** Chave do grupo do item: o texto aparado; vazio = "(sem grupo)". */
export const chaveGrupo = (g: unknown): string => { const t = String(g ?? '').replace(/\s+/g, ' ').trim(); return t || SEM_GRUPO; };
export const chaveSubgrupo = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Cabeçalho de coluna que é o subgrupo gravado como coluna extra (bases importadas antes de a importação mapear o subgrupo guardavam
 * `campos["Subgrupo"]`, com o nome do cabeçalho). Mesmos nomes que o mapeamento reconhece (SINONIMOS.subgrupo e o casamento aproximado).
 */
export function ehCabecalhoDeSubgrupo(k: string): boolean {
  if (k === 'subgrupo') return false;
  const s = simplificar(k);
  return SINONIMOS.subgrupo.includes(s) || /^sub(grupo|famil|categ)/.test(s);
}
/** Subgrupo do item: `campos.subgrupo` (importação atual) ou, nas bases antigas, a coluna extra com cabeçalho de subgrupo. Sem reimportar. */
export function subgrupoDosCampos(campos: Record<string, unknown> | null | undefined): string | null {
  if (!campos || typeof campos !== 'object') return null;
  const atual = campos.subgrupo;
  if (atual != null && String(atual).trim()) return String(atual);
  const k = Object.keys(campos).filter(ehCabecalhoDeSubgrupo).sort()[0];
  return k && campos[k] != null && String(campos[k]).trim() ? String(campos[k]) : null;
}

export type Nivel = 'SUBGRUPO' | 'GRUPO' | 'TODOS';

/** Pares que a regra cobre no nível dela. TODOS = um par só. */
function pares(a: Abrangencia): { nivel: Nivel; chaves: string[] } {
  if (a.todos) return { nivel: 'TODOS', chaves: ['*'] };
  if (a.subgrupos?.length) return { nivel: 'SUBGRUPO', chaves: a.grupos.flatMap((g) => a.subgrupos!.map((s) => `${chaveGrupo(g)}\u0000${chaveSubgrupo(s)}`)) };
  return { nivel: 'GRUPO', chaves: a.grupos.map(chaveGrupo) };
}
const rotuloPar = (k: string) => (k === '*' ? 'Todos os grupos' : k.replace('\u0000', ' / '));
const porCodigo = (a: { codigo: string }, b: { codigo: string }) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0);

export type IndiceDiretrizes = {
  regras: RegraResolvivel[];
  /** Regra efetiva de cada aspecto para o grupo/subgrupo (no máximo uma). */
  resolver(grupo: unknown, subgrupo?: unknown): Partial<Record<Aspecto, RegraResolvivel>>;
  porId: Map<string, RegraResolvivel>;
};

/** Índice de resolução. Em empate no mesmo nível (sobreposição que escapou), vale a de menor código, sempre a mesma. */
export function criarIndice(regras: RegraResolvivel[]): IndiceDiretrizes {
  const ordenadas = [...regras].sort(porCodigo);
  const mapa: Record<Aspecto, { todos?: RegraResolvivel; grupo: Map<string, RegraResolvivel>; sub: Map<string, RegraResolvivel> }> = Object.fromEntries(
    ASPECTOS.map((a) => [a, { grupo: new Map(), sub: new Map() }]),
  ) as never;
  for (const r of ordenadas) {
    const m = mapa[r.aspecto];
    const { nivel, chaves } = pares(r.abrangencia);
    if (nivel === 'TODOS') { m.todos ??= r; continue; }
    const alvo = nivel === 'GRUPO' ? m.grupo : m.sub;
    for (const k of chaves) if (!alvo.has(k)) alvo.set(k, r);
  }
  const memo = new Map<string, Partial<Record<Aspecto, RegraResolvivel>>>();
  return {
    regras: ordenadas,
    porId: new Map(ordenadas.map((r) => [r.id, r])),
    resolver(grupo, subgrupo) {
      const g = chaveGrupo(grupo); const s = chaveSubgrupo(subgrupo);
      const k = `${g}\u0000${s}`;
      const ja = memo.get(k);
      if (ja) return ja;
      const out: Partial<Record<Aspecto, RegraResolvivel>> = {};
      for (const a of ASPECTOS) {
        const m = mapa[a];
        const r = (s ? m.sub.get(k) : undefined) ?? m.grupo.get(g) ?? m.todos;
        if (r) out[a] = r;
      }
      memo.set(k, out);
      return out;
    },
  };
}

type ComAbrangencia = { id: string; codigo: string; aspecto: Aspecto; abrangencia: Abrangencia };

/** Sobreposições da regra com as demais do mesmo aspecto (mesmo nível e mesmo grupo ou par grupo/subgrupo). */
export function sobreposicoes(regra: ComAbrangencia, outras: ComAbrangencia[]): { grupo: string; regraAtual: string; regraId: string }[] {
  const minha = pares(regra.abrangencia);
  const meus = new Set(minha.chaves);
  const out: { grupo: string; regraAtual: string; regraId: string }[] = [];
  for (const o of [...outras].sort(porCodigo)) {
    if (o.id === regra.id || o.aspecto !== regra.aspecto) continue;
    const dela = pares(o.abrangencia);
    if (dela.nivel !== minha.nivel) continue;
    for (const k of dela.chaves) if (meus.has(k)) out.push({ grupo: rotuloPar(k), regraAtual: o.codigo, regraId: o.id });
  }
  return out;
}

/**
 * A abrangência da outra regra sem o que passa para a nova (transferência confirmada). Par grupo/subgrupo só se retira quando o resultado
 * continua sendo grupos × subgrupos; senão devolve null (a pessoa ajusta a abrangência à mão).
 */
export function retirarSobreposicao(outra: Abrangencia, nova: Abrangencia): Abrangencia | null {
  const a = pares(outra); const b = new Set(pares(nova).chaves);
  if (a.nivel === 'TODOS') return b.has('*') ? { todos: false, grupos: [] } : outra;
  if (outra.todos) return outra;
  if (a.nivel === 'GRUPO') return { todos: false, grupos: outra.grupos.filter((g) => !b.has(chaveGrupo(g))) };
  const resta = new Map<string, Set<string>>();
  for (const g of outra.grupos) for (const s of outra.subgrupos ?? []) if (!b.has(`${chaveGrupo(g)}\u0000${chaveSubgrupo(s)}`)) (resta.get(g) ?? resta.set(g, new Set()).get(g)!).add(s);
  if (!resta.size) return { todos: false, grupos: [] };
  const conjuntos = [...resta.values()].map((s) => [...s].sort().join('\u0001'));
  if (new Set(conjuntos).size !== 1) return null;
  return { todos: false, grupos: outra.grupos.filter((g) => resta.has(g)), subgrupos: (outra.subgrupos ?? []).filter((s) => resta.values().next().value!.has(s)) };
}

/** A regra cobre o grupo/subgrupo (no nível dela)? */
export function cobre(a: Abrangencia, grupo: unknown, subgrupo?: unknown): boolean {
  if (a.todos) return true;
  const g = chaveGrupo(grupo);
  if (!a.grupos.some((x) => chaveGrupo(x) === g)) return false;
  return !a.subgrupos?.length || a.subgrupos.some((x) => chaveSubgrupo(x) === chaveSubgrupo(subgrupo));
}

/** Grupos sem regra de cada aspecto (pendências): sem "Todos os grupos" e sem regra própria do grupo. Regra só de subgrupo não cobre o grupo. */
export function gruposSemRegra(grupos: string[], regras: ComAbrangencia[]): { aspecto: Aspecto; grupos: string[] }[] {
  return ASPECTOS.map((aspecto) => {
    const doAspecto = regras.filter((r) => r.aspecto === aspecto);
    if (doAspecto.some((r) => r.abrangencia.todos)) return { aspecto, grupos: [] };
    const cobertos = new Set(doAspecto.flatMap((r) => (!r.abrangencia.todos && !r.abrangencia.subgrupos?.length ? r.abrangencia.grupos.map(chaveGrupo) : [])));
    return { aspecto, grupos: grupos.filter((g) => !cobertos.has(chaveGrupo(g))) };
  });
}
