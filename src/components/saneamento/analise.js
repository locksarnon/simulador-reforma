// Análises por critério (passo 4): os achados de cada teste automático, a aprovação do critério (inclusive a automática, quando o teste não acha
// nada) e o tratamento por grupo. Funções puras (sem React).
import { CRITERIOS, achadosDoCriterio, grupoDe } from "./logica";

/** Achados de todos os critérios com teste automático, nos itens em escopo: { [critId]: [{ item, motivo, sugerida, extra }] }. */
export function calcularAchados(itensEmEscopo, testes) {
  const saida = {};
  for (const c of CRITERIOS) if (c.auto) saida[c.id] = achadosDoCriterio(c, itensEmEscopo, testes);
  return saida;
}

/**
 * Totais por critério e por grupo. null quando não há item em escopo: sem base (ou com tudo fora do escopo) não há como afirmar que "não há achado".
 */
export function contarAchados(achados, totalEmEscopo) {
  if (!totalEmEscopo) return null;
  const porCriterio = {}; const porGrupoCriterio = {};
  for (const [id, lista] of Object.entries(achados)) {
    porCriterio[id] = lista.length;
    for (const a of lista) { const k = `${grupoDe(a.item)}|${id}`; porGrupoCriterio[k] = (porGrupoCriterio[k] || 0) + 1; }
  }
  return { porCriterio, porGrupoCriterio };
}

/** Achados do critério nos itens em escopo; null se o critério é conferido à mão ou ainda não há contagem. */
export const achadosDe = (contagem, crit) => (crit.auto && contagem ? contagem.porCriterio[crit.id] ?? 0 : null);

/**
 * Situação de aprovação de um critério:
 *  - APROVADO: o analista aprovou;
 *  - AUTO: teste automático que não achou nada na base abre aprovado (não há o que aprovar);
 *  - PENDENTE: o resto. Reabrir (aprovado: false) pede revisão manual e vale mesmo sem achados.
 */
export function situacaoCriterio(estado, crit, contagem) {
  const c = estado?.criterios?.[crit.id];
  if (c?.aprovado === true) return "APROVADO";
  if (c?.aprovado === false) return "PENDENTE";
  return achadosDe(contagem, crit) === 0 ? "AUTO" : "PENDENTE";
}
export const criterioAprovado = (estado, crit, contagem) => situacaoCriterio(estado, crit, contagem) !== "PENDENTE";
export const criteriosAprovados = (estado, contagem) => CRITERIOS.filter((c) => criterioAprovado(estado, c, contagem));

/** O grupo está tratado no critério quando o analista marcou, ou quando o teste automático não achou nada nele. */
export function grupoTratado(estado, grupo, crit, contagem) {
  if (estado?.tratados?.[`${grupo}|${crit.id}`]) return true;
  return !!contagem && crit.auto && (contagem.porGrupoCriterio[`${grupo}|${crit.id}`] ?? 0) === 0;
}

/**
 * O que ainda impede sanear o grupo: critério aprovado e ainda não tratado nele, ou critério automático que achou itens nele e ainda não foi aprovado
 * (achado conhecido não pode ficar de fora do saneamento do grupo).
 */
export function criteriosPendentesDoGrupo(estado, grupo, contagem) {
  return CRITERIOS.filter((c) => (criterioAprovado(estado, c, contagem)
    ? !grupoTratado(estado, grupo, c, contagem)
    : c.auto && !!contagem && (contagem.porGrupoCriterio[`${grupo}|${c.id}`] ?? 0) > 0));
}

/** O grupo só pode ser saneado sem nenhuma pendência, e com ao menos um critério aprovado. */
export const grupoPodeSanear = (estado, grupo, contagem) => criteriosAprovados(estado, contagem).length > 0 && criteriosPendentesDoGrupo(estado, grupo, contagem).length === 0;

/** Achados de um critério agrupados por grupo de itens: [{ grupo, achados }], do grupo com mais achados para o com menos. */
export function agruparAchados(lista) {
  const m = new Map();
  for (const a of lista) { const g = grupoDe(a.item); const x = m.get(g); if (x) x.push(a); else m.set(g, [a]); }
  return [...m.entries()].map(([grupo, achados]) => ({ grupo, achados })).sort((a, b) => b.achados.length - a.achados.length || a.grupo.localeCompare(b.grupo, "pt-BR"));
}
