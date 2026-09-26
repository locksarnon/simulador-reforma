/**
 * Alíquotas do sistema atual para preenchimento assistido da operação manual.
 * Só entram valores de lei nacional, conferidos; ICMS interno varia por UF/produto e NÃO é sugerido.
 * O usuário sempre pode alterar o valor depois de aplicar.
 */

export const TABELA_PIS_COFINS = {
  "Lucro Real": {
    pis: 0.0165, cofins: 0.076,
    base: "Regime não cumulativo: PIS 1,65% (Lei 10.637/2002) e Cofins 7,6% (Lei 10.833/2003).",
  },
  "Lucro Presumido": {
    pis: 0.0065, cofins: 0.03,
    base: "Regime cumulativo: PIS 0,65% (Lei 9.715/1998) e Cofins 3,0% (Lei 9.718/1998).",
  },
  "Simples Nacional": {
    pis: 0, cofins: 0,
    base: "No Simples, PIS/Cofins vão dentro do DAS (LC 123/2006), sem alíquota própria na nota.",
  },
  "Produtor rural PF": {
    pis: 0, cofins: 0,
    base: "Produtor rural pessoa física não recolhe PIS/Cofins nas vendas diretas.",
  },
};

const SUL_SUDESTE_SEM_ES = new Set(["SP", "RJ", "MG", "PR", "SC", "RS"]);

/**
 * ICMS interestadual (Resolução do Senado 22/1989; 13/2012 para importados):
 * 12% como regra; 7% quando a origem é Sul/Sudeste (exceto ES) e o destino é Norte, Nordeste, Centro-Oeste ou ES.
 */
export function icmsInterestadual(ufOrigem, ufDestino) {
  const o = String(ufOrigem || "").toUpperCase();
  const d = String(ufDestino || "").toUpperCase();
  if (!o || !d || o === d) return null;
  const destinoMenosDesenvolvido = !SUL_SUDESTE_SEM_ES.has(d);
  const aliquota = SUL_SUDESTE_SEM_ES.has(o) && destinoMenosDesenvolvido ? 0.07 : 0.12;
  return {
    icms: aliquota,
    base: `Operação interestadual ${o}→${d}: ${aliquota === 0.07 ? "7% (origem Sul/Sudeste, destino N/NE/CO/ES)" : "12%"} — Resolução do Senado 22/1989. Bens importados: 4% (Res. 13/2012).`,
  };
}

/** Sugestão de tributos atuais a partir do regime e das UFs da operação. */
export function sugerirTributosAtuais({ regime_atual, uf_origem, uf_destino }) {
  const t = TABELA_PIS_COFINS[regime_atual];
  const ic = icmsInterestadual(uf_origem, uf_destino);
  return {
    pis_pct: t?.pis,
    cofins_pct: t?.cofins,
    ...(ic ? { icms_pct: ic.icms } : {}),
    explicacao: [t?.base, ic?.base, ic ? null : "ICMS: alíquota interna depende da UF e do produto — informe conforme o RICMS."].filter(Boolean),
  };
}
