// Política de unidades de medida do estoque (saneamento de estoques).
//
// CONCEITO. A unidade de ESTOQUE de um item é a menor unidade prática da medida em que ele é controlado: massa em KG, volume em L,
// comprimento em M, área em M2, contagem em UN. Unidade maior (tonelada, hectolitro, dúzia, metro cúbico...) e embalagem (saca,
// big bag, galão, caixa, pacote...) passam a ser unidade de COMPRA, com o fator de conversão cadastrado. TON → KG e GALÃO → LITRO são só
// exemplos: a regra vale para qualquer unidade que a tabela abaixo, o texto da própria unidade ("BALDE 20KG") ou o analista (tabela do
// projeto) relacione a uma medida.
//
// O sistema só SUGERE. O fator só é dado como certo quando é exato por definição (1 t = 1.000 kg) ou está escrito na unidade; quando vem
// da descrição (uma única medida citada) fica "para confirmar"; nos demais casos fica "a informar". Unidade que a política não conhece
// nunca é adivinhada: vai para o analista classificar.

/**
 * Medidas com a unidade de estoque padrão. `base` é a classe (grafias da mesma unidade) da unidade padrão; `si` diz que o nome padrão é o símbolo
 * (KG, L, M, M2), sem acompanhar a grafia da base. Na contagem o nome acompanha o que a base já usa (UNIDADE ou UN).
 */
export const GRANDEZAS = {
  massa: { rotulo: "Massa", padrao: "KG", base: "kg", si: true },
  volume: { rotulo: "Volume", padrao: "L", base: "l", si: true },
  comprimento: { rotulo: "Comprimento", padrao: "M", base: "m", si: true },
  area: { rotulo: "Área", padrao: "M2", base: "m2", si: true },
  contagem: { rotulo: "Contagem", padrao: "UN", base: "un", si: false },
};

const semAcento = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
/** Chave de uma unidade: minúscula, sem acento, ponto e espaço ("M²" → "m2", "BIG BAG" → "bigbag"). */
export const chaveUnidade = (s) => semAcento(s).toLowerCase().replace(/[.\s]/g, "");

// Unidades de medida: [classe (todas as grafias da mesma unidade), medida, fator EXATO para a unidade padrão, grafias].
// Fator 1 = a própria unidade padrão; menor que 1 = unidade ainda menor (aceita); maior que 1 = unidade maior (vira unidade de compra).
const MEDIDAS = [
  ["mg", "massa", 1e-6, ["mg", "miligrama", "miligramas"]],
  ["g", "massa", 1e-3, ["g", "gr", "grs", "grama", "gramas"]],
  ["kg", "massa", 1, ["kg", "kgs", "kgr", "kilo", "kilos", "quilo", "quilos", "quilograma", "quilogramas", "quilogram"]],
  ["t", "massa", 1000, ["t", "ton", "tons", "tonelada", "toneladas"]],
  ["ml", "volume", 1e-3, ["ml", "mililitro", "mililitros", "cc", "cm3"]],
  ["l", "volume", 1, ["l", "lt", "lts", "litro", "litros"]],
  ["hl", "volume", 100, ["hl", "hectolitro", "hectolitros"]],
  ["m3", "volume", 1000, ["m3", "metrocubico", "metroscubicos", "metrocub", "metroscub"]],
  ["mm", "comprimento", 1e-3, ["mm", "milimetro", "milimetros"]],
  ["cm", "comprimento", 1e-2, ["cm", "centimetro", "centimetros"]],
  ["m", "comprimento", 1, ["m", "mt", "mts", "metro", "metros"]],
  ["km", "comprimento", 1000, ["km", "quilometro", "quilometros"]],
  ["cm2", "area", 1e-4, ["cm2"]],
  ["m2", "area", 1, ["m2", "metroquadrado", "metrosquadrados", "metroqua", "metrosqua"]],
  ["ha", "area", 10000, ["ha", "hectare", "hectares"]],
  ["km2", "area", 1e6, ["km2"]],
  ["un", "contagem", 1, ["un", "und", "unid", "unidade", "unidades", "pc", "pcs", "pca", "peca", "pecas"]],
  ["dose", "contagem", 1, ["dose", "doses"]],
  ["cabeca", "contagem", 1, ["cabeca", "cabecas"]],
  ["dz", "contagem", 12, ["dz", "duzia", "duzias"]],
  ["cento", "contagem", 100, ["cento", "centos"]],
  ["milhar", "contagem", 1000, ["milhar", "milhares", "milheiro", "milheiros"]],
];
// Embalagens cuja medida é praticamente sempre a mesma: [classe, medida, grafias]. O conteúdo (fator) vem do item. As ambíguas (rolo, barra,
// balde, tambor, bombona, frasco, lata...) não entram: dependem do item e ficam para o analista classificar.
const EMBALAGENS = [
  ["sc", "massa", ["sc", "sca", "saca", "sacas", "saco", "sacos"]],
  ["bb", "massa", ["bb", "bigbag", "bigbags"]],
  ["gl", "volume", ["gl", "galao", "galoes"]],
  ["cx", "contagem", ["cx", "caixa", "caixas"]],
  ["pct", "contagem", ["pct", "pacote", "pacotes"]],
  ["fd", "contagem", ["fd", "fardo", "fardos"]],
];
// Conjuntos: o próprio conjunto é o item (a quantidade de peças depende do item). Aceitos; o analista pode definir um fator.
const CONJUNTOS = [
  ["jg", ["jg", "jogo", "jogos"]],
  ["cj", ["cj", "conjunto", "conjuntos"]],
  ["kit", ["kit", "kits"]],
  ["par", ["par", "pares"]],
];

