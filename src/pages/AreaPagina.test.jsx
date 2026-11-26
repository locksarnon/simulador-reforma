import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const usuario = { current: { id: "u1", email: "ana@fal.test", name: "Ana", role: "admin" } };
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: usuario.current }) }));

const { default: AreaPagina } = await import("./AreaPagina");
const { areaPorId } = await import("@/lib/navegacao");
const { temTela } = await import("@/lib/permissoes");

function desenhar(caminho) {
  const qc = new QueryClient();
  qc.setQueryData(["base-legal-normas"], [{ chave: "lcp-214-2025", numero: "LC 214/2025", total_dispositivos: 609, formato: "html" }]);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[caminho]}><Routes><Route path="/area/:areaId" element={<AreaPagina />} /></Routes></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("página da área", () => {
  it("a área das normas chama-se Bases legais no menu", () => {
    expect(areaPorId("conhecimento").titulo).toBe("Bases legais");
  });

  it("Bases legais abre com a barra de consulta em todas as normas (busca e IA), antes dos cartões das telas", () => {
    expect(temTela(usuario.current, "base-legal")).toBe(true);
    const h = desenhar("/area/conhecimento");
    expect(h).toContain("Bases legais");
    expect(h).toContain("Consultar as bases legais");
    expect(h).toContain("procura o texto em todas as normas carregadas (1)");
    expect(h).toContain("Resposta com IA: ligada");
    expect(h.indexOf("Consultar as bases legais")).toBeLessThan(h.indexOf("Base legal e assistente"));
  });

  it("as outras áreas não têm a barra", () => {
    expect(desenhar("/area/comercial")).not.toContain("Consultar as bases legais");
  });
});
