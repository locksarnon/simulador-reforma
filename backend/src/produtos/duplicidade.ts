/**
 * Detecção de produtos duplicados em cadastro de ERP — lógica pura, sem banco.
 *
 * O que ela faz além de comparar texto igual:
 *  - normaliza acentos, caixa, pontuação, "c/", "s/", plural e ABREVIAÇÕES de mercado (fert → fertilizante, cx → caixa, sc → saco...);
 *  - entende MEDIDAS e as converte (0,5 L = 500 ml; 1 kg = 1000 g; 500 g/L = 500 mg/mL) e embalagens (12x500ml, caixa com 12);
 *  - tolera grafia errada (glifosto ≈ glifosato), fonética (ss/ç/ch...) e nome truncado (fertiliz ≈ fertilizante), em qualquer ordem de palavras;
 *  - dá mais peso a palavras raras do cadastro (IDF) e quase nenhum a palavras comuns ("produto", "tipo");
 *  - VETA o que parece igual mas é diferente: dose/medida diferente, unidade diferente, variedade/código alfanumérico diferente
 *    (30F35 x 30F53), número diferente (tipo 1 x tipo 2), complemento diferente (produto + cor, tamanho, lado, material, sabor: CORANTE ROSA x CORANTE VERDE
 *    são o mesmo produto em dois itens, não duplicidade) e, se pedido, princípio ativo diferente;
 *  - explica o porquê (motivos) e agrupa os duplicados, sugerindo qual cadastro manter (o mais completo).
 *
 * É uma CRÍTICA para revisão humana: nunca exclui nada.
 */

export type ItemDup = { descricao: string; unidade: string; ncm: string; principio: string; barras: string; codigo: string; grupo?: string };
export type NivelDup = 'EXATA' | 'MUITO_PROVAVEL' | 'POSSIVEL';
export type CandidatoDup = { idx: number; score: number; nivel: NivelDup; motivos: string[] };
export type ResultadoDup = { candidatos: CandidatoDup[]; grupo: number | null; mestre: number | null };

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Abreviações curtas (a partir de 4 letras o casamento por prefixo já cobre: "fertiliz" ≈ "fertilizante"). */
const ABREV: Record<string, string> = {
  cx: 'caixa', cxs: 'caixa', pct: 'pacote', pcte: 'pacote', pc: 'peca', pcs: 'peca', fr: 'frasco', frs: 'frasco', sc: 'saco', scs: 'saco',
  gl: 'galao', tb: 'tubo', amp: 'ampola', cp: 'comprimido', cpr: 'comprimido', comp: 'comprimido', cps: 'capsula', cap: 'capsula', caps: 'capsula',
  bisn: 'bisnaga', sol: 'solucao', susp: 'suspensao', conc: 'concentrado', emuls: 'emulsao', liq: 'liquido', inj: 'injetavel', vet: 'veterinario',
  bov: 'bovino', sui: 'suino', gran: 'granulado', pó: 'po', adub: 'adubo', fert: 'fertilizante', fertil: 'fertilizante', herb: 'herbicida',
  inset: 'inseticida', fung: 'fungicida', sem: 'semente', semen: 'semente', def: 'defensivo', defens: 'defensivo', org: 'organico', quim: 'quimico',
  ref: 'refil', emb: 'embalagem', tp: 'tipo', trat: 'tratamento', ind: 'industrial', nat: 'natural', orig: 'original',
};
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'ao', 'com', 'un', 'und', 'unid', 'unidade', 'tipo', 'marca', 'x']);

const UNIDADES: Record<string, string> = {
  kg: 'kg', kgs: 'kg', quilo: 'kg', quilos: 'kg', quilograma: 'kg', g: 'g', gr: 'g', grs: 'g', grama: 'g', gramas: 'g',
  l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l', ml: 'ml', un: 'un', und: 'un', unid: 'un', unidade: 'un', pc: 'un', pca: 'un', peca: 'un', pecas: 'un', pç: 'un', quilogram: 'kg', quilogramas: 'kg', metrocub: 'm3',
  cx: 'cx', caixa: 'cx', sc: 'sc', saco: 'sc', pct: 'pct', pacote: 'pct', fr: 'fr', frasco: 'fr', t: 't', ton: 't', tonelada: 't', m: 'm', mt: 'm', metro: 'm', dz: 'dz',
};
/** Unidades da mesma grandeza (L/ML, KG/G) não vetam: a medida da descrição é que decide. */
const unidadesCompativeis = (a: string, b: string) => a === b || (['l', 'ml'].includes(a) && ['l', 'ml'].includes(b)) || (['kg', 'g'].includes(a) && ['kg', 'g'].includes(b));
export const unidadeCanonica = (u: string) => { const k = sem(u).replace(/[^a-z]/g, ''); return UNIDADES[k] ?? k; };

