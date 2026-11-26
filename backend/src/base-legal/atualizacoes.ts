/**
 * O que uma atualização do texto oficial significa para a base de conhecimento: atos que alteraram a norma, situação da norma
 * (vigente, parcialmente revogada, revogada) e as novidades que entram na lista que a equipe lê. Funções puras.
 */
import { semRiscado, type DispositivoExtraido } from './base-legal.parser';
import { atoDoTexto } from './marcas';

export type AtoModificador = { ato: string; referencia: string; dispositivos: number; tipos: string[] };

const TIPOS_QUE_MODIFICAM = new Set(['redacao', 'inclusao', 'revogacao', 'renumeracao']);

/** Atos que alteraram, incluíram ou revogaram dispositivos da norma (lidos das notas do texto oficial), do que mais mexeu ao que menos. */
export function atosModificadores(extraidos: DispositivoExtraido[]): AtoModificador[] {
  const mapa = new Map<string, { ato: string; referencia: string; dispositivos: number; tipos: Set<string> }>();
  for (const d of extraidos) {
    const contado = new Set<string>();
    for (const m of d.alteracoes) {
      if (!m.ato || !m.referencia || !TIPOS_QUE_MODIFICAM.has(m.tipo)) continue;
      let a = mapa.get(m.referencia);
      if (!a) { a = { ato: m.ato, referencia: m.referencia, dispositivos: 0, tipos: new Set() }; mapa.set(m.referencia, a); }
      a.tipos.add(m.tipo);
      if (!contado.has(m.referencia)) { a.dispositivos += 1; contado.add(m.referencia); }
    }
  }
  return [...mapa.values()]
    .map((a) => ({ ato: a.ato, referencia: a.referencia, dispositivos: a.dispositivos, tipos: [...a.tipos] }))
    .sort((x, y) => y.dispositivos - x.dispositivos)
    .slice(0, 80);
}

export type SituacaoDaNorma = { situacao: 'vigente' | 'parcialmente_revogada' | 'revogada'; revogada_por: string | null };

/**
 * Situação da norma lida do próprio texto: o aviso "(Revogada pela Lei nº ...)" no cabeçalho, ou quase todos os artigos revogados,
 * dizem que ela inteira saiu; qualquer dispositivo revogado (ou revogado em parte) a torna parcialmente revogada.
 */
export function situacaoDaNorma(extraidos: DispositivoExtraido[], texto: string): SituacaoDaNorma {
  const linhas = semRiscado(texto).split('\n').map((l) => l.trim());
  const primeiro = linhas.findIndex((l) => /^(?:Art\.?\s*\d|Cl[áa]usula\s+[a-zé])/.test(l));
  // O aviso de revogação da norma inteira fica no cabeçalho, antes do primeiro artigo (sem artigo reconhecido, olha as 40 primeiras linhas).
  const cabecalho = linhas.slice(0, primeiro >= 0 ? Math.min(primeiro, 40) : 40).join('\n');
  const nota = /\(\s*Revogad[oa]s?\s+(?:pel[oa]s?|a partir)\b[^)]*\)/i.exec(cabecalho);
  if (nota) return { situacao: 'revogada', revogada_por: atoDoTexto(nota[0])?.rotulo ?? null };
  const artigos = extraidos.filter((d) => d.tipo === 'artigo');
  const base = artigos.length ? artigos : extraidos;
  const revogados = base.filter((d) => d.revogado).length;
  if (base.length >= 3 && revogados / base.length >= 0.9) return { situacao: 'revogada', revogada_por: null };
  if (extraidos.some((d) => d.revogado || d.parcialmente_revogado)) return { situacao: 'parcialmente_revogada', revogada_por: null };
  return { situacao: 'vigente', revogada_por: null };
}

export type NovidadeNova = {
  tipo: string;
  origem: string;
  norma_chave?: string | null;
  norma_numero?: string | null;
  caminho?: string | null;
  rotulo?: string | null;
  titulo: string;
  resumo?: string | null;
  detalhes?: { rotulo: string; caminho?: string; url?: string }[];
  ato?: string | null;
  ato_ref?: string | null;
  url?: string | null;
  oficial?: boolean;
  confirmada?: boolean;
  execucao_id?: string | null;
  data_ato?: Date | null;
};

type Item = { rotulo: string; caminho: string };
export type EntradaNovidades = {
  norma: { chave: string; numero: string; url_oficial: string };
  primeiraCarga: boolean;
  totalDispositivos: number;
  alterados: (Item & { ato: string | null })[];
  revogados: (Item & { ato: string | null })[];
  incluidos: (Item & { ato: string | null })[];
  situacaoAnterior: string | null;
  situacao: SituacaoDaNorma;
  execucaoId?: string | null;
  /** Releitura com leitor novo: o que mudou no texto gravado veio do leitor, não da lei. */
  reprocessamento?: boolean;
};

