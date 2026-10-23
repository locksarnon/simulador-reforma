// Aprovação ligada à alteração específica: cada decisão guarda como o item estava quando foi proposta (`antes`) e o que foi proposto (descrição, unidade e fator, o código
// que fica, o grupo, o NCM e a classe). Aprovar uma descrição não aprova outra descrição sugerida depois: se o cadastro do item mudou para outra coisa desde a decisão, ela
// não vale mais para a base atual e volta para nova avaliação. Funções puras.
import { grupoDe } from "./logica";
import { idItem, indexar, itemPorId, partirChave } from "./identidade";

const texto = (v) => String(v ?? "").trim();
const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");
/** Texto comparável: sem acento, minúsculo e só letras e números (grafias de um mesmo texto comparam iguais). */
const comparavel = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const palavras = (v) => new Set(String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));

/** Parecença entre dois textos pelas palavras (0 a 1): a correção de formato ou a abreviação expandida reorganizam a descrição, não a trocam por outra. */
export function parecenca(a, b) {
  const x = palavras(a); const y = palavras(b); if (!x.size && !y.size) return 1;
  let comum = 0; for (const p of x) if (y.has(p)) comum += 1;
  return comum / (x.size + y.size - comum || 1);
}
/**
 * A descrição de hoje é a do instantâneo? Vale a escrita igual (sem espaço, acento e caixa) ou a que uma correção de descrição APROVADA deste mesmo item deixou no cadastro (a
 * abreviação expandida, por exemplo). Qualquer outra mudança é outro cadastro: parecer com a descrição de antes (palavras em comum) não prova que seja o mesmo produto.
 */
const descricaoVale = (atual, antes, id, decisoes) => {
  if (comparavel(atual) === comparavel(antes)) return true;
  const p = decisoes?.[`${id}|padrao`]; const aprovada = p?.status === "APR" ? (p.final || p.sugerida) : null;
  return !!aprovada && comparavel(atual) === comparavel(aprovada);
};

/** O que o teste de NCM propõe para o item (o mesmo que a tela mostra em "como seria"): o NCM corrigido e a classe sugerida pelos anexos. Sem sugestão, vazio. */
export function propostaNcm(it) {
  const p = {};
  if (it?.ncm && it?.ncm_original && it.ncm !== it.ncm_original) p.ncm = soDigitos(it.ncm);
  if (it?.sugestao?.c_class_trib) p.cClassTrib = texto(it.sugestao.c_class_trib);
  return p;
}

/**
 * Como o item estava quando a decisão foi proposta: o que o critério confere depois para saber se o cadastro mudou (descrição na padronização e na duplicidade, unidade, grupo,
 * ou NCM e classe informados) e, nos demais, a descrição só para identificar o item nas telas e na tarefa se ele sair da base (não é conferida). Critério sem alteração de
 * cadastro própria não guarda nada (devolve null).
 */
export function instantaneoDoItem(it, crit) {
  switch (crit) {
    case "padrao": case "duplicidade": return { descricao: texto(it?.descricao) };
    case "unidade": return { unidade: texto(it?.unidade), descricao: texto(it?.descricao) };
    case "grupo": return { grupo: grupoDe(it || {}), descricao: texto(it?.descricao) };
    case "ncm": return { ncm: soDigitos(it?.ncm_original ?? it?.ncm), cClassTrib: texto(it?.c_class_trib_informado), descricao: texto(it?.descricao) };
    default: return null;
  }
}

export const SITUACAO_DECISAO = { OK: "OK", REFLETIDA: "REFLETIDA", MUDOU: "MUDOU", AUSENTE: "AUSENTE", AMBIGUA: "AMBIGUA" };
const OK = { estado: "OK", ok: true, motivo: "" };
const REFLETIDA = (motivo) => ({ estado: "REFLETIDA", ok: true, motivo });
const MUDOU = (motivo) => ({ estado: "MUDOU", ok: false, motivo });

/**
 * A decisão ainda vale para o cadastro da base atual? Devolve { estado, ok, motivo }:
 *  - OK: o cadastro está como estava quando a decisão foi proposta (ou a decisão não guardou como estava e não há o que conferir);
 *  - REFLETIDA: o cadastro já está como a decisão manda (a correção já foi aplicada no ERP);
 *  - MUDOU: o cadastro mudou para outra coisa desde a decisão: a aprovação não cobre o que está lá agora (ok = false);
 *  - AMBIGUA: o código do item que fica aparece mais de uma vez na base: não dá para saber qual é (ok = false);
 *  - AUSENTE: o item (ou o código que fica) não está na base atual: não dá para conferir (ok = true; é aviso, não bloqueio).
 * Na duplicidade, a descrição do item e a do código que fica precisam estar como na decisão (ou como uma correção de descrição aprovada as deixou): é o que prova que são os
 * mesmos produtos que foram unificados. `decisoes` (opcional) é o conjunto de decisões do projeto, onde essa correção aprovada é procurada.
 */
