import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RegimesPagina from "./RegimesPagina";

const PARAMETROS = [
  { ano: 2027, pis_cofins_fator: 0, ipi_fator_geral: 0, icms_fator: 1, iss_fator: 1, ibs_efetivo: 0.001, cbs_efetiva: 0.112, ibs_uf_aliquota: 0, ibs_mun_aliquota: 0, efeito_financeiro: 1 },
  { ano: 2033, pis_cofins_fator: 0, ipi_fator_geral: 0, icms_fator: 0, iss_fator: 0, ibs_efetivo: 0.1, cbs_efetiva: 0.088, ibs_uf_aliquota: 0, ibs_mun_aliquota: 0, efeito_financeiro: 1 },
];

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["publicParametrosTransicao"], PARAMETROS);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/reforma/regimes"><RegimesPagina /></StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Onde cada regime vence", () => {
  it("mostra os dados da empresa, quem vence, a tabela ano a ano, o mapa e o aviso do que fica de fora", () => {
    const html = renderizar();
    for (const t of ["Perfil da atividade", "Faturamento anual (R$)", "DAS efetivo no Simples", "Quem tem a menor carga sobre o consumo", "Carga sobre o consumo, ano a ano", "Mapa de 2033", "Compara só os tributos sobre o consumo", "IRPJ, CSLL"]) expect(html).toContain(t);
    expect(html).toContain('aria-label="Carga por regime e ano"');
    expect(html).toContain('aria-label="Regime vencedor em 2033 por compras e crédito"');
    expect(html).toMatch(/2027/);
  });
});
