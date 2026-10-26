// Variante é observação (limpeza, copa, cozinha, utensílios...): nesses grupos a cor, o tipo ou a apresentação (CLEAR, NEUTRO, INCOLOR, EM PASTA, LÍQUIDA...) não é o produto, é OBSERVAÇÃO
// (campo adicional). Os itens que só diferem por palavras de observação são o MESMO produto: viram indicação de duplicidade, e a variante de cada um segue na decisão de unificar, para
// ser registrada no campo adicional do item mantido. É uma regra por GRUPO e por PALAVRA, do analista: o grupo precisa estar marcado e a palavra aprovada (as cores e os tons já vêm
// aprovados); em qualquer outro grupo a variante continua separando os itens (peças: lado direito e esquerdo são itens diferentes). Só SUGERE: nada é alterado no cadastro. Funções puras.
import { grupoDe } from "./logica";
import { NIVEL_ORDEM, montarConjuntos, sugerirSobrevivente } from "./conjuntos";
import { chaveUnidade, unidadeCanonica } from "./unidades";

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const arred = (n) => Math.round(n * 1e6) / 1e6;
const unicos = (xs) => [...new Set(xs)];
const doMapa = (mapa, chave) => mapa.get(chave) ?? mapa.set(chave, []).get(chave);

/** Grupos que usam a regra por padrão (pelo nome): limpeza, copa, cozinha e utensílios. O analista marca ou desmarca qualquer grupo, e a escolha dele vale mais que o padrão. */
export const PADRAO_GRUPOS = /limpez|copa|cozinha|utensil/;
export const grupoUsaPorPadrao = (nome) => PADRAO_GRUPOS.test(semAcento(nome).toLowerCase());
export function grupoUsaObservacao(cfg, nome) { const v = cfg?.grupos?.[nome]; return typeof v === "boolean" ? v : grupoUsaPorPadrao(nome); }

/** Uma palavra comparável: sem acento, minúscula, só letras e números e sem o plural simples (as grafias da mesma palavra comparam iguais). */
export function formaDaPalavra(w) {
  let t = semAcento(w).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (t.length > 4 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  return t;
}

// Já vêm aprovadas como observação nos grupos marcados: as cores e os tons, e CLEAR e NEUTRO. Ficam de fora as cores que também são produto ou sabor (VINHO, LARANJA, CLARA de ovo): na copa e
// na cozinha "SUCO DE LARANJA" não é "SUCO". O analista tira qualquer uma e aprova outras (a lista de sugestões ajuda).
const ROTULOS_PADRAO = ["BRANCO", "BRANCA", "BCO", "BCA", "PRETO", "PRETA", "AZUL", "VERDE", "VERMELHO", "VERMELHA", "AMARELO", "AMARELA", "ROSA", "ROXO", "ROXA", "CINZA", "MARROM", "BEGE",
  "DOURADO", "DOURADA", "PRATEADO", "PRATEADA", "VIOLETA", "LILÁS", "INCOLOR", "TRANSPARENTE", "TRANSP", "CLARO", "ESCURO", "ESCURA", "CLEAR", "NEUTRO"];
export const PALAVRAS_PADRAO = ROTULOS_PADRAO.map(formaDaPalavra);
const PADRAO = new Set(PALAVRAS_PADRAO);
const ROTULO_PADRAO = new Map(ROTULOS_PADRAO.map((r) => [formaDaPalavra(r), r]));
/** Como a palavra aparece na tela: como o analista a escreveu (com acento), ou o rótulo da padrão; na falta, a forma em maiúsculas. */
const rotuloDa = (cfg, forma) => cfg?.rotulos?.[forma] ?? ROTULO_PADRAO.get(forma) ?? forma.toUpperCase();

/** As palavras de observação em vigor (formas): as padrão, menos as que o analista tirou (false), e as que ele aprovou (true). */
export function palavrasAprovadas(cfg) {
  const s = new Set(PADRAO);
  for (const [w, v] of Object.entries(cfg?.palavras || {})) { const t = formaDaPalavra(w); if (!t) continue; if (v === true) s.add(t); else if (v === false) s.delete(t); }
  return s;
}

// ── A descrição em palavras e medidas ──
// Palavras que não identificam o produto (conectivos). "COM" e "SEM" ficam: "COPO COM TAMPA" e "COPO SEM TAMPA" são produtos diferentes. As medidas SEPARAM os itens (5 L e 500 ml são produtos
// diferentes) e valem pela quantidade, não pela grafia: 5LTS = 5 L = 5000 ml.
const STOP = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "no", "na", "nos", "nas", "para", "por", "ao", "um", "uma", "tipo", "marca"]);
const MEDIDAS = [["massa", 1, ["g", "gr", "grs", "grama", "gramas"]], ["massa", 1000, ["kg", "kgs", "kgr", "kilo", "kilos", "quilo", "quilos"]], ["massa", 0.001, ["mg"]],
  ["volume", 1, ["ml"]], ["volume", 1000, ["l", "lt", "lts", "litro", "litros"]], ["comprimento", 1, ["mm"]], ["comprimento", 10, ["cm"]], ["comprimento", 1000, ["m", "mt", "mts", "metro", "metros"]],
  ["contagem", 1, ["un", "und", "unid", "unids", "unidade", "unidades", "pc", "pcs", "peca", "pecas", "peça", "peças"]], ["percentual", 1, ["%"]]];