export function coerenciaDaDecisao(d, crit, it, indice, decisoes) {
  if (!d) return OK;
  if (!it) return { estado: "AUSENTE", ok: true, motivo: "O item não está na base atual" };
  const a = d.antes;
  if (crit === "duplicidade") {
    const id = idItem(it); const destId = d.destino != null ? String(d.destino) : null;
    if (a?.descricao != null && !descricaoVale(it.descricao, a.descricao, id, decisoes)) return MUDOU("A descrição do item mudou no cadastro desde a decisão");
    if (destId && destId !== id) {
      if (indice?.repetidos?.has(destId)) return { estado: "AMBIGUA", ok: false, motivo: `O código que fica (${destId}) aparece mais de uma vez na base: não dá para saber qual item é` };
      const dest = itemPorId(indice, destId);
      if (!dest) return { estado: "AUSENTE", ok: true, motivo: `O código que fica (${destId}) não está na base atual` };
      if (d.destinoAntes?.descricao != null && !descricaoVale(dest.descricao, d.destinoAntes.descricao, destId, decisoes)) return MUDOU("A descrição do código que fica mudou no cadastro desde a decisão");
    }
    return OK;
  }
  if (!a) return OK;
  // O instantâneo antigo guardava descrição, unidade e grupo para todo critério; o atual guarda só o que o critério confere. Campo que a decisão não guardou = nada a conferir.
  if (crit === "padrao") {
    if (a.descricao == null || texto(it.descricao) === a.descricao) return OK;
    if (comparavel(it.descricao) === comparavel(d.final || d.sugerida)) return REFLETIDA("O cadastro já está com a descrição aprovada");
    return MUDOU("A descrição mudou no cadastro desde a decisão");
  }
  if (crit === "unidade") {
    if (a.unidade == null || texto(it.unidade) === a.unidade) return OK;
    if (d.para && comparavel(it.unidade) === comparavel(d.para)) return REFLETIDA("O cadastro já está com a unidade aprovada");
    return MUDOU("A unidade mudou no cadastro desde a decisão");
  }
  if (crit === "grupo") {
    if (a.grupo == null || grupoDe(it) === a.grupo) return OK;
    if (d.proposto?.grupo && grupoDe(it) === d.proposto.grupo) return REFLETIDA("O cadastro já está no grupo proposto");
    return MUDOU("O grupo do item mudou no cadastro desde a decisão");
  }
  if (crit === "ncm") {
    if (a.ncm == null && a.cClassTrib == null) return OK;
    const atual = { ncm: soDigitos(it.ncm_original ?? it.ncm), cClassTrib: texto(it.c_class_trib_informado) };
    if ((a.ncm == null || atual.ncm === a.ncm) && (a.cClassTrib == null || atual.cClassTrib === a.cClassTrib)) return OK;
    const p = d.proposto || {}; // já está como proposto: o que a proposta muda tem o valor proposto e o que ela não muda continua como estava
    const ncmOk = p.ncm ? atual.ncm === soDigitos(p.ncm) : a.ncm == null || atual.ncm === a.ncm; const classeOk = p.cClassTrib ? atual.cClassTrib === p.cClassTrib : a.cClassTrib == null || atual.cClassTrib === a.cClassTrib;
    if ((p.ncm || p.cClassTrib) && ncmOk && classeOk) return REFLETIDA("O cadastro já está com o NCM e a classificação propostos");
    return MUDOU("O NCM ou a classificação do item mudaram no cadastro desde a decisão");
  }
  return OK;
}

/** Coerência da decisão de uma chave "código|critério": código repetido na base não tem como ser lido (ambígua); o resto segue coerenciaDaDecisao. */
export function coerenciaDaChave(k, d, indice, decisoes) {
  const { id, crit } = partirChave(k);
  if (indice.repetidos.has(id)) return { estado: "AMBIGUA", ok: false, motivo: `O código ${id} aparece mais de uma vez na base: não dá para saber de qual item é a decisão` };
  return coerenciaDaDecisao(d, crit, indice.porId.get(id), indice, decisoes);
}

/**
 * Confere as decisões guardadas com a base atual (depois de trocar a base, por exemplo): quantas valem como estão, quantas o cadastro já reflete, quais mudaram para outra
 * coisa (não valem até nova avaliação), quais são de itens que não estão na base e quais têm código repetido. Cada lista traz { k, id, crit, status, motivo }.
 */
export function conciliarDecisoes(decisoes, itens) {
  const indice = indexar(itens); const r = { total: 0, ok: 0, refletidas: 0, mudaram: [], ausentes: [], ambiguas: [] };
  for (const [k, d] of Object.entries(decisoes || {})) {
    const { id, crit } = partirChave(k); r.total += 1; const base = { k, id, crit, status: d?.status };
    const c = coerenciaDaChave(k, d, indice, decisoes);
    if (c.estado === "OK") r.ok += 1; else if (c.estado === "REFLETIDA") r.refletidas += 1; else if (c.estado === "MUDOU") r.mudaram.push({ ...base, motivo: c.motivo }); else if (c.estado === "AMBIGUA") r.ambiguas.push({ ...base, motivo: c.motivo }); else r.ausentes.push({ ...base, motivo: c.motivo });
  }
  return r;
}

/**
 * A sugestão de hoje para o achado é diferente da que foi decidida? A aprovação vale só para a alteração decidida (a descrição ou a unidade que estava na decisão): se as regras
 * mudaram e a ferramenta sugere outra coisa agora, a decisão antiga não aprova a nova sugestão.
 */
export function sugestaoMudou(critId, decisao, achado) {
  if (!decisao || achado?.sugerida == null) return false;
  if (critId === "padrao") return decisao.sugerida != null && decisao.sugerida !== achado.sugerida;
  if (critId === "unidade") return decisao.para != null && decisao.para !== achado.sugerida;
  return false;
}