type Medidas = Map<string, Set<string>>; // dimensão -> valores canônicos

/**
 * COMPLEMENTOS: palavras que distinguem VARIANTES do mesmo produto. O produto é o nome (CORANTE ALIMENTÍCIO LÍQUIDO); o complemento (ROSA, VERDE, GG, ESQUERDO,
 * INOX, MORANGO...) faz outro item: complemento diferente, ou presente em só um dos lados, não é duplicidade. Cada linha: [valor canônico, ...grafias e apelidos].
 * A lista cobre o que é comum; o que ficar fora dela é pego pela regra geral (palavras diferentes nos dois lados), ver compararPar.
 */
const COMPLEMENTOS: Record<string, string[][]> = {
  cor: [['branco', 'branca', 'bco', 'bca'], ['preto', 'preta', 'pto', 'pta'], ['azul', 'azuis', 'azl'], ['verde'], ['vermelho', 'vermelha', 'verm'], ['amarelo', 'amarela', 'amar'], ['rosa'], ['roxo', 'roxa'], ['laranja'],
    ['cinza', 'cinzento'], ['marrom', 'marron'], ['bege'], ['dourado', 'dourada'], ['prateado', 'prateada'], ['violeta'], ['lilas'], ['vinho'], ['turquesa'], ['grafite'], ['creme'], ['marfim'], ['bordo'], ['salmao'], ['ciano'],
    ['magenta'], ['fucsia'], ['petroleo'], ['musgo'], ['chumbo'], ['incolor'], ['transparente', 'transp']],
  tom: [['claro', 'clara'], ['escuro', 'escura'], ['fosco', 'fosca'], ['brilhante'], ['neon'], ['perolado', 'perolada']],
  tamanho: [['pp'], ['p'], ['m'], ['g'], ['gg'], ['xg', 'exg'], ['xgg', 'egg'], ['pequeno', 'pequena'], ['medio', 'media'], ['grande'], ['mini'], ['maxi'], ['jumbo'], ['infantil'], ['adulto', 'adulta']],
  posicao: [['esquerdo', 'esquerda', 'esq'], ['direito', 'direita', 'dir'], ['dianteiro', 'dianteira', 'diant'], ['traseiro', 'traseira', 'tras'], ['superior', 'sup'], ['inferior', 'inf'], ['interno', 'interna'], ['externo', 'externa'],
    ['central'], ['lateral'], ['frontal'], ['macho'], ['femea']],
  condicao: [['novo', 'nova'], ['usado', 'usada'], ['recondicionado', 'recondicionada', 'recond'], ['remanufaturado', 'remanufaturada', 'reman'], ['original'], ['paralelo', 'paralela'], ['similar'], ['generico', 'generica'],
    ['importado', 'importada'], ['nacional']],
  material: [['aco'], ['inox', 'inoxidavel'], ['aluminio'], ['latao'], ['bronze'], ['cobre'], ['ferro'], ['plastico'], ['pvc'], ['borracha'], ['nylon', 'nailon'], ['couro'], ['madeira'], ['vidro'], ['ceramica'], ['silicone'], ['teflon'],
    ['zincado', 'zinc'], ['galvanizado', 'galv'], ['cromado'], ['niquelado'], ['polido'], ['pintado']],
  sabor: [['morango'], ['baunilha'], ['chocolate'], ['limao'], ['uva'], ['maracuja'], ['abacaxi'], ['coco'], ['menta', 'hortela'], ['caramelo'], ['banana'], ['pessego'], ['framboesa'], ['cereja'], ['tangerina'], ['acerola'],
    ['mamao'], ['manga'], ['goiaba'], ['melancia'], ['caju'], ['maca'], ['pera']],
};
const COMPL_DA_PALAVRA = new Map<string, { classe: string; valor: string }>();
for (const [classe, linhas] of Object.entries(COMPLEMENTOS)) {
  for (const l of linhas) for (const w of l) { if (COMPL_DA_PALAVRA.has(w)) throw new Error(`Complemento "${w}" repetido na lista`); COMPL_DA_PALAVRA.set(w, { classe, valor: l[0] }); }
}
const complDe = (t: Tok) => COMPL_DA_PALAVRA.get(t.t) ?? COMPL_DA_PALAVRA.get(t.orig);
type Tok = { t: string; orig: string; w: number; leve?: boolean };
/** Palavras de embalagem: pesam pouco ("saco", "frasco" não distinguem produto; a unidade e a medida já cuidam disso). */
const EMBALAGEM = new Set(['saco', 'caixa', 'frasco', 'pacote', 'galao', 'tubo', 'ampola', 'bisnaga', 'refil', 'embalagem', 'peca', 'unidade']);
export type Norm = { tokens: Tok[]; medidas: Medidas; numeros: Set<string>; codigos: Set<string>; compl: Medidas; chave: string };

