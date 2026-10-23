// Conjuntos de itens iguais ou parecidos (critério Duplicidade): o comparativo lado a lado e a escolha de qual código fica. Só SUGERE: nada é alterado
// no cadastro; escolher quem fica encaminha os outros ao De/para (unificar no código que fica), onde cada caso é aprovado ou rejeitado. Funções puras.
import { dataBr, grupoDe } from "./logica";
import { chaveDeId, idItem } from "./identidade";
import { instantaneoDoItem } from "./aprovacao";
import { numeroBr } from "./unidades";

export const NIVEL_ORDEM = { EXATA: 0, MUITO_PROVAVEL: 1, POSSIVEL: 2 };
const colador = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/** Saldo na escala escolhida (a base da Crestani traz o saldo ×1.000.000); null continua null. */
export const saldoNaEscala = (saldo, escala = 1) => (saldo == null || !Number.isFinite(Number(saldo)) ? null : Number(saldo) / (escala || 1));

/** Escala provável do saldo: 1.000.000 quando todos os saldos não nulos e diferentes de zero são múltiplos exatos de 1.000.000 (ao menos 3); senão 1. */
export function detectarEscalaSaldo(itens) {
  const v = []; for (const it of itens) { const s = Number(it.saldo); if (it.saldo != null && Number.isFinite(s) && s !== 0) v.push(Math.abs(s)); }
  return v.length >= 3 && v.every((s) => s >= 1e6 && s % 1e6 === 0) ? 1e6 : 1;
}

/** Campos do cadastro preenchidos (NCM, unidade, princípio ativo e grupo): quem tem mais é o cadastro mais completo. */
const completude = (m) => [m.ncm || m.ncm_original, m.unidade, m.principio_ativo, m.grupo_atual].filter((x) => String(x ?? "").trim()).length;

/**
 * Quem a ferramenta sugere manter e por quê. Critérios, nesta ordem, cada um só decide se separa os que ainda empatam:
 * 1) maior saldo em estoque (menos estoque a transferir); 2) movimentação mais recente; 3) cadastro mais completo; 4) menor código (o mais antigo).
 * Devolve { linha, id, criterio, motivo, ordem } com `id` = código do indicado e `ordem` = linhas da mais para a menos indicada. Determinístico.
 */
export function sugerirSobrevivente(membros, { escala = 1 } = {}) {
  const saldo = (m) => { const s = saldoNaEscala(m.saldo, escala); return s != null && s > 0 ? s : 0; };
  const criterios = [
    { id: "saldo", v: saldo, melhor: (a, b) => a - b, motivo: (a, b) => `maior saldo em estoque (${numeroBr(a)} contra ${numeroBr(b)})` },
    { id: "movimentacao", v: (m) => m.ultima_mov || "", melhor: (a, b) => (a < b ? -1 : a > b ? 1 : 0), motivo: (a, b) => `movimentação mais recente (${dataBr(a)} contra ${b ? dataBr(b) : "sem data"})` },
    { id: "completude", v: (m) => [completude(m), String(m.descricao ?? "").length], melhor: (a, b) => a[0] - b[0] || a[1] - b[1], motivo: () => "cadastro mais completo" },
    { id: "codigo", v: (m) => String(m.codigo ?? ""), melhor: (a, b) => colador.compare(b, a), motivo: () => "menor código (cadastro mais antigo)" },
  ];
  const ordenados = [...membros].sort((x, y) => { for (const c of criterios) { const r = c.melhor(c.v(y), c.v(x)); if (r) return r; } return x.linha - y.linha; });
  const [topo, segundo] = ordenados;
  let criterio = "unico"; let motivo = "";
  if (segundo) {
    criterio = "linha"; motivo = "cadastros iguais nos critérios de escolha: sugerido o primeiro da planilha";
    for (const c of criterios) { if (c.melhor(c.v(topo), c.v(segundo)) !== 0) { criterio = c.id; motivo = c.motivo(c.v(topo), c.v(segundo)); break; } }
  }
  return { linha: topo?.linha ?? null, id: topo ? idItem(topo) : null, criterio, motivo, ordem: ordenados.map((m) => m.linha) };
}

/**
 * Conjuntos de duplicados entre os itens dados (só os com indicação estruturada do backend em `duplicidade`). Cada item se liga ao seu candidato mais forte
 * e os itens do mesmo grupo forte (indicação alta ou idêntico) ficam juntos; os conjuntos são os componentes ligados. Candidato fora dos itens dados é
 * ignorado e conjunto de um item só é descartado. Cada conjunto: { id, nivel, score, grupo, membros (o sugerido primeiro), sugestao }, dos mais fortes aos mais fracos.
 */