const lista = (itens: Item[], max = 14) => itens.slice(0, max).map((i) => i.rotulo).join(', ') + (itens.length > max ? ` e mais ${itens.length - max}` : '');
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Agrupa por ato: "LC 227/2026 alterou 174 dispositivos da LC 214/2025" vale mais do que 174 linhas soltas. */
function porAto<T extends Item & { ato: string | null }>(itens: T[]): [string | null, T[]][] {
  const mapa = new Map<string | null, T[]>();
  for (const i of itens) mapa.set(i.ato, [...(mapa.get(i.ato) ?? []), i]);
  return [...mapa.entries()].sort((a, b) => b[1].length - a[1].length);
}

/** Novidades que uma atualização da norma gera: o que mudou, quem mudou (o ato) e se a norma inteira saiu. */
export function novidadesDaAtualizacao(e: EntradaNovidades): NovidadeNova[] {
  const base = { origem: 'texto_oficial', norma_chave: e.norma.chave, norma_numero: e.norma.numero, url: e.norma.url_oficial, oficial: true, confirmada: true, execucao_id: e.execucaoId ?? null };
  const saida: NovidadeNova[] = [];
  if (e.primeiraCarga) {
    return [{ ...base, tipo: 'nova_norma', titulo: `${e.norma.numero} carregada na base de conhecimento`, resumo: `${plural(e.totalDispositivos, 'dispositivo', 'dispositivos')} com o texto oficial, as notas de alteração e as redações anteriores.` }];
  }
  if (e.situacao.situacao === 'revogada' && e.situacaoAnterior !== 'revogada') {
    saida.push({ ...base, tipo: 'norma_revogada', titulo: `${e.norma.numero} foi revogada${e.situacao.revogada_por ? ` pela ${e.situacao.revogada_por}` : ''}`, resumo: 'O texto oficial traz a norma como revogada. Confira o que a substituiu antes de aplicar.', ato: e.situacao.revogada_por, ato_ref: e.situacao.revogada_por?.toLowerCase() ?? null });
  }
  if (e.reprocessamento) {
    const n = e.alterados.length + e.revogados.length;
    if (n === 0) return saida; // só a leitura nova de campos derivados: nada a dizer
    saida.push({
      ...base, tipo: 'reprocessada', titulo: `${e.norma.numero}: texto reprocessado com a leitura nova do texto oficial`,
      resumo: `${plural(n, 'dispositivo teve', 'dispositivos tiveram')} a redação antiga separada do texto vigente${e.revogados.length ? ` e ${plural(e.revogados.length, 'passou', 'passaram')} a constar como ${e.revogados.length === 1 ? 'revogado' : 'revogados'}` : ''}. Isso não é mudança da lei. Os cartões, as notas do cálculo e os marcos que citam esses dispositivos voltaram para revisão.`,
      detalhes: [...e.revogados, ...e.alterados].slice(0, 60).map(({ rotulo, caminho }) => ({ rotulo, caminho })),
    });
    return saida;
  }
  for (const [ato, itens] of porAto(e.revogados)) {
    saida.push({
      ...base, tipo: 'revogacao', ato, ato_ref: ato?.toLowerCase() ?? null,
      titulo: `${e.norma.numero}: ${plural(itens.length, 'dispositivo revogado', 'dispositivos revogados')}${ato ? ` pela ${ato}` : ''}`,
      resumo: lista(itens), detalhes: itens.slice(0, 60).map(({ rotulo, caminho }) => ({ rotulo, caminho })),
    });
  }
  for (const [ato, itens] of porAto(e.alterados)) {
    saida.push({
      ...base, tipo: 'alteracao', ato, ato_ref: ato?.toLowerCase() ?? null,
      titulo: `${e.norma.numero}: ${plural(itens.length, 'dispositivo alterado', 'dispositivos alterados')}${ato ? ` pela ${ato}` : ''}`,
      resumo: lista(itens), detalhes: itens.slice(0, 60).map(({ rotulo, caminho }) => ({ rotulo, caminho })),
    });
  }
  for (const [ato, itens] of porAto(e.incluidos)) {
    saida.push({
      ...base, tipo: 'inclusao', ato, ato_ref: ato?.toLowerCase() ?? null,
      titulo: `${e.norma.numero}: ${plural(itens.length, 'dispositivo novo', 'dispositivos novos')}${ato ? ` (${ato})` : ''}`,
      resumo: lista(itens), detalhes: itens.slice(0, 60).map(({ rotulo, caminho }) => ({ rotulo, caminho })),
    });
  }
  return saida;
}

/** O ato mais recente que deu a redação do dispositivo (a última nota "Redação dada..." do texto), ou o que incluiu ou revogou. */
export function atoDaMudanca(d: DispositivoExtraido, tipos: string[]): string | null {
  const marcas = d.alteracoes.filter((m) => m.ato && tipos.includes(m.tipo));
  return marcas.length ? marcas[marcas.length - 1].ato : null;
}
