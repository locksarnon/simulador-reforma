import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const usuario = { current: { id: "u1", email: "ana@fal.test", name: "Ana", role: "admin" } };
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: usuario.current }) }));

const { default: NormasMonitoradasPagina } = await import("./NormasMonitoradasPagina");
const { moduloDoCaminho } = await import("@/lib/navegacao");

const NORMAS = [
  { chave: "lcp-214-2025", numero: "LC 214/2025", titulo: "Institui o IBS, a CBS e o Imposto Seletivo", grupo: "reforma", formato: "html", leitura: "texto", uf: null, monitorar: true, capturada_em: "2026-11-30T08:00:00.000Z", atualizada_em: null },
  { chave: "pa-dec-4676-2001", numero: "Decreto 4.676/2001 (PA)", titulo: "Regulamento do ICMS do Pará (RICMS/PA)", grupo: "territorial", formato: "externo", leitura: "referencia", uf: "PA", monitorar: true, capturada_em: null, atualizada_em: null },
  { chave: "in-rfb-2121-2022", numero: "IN RFB 2.121/2022", titulo: "PIS/Cofins (consolidação)", grupo: "operacional", formato: "externo", leitura: "referencia", uf: null, monitorar: false, capturada_em: null, atualizada_em: null },
];

/** A caixa Monitorar de uma norma, como saiu no HTML (os atributos podem vir em qualquer ordem). */
const caixa = (h, numero) => (h.match(/<input[^>]*>/g) || []).find((t) => t.includes(`aria-label="Monitorar ${numero}"`)) || "";

function desenhar() {
  const qc = new QueryClient();
  qc.setQueryData(["base-legal-monitoramento"], NORMAS);
  return renderToStaticMarkup(<QueryClientProvider client={qc}><MemoryRouter initialEntries={["/admin/normas-monitoradas"]}><NormasMonitoradasPagina /></MemoryRouter></QueryClientProvider>);
}

describe("normas monitoradas (Administração > Parâmetros e rotinas)", () => {
  it("lista as normas com a caixa Monitorar marcada como está gravado e o resumo da seleção", () => {
    const h = desenhar();
    expect(h).toContain("Normas monitoradas");
    expect(h).toContain("Monitoramento das empresas");
    expect(h).toContain("2 normas marcadas de 3");
    expect(caixa(h, "LC 214/2025")).toContain('checked=""');
    expect(caixa(h, "IN RFB 2.121/2022")).not.toContain("checked");
    expect(caixa(h, "LC 214/2025")).not.toContain("disabled");
    expect(h).toContain("Documento oficial (só referência)");
    expect(h).toContain("Texto por artigo");
    expect(h).toContain("Marcar todas");
    expect(h).toContain("Desmarcar todas");
  });

  it("quem não é administrador vê a lista, mas não altera", () => {
    usuario.current = { ...usuario.current, role: "user", nivel: "GESTOR" };
    try {
      const h = desenhar();
      expect(h).toContain("Só um administrador altera a lista.");
      expect(h).not.toContain("Marcar todas");
      expect(caixa(h, "LC 214/2025")).toContain('disabled=""');
    } finally {
      usuario.current = { ...usuario.current, role: "admin", nivel: undefined };
    }
  });

  it("a tela fica dentro do módulo Parâmetros e rotinas (a Administração tem no máximo 7 itens no menu)", () => {
    expect(moduloDoCaminho("/admin/normas-monitoradas")?.id).toBe("parametros-rotinas");
  });
});
