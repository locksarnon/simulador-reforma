/**
 * Política de unidades de medida do estoque (porte de src/components/saneamento/unidades.js).
 *
 * A unidade de ESTOQUE é a MENOR unidade prática da medida: massa em KG, volume em L, comprimento em M, área em M2, contagem em UN.
 * Unidade maior (tonelada, hectolitro, dúzia, m³...) e embalagem (saca, big bag, galão, caixa, pacote...) viram unidade de COMPRA, com o fator de conversão.
 * O motor só SUGERE. O fator só é dado como certo quando é exato por definição (1 t = 1.000 kg) ou está escrito na unidade; quando vem da descrição
 * (uma única medida citada) fica "para confirmar"; nos demais casos fica "a informar". Unidade que a tabela não conhece nunca é adivinhada.
 */
import { lerNumero as lerNumeroDaImportacao } from '../importacao/normalizacao';
import type { RegraUnidade } from './contexto';
import { numeroBr, semAcento } from './texto';

export type Grandeza = 'massa' | 'volume' | 'comprimento' | 'area' | 'contagem';
type Nivel = 'padrao' | 'menor' | 'maior' | 'embalagem' | 'conjunto' | 'mantida';
type Evidencia = 'universal' | 'unidade' | 'descricao' | 'regra' | null;

export const GRANDEZAS: Record<Grandeza, { rotulo: string; padrao: string; base: string; si: boolean }> = {
  massa: { rotulo: 'Massa', padrao: 'KG', base: 'kg', si: true },
  volume: { rotulo: 'Volume', padrao: 'L', base: 'l', si: true },
  comprimento: { rotulo: 'Comprimento', padrao: 'M', base: 'm', si: true },
  area: { rotulo: 'Área', padrao: 'M2', base: 'm2', si: true },
  contagem: { rotulo: 'Contagem', padrao: 'UN', base: 'un', si: false },
};

/** Chave de uma unidade: minúscula, sem acento, sem ponto nem espaço ("M²" → "m2", "BIG BAG" → "bigbag"). */
export const chaveUnidade = (s: unknown): string => semAcento(s).toLowerCase().replace(/[.\s]/g, '');

// [classe (grafias da mesma unidade), medida, fator EXATO para a unidade padrão, grafias]. Fator 1 = a própria padrão; < 1 = menor (aceita); > 1 = maior (vira unidade de compra).
const MEDIDAS: [string, Grandeza, number, string[]][] = [
  ['mg', 'massa', 1e-6, ['mg', 'miligrama', 'miligramas']],
  ['g', 'massa', 1e-3, ['g', 'gr', 'grs', 'grama', 'gramas']],
  ['kg', 'massa', 1, ['kg', 'kgs', 'kgr', 'kilo', 'kilos', 'quilo', 'quilos', 'quilograma', 'quilogramas', 'quilogram']],
  ['t', 'massa', 1000, ['t', 'ton', 'tons', 'tonelada', 'toneladas']],
  ['ml', 'volume', 1e-3, ['ml', 'mililitro', 'mililitros', 'cc', 'cm3']],
  ['l', 'volume', 1, ['l', 'lt', 'lts', 'litro', 'litros']],
  ['hl', 'volume', 100, ['hl', 'hectolitro', 'hectolitros']],
  ['m3', 'volume', 1000, ['m3', 'metrocubico', 'metroscubicos', 'metrocub', 'metroscub']],
  ['mm', 'comprimento', 1e-3, ['mm', 'milimetro', 'milimetros']],
  ['cm', 'comprimento', 1e-2, ['cm', 'centimetro', 'centimetros']],
  ['m', 'comprimento', 1, ['m', 'mt', 'mts', 'metro', 'metros']],
  ['km', 'comprimento', 1000, ['km', 'quilometro', 'quilometros']],
  ['cm2', 'area', 1e-4, ['cm2']],
  ['m2', 'area', 1, ['m2', 'metroquadrado', 'metrosquadrados', 'metroqua', 'metrosqua']],
  ['ha', 'area', 10000, ['ha', 'hectare', 'hectares']],
  ['km2', 'area', 1e6, ['km2']],
  ['un', 'contagem', 1, ['un', 'und', 'unid', 'unidade', 'unidades', 'pc', 'pcs', 'pca', 'peca', 'pecas']],
  ['dose', 'contagem', 1, ['dose', 'doses']],
  ['cabeca', 'contagem', 1, ['cabeca', 'cabecas']],
  ['dz', 'contagem', 12, ['dz', 'duzia', 'duzias']],
  ['cento', 'contagem', 100, ['cento', 'centos']],
  ['milhar', 'contagem', 1000, ['milhar', 'milhares', 'milheiro', 'milheiros']],
];
// Embalagens cuja medida é praticamente sempre a mesma; o conteúdo (fator) vem do item. As ambíguas (rolo, balde, tambor, frasco, lata...) ficam para o analista.
const EMBALAGENS: [string, Grandeza, string[]][] = [
  ['sc', 'massa', ['sc', 'sca', 'saca', 'sacas', 'saco', 'sacos']],
  ['bb', 'massa', ['bb', 'bigbag', 'bigbags']],
  ['gl', 'volume', ['gl', 'galao', 'galoes']],
  ['cx', 'contagem', ['cx', 'caixa', 'caixas']],
  ['pct', 'contagem', ['pct', 'pacote', 'pacotes']],
  ['fd', 'contagem', ['fd', 'fardo', 'fardos']],
];
// Conjuntos: o próprio conjunto é o item. Aceitos.
const CONJUNTOS: [string, string[]][] = [['jg', ['jg', 'jogo', 'jogos']], ['cj', ['cj', 'conjunto', 'conjuntos']], ['kit', ['kit', 'kits']], ['par', ['par', 'pares']]];

