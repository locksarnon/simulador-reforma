// Aprovação ligada à alteração específica: cada decisão guarda como o item estava quando foi proposta (`antes`) e o que foi proposto (descrição, unidade e fator, ou o
// código que fica). Aprovar uma descrição não aprova outra descrição sugerida depois: se o cadastro do item mudou para outra coisa desde a decisão, ela não vale mais
// para a base atual e volta para nova avaliação. Funções puras.
import { grupoDe } from "./logica";
import { idItem, indexar, itemPorId, partirChave } from "./identidade";

const texto = (v) => String(v ?? "").trim();
/** Texto comparável: sem acento, minúsculo e só letras e números (grafias de um mesmo texto comparam iguais). */
const comparavel = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Como o item está agora, o que as decisões precisam para saber se o cadastro mudou depois: descrição, unidade e grupo. */
export const instantaneoDoItem = (it) => ({ descricao: texto(it?.descricao), unidade: texto(it?.unidade), grupo: grupoDe(it || {}) });

export const SITUACAO_DECISAO = { OK: "OK", REFLETIDA: "REFLETIDA", MUDOU: "MUDOU", AUSENTE: "AUSENTE" };

/**
 * A decisão ainda vale para o cadastro da base atual? Devolve { estado, ok, motivo }:
 *  - OK: o cadastro está como estava quando a decisão foi proposta (ou a decisão não guardou como estava e não há o que conferir);
 *  - REFLETIDA: o cadastro já está como a decisão manda (a correção já foi aplicada no ERP);
 *  - MUDOU: o cadastro mudou para outra coisa desde a decisão: a aprovação não cobre o que está lá agora (ok = false);
 *  - AUSENTE: o item (ou o código que fica) não está na base atual: não dá para conferir (ok = true; é aviso, não bloqueio).
 */
export function coerenciaDaDecisao(d, crit, it, indice) {
  if (!d) return { estado: "OK", ok: true, motivo: "" };
  if (!it) return { estado: "AUSENTE", ok: true, motivo: "O item não está na base atual" };
  const a = d.antes;
  if (crit === "duplicidade") {
    const destId = d.destino != null ? String(d.destino) : null;
    if (destId && destId !== idItem(it) && !itemPorId(indice, destId)) return { estado: "AUSENTE", ok: true, motivo: `O código que fica (${destId}) não está na base atual` };
    if (a && texto(it.descricao) !== a.descricao) return { estado: "MUDOU", ok: false, motivo: "A descrição do item mudou no cadastro desde a decisão" };
    const dest = destId ? itemPorId(indice, destId) : null;
    if (d.destinoAntes && dest && texto(dest.descricao) !== d.destinoAntes.descricao) return { estado: "MUDOU", ok: false, motivo: "A descrição do código que fica mudou no cadastro desde a decisão" };
    return { estado: "OK", ok: true, motivo: "" };
  }
  if (!a) return { estado: "OK", ok: true, motivo: "" };
  if (crit === "padrao") {
    if (texto(it.descricao) === a.descricao) return { estado: "OK", ok: true, motivo: "" };
    if (comparavel(it.descricao) === comparavel(d.final || d.sugerida)) return { estado: "REFLETIDA", ok: true, motivo: "O cadastro já está com a descrição aprovada" };
    return { estado: "MUDOU", ok: false, motivo: "A descrição mudou no cadastro desde a decisão" };
  }
  if (crit === "unidade") {
    if (texto(it.unidade) === a.unidade) return { estado: "OK", ok: true, motivo: "" };
    if (d.para && comparavel(it.unidade) === comparavel(d.para)) return { estado: "REFLETIDA", ok: true, motivo: "O cadastro já está com a unidade aprovada" };
    return { estado: "MUDOU", ok: false, motivo: "A unidade mudou no cadastro desde a decisão" };
  }
  return { estado: "OK", ok: true, motivo: "" };
}

/**
 * Confere as decisões guardadas com a base atual (depois de trocar a base, por exemplo): quantas valem como estão, quantas o cadastro já reflete, quais mudaram para outra
 * coisa (não valem até nova avaliação), quais são de itens que não estão na base e quais têm código repetido. Cada lista traz { k, id, crit, status, motivo }.
 */
export function conciliarDecisoes(decisoes, itens) {
  const indice = indexar(itens); const r = { total: 0, ok: 0, refletidas: 0, mudaram: [], ausentes: [], ambiguas: [] };
  for (const [k, d] of Object.entries(decisoes || {})) {
    const { id, crit } = partirChave(k); r.total += 1; const base = { k, id, crit, status: d?.status };
    if (indice.repetidos.has(id)) { r.ambiguas.push({ ...base, motivo: `O código ${id} aparece mais de uma vez na base` }); continue; }
    const c = coerenciaDaDecisao(d, crit, indice.porId.get(id), indice);
    if (c.estado === "OK") r.ok += 1; else if (c.estado === "REFLETIDA") r.refletidas += 1; else if (c.estado === "MUDOU") r.mudaram.push({ ...base, motivo: c.motivo }); else r.ausentes.push({ ...base, motivo: c.motivo });
  }
  return r;
}
