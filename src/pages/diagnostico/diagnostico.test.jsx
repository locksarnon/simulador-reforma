import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "qa@fal" } }) }));

const DiagnosticosPagina = (await import("./DiagnosticosPagina")).default;
const ProjetoDiagnosticoPagina = (await import("./ProjetoDiagnosticoPagina")).default;
const { caminhoDaFerramenta, cobreGrupoInteiro, nomeSugerido } = await import("@/lib/projetos");
const { opcoesDoSeletor } = await import("@/lib/clientes");
const { valorDoSeletor } = await import("@/pages/Home");

const GRUPOS = [{ id: "G1", numero: "#001", nome: "Família Extra", tipo: "Grupo familiar" }, { id: "G2", numero: "#002", nome: "Beta", tipo: "Cliente individual" }];
const EMPRESAS = [
  { id: "A", razao_social: "EXTRA AGRO LTDA", cnpj_cpf: "58509112000152", grupo: "#001", id_empresa: "58509112", regime_atual: "Lucro Presumido" },
  { id: "B", razao_social: "EXTRA ARMAZÉNS LTDA", cnpj_cpf: "11222333000181", grupo: "#001", id_empresa: "11222333" },
  { id: "C", razao_social: "EXTRA TRANSPORTES LTDA", cnpj_cpf: "45997418000153", grupo: "#001", id_empresa: "45997418" },
  { id: "D", razao_social: "Beta", cnpj_cpf: "12345678000195", grupo: "#002", id_empresa: "12345678" },
];
const PROJETOS = [
  { id: "P1", nome: "Diagnóstico Família Extra 11/2026", grupo_numero: "#001", empresa_ids: ["A", "C"], escopo: "Crédito de estoque e saneamento", situacao: "EM_ANDAMENTO", inicio: "2026-11-11T00:00:00Z", prazo: "2026-10-01T00:00:00Z", responsavel: "Ana" },
  { id: "P2", nome: "Diagnóstico antigo", grupo_numero: "#002", empresa_ids: ["D"], situacao: "CONCLUIDO", inicio: "2026-01-01T00:00:00Z" },
];

function renderizar(elemento, local = "/diagnostico") {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, enabled: false } } });
  qc.setQueryData(["empresas", "carteiras"], EMPRESAS);
  qc.setQueryData(["grupos"], GRUPOS);
  qc.setQueryData(["servicos-contratados"], []);
  qc.setQueryData(["servicos-contratados", "resumo"], {});
  qc.setQueryData(["projetos-diagnostico"], PROJETOS);
  qc.setQueryData(["projetos-diagnostico", "P1"], PROJETOS[0]);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location={local}>{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Diagnósticos: a lista de projetos", () => {
  it("abre com Novo diagnóstico, os projetos em aberto e o atraso marcado", () => {
    const html = renderizar(<DiagnosticosPagina />);
    expect(html).toContain("Novo diagnóstico");
    expect(html).toContain("Diagnóstico Família Extra 11/2026");
    expect(html).toContain("EXTRA AGRO LTDA, EXTRA TRANSPORTES LTDA");
    expect(html).toContain("atrasado");
    expect(html).not.toContain("Diagnóstico antigo"); // concluído não aparece no filtro padrão
    expect(html).toContain("Clientes com diagnóstico");
  });
});

describe("Diagnósticos: o projeto", () => {
  const pagina = () => renderizar(<Routes><Route path="/diagnostico/projetos/:id" element={<ProjetoDiagnosticoPagina />} /></Routes>, "/diagnostico/projetos/P1");
  it("mostra o escopo (parte do grupo), as empresas escolhidas e as ferramentas de cada uma", () => {
    const html = pagina();
    expect(html).toContain("2 empresas · Grupo Família Extra (parte)");
    expect(html).toContain("Crédito de estoque e saneamento");
    expect(html).toContain("EXTRA AGRO LTDA");
    expect(html).toContain("EXTRA TRANSPORTES LTDA");
    expect(html).not.toContain("EXTRA ARMAZÉNS LTDA");
    for (const f of ["XML das notas", "Planilha de operações", "Saneamento de estoques", "XML do repositório"]) expect(html).toContain(f);
    expect(html).toContain("/workroom/G1/empresas/A/importacao-xml");
    expect(html).not.toContain("Painel executivo do grupo inteiro");
  });
});

describe("regras dos projetos e do seletor", () => {
  it("grupo inteiro só quando todas as empresas do grupo estão no escopo", () => {
    expect(cobreGrupoInteiro(PROJETOS[0], EMPRESAS)).toBe(false);
    expect(cobreGrupoInteiro({ ...PROJETOS[0], empresa_ids: ["A", "B", "C"] }, EMPRESAS)).toBe(true);
  });
  it("caminho da ferramenta pelo grupo da empresa; nome sugerido; valor do seletor do painel", () => {
    expect(caminhoDaFerramenta(EMPRESAS[0], GRUPOS, "operacoes")).toBe("/workroom/G1/empresas/A/operacoes");
    expect(caminhoDaFerramenta({ id: "X", grupo: "#9" }, GRUPOS, "operacoes")).toBeNull();
    expect(nomeSugerido("Grupo Família Extra", new Date(2026, 10, 11))).toBe("Diagnóstico Grupo Família Extra 11/2026");
    expect(valorDoSeletor("#001", "58509112")).toBe("e:#001|58509112");
    expect(valorDoSeletor("#001", "")).toBe("g:#001");
    expect(valorDoSeletor("", "")).toBe("");
  });
  it("o seletor mostra só grupos de verdade (o 'Cliente individual' de uma empresa só não aparece como grupo)", () => {
    const { grupos, empresas } = opcoesDoSeletor(GRUPOS, EMPRESAS);
    expect(grupos.map((g) => g.nome)).toEqual(["Família Extra"]);
    expect(empresas).toHaveLength(4);
  });
});