type Linha = { classe: string; nivel: Nivel; grandeza: Grandeza | null; base: string | null; fator: number | null; evidencia: Evidencia };
const TABELA = new Map<string, Linha>();
const registrar = (nome: string, linha: Linha) => {
  if (TABELA.has(nome)) throw new Error(`Unidade "${nome}" repetida na tabela de unidades`);
  TABELA.set(nome, linha);
};
for (const [classe, grandeza, fator, nomes] of MEDIDAS) {
  const nivel: Nivel = fator === 1 ? 'padrao' : fator < 1 ? 'menor' : 'maior';
  for (const n of nomes) registrar(n, { classe, nivel, grandeza, base: GRANDEZAS[grandeza].base, fator, evidencia: nivel === 'maior' ? 'universal' : null });
}
for (const [classe, grandeza, nomes] of EMBALAGENS) for (const n of nomes) registrar(n, { classe, nivel: 'embalagem', grandeza, base: GRANDEZAS[grandeza].base, fator: null, evidencia: null });
for (const [classe, nomes] of CONJUNTOS) for (const n of nomes) registrar(n, { classe, nivel: 'conjunto', grandeza: null, base: null, fator: null, evidencia: null });

/** Classe (grafias da mesma unidade) da unidade, ou null se a tabela não a conhece. */
export const unidadeCanonica = (u: unknown): string | null => { const k = chaveUnidade(u); return k ? (TABELA.get(k)?.classe ?? null) : null; };