const arred = (n: number) => String(Math.round(n * 1000) / 1000);
const MASSA: Record<string, number> = { kg: 1000, kgs: 1000, g: 1, gr: 1, grs: 1, mg: 0.001, ton: 1e6, t: 1e6 };
const VOL: Record<string, number> = { l: 1000, lt: 1000, lts: 1000, litro: 1000, litros: 1000, ml: 1, cc: 1 };
const COMP: Record<string, number> = { m: 1000, mt: 1000, cm: 10, mm: 1 };

function add(m: Medidas, dim: string, val: string) { (m.get(dim) ?? m.set(dim, new Set()).get(dim)!).add(val); }

/** Texto -> tokens informativos + medidas + números + códigos. Pesos (IDF) entram depois. */
export function normalizar(descricao: string): Norm {
  // "LÍQ.CONFEITARIA": o ponto da abreviação cola a palavra seguinte; separa (decimais como 2.5 e siglas de uma letra, como M.L, ficam como estão)
  let s = sem(descricao).replace(/(\d),(\d)/g, '$1.$2').replace(/([a-z]{2,})\.(?=[a-z]{2,})/g, '$1 ').replace(/c\//g, ' com ').replace(/s\//g, ' sem ').replace(/p\//g, ' para ').replace(/&/g, ' e ');
  const medidas: Medidas = new Map(); const numeros = new Set<string>(); const codigos = new Set<string>();

  // 0) Referências de peça/fabricante (ANEL TRAVA 1440478X1, JUNTA R531581, SR-TA-2E, 7410-1296): token com 5+ caracteres que mistura letras e dígitos
  //    ou é só número longo vira CÓDIGO (exige igualdade) — antes que "1440478x1" seja lido como embalagem ou "57m8964" como metros.
  const MEDIDA_SIMPLES = /^\d+(?:\.\d+)?(?:kgs?|grs?|g|mg|ml|l|lts?|mm|cm|m|mt|%|ui|cc|ton|pol)$/;
  const DIMENSAO = /^\d{1,4}(?:\.\d+)?x\d{1,4}(?:\.\d+)?(?:x\d{1,4}(?:\.\d+)?)?(?:mm|cm|m|ml|l|kg|g)?$/;
  s = s.split(/\s+/).map((tk) => {
    const limpo = tk.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    if (/^[a-z]{1,3}-\d{1,4}[a-z]?$/.test(limpo)) { codigos.add(limpo.replace('-', '')); return ' '; }
    if (limpo.length < 5 || limpo.includes('/') || MEDIDA_SIMPLES.test(limpo) || DIMENSAO.test(limpo)) return tk;
    const so = limpo.replace(/[^a-z0-9]/g, '');
    if (so.length < 5 || !/\d/.test(so)) return tk;
    if (!/[a-z]/.test(so) && !/^\d{5,}$/.test(so)) return tk;
    codigos.add(so.replace(/^0+(?=\d)/, '')); return ' ';
  }).join(' ');
  // fração (polegadas): 11/16, 1/2 — compara como número
  s = s.replace(/(\d+)\/(\d+)/g, (_m, a: string, b: string) => { numeros.add(a + '/' + b); return ' '; });

  // 1) concentração "500 g/l", "500mg/ml"
  s = s.replace(/(\d+(?:\.\d+)?)\s*(kg|g|gr|mg|ui)\s*\/\s*(l|lt|ml)\b/g, (_m, n: string, a: string, b: string) => {
    const massa = Number(n) * (a === 'ui' ? 1 : MASSA[a] ?? 1); const vol = VOL[b] ?? 1;
    add(medidas, 'conc', arred((massa / vol) * 1000)); return ' ';
  });
  // 2) embalagem "12x500ml", "caixa com 12 frascos", "c/ 20 un"
  s = s.replace(/(\d+)\s*x\s*(?=\d+(?:\.\d+)?\s*(?:kgs?|grs?|g|mg|ml|l|lts?|litros?|cc)(?![a-z]))/g, (_m, n: string) => { add(medidas, 'pack', n); return ' '; });
  // dimensões "AxB[xC]" (pneu 1000x20, abraçadeira 18x27, oring 5.33x59.69): a ordem importa
  s = s.replace(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*x\s*(\d+(?:\.\d+)?))?\s*(?:mm|cm|m)?(?![a-z0-9])/g, (_m, a: string, b: string, c?: string) => { add(medidas, 'dim', [a, b, c].filter(Boolean).map((x) => arred(Number(x))).join('x')); return ' '; });
  s = s.replace(/\bcom\s+(\d+)\s*(?:un|und|unid|unidades?|frascos?|ampolas?|comprimidos?|capsulas?|sachês?|saches?|pecas?|tubos?)\b/g, (_m, n: string) => { add(medidas, 'pack', n); return ' '; });
  // 3) medidas simples
  s = s.replace(/(\d+(?:\.\d+)?)\s*(kgs?|grs?|g|mg|tonelada|ton|litros?|lts?|lt|l|ml|cc|mt|cm|mm|m|%|ui)(?![a-z0-9])/g, (_m, n: string, u: string) => {
    const v = Number(n);
    if (MASSA[u] !== undefined) add(medidas, 'massa', arred(v * MASSA[u]));
    else if (VOL[u] !== undefined || /^litros?$/.test(u)) add(medidas, 'volume', arred(v * (VOL[u] ?? 1000)));
    else if (COMP[u] !== undefined) add(medidas, 'compr', arred(v * COMP[u]));
    else if (u === '%') add(medidas, 'pct', arred(v));
    else if (u === 'ui') add(medidas, 'ui', arred(v));
    return ' ';
  });

  const brutos = s.split(/[^a-z0-9.]+/).map((x) => x.replace(/^\.+|\.+$/g, '')).filter(Boolean);
  const tokens: Tok[] = [];
  for (const b of brutos) {
    if (/^\d+(\.\d+)?$/.test(b)) { numeros.add(arred(Number(b))); continue; }
    if (/\d/.test(b) && /[a-z]/.test(b)) { codigos.add(b); continue; } // 30f35, bt2, a2024: variedade/código — exige igualdade
    const t0 = b.replace(/\./g, '');
    if (!t0 || STOP.has(t0)) continue;
    let t = ABREV[t0] ?? t0;
    if (!t) continue;
    if (t.length > 4 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1); // plural simples
    tokens.push({ t, orig: t0, w: 1, leve: EMBALAGEM.has(t) });
  }
  const compl: Medidas = new Map();
  for (const tk of tokens) { const c = complDe(tk); if (c) add(compl, c.classe, c.valor); }
  const chave = [...tokens.map((x) => x.t)].sort().join(' ') + '|' + [...medidas.entries()].map(([d, v]) => d + ':' + [...v].sort().join(',')).sort().join(';')
    + '|' + [...numeros].sort().join(',') + '|' + [...codigos].sort().join(',');
  return { tokens, medidas, numeros, codigos, compl, chave };
}

