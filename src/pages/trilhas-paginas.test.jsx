/** Trilha de navegação nas telas da Consultoria: a mesma hierarquia (Início > área > carteira > cliente > projeto > tela) em todas. */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { Route, Routes } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "a@b.c" } }) }));

import ConsultoriaPagina from "@/pages/ConsultoriaPagina";
import ProjetoDiagnosticoPagina from "@/pages/diagnostico/ProjetoDiagnosticoPagina";
import SaneamentoEstoquesPagina from "@/pages/saneamento-estoques/SaneamentoEstoquesPagina";
import RoteiroSaneamentoPagina from "@/pages/saneamento-estoques/RoteiroSaneamentoPagina";

const EMPRESAS = [{ id: "e1", razao_social: "AGROPECUARIA CRESTANI LTDA", cnpj_cpf: "58509112000152", grupo: "#001", id_empresa: "58509112" }];
const PROJETO = { id: "p9", nome: "Saneamento de estoques com foco em IBS e CBS · AGROPECUARIA CRESTANI LTDA", servico_consultoria: "saneamento-estoques", empresa_ids: ["e1"], situacao: "EM_ANDAMENTO", periodo_inicio: "2026-12-31T00:00:00Z" };
const CATALOGO = [{ id: "saneamento-estoques", nome: "Saneamento de estoques com foco em IBS e CBS", publico: "PJ", area: "Estoques", projeto: true }];

function renderizar(caminho, rota, elemento) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, enabled: false } } });
  qc.setQueryData(["empresas", "carteiras"], EMPRESAS);
  qc.setQueryData(["empresas", "todas"], EMPRESAS);
  qc.setQueryData(["grupos"], []);
  qc.setQueryData(["servicos-contratados"], []);
  qc.setQueryData(["servicos-contratados", "resumo"], {});
  qc.setQueryData(["pessoas-fisicas"], []);
  qc.setQueryData(["consultoria", "catalogo"], CATALOGO);
  qc.setQueryData(["consultoria", "vinculos"], [{ publico: "PJ", cliente_id: "e1", servico: "saneamento-estoques" }]);
  qc.setQueryData(["projetos-diagnostico"], [PROJETO]);
  qc.setQueryData(["projetos-diagnostico", "p9"], PROJETO);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location={caminho}><Routes><Route path={rota} element={elemento} /></Routes></StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

/** A trilha do cabeçalho: [rótulo, link] de cada item (a tela aberta, e o que levaria a ela, sem link). */
function trilha(html) {
  const nav = html.match(/<nav aria-label="breadcrumb"[\s\S]*?<\/nav>/)?.[0] || "";
  return [...nav.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>|<span [^>]*>([^<]*)<\/span>/g)]
    .map((m) => (m[3] !== undefined ? [m[3], null] : [m[2], m[1].replace(/&amp;/g, "&")]));
}
/** Rótulo marcado como a tela aberta (aria-current): só o último item. */
const telaAberta = (html) => [...(html.match(/<nav aria-label="breadcrumb"[\s\S]*?<\/nav>/)?.[0] || "").matchAll(/aria-current="page"[^>]*>([^<]*)</g)].map((m) => m[1]);
const rotulos = (t) => t.map(([r]) => r).join(" > ");
const BASE = "Início > Consultoria Tributária > Carteira de Consultoria > AGROPECUARIA CRESTANI LTDA";

