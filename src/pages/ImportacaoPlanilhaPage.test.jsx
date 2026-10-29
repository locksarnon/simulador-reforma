import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Routes, Route, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ImportacaoPlanilhaPage from "./ImportacaoPlanilhaPage";

const renderizar = (caminho, contexto) => {
  const qc = new QueryClient();
  qc.setQueryData(["grupo", "grupo-a"], { numero: "G1", nome: "Grupo A" });
  qc.setQueryData(["empresas", "G1"], []);
  return renderToString(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[caminho]}>
        <Routes>
          <Route path="/workroom/:id" element={<Outlet context={contexto} />}>
            <Route path="importacao-planilha" element={<ImportacaoPlanilhaPage />} />
            <Route path="empresas/:empresaId/importacao-planilha" element={<ImportacaoPlanilhaPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("página de importação de operações por planilha", () => {
  it("no grupo: mostra o modelo, o primeiro passo e a trilha, e ainda não mostra o mapeamento de colunas", () => {
    const html = renderizar("/workroom/grupo-a/importacao-planilha", { grupo: { numero: "G1", nome: "Grupo A" } });
    expect(html).toContain("Importar operações por planilha");
    expect(html).toContain("Baixar modelo (.xlsx)");
    expect(html).toContain("1. Escolha a planilha");
    expect(html).toContain("Escolher .xlsx ou .csv");
    expect(html).toContain("Grupo A");
    expect(html).not.toContain("2. Qual coluna é cada campo?");
    expect(html).not.toContain("Conferir a planilha");
  });

  it("dentro de uma empresa: a planilha toda é dela e há o atalho para importar pelo grupo", () => {
    const html = renderizar("/workroom/grupo-a/empresas/emp-1/importacao-planilha", {
      grupo: { numero: "G1", nome: "Grupo A" }, empresa: { id: "emp-1", id_empresa: "TRANSP-01", razao_social: "Transportadora Exemplo" },
    });
    expect(html).toContain("TRANSP-01");
    expect(html).toContain("/workroom/grupo-a/importacao-planilha");
    expect(html).toContain("Importe pelo grupo");
  });
});