const TABELA = new Map();
const registrar = (nome, linha) => {
  if (TABELA.has(nome)) throw new Error(`Unidade "${nome}" repetida na tabela de unidades`);
  TABELA.set(nome, linha);
};
for (const [classe, grandeza, fator, nomes] of MEDIDAS) {
  const nivel = fator === 1 ? "padrao" : fator < 1 ? "menor" : "maior";
  for (const n of nomes) registrar(n, { classe, nivel, grandeza, base: GRANDEZAS[grandeza].base, fator, evidencia: nivel === "maior" ? "universal" : null });
}
for (const [classe, grandeza, nomes] of EMBALAGENS) for (const n of nomes) registrar(n, { classe, nivel: "embalagem", grandeza, base: GRANDEZAS[grandeza].base, fator: null, evidencia: null });
for (const [classe, nomes] of CONJUNTOS) for (const n of nomes) registrar(n, { classe, nivel: "conjunto", grandeza: null, base: null, fator: null, evidencia: null });

/** Classe (grafias da mesma unidade) da unidade, ou null se a tabela não a conhece. */
export const unidadeCanonica = (u) => { const k = chaveUnidade(u); return k ? (TABELA.get(k)?.classe ?? null) : null; };

// ── Leitura de medidas escritas em texto ("50KG", "5 LT", "250 ML", "C/12") ──
const NUM = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)`;
// medida → [expressão da unidade, fator para a unidade padrão]. Comprimento só aceita metro: mm e cm costumam ser dimensão do produto, não conteúdo.
const ESCRITA = {
  massa: [[String.raw`kgs?|kgr|quilos?|kilos?`, 1], [String.raw`gramas?|grs?|g`, 1e-3], ["mg", 1e-6]],
  volume: [[String.raw`litros?|lts?|l`, 1], ["ml", 1e-3]],
  comprimento: [[String.raw`metros?|mts?|m`, 1]],
  contagem: [[String.raw`unidades?|unids?|und|un|pecas?|pcs?|pc`, 1]],
};
const arred = (n) => Math.round(n * 1e6) / 1e6;
/** "1.000" é mil (notação brasileira); "1,5" e "0.9" são decimais. */
const lerNumero = (t) => {
  const s = String(t).trim();
  const n = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
/** Fator digitado pelo analista ("1.000", "0,5", "20"); null se vazio ou inválido. */
export const lerFator = (t) => { const n = lerNumero(String(t ?? "").trim()); return n != null && n > 0 ? n : null; };
const fatorDoToken = (grupos, token) => grupos.find(([e]) => new RegExp(`^(?:${e})$`).test(token))?.[1] ?? null;

function medidasNoTexto(grandeza, d) {
  const grupos = ESCRITA[grandeza]; if (!grupos) return [];
  const re = new RegExp(String.raw`(?<![a-z0-9])${NUM}\s*(${grupos.map(([e]) => e).join("|")})(?![a-z0-9])`, "g");
  const saida = [];
  for (const m of d.matchAll(re)) { const n = lerNumero(m[1]); const f = fatorDoToken(grupos, m[2]); if (n != null && f != null) saida.push(n * f); }
  return saida;
}
const CONTAGENS_EXPLICITAS = [
  /(?<![a-z0-9])c\s*\/\s*(\d+)(?![\d.,]*\d)/g,
  /(?<![a-z0-9])com\s+(\d+)\s*(?:unidades?|unids?|und|un|pecas?|pcs?|pc)(?![a-z0-9])/g,
];
const unico = (vs) => { const s = [...new Set(vs.filter((v) => v != null && v > 0).map(arred))]; return s.length === 1 ? s[0] : null; };

/**
 * Quantas unidades padrão da medida há em UMA unidade do item, quando a descrição diz ("SACO 50KG" → 50; "GALAO 5 LT" → 5; "CAIXA C/12" → 12).
 * Só vale se a descrição cita UMA medida da mesma família (ou várias iguais); com medidas diferentes não há como saber qual é o conteúdo → null.
 */
export function fatorPelaDescricao(grandeza, descricao) {
  const d = semAcento(descricao).toLowerCase();
  if (!d || !ESCRITA[grandeza]) return null;
  const valores = medidasNoTexto(grandeza, d);
  if (grandeza === "contagem") for (const re of CONTAGENS_EXPLICITAS) for (const m of d.matchAll(re)) valores.push(lerNumero(m[1]));
  return unico(valores);
}

/** Conteúdo escrito na própria unidade: "BALDE 20KG" → massa 20; "FRASCO 500ML" → volume 0,5; "CX12" → contagem 12. null se não há. */
export function conteudoNaUnidade(raw) {
  const t = semAcento(raw).toLowerCase().trim();
  if (!t || t.length > 40) return null;
  for (const [grandeza, grupos] of Object.entries(ESCRITA)) {
    const m = new RegExp(String.raw`^([a-z][a-z .]*?)[\s\-/:]*${NUM}\s*(${grupos.map(([e]) => e).join("|")})$`).exec(t);
    if (!m) continue;
    const n = lerNumero(m[2]); const f = fatorDoToken(grupos, m[3]);
    if (n != null && n > 0 && f != null) return { nome: m[1].trim(), grandeza, fator: arred(n * f) };
  }
  const m = /^([a-z]+)\s*[-/]?\s*(\d+)$/.exec(t);
  const linha = m && TABELA.get(m[1]);
  return linha?.nivel === "embalagem" && Number(m[2]) > 0 ? { nome: m[1], grandeza: linha.grandeza, fator: Number(m[2]) } : null;
}

/**
 * Como a política enxerga a unidade: { chave, origem, nivel, classe, grandeza, base, fator, evidencia } ou null (sem regra).
 * nivel: padrao | menor | maior | embalagem | conjunto | mantida. Ordem: regra do projeto → tabela → conteúdo escrito na unidade.
 * `regras` = { [chave]: { manter: true } | { grandeza, fator } } (fator vazio = embalagem com conteúdo a informar).
 */
export function classificarUnidade(raw, regras = {}) {
  const chave = chaveUnidade(raw);
  if (!chave) return null;
  const r = regras?.[chave];
  if (r?.manter) return { chave, origem: "regra", nivel: "mantida", classe: null, grandeza: null, base: null, fator: null, evidencia: null };
  const g = r && GRANDEZAS[r.grandeza];
  if (g) {
    const f = r.fator == null || r.fator === "" ? null : Number(r.fator);
    if (f == null) return { chave, origem: "regra", nivel: "embalagem", classe: null, grandeza: r.grandeza, base: g.base, fator: null, evidencia: null };
    if (Number.isFinite(f) && f > 0) return { chave, origem: "regra", nivel: f === 1 ? "padrao" : f < 1 ? "menor" : "maior", classe: null, grandeza: r.grandeza, base: g.base, fator: f, evidencia: "regra" };
  }
  const linha = TABELA.get(chave);
  if (linha) return { chave, origem: "tabela", ...linha };
  const c = conteudoNaUnidade(raw);
  return c ? { chave, origem: "unidade", nivel: "embalagem", classe: null, grandeza: c.grandeza, base: GRANDEZAS[c.grandeza].base, fator: c.fator, evidencia: "unidade" } : null;
}

/** Número no padrão brasileiro: 1000 → "1.000", 0.001 → "0,001". */
export const numeroBr = (n) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 6 });
const numero = numeroBr;

/** Grafia dominante de cada classe de unidade presente nos itens. */
function dominantes(itens) {
  const cont = new Map();
  for (const it of itens) {
    const c = unidadeCanonica(it.unidade); if (!c) continue;
    const mm = cont.get(c) ?? new Map(); const k = String(it.unidade).trim(); mm.set(k, (mm.get(k) || 0) + 1); cont.set(c, mm);
  }
  return new Map([...cont].map(([c, mm]) => [c, [...mm.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]]));
}
const rotuloTxt = (s) => String(s ?? "").trim().toUpperCase();
/**
 * Nome da unidade padrão de cada medida. Vale o que o analista definiu no projeto (`rotulos`); sem isso, as medidas do SI usam o símbolo (KG, L, M, M2:
 * "KG" é melhor que "QUILOGRAM") e a contagem usa a grafia que a própria base já adota (UNIDADE ou UN), para não reescrever a base inteira à toa.
 */
const padroesDe = (dom, rotulos = {}) => Object.fromEntries(Object.entries(GRANDEZAS).map(([g, v]) => [g, rotuloTxt(rotulos?.[g]) || (v.si ? v.padrao : dom.get(v.base) || v.padrao)]));
export const rotulosPadrao = (itens, rotulos = {}) => padroesDe(dominantes(itens), rotulos);

function conversao(it, raw, k, alvo) {
  const nome = raw.toUpperCase(); const medida = GRANDEZAS[k.grandeza].rotulo.toLowerCase();
  let fator = k.fator; let evidencia = k.evidencia;
  if (fator == null) { const d = fatorPelaDescricao(k.grandeza, it.descricao); if (d != null) { fator = d; evidencia = "descricao"; } }
  const eq = fator != null ? `1 ${nome} = ${numero(fator)} ${alvo}` : null;
  const detalhe = eq == null ? `informe quantos ${alvo} há em cada ${nome}`
    : evidencia === "descricao" ? `a descrição indica ${eq} (confirmar)`
      : evidencia === "unidade" ? `o conteúdo está na própria unidade: ${eq}`
        : evidencia === "regra" ? `${eq} (regra do projeto)` : eq;
  const motivo = k.nivel === "embalagem" ? `Embalagem de ${medida}: ${detalhe}` : `Maior que a unidade padrão de ${medida} (${alvo}): ${detalhe}`;
  return { achado: true, motivo, sugerida: alvo, extra: { tipo: "conversao", de: raw, grandeza: k.grandeza, nivel: k.nivel, fator: fator ?? null, evidencia: fator != null ? evidencia : null } };
}

/**
 * Teste do critério "Unidade de medida", por item.
 *  - sem unidade → pendência; unidade que a política não conhece → pendência (o analista a classifica na tabela de unidades);
 *  - com a política ligada: unidade maior que a padrão da medida, ou embalagem → sugere a unidade padrão e o fator (a unidade atual vira unidade de compra);
 *  - grafia diferente da dominante da mesma unidade (KGS × KG) → sugere a dominante.
 * Unidade já menor que a padrão, conjunto e unidade marcada para manter são aceitos.
 */
export function achadosUnidade(itens, { politica = true, regras = {}, rotulos = {} } = {}) {
  const dom = dominantes(itens); const padroes = padroesDe(dom, rotulos);
  const memo = new Map();
  const cls = (raw) => { if (!memo.has(raw)) memo.set(raw, classificarUnidade(raw, regras)); return memo.get(raw); };
  return (it) => {
    const raw = String(it.unidade ?? "").trim();
    if (!raw) return { achado: true, motivo: "Sem unidade de medida" };
    const k = cls(raw);
    if (!k) return { achado: true, motivo: `Unidade "${raw}" sem regra na política: classifique-a na tabela de unidades (passo Critérios)` };
    if (k.nivel === "mantida") return { achado: false };
    if (politica && (k.nivel === "maior" || k.nivel === "embalagem")) return conversao(it, raw, k, padroes[k.grandeza]);
    if (!k.classe) return { achado: false };
    const padrao = !!k.grandeza && k.classe === GRANDEZAS[k.grandeza].base; // a unidade padrão da medida tem nome definido; as demais seguem a grafia dominante
    const alvo = padrao ? padroes[k.grandeza] : dom.get(k.classe);
    return raw !== alvo ? { achado: true, motivo: `Grafia "${raw}" difere ${padrao ? "do padrão" : "da dominante"} "${alvo}"`, sugerida: alvo, extra: { tipo: "grafia", de: raw, para: alvo } } : { achado: false };
  };
}

/** Frase da classificação de uma unidade, para a tabela de unidades. */
export function descreverClassificacao(k, rotulo, padroes) {
  if (!k) return "Sem regra na política: classifique";
  const nome = String(rotulo).toUpperCase();
  const medida = k.grandeza ? GRANDEZAS[k.grandeza].rotulo.toLowerCase() : "";
  const eq = k.fator != null ? `1 ${nome} = ${numero(k.fator)} ${padroes[k.grandeza]}` : null;
  const regra = k.origem === "regra" ? " · regra do projeto" : "";
  switch (k.nivel) {
    case "mantida": return `Mantida como está${regra}`;
    case "padrao": return `Unidade de estoque padrão de ${medida}${regra}`;
    case "menor": return `Menor que a padrão de ${medida}, aceita (${eq})${regra}`;
    case "maior": return `Maior que a padrão de ${medida}: ${eq}${regra}`;
    case "embalagem": return `Embalagem de ${medida}: ${eq ?? "conteúdo a informar em cada item"}${regra}`;
    case "conjunto": return "Conjunto: o item é o conjunto (aceito)";
    default: return "";
  }
}

/** Todas as unidades da base (por chave), com quantidade de itens, grafia mais usada e classificação; mais frequentes primeiro. */
export function resumoUnidades(itens, { regras = {}, rotulos = {} } = {}) {
  const padroes = rotulosPadrao(itens, rotulos);
  const por = new Map(); let semUnidade = 0;
  for (const it of itens) {
    const raw = String(it.unidade ?? "").trim(); if (!raw) { semUnidade += 1; continue; }
    const chave = chaveUnidade(raw); const e = por.get(chave) ?? { chave, n: 0, grafias: new Map() };
    e.n += 1; e.grafias.set(raw, (e.grafias.get(raw) || 0) + 1); por.set(chave, e);
  }
  const linhas = [...por.values()].map((e) => {
    const grafias = [...e.grafias.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g);
    const k = classificarUnidade(grafias[0], regras);
    return { chave: e.chave, rotulo: grafias[0], grafias, n: e.n, k, texto: descreverClassificacao(k, grafias[0], padroes), regra: regras?.[e.chave] || null, conhecida: !!classificarUnidade(grafias[0], {}) };
  }).sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  return { linhas, semUnidade, padroes };
}

/** Fator de conversão de uma decisão de unidade: o informado pelo analista ou o sugerido; null se ainda é "a informar". */
export const fatorDaDecisao = (d) => { const f = Number(d?.fatorFinal ?? d?.fator); return Number.isFinite(f) && f > 0 ? f : null; };
/** Conversão sem fator não pode ser aprovada: a unidade de compra precisa do "itens por unidade de compra". */
export const precisaFator = (d) => d?.tipo === "conversao" && !!d.para && fatorDaDecisao(d) == null;