/** Distância de Damerau-Levenshtein (OSA) com corte: devolve max+1 quando passa do limite. */
function distancia(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = []; let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j); let cur: number[] = [];
  for (let i = 1; i <= a.length; i++) {
    cur = [i]; let min = i;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, (prev2[j - 2] ?? 99) + 1);
      cur[j] = v; if (v < min) min = v;
    }
    if (min > max) return max + 1;
    prev2.length = 0; prev2.push(...prev); prev = cur;
  }
  return prev[b.length];
}

/** Chave fonética simplificada do português (ss/ç/z, ch/x, ph, y, h mudo, letras dobradas). */
export function fonetica(t: string): string {
  return t.replace(/ph/g, 'f').replace(/ch|sh/g, 'x').replace(/ss|sc|ç|z/g, 's').replace(/y/g, 'i').replace(/w/g, 'v').replace(/qu|k/g, 'q')
    .replace(/^h/, '').replace(/h/g, '').replace(/(.)\1+/g, '$1').replace(/[aeiou]+$/, '');
}

/** Similaridade entre duas palavras (0 a 1) e a razão, para explicar. */
export function simToken(a: Tok, b: Tok): { s: number; motivo?: string; genero?: boolean } {
  if (a.t === b.t) return a.orig !== b.orig ? { s: 1, motivo: `abreviação: "${a.orig.length < b.orig.length ? a.orig : b.orig}" = "${a.t}"` } : { s: 1 };
  const [c, l] = a.t.length <= b.t.length ? [a.t, b.t] : [b.t, a.t];
  if (c.length >= 4 && l.startsWith(c) && c.length / l.length >= 0.5) return { s: 0.92, motivo: `nome truncado: "${c}" ≈ "${l}"` };
  const max = Math.max(a.t.length, b.t.length);
  if (Math.min(a.t.length, b.t.length) >= 6) {
    const lim = max >= 10 ? 2 : 1;
    if (a.t.length === b.t.length && a.t.slice(0, -1) === b.t.slice(0, -1) && /^[aoe]$/.test(a.t.slice(-1)) && /^[aoe]$/.test(b.t.slice(-1))) return { s: 0, genero: true };
    const d = distancia(a.t, b.t, lim);
    if (d <= lim) return { s: d === 1 ? 0.9 : 0.85, motivo: `grafia próxima: "${a.t}" ≈ "${b.t}"` };
    if (fonetica(a.t) === fonetica(b.t) && fonetica(a.t).length >= 4) return { s: 0.85, motivo: `mesma pronúncia: "${a.t}" ≈ "${b.t}"` };
  }
  return { s: 0 };
}

