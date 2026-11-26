/** Utilitários de texto das camadas. Funções puras. */
import type { ItemTrabalho } from '../tipos';

export const semAcento = (s: unknown): string => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
export const soDigitos = (s: unknown): string => String(s ?? '').replace(/\D/g, '');
export const vazio = (s: unknown): boolean => s == null || String(s).trim() === '';
export const txt = (s: unknown): string => String(s ?? '').trim();
export const numeroBr = (n: number): string => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
export const dataBr = (d: string | null | undefined): string => (d ? String(d).split('-').reverse().join('/') : '');
export const comparar = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' }).compare;

/** Palavras de ligação que não identificam o produto. */
export const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'ao', 'com', 'sem', 'um', 'uma', 'tipo', 'marca']);

/** Palavras que sozinhas não descrevem produto algum. */
export const GENERICOS = new Set(['material', 'materiais', 'peca', 'pecas', 'item', 'itens', 'produto', 'produtos', 'diversos', 'diverso', 'diversa', 'diversas', 'outros', 'outro', 'outra', 'outras',
  'varios', 'varias', 'geral', 'gerais', 'insumo', 'insumos', 'acessorio', 'acessorios', 'componente', 'componentes', 'equipamento', 'equipamentos', 'ferramenta', 'ferramentas', 'sortido', 'sortidos', 'misc', 'ref', 'cod', 'novo', 'nova', 'usado', 'usada']);

/** Palavras informativas da descrição: minúsculas, sem acento, sem ligação, sem números soltos. */
export function palavras(descricao: unknown): string[] {
  return semAcento(descricao).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t));
}

/** Só termos genéricos (e números): "MATERIAL DIVERSO", "PEÇAS", "OUTROS 10". */
export function soTermosGenericos(descricao: unknown): boolean {
  const p = palavras(descricao);
  return p.length > 0 && p.every((t) => GENERICOS.has(t));
}

/**
 * Descrição insuficiente: vazia, curta demais, só números/pontuação, ou uma única palavra sem medida, número nem referência.
 * Devolve o motivo ou null. Descrição só de termos genéricos é tratada em Nomes e unidades (termo genérico), não aqui.
 */
export function motivoDescricaoInsuficiente(descricao: unknown): string | null {
  const d = txt(descricao);
  if (!d) return 'Descrição vazia';
  if (!/[a-zA-ZÀ-ÿ]/.test(d)) return 'Descrição sem letras (só números ou pontuação)';
  if (d.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').length < 3) return 'Descrição com menos de 3 caracteres';
  const p = palavras(d);
  if (p.length <= 1 && !/\d/.test(d) && !soTermosGenericos(d)) return 'Descrição de uma única palavra, sem medida, referência nem complemento';
  return null;
}

/** yyyy-mm-dd e data de calendário real. */
export function dataIsoValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Chave do estabelecimento: null/vazio = único. */
export const chaveEstab = (it: Pick<ItemTrabalho, 'estabelecimento'>): string => txt(it.estabelecimento);

/** Lê um campo do item pelo nome (propriedade direta ou coluna mapeada em `campos`). */
export function campoDe(it: ItemTrabalho, nome: string): string | number | boolean | null {
  const direto = (it as unknown as Record<string, unknown>)[nome];
  if (direto !== undefined && (direto === null || typeof direto !== 'object')) return direto as string | number | boolean | null;
  return it.campos?.[nome] ?? null;
}

/** Campo extra de `campos` por qualquer um dos nomes (primeiro preenchido). */
export function campoExtra(it: ItemTrabalho, ...nomes: string[]): string {
  for (const n of nomes) { const v = it.campos?.[n]; if (v != null && String(v).trim() !== '') return String(v).trim(); }
  return '';
}

export const unicos = <T>(xs: T[]): T[] => [...new Set(xs)];

/** Comparador de strings estável (independe de locale). */
export const porTexto = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Reúne itens por chave mantendo a ordem de chegada. */
export function agrupar<T>(xs: T[], chave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) { const k = chave(x); const a = m.get(k); if (a) a.push(x); else m.set(k, [x]); }
  return m;
}