describe("trilha de navegação da Consultoria", () => {
  it("página do cliente", () => {
    const t = trilha(renderizar("/consultoria/carteira/PJ/e1", "/consultoria/carteira/:tipoCliente/:clienteId", <ConsultoriaPagina carteira />));
    expect(rotulos(t)).toBe(BASE);
    expect(t.map(([, to]) => to)).toEqual(["/inicio", "/area/diagnostico", "/consultoria/carteira", null]);
  });

  it("página do projeto: o cliente pelo nome, com link, e o projeto sem repetir o cliente", () => {
    const t = trilha(renderizar("/diagnostico/projetos/p9", "/diagnostico/projetos/:id", <ProjetoDiagnosticoPagina />));
    expect(rotulos(t)).toBe(`${BASE} > Saneamento de estoques com foco em IBS e CBS`);
    expect(t[3][1]).toBe("/consultoria/carteira/PJ/e1");
    expect(t[4][1]).toBeNull();
  });

  it("saneamento: a fase e a aba do endereço no fim da trilha, e o projeto levando à ferramenta (não à página que só redireciona)", () => {
    const html = renderizar("/diagnostico/projetos/p9/saneamento?fase=1&aba=casos", "/diagnostico/projetos/:id/saneamento", <SaneamentoEstoquesPagina />);
    const t = trilha(html);
    expect(rotulos(t)).toBe(`${BASE} > Saneamento de estoques com foco em IBS e CBS > Fase 1 > 1.3 Casos`);
    expect(t.slice(3).map(([, to]) => to)).toEqual(["/consultoria/carteira/PJ/e1", "/diagnostico/projetos/p9/saneamento", "/diagnostico/projetos/p9/saneamento?fase=1", null]);
    expect(telaAberta(html)).toEqual(["1.3 Casos"]);
    const t2 = trilha(renderizar("/diagnostico/projetos/p9/saneamento?fase=2&aba=analise", "/diagnostico/projetos/:id/saneamento", <SaneamentoEstoquesPagina />));
    expect(rotulos(t2)).toMatch(/com foco em IBS e CBS > Fase 2 > 2\.2 Análise$/);
    expect(t2[5][1]).toBe("/diagnostico/projetos/p9/saneamento?fase=2");
  });

  it("saneamento na tela em que o projeto abre (Fase 1 > 1.1): nenhum item leva à mesma tela", () => {
    const html = renderizar("/diagnostico/projetos/p9/saneamento?fase=1&aba=preparar", "/diagnostico/projetos/:id/saneamento", <SaneamentoEstoquesPagina />);
    const t = trilha(html);
    expect(rotulos(t)).toBe(`${BASE} > Saneamento de estoques com foco em IBS e CBS > Fase 1 > 1.1 Preparar e diretrizes`);
    // O cliente continua levando à página dele; o projeto e a Fase 1 ficam sem link (o clique não mudaria nada).
    expect(t.slice(3).map(([, to]) => to)).toEqual(["/consultoria/carteira/PJ/e1", null, null, null]);
    expect(telaAberta(html)).toEqual(["1.1 Preparar e diretrizes"]);
    // Em outra fase, na primeira aba dela: a fase sem link, o projeto com link (leva à fase em andamento).
    const t2 = trilha(renderizar("/diagnostico/projetos/p9/saneamento?fase=2&aba=premissas", "/diagnostico/projetos/:id/saneamento", <SaneamentoEstoquesPagina />));
    expect(t2.slice(4).map(([, to]) => to)).toEqual(["/diagnostico/projetos/p9/saneamento", null, null]);
  });

  it("roteiro do projeto", () => {
    const t = trilha(renderizar("/diagnostico/projetos/p9/saneamento/roteiro", "/diagnostico/projetos/:id/saneamento/roteiro", <RoteiroSaneamentoPagina />));
    expect(rotulos(t)).toBe(`${BASE} > Saneamento de estoques com foco em IBS e CBS > Roteiro do projeto`);
    expect(t[4][1]).toBe("/diagnostico/projetos/p9/saneamento");
    expect(t[5][1]).toBeNull();
  });
});

describe("projeto de Saneamento abre direto na ferramenta (sem a página do projeto)", () => {
  it("o cartão do projeto na página do cliente leva direto ao Saneamento", () => {
    const html = renderizar("/consultoria/carteira/PJ/e1", "/consultoria/carteira/:tipoCliente/:clienteId", <ConsultoriaPagina carteira />);
    expect(html).toContain('href="/diagnostico/projetos/p9/saneamento"');
    expect(html).not.toContain('href="/diagnostico/projetos/p9"');
  });

  it("os dados do projeto (situação, data-base, documentos, exclusão) ficam no cabeçalho do Saneamento", () => {
    const html = renderizar("/diagnostico/projetos/p9/saneamento?fase=1&aba=casos", "/diagnostico/projetos/:id/saneamento", <SaneamentoEstoquesPagina />);
    expect(html).toContain("Dados do projeto");
  });
});
