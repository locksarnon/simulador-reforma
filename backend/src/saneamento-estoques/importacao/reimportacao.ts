import type { ItemImportado } from './tipos';

export type Valor = string | number | boolean | null;
/** Item como a comparação o enxerga: campo → valor (plano). Use `achatarItem` para gerar a partir de um item. */
export type CamposPlanos = Record<string, Valor | undefined>;

/** Item atual da base de trabalho: seus campos e quais deles têm decisão aprovada (uma decisão aprovada nunca é sobrescrita em silêncio). */
export type EntradaAtual = { campos: CamposPlanos; camposComDecisao: string[] };
export type EntradaNova = { campos: CamposPlanos };

export type Mudanca = { campo: string; antes: Valor; depois: Valor; comDecisao: boolean };
export type ItemNovo = { chave: string; campos: Record<string, Valor> };
export type ItemAlterado = { chave: string; mudancas: Mudanca[] };
export type Conflito = { chave: string; campo: string; antes: Valor; depois: Valor };

export type ComparacaoBases = {
  /** Chaves que só existem no arquivo novo (com os campos comparados). */
  novos: ItemNovo[];
  /** Chaves que só existem na base atual: NUNCA são removidas automaticamente. */
  ausentes: string[];
  inalterados: string[];
  /** Itens com diferença por campo (antes/depois), inclusive nos campos com decisão. */
  alterados: ItemAlterado[];
  /** Subconjunto das mudanças que atingem campo com decisão aprovada: a tela pede a resolução antes de incorporar. */
  conflitos: Conflito[];
  resumo: { novos: number; ausentes: number; inalterados: number; alterados: number; conflitos: number };
};

/** Prefixo dos campos adicionais (`campos` do item) na forma plana. */
export const PREFIXO_CAMPOS = 'campos.';

/** Item importado/da base -> campos planos para comparar (códigos e NCM como texto; adicionais com o prefixo `campos.`). Chave e `id` ficam de fora. */
export function achatarItem(item: Pick<ItemImportado, 'descricao' | 'unidade' | 'ncm' | 'grupo' | 'ativo' | 'saldo' | 'ultimaMovimentacao' | 'fabricante' | 'referencia' | 'finalidade' | 'campos'>): CamposPlanos {
  const r: CamposPlanos = {
    descricao: item.descricao, unidade: item.unidade, ncm: item.ncm, grupo: item.grupo, ativo: item.ativo, saldo: item.saldo,
    ultimaMovimentacao: item.ultimaMovimentacao, fabricante: item.fabricante, referencia: item.referencia, finalidade: item.finalidade,
  };
  for (const [k, v] of (Object.entries(item.campos ?? {}) as [string, Valor][])) r[PREFIXO_CAMPOS + k] = v;
  return r;
}

/** Vazio, nulo e indefinido são o mesmo; texto é comparado aparado; número como número. */
function canon(v: Valor | undefined): Valor {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') { const t = v.replace(/\s+/g, ' ').trim(); return t === '' ? null : t; }
  return v;
}
const iguais = (a: Valor, b: Valor) => a === b;

/**
 * Compara a base atual com o arquivo reimportado, por chave (estabelecimento + código). Função pura e determinística: as listas saem
 * ordenadas pela chave e os campos pela ordem de `camposComparados`; tudo é JSON puro.
 *
 * - `camposComparados`: quais campos entram na comparação (omitido = união dos campos de ambos os lados).
 * - Um campo ausente de um lado e presente no outro conta como diferença (null -> valor).
 */
export function compararBases(atuais: Map<string, EntradaAtual>, novos: Map<string, EntradaNova>, opcoes: { camposComparados?: string[] } = {}): ComparacaoBases {
  let campos = opcoes.camposComparados;
  if (!campos) {
    const u = new Set<string>();
    for (const e of atuais.values()) for (const k of Object.keys(e.campos)) u.add(k);
    for (const e of novos.values()) for (const k of Object.keys(e.campos)) u.add(k);
    campos = [...u].sort();
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const resultado: ComparacaoBases = { novos: [], ausentes: [], inalterados: [], alterados: [], conflitos: [], resumo: { novos: 0, ausentes: 0, inalterados: 0, alterados: 0, conflitos: 0 } };

  for (const chave of [...novos.keys()].sort(cmp)) {
    const n = novos.get(chave) as EntradaNova;
    const a = atuais.get(chave);
    if (!a) {
      const planos: Record<string, Valor> = {};
      for (const c of campos) planos[c] = canon(n.campos[c]);
      resultado.novos.push({ chave, campos: planos });
      continue;
    }
    const decididos = new Set(a.camposComDecisao);
    const mudancas: Mudanca[] = [];
    for (const c of campos) {
      const antes = canon(a.campos[c]); const depois = canon(n.campos[c]);
      if (!iguais(antes, depois)) mudancas.push({ campo: c, antes, depois, comDecisao: decididos.has(c) });
    }
    if (!mudancas.length) { resultado.inalterados.push(chave); continue; }
    resultado.alterados.push({ chave, mudancas });
    for (const m of mudancas) if (m.comDecisao) resultado.conflitos.push({ chave, campo: m.campo, antes: m.antes, depois: m.depois });
  }
  for (const chave of [...atuais.keys()].sort(cmp)) if (!novos.has(chave)) resultado.ausentes.push(chave);
  resultado.resumo = { novos: resultado.novos.length, ausentes: resultado.ausentes.length, inalterados: resultado.inalterados.length, alterados: resultado.alterados.length, conflitos: resultado.conflitos.length };
  return resultado;
}