export function montarConjuntos(itens, { escala = 1 } = {}) {
  const porLinha = new Map(); for (const it of itens) if (it.duplicidade) porLinha.set(it.linha, it);
  const pai = new Map([...porLinha.keys()].map((l) => [l, l]));
  const raiz = (x) => { while (pai.get(x) !== x) { pai.set(x, pai.get(pai.get(x))); x = pai.get(x); } return x; };
  const uniao = (a, b) => { const x = raiz(a); const y = raiz(b); if (x !== y) pai.set(Math.max(x, y), Math.min(x, y)); };
  const primeiroDoGrupo = new Map();
  for (const it of porLinha.values()) {
    const d = it.duplicidade;
    if (d.grupo != null) { const g0 = primeiroDoGrupo.get(d.grupo); if (g0 === undefined) primeiroDoGrupo.set(d.grupo, it.linha); else uniao(it.linha, g0); }
    const topo = d.candidatos?.[0]; if (topo && porLinha.has(topo.linha)) uniao(it.linha, topo.linha);
  }
  const comp = new Map(); for (const l of porLinha.keys()) { const r = raiz(l); const a = comp.get(r); if (a) a.push(porLinha.get(l)); else comp.set(r, [porLinha.get(l)]); }
  const conjuntos = [];
  for (const lista of comp.values()) {
    if (lista.length < 2) continue;
    const sug = sugerirSobrevivente(lista, { escala }); const pos = new Map(sug.ordem.map((l, i) => [l, i]));
    const membros = [...lista].sort((a, b) => pos.get(a.linha) - pos.get(b.linha));
    const nivel = lista.reduce((n, m) => (NIVEL_ORDEM[m.duplicidade.nivel] < NIVEL_ORDEM[n] ? m.duplicidade.nivel : n), "POSSIVEL");
    const contagem = new Map(); for (const m of lista) { const g = grupoDe(m); contagem.set(g, (contagem.get(g) || 0) + 1); }
    const grupo = [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0][0];
    const menorCodigo = lista.map((m) => idItem(m) || `L${m.linha}`).sort((a, b) => colador.compare(a, b))[0]; // o identificador do conjunto é o menor código: não muda de uma extração para outra
    conjuntos.push({ id: `c:${menorCodigo}`, nivel, score: Math.max(...lista.map((m) => Number(m.duplicidade.score) || 0)), grupo, membros, sugestao: sug });
  }
  return conjuntos.sort((a, b) => NIVEL_ORDEM[a.nivel] - NIVEL_ORDEM[b.nivel] || b.membros.length - a.membros.length || a.membros[0].linha - b.membros[0].linha);
}

const chave = (m) => chaveDeId(idItem(m), "duplicidade");

/**
 * Os itens do conjunto podem receber decisão: todos têm código e nenhum se repete (no conjunto nem, dado o índice da base, na base). A escolha de quem fica é guardada
 * pelo código; sem ele, ou com código repetido, não dá para saber depois de qual item é a escolha.
 */
export function conjuntoIdentificavel(conj, indice) {
  const ids = conj.membros.map(idItem);
  if (ids.some((x) => !x)) return { ok: false, motivo: "Há item sem código no conjunto: não dá para guardar a escolha de forma estável." };
  if (new Set(ids).size !== ids.length || (indice && ids.some((x) => indice.repetidos.has(x)))) return { ok: false, motivo: "Há código repetido na base entre os itens do conjunto: não dá para saber de qual item é a escolha." };
  return { ok: true, motivo: "" };
}

/**
 * Escolha vigente do conjunto, lida das decisões: { fica, origem, status, travada }, com `fica` = código do que fica. Modelo atual: cada membro que NÃO fica tem a decisão
 * com `destino` = o código do que fica (o que fica não tem decisão). Modelo antigo: a decisão com destino igual ao próprio código marca quem fica. Travada = alguém já foi
 * aprovado ou rejeitado no De/para.
 */
