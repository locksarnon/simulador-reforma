import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import RegrasEstaduais from "./RegrasEstaduais";

const UFS = [
  {
    uf: "PA", nome: "Pará", documentos: [
      { chave: "pa-lei-5530-1989", botao: "Lei do ICMS", numero: "Lei 5.530/1989 (PA)", titulo: "Lei do ICMS do Pará", url: "https://www.sefa.pa.gov.br/legislacao/interna/lei/lp1989_05530.pdf", conferida_em: "2026-11-30T08:10:00.000Z", mudou_em: null },
      { chave: "pa-dec-4676-2001", botao: "RICMS", numero: "Decreto 4.676/2001 (PA)", titulo: "Regulamento do ICMS do Pará (RICMS/PA)", url: "https://www.sefa.pa.gov.br/legislacao/interna/decreto/dc2001_04676.pdf", conferida_em: "2026-11-30T08:10:00.000Z", mudou_em: "2026-11-30T08:10:00.000Z" },
    ],
  },
  { uf: "SP", nome: "São Paulo", documentos: [] },
];

function desenhar(props) {
  const qc = new QueryClient();
  qc.setQueryData(["base-legal-regras-estaduais"], UFS);
  return renderToStaticMarkup(<QueryClientProvider client={qc}><MemoryRouter><RegrasEstaduais {...props} /></MemoryRouter></QueryClientProvider>);
}

describe("regras estaduais: um botão por UF", () => {
  it("mostra os botões das UFs e, sem UF escolhida, nenhum documento", () => {
    const h = desenhar({ uf: "" });
    expect(h).toContain("Regras estaduais");
    expect(h).toContain(">PA</button>");
    expect(h).toContain(">SP</button>");
    expect(h).not.toContain("href=");
  });

  it("a UF escolhida mostra um botão por norma, que abre o documento oficial em outra aba, e avisa o que mudou", () => {
    const h = desenhar({ uf: "PA" });
    expect(h).toContain('aria-pressed="true"');
    expect(h).toContain('href="https://www.sefa.pa.gov.br/legislacao/interna/decreto/dc2001_04676.pdf"');
    expect(h).toContain('target="_blank"');
    expect(h).toContain("RICMS");
    expect(h).toContain("Lei do ICMS");
    expect(h).toContain("mudou em 30/11/2026");
    expect(h).toContain("conferido em 30/11/2026");
  });

  it("UF ainda sem documento cadastrado diz isso", () => {
    expect(desenhar({ uf: "SP" })).toContain("Ainda sem documento oficial cadastrado para São Paulo.");
  });
});
