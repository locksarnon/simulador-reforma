import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const papel = vi.hoisted(() => ({ atual: "admin" }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "A1", role: papel.atual, email: "admin@fal" } }) }));

const CarteiraColaboradoresPagina = (await import("./CarteiraColaboradoresPagina")).default;
const { PorColaborador, SemColaborador, diferenca } = await import("./CarteiraColaboradoresPagina");

const EMPRESAS = [
  { id: "E1", id_empresa: "EXTRA-AGRO", razao_social: "EXTRA AGRO LTDA", cnpj_cpf: "58.509.112/0001-52" },
  { id: "E2", id_empresa: "EMP-2", razao_social: "Beta Comércio SA", cnpj_cpf: null },
  { id: "E3", id_empresa: "EMP-3", razao_social: "Gama Serviços Ltda", cnpj_cpf: null },
];
const COLABORADORES = [
  { id: "A1", email: "admin@fal", name: "Admin", empresa_ids: [] },
  { id: "U1", email: "maria@fal", name: "Maria", empresa_ids: ["E1", "E2"] },
];

function renderizar(elemento, { colaboradores = COLABORADORES, empresas = EMPRESAS, sem = [] } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["carteira", "colaboradores"], colaboradores);
  qc.setQueryData(["empresas", "carteiras"], empresas);
  qc.setQueryData(["carteira", "sem-colaborador"], sem);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/">{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Carteira e colaboradores", () => {
  it("lista os colaboradores com quantas empresas atendem e pede para escolher um", () => {
    papel.atual = "admin";
    const html = renderizar(<CarteiraColaboradoresPagina />);
    expect(html).toContain('aria-label="Colaboradores"');
    expect(html).toContain("Maria");
    expect(html).toContain("2 empresas");
    expect(html).toContain("0 empresas");
    expect(html).toContain("Escolha um colaborador.");
    expect(html).toContain("Por colaborador");
    expect(html).toContain("Empresas sem colaborador");
  });

  it("não-administrador só consulta: o texto diz que só administradores alteram", () => {
    papel.atual = "user";
    const html = renderizar(<CarteiraColaboradoresPagina />);
    expect(html).toContain("Só administradores alteram.");
    papel.atual = "admin";
  });

  it("calcula quantas empresas entram e quantas saem da carteira antes de salvar", () => {
    expect(diferenca(["E1", "E2"], ["E1", "E2"])).toEqual({ entram: 0, saem: 0 });
    expect(diferenca(["E1", "E2"], ["E2", "E3"])).toEqual({ entram: 1, saem: 1 });
    expect(diferenca([], ["E1", "E2", "E3"])).toEqual({ entram: 3, saem: 0 });
    expect(diferenca(["E1"], [])).toEqual({ entram: 0, saem: 1 });
  });

  it("PorColaborador sem ninguém escolhido não mostra empresas nem o botão Salvar", () => {
    const html = renderizar(<PorColaborador colaboradores={COLABORADORES} empresas={EMPRESAS} ehAdmin />);
    expect(html).not.toContain("Salvar carteira");
    expect(html).not.toContain("EXTRA AGRO LTDA");
  });
});

describe("Empresas sem colaborador", () => {
  it("lista as empresas que ninguém atende e deixa atribuir em lote (só administrador)", () => {
    const html = renderizar(<SemColaborador colaboradores={COLABORADORES} ehAdmin />, { sem: [EMPRESAS[2]] });
    expect(html).toContain("Gama Serviços Ltda");
    expect(html).toContain("1 empresa sem colaborador.");
    expect(html).toContain("Atribuir as marcadas a");
    expect(html).toContain('aria-label="Marcar Gama Serviços Ltda"');
    const leitura = renderizar(<SemColaborador colaboradores={COLABORADORES} ehAdmin={false} />, { sem: [EMPRESAS[2]] });
    expect(leitura).not.toContain("Atribuir as marcadas a");
    expect(leitura).not.toContain('aria-label="Marcar Gama Serviços Ltda"');
  });

  it("quando todas têm colaborador, diz isso em vez de mostrar uma lista vazia", () => {
    const html = renderizar(<SemColaborador colaboradores={COLABORADORES} ehAdmin />, { sem: [] });
    expect(html).toContain("Todas as empresas têm pelo menos um colaborador.");
  });
});