export function escolhaDoConjunto(conj, decisoes) {
  const ds = conj.membros.map((m) => ({ m, d: decisoes?.[chave(m)] })).filter((x) => x.d);
  if (!ds.length) return { fica: null, origem: null, status: "nenhuma", travada: false };
  const travada = ds.some((x) => x.d.status === "APR" || x.d.status === "REJ");
  const antigo = ds.find((x) => x.d.destino === idItem(x.m));
  const cont = new Map(); for (const x of ds) if (x.d.destino != null && x.d.destino !== idItem(x.m)) cont.set(x.d.destino, (cont.get(x.d.destino) || 0) + 1);
  const fica = antigo ? idItem(antigo.m) : [...cont.entries()].sort((a, b) => b[1] - a[1] || colador.compare(a[0], b[0]))[0]?.[0] ?? null;
  return { fica, origem: ds.find((x) => x.d.escolhaPor)?.d.escolhaPor ?? (fica != null ? "analista" : null), status: travada ? "decidida" : "aguardando", travada };
}

/**
 * Aplica a escolha de quem fica (`fica` = código): devolve NOVAS decisões (não altera as dadas). Cada membro que sai vira uma proposta para o De/para (unificar no `fica`),
 * com como o item estava na hora (`antes`) e como estava o que fica (`destinoAntes`); quem fica não tem decisão. Decisão já aprovada ou rejeitada nunca é tocada: com o
 * conjunto travado (ou sem como identificar todos os itens), devolve as mesmas decisões. `indice` (de identidade.indexar) confere também os códigos repetidos na base.
 */
export function aplicarEscolha(decisoes, conj, fica, { quem, hoje, origem = "analista", indice } = {}) {
  if (!conjuntoIdentificavel(conj, indice).ok) return decisoes;
  if (escolhaDoConjunto(conj, decisoes).travada) return decisoes;
  const d = { ...decisoes }; let mudou = false;
  const mantido = conj.membros.find((m) => idItem(m) === fica);
  for (const m of conj.membros) {
    const k = chave(m); const atual = d[k];
    if (idItem(m) === fica) { if (atual) { delete d[k]; mudou = true; } continue; }
    if (atual && atual.destino === fica && atual.escolhaPor === origem && atual.status === "PROP") continue;
    d[k] = { acao: "ENC", status: "PROP", grupo: grupoDe(m), por: quem, em: hoje, destino: fica, conjunto: conj.id, escolhaPor: origem, antes: instantaneoDoItem(m, "duplicidade"), ...(mantido ? { destinoAntes: instantaneoDoItem(mantido, "duplicidade") } : {}) }; mudou = true;
  }
  return mudou ? d : decisoes;
}

/**
 * Os membros que saem do conjunto e estão sem proposta (decisão descartada, duplicado novo), num conjunto que já tem um caso aprovado ou rejeitado (travado). O código que ficou
 * precisa continuar no conjunto: se ele saiu (o conjunto de hoje é outro), os membros novos nunca foram comparados com ele e não há o que completar.
 */
export function membrosSemProposta(conj, decisoes) {
  const esc = escolhaDoConjunto(conj, decisoes);
  if (!esc.travada || esc.fica == null || !conj.membros.some((m) => idItem(m) === esc.fica)) return [];
  return conj.membros.filter((m) => idItem(m) !== esc.fica && !decisoes?.[chave(m)]);
}

/**
 * Conjunto travado (algum caso já aprovado ou rejeitado) com membros sem proposta: encaminha só os que faltam, para o MESMO código que já ficou. Nunca troca quem fica nem
 * toca em decisão aprovada ou rejeitada.
 */
export function completarEscolha(decisoes, conj, { quem, hoje, origem = "analista", indice } = {}) {
  if (!conjuntoIdentificavel(conj, indice).ok) return decisoes;
  const faltam = membrosSemProposta(conj, decisoes); if (!faltam.length) return decisoes;
  const fica = escolhaDoConjunto(conj, decisoes).fica; const mantido = conj.membros.find((m) => idItem(m) === fica); const d = { ...decisoes };
  for (const m of faltam) d[chave(m)] = { acao: "ENC", status: "PROP", grupo: grupoDe(m), por: quem, em: hoje, destino: fica, conjunto: conj.id, escolhaPor: origem, antes: instantaneoDoItem(m, "duplicidade"), ...(mantido ? { destinoAntes: instantaneoDoItem(mantido, "duplicidade") } : {}) };
  return d;
}

/** Desfaz o encaminhamento do conjunto: remove só as propostas ainda não decididas (aprovadas e rejeitadas ficam). */
export function desfazerEscolha(decisoes, conj) {
  let d = null;
  for (const m of conj.membros) { const k = chave(m); if (decisoes?.[k]?.status === "PROP") { d = d || { ...decisoes }; delete d[k]; } }
  return d || decisoes;
}
