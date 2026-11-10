/**
 * Revisão pela lei: quando o texto de um dispositivo da Base legal muda, os cartões de pergunta frequente, as notas "i"
 * do cálculo e os marcos da agenda que o citam entram numa fila de revisão (tabela RevisaoLegal, no servidor).
 * Aqui ficam só os textos e o agrupamento que as telas usam.
 */
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export const ROTULO_TIPO_REVISAO = {
  cartao: "Pergunta frequente",
  fundamento: "Nota do cálculo",
  marco: "Marco da agenda",
};

const dataBr = (v) => {
  if (!v) return "";
  try { return new Date(v).toLocaleDateString("pt-BR"); } catch { return ""; }
};

/** Frase do aviso depois de atualizar o texto de uma norma: o que voltou para revisão. Vazia se nada foi atingido. */
export function resumoRevisao(rev) {
  if (!rev || !rev.itens) return "";
  const partes = [
    rev.cartoes ? plural(rev.cartoes, "cartão", "cartões") : "",
    rev.fundamentos ? plural(rev.fundamentos, "nota do cálculo", "notas do cálculo") : "",
    rev.marcos ? plural(rev.marcos, "marco da agenda", "marcos da agenda") : "",
  ].filter(Boolean);
  const publicados = rev.cartoes_despublicados
    ? ` ${plural(rev.cartoes_despublicados, "cartão publicado voltou", "cartões publicados voltaram")} para rascunho.`
    : "";
  return `Para revisar: ${partes.join(", ")}.${publicados}`;
}

/** O que aconteceu com o dispositivo, sem o nome dele: "(LC 214/2025) alterado em 12/11/2026. O texto do dispositivo mudou." */
export function oQueMudou(l) {
  const norma = l.norma_numero ?? l.numero;
  const o = l.mudanca === "revogado" ? "revogado" : "alterado";
  const quando = dataBr(l.mudou_em);
  return `${norma ? `(${norma}) ` : ""}${o}${quando ? ` em ${quando}` : ""}.${l.detalhe ? ` ${l.detalhe}` : ""}`;
}

/** Uma linha da fila em palavras: qual dispositivo mudou, quando e o que isso significa para o item. */
export const fraseDaRevisao = (l) => `${l.rotulo} ${oQueMudou(l)}`;

/** Agrupa as linhas da fila por item (tipo e id): um item com vários dispositivos alterados aparece uma vez. */
export function agruparRevisoes(linhas = []) {
  const mapa = new Map();
  for (const l of linhas) {
    const chave = `${l.tipo}:${l.alvo_id}`;
    if (!mapa.has(chave)) mapa.set(chave, { tipo: l.tipo, alvo_id: l.alvo_id, titulo: l.alvo_titulo, linhas: [] });
    mapa.get(chave).linhas.push(l);
  }
  return [...mapa.values()];
}