// ── Medidas escritas em texto ("50KG", "5 LT", "250 ML", "C/12") ──
const NUM = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)`;
// Comprimento só aceita metro: mm e cm costumam ser dimensão do produto, não conteúdo.
const ESCRITA: Partial<Record<Grandeza, [string, number][]>> = {
  massa: [[String.raw`kgs?|kgr|quilos?|kilos?`, 1], [String.raw`gramas?|grs?|g`, 1e-3], ['mg', 1e-6]],
  volume: [[String.raw`litros?|lts?|l`, 1], ['ml', 1e-3]],
  comprimento: [[String.raw`metros?|mts?|m`, 1]],
  contagem: [[String.raw`unidades?|unids?|und|un|pecas?|pcs?|pc`, 1]],
};
const arred = (n: number) => Math.round(n * 1e6) / 1e6;
/** "1.000" é mil (notação brasileira); "1,5" e "0.9" são decimais. */
const lerNumero = (t: string): number | null => {
  const s = String(t).trim();
  const n = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
/**
 * Fator digitado pelo analista ("1.000", "0,5", "20"); null se vazio, inválido ou ≤ 0. Número já é número (0.001 continua 0,001); texto segue a
 * MESMA leitura da importação (`lerNumero` de importacao/normalizacao: "1.000" = mil, "1.000,5" = mil e meio, "0,001" e "0.001" = um milésimo).
 */
export const lerFator = (t: unknown): number | null => { const n = lerNumeroDaImportacao(t); return n != null && n > 0 ? n : null; };
const fatorDoToken = (grupos: [string, number][], token: string): number | null => grupos.find(([e]) => new RegExp(`^(?:${e})$`).test(token))?.[1] ?? null;

function medidasNoTexto(grandeza: Grandeza, d: string): number[] {
  const grupos = ESCRITA[grandeza]; if (!grupos) return [];
  const re = new RegExp(String.raw`(?<![a-z0-9])${NUM}\s*(${grupos.map(([e]) => e).join('|')})(?![a-z0-9])`, 'g');
  const saida: number[] = [];
  for (const m of d.matchAll(re)) { const n = lerNumero(m[1]); const f = fatorDoToken(grupos, m[2]); if (n != null && f != null) saida.push(n * f); }
  return saida;
}
const CONTAGENS_EXPLICITAS = [
  /(?<![a-z0-9])c\s*\/\s*(\d+)(?![\d.,]*\d)/g,
  /(?<![a-z0-9])com\s+(\d+)\s*(?:unidades?|unids?|und|un|pecas?|pcs?|pc)(?![a-z0-9])/g,
];
const unico = (vs: (number | null)[]): number | null => { const s = [...new Set(vs.filter((v): v is number => v != null && v > 0).map(arred))]; return s.length === 1 ? s[0] : null; };

/**
 * Quantas unidades padrão da medida há em UMA unidade do item, quando a descrição diz ("SACO 50KG" → 50; "GALAO 5 LT" → 5; "CAIXA C/12" → 12).
 * Só vale se a descrição cita UMA medida da mesma família (ou várias iguais); com medidas diferentes não há como saber qual é o conteúdo → null.
 */
export function fatorPelaDescricao(grandeza: Grandeza | string, descricao: unknown): number | null {
  const d = semAcento(descricao).toLowerCase();
  if (!d || !ESCRITA[grandeza as Grandeza]) return null;
  const valores: (number | null)[] = medidasNoTexto(grandeza as Grandeza, d);
  if (grandeza === 'contagem') for (const re of CONTAGENS_EXPLICITAS) for (const m of d.matchAll(re)) valores.push(lerNumero(m[1]));
  return unico(valores);
}

/** Medidas (grandezas) distintas que a descrição cita: usado para detectar unidade incompatível com a descrição. */
export function grandezasNaDescricao(descricao: unknown): Grandeza[] {
  const d = semAcento(descricao).toLowerCase();
  return (['massa', 'volume'] as Grandeza[]).filter((g) => medidasNoTexto(g, d).length > 0);
}

/** Conteúdo escrito na própria unidade: "BALDE 20KG" → massa 20; "FRASCO 500ML" → volume 0,5; "CX12" → contagem 12. null se não há. */
export function conteudoNaUnidade(raw: unknown): { nome: string; grandeza: Grandeza; fator: number } | null {
  const t = semAcento(raw).toLowerCase().trim();
  if (!t || t.length > 40) return null;
  for (const [grandeza, grupos] of Object.entries(ESCRITA) as [Grandeza, [string, number][]][]) {
    const m = new RegExp(String.raw`^([a-z][a-z .]*?)[\s\-/:]*${NUM}\s*(${grupos.map(([e]) => e).join('|')})$`).exec(t);
    if (!m) continue;
    const n = lerNumero(m[2]); const f = fatorDoToken(grupos, m[3]);
    if (n != null && n > 0 && f != null) return { nome: m[1].trim(), grandeza, fator: arred(n * f) };
  }
  const m = /^([a-z]+)\s*[-/]?\s*(\d+)$/.exec(t);
  const linha = m && TABELA.get(m[1]);
  return linha && linha.nivel === 'embalagem' && linha.grandeza && Number(m![2]) > 0 ? { nome: m![1], grandeza: linha.grandeza, fator: Number(m![2]) } : null;
}

export type ClassificacaoUnidade = {
  chave: string; origem: 'regra' | 'tabela' | 'unidade'; nivel: Nivel; classe: string | null; grandeza: Grandeza | null; base: string | null; fator: number | null; evidencia: Evidencia;
};

/**
 * Como a política enxerga a unidade, ou null (sem regra). Ordem: regra do projeto → tabela → conteúdo escrito na unidade.
 * `regras` = { [chave]: { manter: true } | { grandeza, fator } } (fator vazio = embalagem com conteúdo a informar).
 */
export function classificarUnidade(raw: unknown, regras: Record<string, RegraUnidade> = {}): ClassificacaoUnidade | null {
  const chave = chaveUnidade(raw);
  if (!chave) return null;
  const r = regras?.[chave];
  if (r?.manter) return { chave, origem: 'regra', nivel: 'mantida', classe: null, grandeza: null, base: null, fator: null, evidencia: null };
  const g = r?.grandeza ? GRANDEZAS[r.grandeza as Grandeza] : undefined;
  if (r && g) {
    const f = r.fator == null || r.fator === '' ? null : Number(r.fator);
    if (f == null) return { chave, origem: 'regra', nivel: 'embalagem', classe: null, grandeza: r.grandeza as Grandeza, base: g.base, fator: null, evidencia: null };
    if (Number.isFinite(f) && f > 0) return { chave, origem: 'regra', nivel: f === 1 ? 'padrao' : f < 1 ? 'menor' : 'maior', classe: null, grandeza: r.grandeza as Grandeza, base: g.base, fator: f, evidencia: 'regra' };
  }
  const linha = TABELA.get(chave);
  if (linha) return { chave, origem: 'tabela', ...linha };
  const c = conteudoNaUnidade(raw);
  return c ? { chave, origem: 'unidade', nivel: 'embalagem', classe: null, grandeza: c.grandeza, base: GRANDEZAS[c.grandeza].base, fator: c.fator, evidencia: 'unidade' } : null;
}

type ItemUn = { unidade?: string | null; descricao?: string | null };

/** Grafia dominante (a mais usada) de cada classe de unidade presente nos itens. */
function dominantes(itens: ItemUn[]): Map<string, string> {
  const cont = new Map<string, Map<string, number>>();
  for (const it of itens) {
    const c = unidadeCanonica(it.unidade); if (!c) continue;
    const mm = cont.get(c) ?? new Map<string, number>(); const k = String(it.unidade).trim(); mm.set(k, (mm.get(k) || 0) + 1); cont.set(c, mm);
  }
  return new Map([...cont].map(([c, mm]) => [c, [...mm.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0]]));
}
const rotuloTxt = (s: unknown) => String(s ?? '').trim().toUpperCase();
/**
 * Nome da unidade padrão de cada medida. Vale o que o analista definiu no projeto (`rotulos`); sem isso, as medidas do SI usam o símbolo (KG, L, M, M2)
 * e a contagem usa a grafia que a própria base já adota (UNIDADE ou UN), para não reescrever a base inteira à toa.
 */
export function rotulosPadrao(itens: ItemUn[], rotulos: Partial<Record<Grandeza, string>> = {}): Record<Grandeza, string> {
  const dom = dominantes(itens);
  return Object.fromEntries((Object.entries(GRANDEZAS) as [Grandeza, (typeof GRANDEZAS)[Grandeza]][]).map(([g, v]) => [g, rotuloTxt(rotulos?.[g]) || (v.si ? v.padrao : dom.get(v.base) || v.padrao)])) as Record<Grandeza, string>;
}

export type AchadoUnidade = {
  achado: boolean; motivo?: string; sugerida?: string;
  extra?: { tipo: 'conversao'; de: string; grandeza: Grandeza; nivel: Nivel; fator: number | null; evidencia: Evidencia } | { tipo: 'grafia'; de: string; para: string };
};

function conversao(it: ItemUn, raw: string, k: ClassificacaoUnidade, alvo: string): AchadoUnidade {
  const nome = raw.toUpperCase(); const grandeza = k.grandeza as Grandeza; const medida = GRANDEZAS[grandeza].rotulo.toLowerCase();
  let fator = k.fator; let evidencia = k.evidencia;
  if (fator == null) { const d = fatorPelaDescricao(grandeza, it.descricao); if (d != null) { fator = d; evidencia = 'descricao'; } }
  const eq = fator != null ? `1 ${nome} = ${numeroBr(fator)} ${alvo}` : null;
  const detalhe = eq == null ? `informe quantos ${alvo} há em cada ${nome}`
    : evidencia === 'descricao' ? `a descrição indica ${eq} (confirmar)`
      : evidencia === 'unidade' ? `o conteúdo está na própria unidade: ${eq}`
        : evidencia === 'regra' ? `${eq} (regra do projeto)` : eq;
  const motivo = k.nivel === 'embalagem' ? `Embalagem de ${medida}: ${detalhe}` : `Maior que a unidade padrão de ${medida} (${alvo}): ${detalhe}`;
  return { achado: true, motivo, sugerida: alvo, extra: { tipo: 'conversao', de: raw, grandeza, nivel: k.nivel, fator: fator ?? null, evidencia: fator != null ? evidencia : null } };
}

/**
 * Teste da unidade, por item (sempre sobre o universo de itens dado, porque a grafia dominante depende dele).
 *  - sem unidade → pendência; unidade que a política não conhece → pendência (o analista a classifica);
 *  - política ligada: unidade maior que a padrão, ou embalagem → sugere a unidade padrão e o fator (a atual vira unidade de compra);
 *  - grafia diferente da dominante da mesma unidade (KGS × KG) → sugere a dominante.
 * Unidade já menor que a padrão, conjunto e unidade marcada para manter são aceitos.
 */
export function achadosUnidade(itens: ItemUn[], { politica = true, regras = {}, rotulos = {} }: { politica?: boolean; regras?: Record<string, RegraUnidade>; rotulos?: Partial<Record<Grandeza, string>> } = {}): (it: ItemUn) => AchadoUnidade {
  const dom = dominantes(itens); const padroes = rotulosPadrao(itens, rotulos);
  const memo = new Map<string, ClassificacaoUnidade | null>();
  const cls = (raw: string) => { if (!memo.has(raw)) memo.set(raw, classificarUnidade(raw, regras)); return memo.get(raw) ?? null; };
  return (it) => {
    const raw = String(it.unidade ?? '').trim();
    if (!raw) return { achado: true, motivo: 'Sem unidade de medida' };
    const k = cls(raw);
    if (!k) return { achado: true, motivo: `Unidade "${raw}" sem regra na política: classifique-a na tabela de unidades` };
    if (k.nivel === 'mantida') return { achado: false };
    if (politica && (k.nivel === 'maior' || k.nivel === 'embalagem') && k.grandeza) return conversao(it, raw, k, padroes[k.grandeza]);
    if (!k.classe) return { achado: false };
    const padrao = !!k.grandeza && k.classe === GRANDEZAS[k.grandeza].base; // a unidade padrão da medida tem nome definido; as demais seguem a grafia dominante
    const alvo = padrao ? padroes[k.grandeza as Grandeza] : dom.get(k.classe);
    return raw !== alvo ? { achado: true, motivo: `Grafia "${raw}" difere ${padrao ? 'do padrão' : 'da dominante'} "${alvo}"`, sugerida: alvo, extra: { tipo: 'grafia', de: raw, para: String(alvo) } } : { achado: false };
  };
}

/** Fator de conversão de uma decisão de unidade: o informado pelo analista ou o sugerido; null se ainda é "a informar". */
export const fatorDaDecisao = (d: { fatorFinal?: unknown; fator?: unknown } | null | undefined): number | null => lerFator(d?.fatorFinal ?? d?.fator);
/** Conversão sem fator não pode ser aprovada: a unidade de compra precisa do "itens por unidade de compra". */
export const precisaFator = (d: { tipo?: string; para?: string; fatorFinal?: unknown; fator?: unknown } | null | undefined): boolean => d?.tipo === 'conversao' && !!d.para && fatorDaDecisao(d) == null;
