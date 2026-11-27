import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import AlertasBaseLegal, { paginaDoPortal, urlOficial } from "./AlertasBaseLegal";

const aviso = (url) => ({ id: "a1", tipo: "nova_norma", titulo: "Decreto 13140/2026 citada no Radar e ainda não está na Base legal", origem: "radar", createdAt: "2026-11-12T14:00:00.000Z", url });

function desenhar(alertas) {
  const qc = new QueryClient();
  qc.setQueryData(["base-legal-alertas"], alertas);
  return renderToStaticMarkup(<QueryClientProvider client={qc}><AlertasBaseLegal /></QueryClientProvider>);
}

describe("aviso de norma nova citada no Radar", () => {
  it("página inicial ou lista do portal não é o endereço do ato; a página ou o PDF do ato é", () => {
    expect(paginaDoPortal("https://www.gov.br/receitafederal")).toBe(true);
    expect(paginaDoPortal("https://www.gov.br/receitafederal/pt-br")).toBe(true);
    expect(paginaDoPortal("https://www.cgibs.gov.br")).toBe(true);
    expect(paginaDoPortal("https://www.cgibs.gov.br/atos-tecnicos-conjuntos")).toBe(true);
    expect(paginaDoPortal("https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/D13140.htm")).toBe(false);
    expect(paginaDoPortal("https://www.cgibs.gov.br/upload/arquivos/202610/30102301-atc-10-vf-assinado-assinado-261030-102245.pdf")).toBe(false);
    expect(urlOficial("https://www.gov.br/receitafederal")).toBe(true);
  });

  it("com o endereço do portal guardado pelo Radar, o botão fica desligado e a tela diz o que colar", () => {
    const h = desenhar([aviso("https://www.gov.br/receitafederal")]);
    expect(h).toMatch(/<button type="button" disabled=""[^>]*>.*Incluir na base/);
    expect(h).toContain("página inicial (ou de uma lista) do portal");
  });

  it("com o endereço do próprio ato, o botão fica ligado e não há aviso; o texto antigo de PDF não suportado saiu", () => {
    const h = desenhar([aviso("https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/D13140.htm")]);
    expect(h).not.toMatch(/<button type="button" disabled=""[^>]*>.*Incluir na base/);
    expect(h).not.toContain("página inicial (ou de uma lista)");
    expect(h).not.toContain("PDF ainda não é suportado");
  });
});
