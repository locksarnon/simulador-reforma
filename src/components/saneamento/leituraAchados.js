// "Como é" e "como seria" de cada achado, para a tela de Análises e para o Excel: o que o cadastro tem hoje, o que a ferramenta sugere e por quê.
// Cada lado é uma lista de linhas { rotulo, valor, destaque }. Só SUGERE: nada é alterado no cadastro. Funções puras (sem React).
import { GRANDEZAS, numeroBr } from "./unidades";
import { dataBr } from "./logica";

export const NIVEL_ROT = { EXATA: "Idêntico", MUITO_PROVAVEL: "Indicação alta", POSSIVEL: "Indicação possível" };
const L = (rotulo, valor, destaque = false) => ({ rotulo, valor, destaque });
const num2 = (n) => Number(n).toFixed(2).replace(".", ",");

/** NCM com pontos (12092100 → 1209.21.00); o que não tem 8 dígitos fica como veio. */
export const formatarNcm = (v) => { const s = String(v ?? "").trim(); return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6)}` : s; };

/** Dados de apoio do item, lidos da base (só o que existe): unidade, NCM, última movimentação e saldo. `escala` divide o saldo (a base da Crestani vem ×1.000.000). */
export function dadosDoItem(it, escala = 1) {
  const d = [];
  if (it.unidade) d.push(["Unidade", String(it.unidade)]);
  const ncm = it.ncm || it.ncm_original; if (ncm) d.push(["NCM", formatarNcm(ncm)]);
  if (it.ultima_mov) d.push(["Últ. mov.", dataBr(it.ultima_mov)]);
  if (it.saldo != null && Number.isFinite(Number(it.saldo))) d.push(["Saldo", numeroBr(Number(it.saldo) / (escala || 1))]);
  return d;
}

/** Linhas de um lado da leitura em texto ("Rótulo: valor" por linha), para o Excel. */
export const textoLinhas = (linhas) => linhas.map((l) => (l.rotulo ? `${l.rotulo}: ${l.valor}` : l.valor)).join("\n");

function leituraUnidade(a, escala) {
  const it = a.item; const raw = String(it.unidade ?? "").trim(); const e = a.extra; const nome = raw.toUpperCase();
  const como = [L("Unidade de estoque", raw || "(sem unidade)")];
  if (!a.sugerida) return { como, seria: [L("Unidade de estoque", raw ? "classificar a unidade na tabela de unidades (passo Critérios)" : "informar a unidade de estoque")], porque: a.motivo || "" };
  if (e?.tipo !== "conversao") return { como, seria: [L("Unidade de estoque", a.sugerida, true)], porque: `A mesma unidade está escrita de outra forma; o padrão do projeto é ${a.sugerida}.` };
  const medida = GRANDEZAS[e.grandeza]?.rotulo.toLowerCase() ?? "medida";
  const embalagem = e.nivel === "embalagem";
  como.push(L("Medida", `${medida}${embalagem ? " (embalagem)" : ""}`));
  const fator = e.fator != null ? `1 ${nome} = ${numeroBr(e.fator)} ${a.sugerida}${e.evidencia === "descricao" ? " (lido da descrição: confirmar)" : e.evidencia === "regra" ? " (regra do projeto)" : ""}` : `1 ${nome} = ? ${a.sugerida} (a informar)`;
  const seria = [L("Unidade de estoque", a.sugerida, true), L("Unidade de compra", nome), L("Itens por unidade de compra", fator)];
  const saldo = it.saldo != null && Number.isFinite(Number(it.saldo)) ? Number(it.saldo) / (escala || 1) : null;
  if (saldo != null && e.fator != null) { como.push(L("Saldo", `${numeroBr(saldo)} ${nome}`)); seria.push(L("Saldo", `${numeroBr(saldo * e.fator)} ${a.sugerida}`)); }
  const lead = embalagem ? `Embalagem de ${medida}` : `${nome} é maior que a unidade padrão de ${medida}`;
  const dica = e.fator == null ? " Se todos os itens em " + nome + " tiverem o mesmo conteúdo, informe-o uma vez na tabela de unidades (passo Critérios)." : "";
  return { como, seria, porque: `${lead}: o estoque passa a ser controlado em ${a.sugerida} e ${embalagem ? "a embalagem" : nome} vira unidade de compra.${dica}` };
}

function leituraDuplicidade(a, itemPorLinha) {
  const it = a.item; const dup = it.duplicidade;
  if (!dup) return { como: [L("Indicação", "duplicidade apontada pelo teste")], seria: [L("Ação", "confirmar se é o mesmo produto")], porque: a.motivo || "" };
  const cands = dup.candidatos || [];
  const nomes = cands.slice(0, 3).map((c) => { const o = itemPorLinha?.get(c.linha); return o ? `${o.codigo || `linha ${c.linha}`}${o.descricao ? ` · ${o.descricao}` : ""}` : `linha ${c.linha}`; });
  const como = [L("Parecido com", nomes.length ? nomes.join(" | ") + (cands.length > nomes.length ? ` (+${cands.length - nomes.length})` : "") : "—"), L("Indicação", `${NIVEL_ROT[dup.nivel] ?? dup.nivel} · similaridade ${num2(dup.score)}`)];
  const m = dup.mestre; const o = m != null ? itemPorLinha?.get(m) : null;
  const seria = m == null ? [L("Ação", "confirmar se é o mesmo produto")]
    : m === it.linha ? [L("Ação", "manter este código", true)]
      : [L("Ação", `unificar no código ${o?.codigo ?? `da linha ${m}`}`, true), ...(o?.descricao ? [L("Fica", o.descricao)] : [])];
  return { como, seria, porque: (cands[0]?.motivos || []).join("; ") || a.motivo || "" };
}

function leituraNcm(a) {
  const it = a.item; const atual = it.ncm_original || it.ncm || "";
  const como = [L("NCM", atual ? formatarNcm(atual) : "(vazio)")];
  if (it.c_class_trib_informado) como.push(L("cClassTrib informado", String(it.c_class_trib_informado)));
  const seria = [];
  if (it.ncm && it.ncm_original && it.ncm !== it.ncm_original) seria.push(L("NCM", formatarNcm(it.ncm), true));
  if (it.sugestao?.c_class_trib) seria.push(L("cClassTrib sugerido", String(it.sugestao.c_class_trib), true));
  if (!seria.length) seria.push(L("Ação", "revisar o NCM e a classificação (sem sugestão automática)"));
  return { como, seria, porque: a.motivo || "" };
}

/**
 * Leitura de um achado: { como, seria, porque }. `crit` é o critério; `a` é { item, motivo, sugerida, extra } (o que o teste devolveu).
 * `itemPorLinha` (Map) resolve os itens parecidos da duplicidade; `escala` divide o saldo.
 */
export function leituraAchado(crit, a, { itemPorLinha, escala = 1 } = {}) {
  const it = a.item;
  switch (crit.id) {
    case "unidade": return leituraUnidade(a, escala);
    case "padrao": return { como: [L("Descrição", it.descricao || "(vazia)")], seria: [L("Descrição", a.sugerida ?? "", true)], porque: a.motivo || "" };
    case "duplicidade": return leituraDuplicidade(a, itemPorLinha);
    case "grupo": return { como: [L("Grupo", it.grupo_atual || "(sem grupo)")], seria: [L("Grupo", it.grupo_sugerido || "—", true)], porque: it.grupo_evidencia || a.motivo || "" };
    case "ncm": return leituraNcm(a);
    case "utilizacao": return { como: [L("Última movimentação", "sem data legível")], seria: [L("Ação", "obter a data com o cliente (ou tratar como anterior ao corte, no parâmetro de saneamento)")], porque: a.motivo || "" };
    case "descricao": {
      const falta = [...(!it.descricao ? [L("Ação", "informar a descrição (NOME + REFERÊNCIA + COMPLEMENTO)", true)] : []), ...(!it.codigo ? [L("Ação", "informar o código", true)] : [])];
      return { como: [L("Descrição", it.descricao || "(vazia)"), L("Código", it.codigo || "(vazio)")], seria: falta.length ? falta : [L("Ação", "revisar")], porque: a.motivo || "" };
    }
    default: return { como: [L("Achado", a.motivo || "")], seria: a.sugerida ? [L("Sugestão", a.sugerida, true)] : [], porque: "" };
  }
}
