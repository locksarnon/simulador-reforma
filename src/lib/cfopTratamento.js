/** Tratamento de CFOP no cálculo (a lista-padrão vem da API; o ajuste da empresa vale mais). */

export const TRATAMENTO_ROTULO = {
  RECEITA: "Entra (receita)",
  NAO_RECEITA: "Fora do cálculo",
  DEVOLUCAO_VENDA: "Devolução de venda (−)",
  COMPRA: "Compra (crédito)",
  NAO_CLASSIFICADO: "Não classificado",
};

export const TRATAMENTO_COR = {
  RECEITA: "bg-emerald-100 text-emerald-800 border-emerald-200",
  NAO_RECEITA: "bg-gray-100 text-gray-600 border-gray-300 line-through decoration-gray-400",
  DEVOLUCAO_VENDA: "bg-orange-100 text-orange-800 border-orange-200",
  COMPRA: "bg-cyan-100 text-cyan-800 border-cyan-200",
  NAO_CLASSIFICADO: "bg-amber-100 text-amber-800 border-amber-200",
};

export const somenteDigitos = (v) => String(v ?? "").replace(/\D/g, "").slice(0, 4);

/** { tratamento, origem: "empresa" | "padrao" } de um item. */
export function tratamentoDoItem(regras, empresaId, cfopRaw, direcao) {
  const cfop = somenteDigitos(cfopRaw);
  const ajuste = regras?.empresas?.[empresaId]?.[cfop];
  if (ajuste) return { tratamento: ajuste, origem: "empresa" };
  const padrao = regras?.padrao?.[cfop]?.tratamento;
  if (padrao) return { tratamento: padrao, origem: "padrao" };
  if (direcao === "Entrada" || /^[123]/.test(cfop)) return { tratamento: "COMPRA", origem: "padrao" };
  return { tratamento: "NAO_CLASSIFICADO", origem: "padrao" };
}

/** Só o que gera receita/entra no cálculo é marcado por padrão; "fora do cálculo" fica desmarcado. */
export const entraNoCalculo = (tratamento) => tratamento !== "NAO_RECEITA";