export type Opcoes = { exigirPrincipio: boolean };
const NIVEL_ORDEM: Record<NivelDup, number> = { EXATA: 3, MUITO_PROVAVEL: 2, POSSIVEL: 1 };

type Comparacao = { score: number; nivel: NivelDup; motivos: string[] } | null;

function compararPar(a: Norm, b: Norm, ia: ItemDup, ib: ItemDup, ua: string, ub: string, opc: Opcoes): Comparacao {
  const motivos: string[] = [];
  const barras = ia.barras && ib.barras && ia.barras === ib.barras && ia.barras.replace(/\D/g, '').length >= 8;

  // ── vetos ──
  if (opc.exigirPrincipio) {
    const pa = sem(ia.principio).replace(/[^a-z0-9]/g, ''); const pb = sem(ib.principio).replace(/[^a-z0-9]/g, '');
    if (!pa || !pb || pa !== pb) return null;
  }
  const unidadesConhecidas = !!(ua && ub);
  if (unidadesConhecidas && !unidadesCompativeis(ua, ub) && !barras) return null;
  const codigosEmComum = [...a.codigos].filter((c) => b.codigos.has(c)).length;
  if (a.codigos.size && b.codigos.size && codigosEmComum === 0) return null;
  for (const [dim, va] of a.medidas) {
    const vb = b.medidas.get(dim);
    if (vb && ([...va].some((x) => !vb.has(x)) || [...vb].some((x) => !va.has(x)))) return null;
  }
  if (a.numeros.size && b.numeros.size && ([...a.numeros].some((x) => !b.numeros.has(x)) || [...b.numeros].some((x) => !a.numeros.has(x)))) return null;

  // Letras soltas distinguem variante (M.L x M.C, tamanho P x G): se os dois lados têm e diferem, são produtos diferentes.
  const soltasA = new Set(a.tokens.filter((t) => t.t.length === 1).map((t) => t.t)); const soltasB = new Set(b.tokens.filter((t) => t.t.length === 1).map((t) => t.t));
  if (soltasA.size && soltasB.size && ([...soltasA].some((x) => !soltasB.has(x)) || [...soltasB].some((x) => !soltasA.has(x)))) return null;
  // Só um lado traz informação identificadora (referência, medida, número): é descrição genérica x específica — outro achado, não duplicidade.
  const identificaA = a.codigos.size + a.medidas.size + a.numeros.size > 0; const identificaB = b.codigos.size + b.medidas.size + b.numeros.size > 0;
  if (!barras && identificaA !== identificaB) return null;
  // Os dois trazem informação identificadora, mas nenhuma em comum (referência x fração, dimensões diferentes...): são peças diferentes.
  const compartilha = codigosEmComum > 0 || [...a.numeros].some((n) => b.numeros.has(n))
    || [...a.medidas].some(([d, v]) => { const w = b.medidas.get(d); return !!w && v.size === w.size && [...v].every((x) => w.has(x)); });
  if (!barras && identificaA && identificaB && !compartilha) return null;

  // ── pontuação: alinhamento palavra a palavra, ponderado por raridade ──
  const A = a.tokens; const B = b.tokens;
  let casados = 0; let wTot = 0; let temInformativo = false; const usados = new Set<number>(); const explic = new Set<string>();
  const wA = A.reduce((x, t) => x + t.w, 0); const wB = B.reduce((x, t) => x + t.w, 0);
  const pares: { i: number; j: number; s: number; motivo?: string }[] = [];
  let generoOposto = false;
  A.forEach((ta, i) => B.forEach((tb, j) => { const r = simToken(ta, tb); if (r.genero) generoOposto = true; if (r.s > 0) pares.push({ i, j, s: r.s, motivo: r.motivo }); }));
  // Palavras que só diferem pela vogal de gênero (bezerra x bezerro) são produtos diferentes, não erro de digitação.
  if (generoOposto && !barras) return null;
  pares.sort((x, y) => y.s - x.s);
  const usadoA = new Set<number>();
  for (const p of pares) {
    if (usadoA.has(p.i) || usados.has(p.j)) continue;
    usadoA.add(p.i); usados.add(p.j);
    casados += Math.min(A[p.i].w, B[p.j].w) * p.s; wTot += 1;
    if (p.s >= 0.85 && Math.min(A[p.i].w, B[p.j].w) >= 0.8) temInformativo = true;
    if (p.motivo) explic.add(p.motivo);
  }
  const denom = wA + wB;
  let score = denom > 0 ? (2 * casados) / denom : 0;
  const mesmaOrdem = A.map((t) => t.t).join(' ') === B.map((t) => t.t).join(' ');
  if (!barras && a.chave !== b.chave && (!temInformativo || wTot === 0)) return null;

  // ── penalidades por informação que só um dos lados traz ──
  let incompleto = false;
  for (const dim of new Set([...a.medidas.keys(), ...b.medidas.keys()])) { if (!a.medidas.has(dim) || !b.medidas.has(dim)) { score -= 0.07; incompleto = true; motivos.push(`só uma descrição traz a medida (${dim})`); } }
  if ((a.numeros.size === 0) !== (b.numeros.size === 0)) { score -= 0.05; incompleto = true; }
  if ((a.codigos.size === 0) !== (b.codigos.size === 0)) { score -= 0.1; incompleto = true; motivos.push('só uma descrição traz a referência/código'); }
  else if (a.codigos.size && (a.codigos.size !== b.codigos.size || codigosEmComum !== a.codigos.size)) { score -= 0.1; incompleto = true; motivos.push('as referências/códigos coincidem só em parte'); }
  const sobraA = A.filter((t, i) => !usadoA.has(i) && !t.leve); const sobraB = B.filter((t, j) => !usados.has(j) && !t.leve);
  // O nome é o mesmo, mas o COMPLEMENTO faz outro item (cor, tom, tamanho, posição, condição, material, sabor). Vale para a palavra que sobrou da comparação (a que
  // não é grafia nem abreviação de outra): complemento diferente nos dois lados, ou presente em só um deles (a outra descrição está incompleta: outro achado), não é duplicidade.
  if (!barras) {
    const classes = new Set<string>();
    for (const t of [...sobraA, ...sobraB]) { const c = complDe(t); if (c) classes.add(c.classe); }
    for (const cl of classes) { const va = a.compl.get(cl); const vb = b.compl.get(cl); if (!va || !vb || ![...va].some((x) => vb.has(x))) return null; }
  }
  // Regra geral, para o complemento que não está na lista: palavras que sobram nos DOIS lados, sem ser grafia uma da outra, são complementos diferentes (outro item).
  // Se sobra só de um lado, é descrição incompleta e segue como possível; e a mesma referência de fabricante nos dois (mesma peça) afasta a regra.
  if (!barras && codigosEmComum === 0 && sobraA.length && sobraB.length) return null;
  if (sobraA.length || sobraB.length) { incompleto = true; motivos.push(`palavra só em uma das descrições: ${[...sobraA, ...sobraB].map((t) => t.orig).slice(0, 3).join(', ')}`); }

  const mesmoNcm = ia.ncm && ib.ncm && ia.ncm === ib.ncm; const ncmDiferente = ia.ncm && ib.ncm && ia.ncm !== ib.ncm;
  if (mesmoNcm) { score += 0.03; motivos.push('mesmo NCM'); }
  if (ncmDiferente) { score -= 0.05; motivos.push(`NCM diferente (${ia.ncm} x ${ib.ncm}) — revisar também a classificação`); }
  if (unidadesConhecidas) motivos.push(ua === ub ? `mesma unidade (${ua.toUpperCase()})` : `unidades equivalentes (${ua.toUpperCase()} e ${ub.toUpperCase()})`); else motivos.push('unidade ausente em um dos itens');
  for (const [dim, v] of a.medidas) if (b.medidas.has(dim)) motivos.push(`mesma medida (${dim}: ${[...v].join('/')})`);
  if (A.length === B.length && !mesmaOrdem && a.chave === b.chave) motivos.push('mesmas palavras em outra ordem');
  motivos.push(...explic);

  const identico = a.chave === b.chave;
  let nivel: NivelDup;
  if (identico && unidadesConhecidas) { nivel = 'EXATA'; score = 1; motivos.unshift('descrição idêntica após normalizar acentos, caixa, pontuação e abreviações'); }
  else if (barras) { nivel = score >= 0.5 ? 'MUITO_PROVAVEL' : 'POSSIVEL'; score = Math.max(score, 0.9); motivos.unshift('mesmo código de barras'); }
  else if (score >= 0.9 && unidadesConhecidas && !incompleto && !ncmDiferente) nivel = 'MUITO_PROVAVEL';
  else if (score >= 0.78) nivel = 'POSSIVEL';
  else return null;
  // Descrição genérica (sem referência, número nem medida): igualdade de texto não prova que seja o mesmo produto.
  const generica = identico && a.codigos.size === 0 && a.numeros.size === 0 && a.medidas.size === 0;
  if (generica && nivel === 'EXATA') { nivel = 'POSSIVEL'; score = 0.85; motivos.unshift('descrição genérica, sem referência nem medida: não dá para afirmar que é o mesmo produto'); }
  const gA = sem(ia.grupo || '').replace(/\s+/g, ' ').trim(); const gB = sem(ib.grupo || '').replace(/\s+/g, ' ').trim();
  if (gA && gB && gA !== gB) {
    motivos.push(`grupos de itens diferentes (${ia.grupo} × ${ib.grupo})`);
    if (nivel === 'MUITO_PROVAVEL') nivel = 'POSSIVEL';
  }
  return { score: Math.min(1, Math.max(0, score)), nivel, motivos: [...new Set(motivos)] };
}