const UNIDADE_DE = new Map(MEDIDAS.flatMap(([dim, mult, nomes]) => nomes.map((n) => [n, [dim, mult]])));
// Número no padrão brasileiro: "1.000" é mil; "1,000" e "0,750" são decimais ("1,5" idem).
const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?`;
const RE_MEDIDA = new RegExp(String.raw`(?<![\p{L}\p{N}.,])(${NUM})\s*(${[...UNIDADE_DE.keys()].sort((a, b) => b.length - a.length).join("|")})(?![\p{L}\p{N}])`, "gu");
const lerNumero = (t) => { const n = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t.replace(",", ".")); return Number.isFinite(n) ? n : null; };
const ROTULO_MEDIDA = { massa: [[1000, "kg"], [1, "g"]], volume: [[1000, "L"], [1, "ml"]], comprimento: [[1000, "m"], [1, "mm"]], contagem: [[1, "un"]] };

/** "volume:5000" → "5 L": a medida lida da descrição, para a tela e os motivos. */
export function rotuloMedida(medida) {
  const [dim, v] = String(medida).split(":"); const valor = Number(v);
  if (dim === "percentual") return `${String(valor).replace(".", ",")}%`;
  const [mult, un] = (ROTULO_MEDIDA[dim] || []).find(([k]) => valor >= k) || [1, ""];
  return `${String(arred(valor / mult)).replace(".", ",")} ${un}`.trim();
}

/** A descrição em palavras e medidas: { tokens: [{ f (forma comparável), t (como foi escrita) }], medidas: ["volume:5000", ...] }. Sem acento, plural nem conectivos nas formas. */
export function analisarDescricao(descricao) {
  let s = String(descricao ?? "").normalize("NFC").toLowerCase();
  s = s.replace(/(?<![\p{L}\p{N}])c\s*\//gu, " com ").replace(/(?<![\p{L}\p{N}])s\s*\//gu, " sem ").replace(/(?<![\p{L}\p{N}])p\s*\//gu, " para ");
  const medidas = [];
  s = s.replace(RE_MEDIDA, (achou, n, u) => { const v = lerNumero(n); if (v == null) return achou; const [dim, mult] = UNIDADE_DE.get(u); medidas.push(`${dim}:${arred(v * mult)}`); return " "; });
  const tokens = [];
  for (const t of s.split(/[^\p{L}\p{N}]+/u)) { if (!t) continue; const f = formaDaPalavra(t); if (f && !STOP.has(f)) tokens.push({ f, t }); }
  return { tokens, medidas: unicos(medidas).sort() };
}

const unidadeDe = (it) => { const u = String(it.unidade ?? "").trim(); return u ? unidadeCanonica(u) ?? chaveUnidade(u) : ""; };
const ncmDe = (it) => String(it.ncm || it.ncm_original || "").replace(/\D/g, "");
const emMaiuscula = (palavras) => unicos(palavras.map((p) => p.t.toUpperCase()));

/** Por que dois itens são o mesmo produto, o que muda de um para o outro e o que ainda pede conferência (como o detector: unidade ausente, NCM diferente, grupos diferentes). */
function motivoDoPar(a, b) {
  const soA = a.palavras.filter((p) => !b.formas.has(p.f)); const soB = b.palavras.filter((p) => !a.formas.has(p.f));
  const m = [`mesmo produto (${a.produto}): a diferença é só observação, ${soA.length || soB.length ? `${emMaiuscula(soA).join(", ") || "sem observação"} × ${emMaiuscula(soB).join(", ") || "sem observação"}` : "igual nos dois"}`];
  if (a.grupo !== b.grupo) m.push(`grupos de itens diferentes (${a.grupo} × ${b.grupo})`);
  if (!a.unidade || !b.unidade) m.push("unidade ausente em um dos itens");
  if (a.ncm && b.ncm && a.ncm !== b.ncm) m.push(`NCM diferente (${a.ncm} × ${b.ncm}) — revisar também a classificação`);
  else if (!a.ncm !== !b.ncm) m.push("NCM informado em só um dos itens");
  return m;
}
/** Indicação alta só no mesmo grupo de itens, com a unidade conhecida e o mesmo NCM (ou nenhum dos dois com NCM); o resto é possível, como no detector. */
const ehForte = (a, b) => a.grupo === b.grupo && !!a.unidade && a.unidade === b.unidade && a.ncm === b.ncm;

/** Junta os candidatos do detector com os da regra: o mais forte vale; o mesmo par traz os dois motivos; no máximo 20, do mais forte ao mais fraco. */
function mesclar(atuais, novos) {
  const por = new Map(atuais.map((c) => [c.linha, c]));
  for (const c of novos) {
    const a = por.get(c.linha);
    if (!a) { por.set(c.linha, c); continue; }
    const mais = NIVEL_ORDEM[c.nivel] < NIVEL_ORDEM[a.nivel] || (c.nivel === a.nivel && c.score > a.score);
    if (mais) por.set(c.linha, { ...c, motivos: unicos([...c.motivos, ...(a.motivos || [])]) });
    else por.set(c.linha, { ...a, motivos: unicos([...(a.motivos || []), ...c.motivos]) });
  }
  return [...por.values()].sort((x, y) => NIVEL_ORDEM[x.nivel] - NIVEL_ORDEM[y.nivel] || y.score - x.score).slice(0, 20);
}

/**
 * Aplica a regra aos itens: devolve a lista com a indicação de duplicidade (`duplicidade`) dos itens ligados por observação acrescentada à que o detector já trouxe (a mesma lista, se
 * nada se liga). Só entram os itens dos grupos marcados; o produto de cada item é o que sobra depois de tirar as palavras aprovadas, e itens com o mesmo produto, as mesmas medidas e a
 * mesma unidade são o mesmo produto. Indicação alta (e grupo de duplicados, junto com o que o detector já formou) só no mesmo grupo de itens, com a unidade conhecida e o mesmo NCM; unidade
 * ausente, NCM diferente ou grupos diferentes ficam como possível, com o motivo, como no detector. Itens sem palavra de observação em nenhum dos lados ficam por conta do detector, e o
 * que o detector já indicava com a mesma força não é mexido. `duplicidade.porObservacao` marca o que a regra acrescentou; `duplicidade.observacao.palavras` guarda a variante de cada
 * item, que a unificação leva para o campo adicional do item mantido. Não altera os itens recebidos.
 */
export function aplicarObservacao(itens, cfg, { escala = 1 } = {}) {
  const obs = palavrasAprovadas(cfg);
  const info = new Map(); const baldes = new Map();
  for (const it of itens) {
    const grupo = grupoDe(it); if (!grupoUsaObservacao(cfg, grupo)) continue;
    const a = analisarDescricao(it.descricao); const nucleo = []; const palavras = [];
    for (const t of a.tokens) (obs.has(t.f) ? palavras : nucleo).push(t);
    if (!nucleo.length) continue; // só palavras de observação: não há como saber qual é o produto
    const produto = [...nucleo.map((t) => t.t.toUpperCase()), ...a.medidas.map(rotuloMedida)].join(" ");
    const unidade = unidadeDe(it);
    info.set(it.linha, { grupo, palavras, formas: new Set(palavras.map((p) => p.f)), produto, unidade, ncm: ncmDe(it) });
    doMapa(baldes, `${unicos(nucleo.map((t) => t.f)).sort().join(" ")}|${a.medidas.join(";")}|${unidade}`).push(it);
  }
  const pai = new Map(); // união-busca por linha
  const achar = (x) => { let r = x; while (pai.get(r) !== r) r = pai.get(r); while (pai.get(x) !== r) { const n = pai.get(x); pai.set(x, r); x = n; } return r; };
  const uniao = (x, y) => { for (const l of [x, y]) if (!pai.has(l)) pai.set(l, l); const rx = achar(x); const ry = achar(y); if (rx !== ry) pai.set(Math.max(rx, ry), Math.min(rx, ry)); };
  const novos = new Map(); // linha → candidatos desta regra
  for (const lista of baldes.values()) {
    const comPalavras = lista.filter((it) => info.get(it.linha).palavras.length);
    if (lista.length < 2 || !comPalavras.length) continue;
    const porGrupoNcm = new Map(); for (const it of lista) { const i = info.get(it.linha); doMapa(porGrupoNcm, `${i.grupo}\u0000${i.ncm}`).push(it); }
    for (const membros of porGrupoNcm.values()) { // no mesmo grupo de itens e NCM, com a unidade conhecida, o produto é o mesmo: formam grupo de duplicados
      if (!info.get(membros[0].linha).unidade) continue;
      const eixo = membros.find((it) => info.get(it.linha).palavras.length);
      if (eixo) for (const it of membros) if (it !== eixo) uniao(it.linha, eixo.linha);
    }
    for (const it of lista) {
      const a = info.get(it.linha); const cands = [];
      const fontes = a.palavras.length ? lista : comPalavras; // dois itens sem palavra de observação ficam por conta do detector
      for (const forte of [true, false]) for (const o of fontes) { // primeiro os que a regra dá como indicação alta
        if (cands.length >= 20) break;
        if (o === it) continue;
        const b = info.get(o.linha); if (ehForte(a, b) !== forte) continue;
        cands.push({ linha: o.linha, score: forte ? 0.95 : 0.85, nivel: forte ? "MUITO_PROVAVEL" : "POSSIVEL", motivos: motivoDoPar(a, b), origem: "observacao" });
      }
      if (cands.length) novos.set(it.linha, cands);
    }
  }
  // O que a regra ACRESCENTA: o par que o detector não tinha, ou tinha mais fraco. O resto (pares que o detector já indicava com a mesma força) não é mexido.
  const novoPor = new Set();
  for (const it of itens) {
    const nv = novos.get(it.linha); if (!nv) continue;
    const existentes = new Map((it.duplicidade?.candidatos ?? []).map((c) => [c.linha, c]));
    if (nv.some((c) => { const e = existentes.get(c.linha); return !e || NIVEL_ORDEM[c.nivel] < NIVEL_ORDEM[e.nivel]; })) novoPor.add(it.linha);
  }
  if (!novoPor.size) return itens;
  // O grupo de duplicados que o detector já formou se junta ao novo (todos os membros dele, ligados ou não por esta regra).
  const porLinha = new Map(itens.map((it) => [it.linha, it]));
  const eixoDoGrupo = new Map();
  for (const l of [...pai.keys()]) { const g = porLinha.get(l)?.duplicidade?.grupo; if (g == null) continue; if (eixoDoGrupo.has(g)) uniao(l, eixoDoGrupo.get(g)); else eixoDoGrupo.set(g, l); }
  if (eixoDoGrupo.size) for (const it of itens) { const g = it.duplicidade?.grupo; if (g != null && eixoDoGrupo.has(g)) uniao(it.linha, eixoDoGrupo.get(g)); }
  const componentes = new Map(); for (const l of pai.keys()) doMapa(componentes, achar(l)).push(l);
  const numeroDoGrupo = (it) => (it.duplicidade?.grupo != null && Number.isFinite(Number(it.duplicidade.grupo)) ? Number(it.duplicidade.grupo) : null); // grupo do detector (pode ser 0); null = sem grupo
  let proximo = 1; for (const it of itens) { const g = numeroDoGrupo(it); if (g != null && g >= proximo) proximo = g + 1; }
  const final = new Map(); // linha → { grupo, mestre } do grupo de duplicados, só dos conjuntos onde a regra acrescentou algo
  for (const [, linhas] of [...componentes.entries()].sort((x, y) => x[0] - y[0])) {
    if (!linhas.some((l) => novoPor.has(l))) continue; // a regra não acrescentou nada neste conjunto: fica como o detector deixou
    const membros = linhas.map((l) => porLinha.get(l));
    const antigos = membros.map(numeroDoGrupo).filter((g) => g != null);
    const grupo = antigos.length ? antigos.reduce((x, y) => Math.min(x, y)) : proximo++;
    const mestre = sugerirSobrevivente(membros, { escala }).linha;
    for (const l of linhas) final.set(l, { grupo, mestre });
  }
  return itens.map((it) => {
    const f = final.get(it.linha); const nv = novos.get(it.linha);
    if (!f && !novoPor.has(it.linha)) return it;
    const atual = it.duplicidade ?? {}; const d = { ...atual, ...(f ? { grupo: f.grupo, mestre: f.mestre } : {}), porObservacao: true };
    const i = info.get(it.linha); if (i) d.observacao = { palavras: emMaiuscula(i.palavras) };
    if (nv) { const candidatos = mesclar(atual.candidatos ?? [], nv); Object.assign(d, { nivel: candidatos[0].nivel, score: candidatos[0].score, candidatos }); }
    return { ...it, ...(nv ? { candidatos_duplicidade: d.candidatos.map((c) => c.linha) } : {}), duplicidade: d };
  });
}

/** A variante (observação) que o item traz, em maiúsculas, quando ele foi ligado por esta regra; [] caso contrário. */
export const observacaoDoItem = (it) => it?.duplicidade?.observacao?.palavras ?? [];

/**
 * Palavras que a ferramenta SUGERE como observação, nos grupos marcados: em cada conjunto de itens com a mesma primeira palavra de produto, as mesmas medidas e a mesma unidade, as
 * palavras que nem todos trazem. Ficam de fora as já aprovadas, as que o analista ignorou (false), os números e as palavras de uma letra. Devolve
 * [{ forma, palavra, itens, conjuntos, exemplos }], das mais frequentes (em mais conjuntos) para as menos.
 */
export function sugerirPalavras(itens, cfg, { limite = 60 } = {}) {
  const obs = palavrasAprovadas(cfg); const ignoradas = new Set(Object.entries(cfg?.palavras || {}).filter(([, v]) => v === false).map(([w]) => formaDaPalavra(w)));
  const conjuntos = new Map();
  for (const it of itens) {
    if (!grupoUsaObservacao(cfg, grupoDe(it))) continue;
    const a = analisarDescricao(it.descricao); const toks = a.tokens.filter((t) => !obs.has(t.f)); if (!toks.length) continue;
    doMapa(conjuntos, `${toks[0].f}|${a.medidas.join(";")}|${unidadeDe(it)}`).push({ it, toks });
  }
  const cand = new Map();
  for (const lista of conjuntos.values()) {
    if (lista.length < 2 || lista.length > 80) continue;
    const comuns = new Set([...lista[0].toks].map((t) => t.f).filter((f) => lista.every((m) => m.toks.some((t) => t.f === f))));
    for (const m of lista) for (const t of m.toks) {
      if (comuns.has(t.f) || ignoradas.has(t.f) || t.f.length < 2 || /^\d+$/.test(t.f)) continue;
      const c = cand.get(t.f) ?? cand.set(t.f, { forma: t.f, palavra: t.t.toUpperCase(), itens: new Set(), conjuntos: new Set(), exemplos: [] }).get(t.f);
      c.itens.add(m.it.linha); c.conjuntos.add(lista); if (c.exemplos.length < 2 && !c.exemplos.includes(m.it.descricao)) c.exemplos.push(String(m.it.descricao ?? ""));
    }
  }
  return [...cand.values()].map((c) => ({ forma: c.forma, palavra: c.palavra, itens: c.itens.size, conjuntos: c.conjuntos.size, exemplos: c.exemplos }))
    .sort((a, b) => b.conjuntos - a.conjuntos || b.itens - a.itens || a.palavra.localeCompare(b.palavra, "pt-BR")).slice(0, limite);
}

/** O efeito da regra na base: quantos itens ela ligou e em quantos conjuntos (os mesmos que a tela de Duplicidade mostra). */
export function efeitoObservacao(itens) {
  const ligados = itens.filter((it) => it.duplicidade?.porObservacao);
  return { itens: ligados.length, conjuntos: ligados.length ? montarConjuntos(ligados).length : 0 };
}

// ── Edição dos parâmetros (sempre devolve um novo objeto; as palavras ficam guardadas pela forma) ──
export const observacaoInicial = () => ({ grupos: {}, palavras: {} });
const copia = (cfg) => ({ ...(cfg || {}), grupos: { ...(cfg?.grupos || {}) }, palavras: { ...(cfg?.palavras || {}) }, ...(cfg?.rotulos ? { rotulos: { ...cfg.rotulos } } : {}) });
/** Guarda como o analista escreveu a palavra (com acento) para a tela; a padrão já tem o seu rótulo. */
const guardarRotulo = (c, forma, texto) => { if (!PADRAO.has(forma) && String(texto).trim()) c.rotulos = { ...(c.rotulos || {}), [forma]: String(texto).trim().toUpperCase() }; };
/** O que o analista digitou, em palavras: "anti-bacteriano" são duas; conectivos ("em pasta") e letras soltas não são palavras de observação. */
const palavrasDe = (w) => String(w ?? "").split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((p) => [p, formaDaPalavra(p)]).filter(([, t]) => t.length > 1 && !STOP.has(t));
/** Marca ou desmarca o grupo (a escolha do analista vale mais que o padrão pelo nome). */
export function definirGrupo(cfg, nome, usa) { const c = copia(cfg); c.grupos[nome] = !!usa; return c; }
/** Volta os grupos ao padrão (limpeza, copa, cozinha e utensílios, pelo nome). */
export function gruposNoPadrao(cfg) { return { ...copia(cfg), grupos: {} }; }
/** Aprova palavras como observação (e as tira das ignoradas). */
export function aprovarPalavras(cfg, palavras) { const c = copia(cfg); for (const w of palavras) for (const [p, t] of palavrasDe(w)) { c.palavras[t] = true; guardarRotulo(c, t, p); } return c; }
/** Ignora a palavra: não é observação (uma padrão ignorada deixa de ser) e ela some das sugestões. */
export function ignorarPalavra(cfg, palavra) { const c = copia(cfg); for (const [p, t] of palavrasDe(palavra)) { c.palavras[t] = false; guardarRotulo(c, t, p); } return c; }
/** Devolve a palavra ao que era antes de o analista mexer: a padrão volta a ser observação; as outras deixam de estar aprovadas e voltam às sugestões. */
export function restaurarPalavra(cfg, palavra) { const c = copia(cfg); const t = formaDaPalavra(palavra); delete c.palavras[t]; if (c.rotulos) delete c.rotulos[t]; return c; }
/** As palavras de observação em vigor, para a tela: [{ forma, palavra, padrao }], em ordem alfabética. */
export function palavrasEmVigor(cfg) { return [...palavrasAprovadas(cfg)].map((forma) => ({ forma, palavra: rotuloDa(cfg, forma), padrao: PADRAO.has(forma) })).sort((a, b) => a.palavra.localeCompare(b.palavra, "pt-BR")); }
/** As palavras que o analista disse que NÃO são observação (e ficam fora das sugestões), para ele poder voltar atrás. */
export function palavrasIgnoradas(cfg) { return Object.entries(cfg?.palavras || {}).filter(([, v]) => v === false).map(([w]) => formaDaPalavra(w)).filter(Boolean).sort().map((forma) => ({ forma, palavra: rotuloDa(cfg, forma) })); }
/** Os grupos (nomes) que usam a regra, entre os dados: o que a regra atinge hoje. */
export const gruposMarcados = (cfg, nomes) => nomes.filter((n) => grupoUsaObservacao(cfg, n));
/** O que a regra liga, numa linha comparável: os grupos que a usam (entre os nomes dados) e as palavras de observação em vigor. Mesma assinatura = mesmos itens ligados. */
export const assinaturaObservacao = (cfg, nomes) => `${gruposMarcados(cfg, nomes).sort().join("|")}#${[...palavrasAprovadas(cfg)].sort().join(",")}`;