/** Compara todos contra todos com bloqueio por palavra (exata, prefixo e fonética) e por NCM — nunca O(n²) em 50 mil itens. */
export function detectarDuplicidades(itens: ItemDup[], opc: Opcoes): ResultadoDup[] {
  const n = itens.length;
  const norms = itens.map((i) => normalizar(i.descricao));
  const unid = itens.map((i) => unidadeCanonica(i.unidade));

  // IDF: palavra comum no cadastro vale pouco, palavra rara vale muito.
  const df = new Map<string, number>();
  for (const nm of norms) for (const t of new Set(nm.tokens.map((x) => x.t))) df.set(t, (df.get(t) || 0) + 1);
  const base = Math.log(Math.max(n, 3));
  for (const nm of norms) for (const t of nm.tokens) t.w = t.leve ? 0.3 : Math.min(2, Math.max(0.4, 0.4 + (1.6 * Math.log(n / (df.get(t.t) || 1))) / base));

  const DF_MAX = Math.max(60, Math.floor(n * 0.03));
  const indice = new Map<string, number[]>();
  const empurra = (k: string, i: number) => { const a = indice.get(k); if (a) a.push(i); else indice.set(k, [i]); };
  norms.forEach((nm, i) => {
    for (const t of new Set(nm.tokens.map((x) => x.t))) {
      if ((df.get(t) || 0) > DF_MAX) continue;
      empurra('w:' + t, i);
      if (t.length >= 5) { empurra('p:' + t.slice(0, 4), i); empurra('f:' + fonetica(t), i); }
    }
    if (itens[i].barras) empurra('b:' + itens[i].barras, i);
    empurra('x:' + nm.chave, i);
  });
  const porNcm = new Map<string, number[]>();
  itens.forEach((it, i) => { if (it.ncm.length === 8) { const a = porNcm.get(it.ncm); if (a) a.push(i); else porNcm.set(it.ncm, [i]); } });
  for (const [k, lista] of porNcm) if (lista.length <= 150) for (const i of lista) empurra('n:' + k, i);

  const vizinhos: CandidatoDup[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    if (!norms[i].tokens.length && !itens[i].barras) continue;
    const cont = new Map<number, number>();
    for (const k of new Set([...norms[i].tokens.flatMap((t) => ['w:' + t.t, 'p:' + t.t.slice(0, 4), 'f:' + fonetica(t.t)]), 'x:' + norms[i].chave, ...(itens[i].barras ? ['b:' + itens[i].barras] : []), ...(itens[i].ncm.length === 8 ? ['n:' + itens[i].ncm] : [])])) {
      const lista = indice.get(k); if (!lista) continue;
      for (const j of lista) if (j > i) cont.set(j, (cont.get(j) || 0) + 1);
    }
    const alvo = [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400);
    for (const [j] of alvo) {
      const r = compararPar(norms[i], norms[j], itens[i], itens[j], unid[i], unid[j], opc);
      if (!r) continue;
      vizinhos[i].push({ idx: j, ...r }); vizinhos[j].push({ idx: i, ...r });
    }
  }

  // Grupos: só ligações fortes (exata/muito provável) formam grupo; "possível" fica como sinal individual.
  const pai = Array.from({ length: n }, (_, i) => i);
  const raiz = (x: number): number => { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; };
  vizinhos.forEach((lista, i) => lista.forEach((c) => { if (NIVEL_ORDEM[c.nivel] >= 2) { const a = raiz(i); const b = raiz(c.idx); if (a !== b) pai[Math.max(a, b)] = Math.min(a, b); } }));
  const membros = new Map<number, number[]>();
  for (let i = 0; i < n; i++) if (vizinhos[i].some((c) => NIVEL_ORDEM[c.nivel] >= 2)) { const r = raiz(i); const a = membros.get(r); if (a) a.push(i); else membros.set(r, [i]); }
  const completude = (i: number) => [itens[i].codigo, itens[i].ncm, itens[i].unidade, itens[i].barras, itens[i].principio].filter(Boolean).length;
  const mestreDe = new Map<number, number>();
  for (const [r, lista] of membros) mestreDe.set(r, [...lista].sort((x, y) => completude(y) - completude(x) || itens[y].descricao.length - itens[x].descricao.length || x - y)[0]);

  return vizinhos.map((lista, i) => {
    const candidatos = lista.sort((a, b) => NIVEL_ORDEM[b.nivel] - NIVEL_ORDEM[a.nivel] || b.score - a.score).slice(0, 20);
    const forte = lista.some((c) => NIVEL_ORDEM[c.nivel] >= 2);
    const r = forte ? raiz(i) : null;
    return { candidatos, grupo: r, mestre: r === null ? null : mestreDe.get(r) ?? null };
  });
}
