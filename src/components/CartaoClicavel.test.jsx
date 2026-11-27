import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import CartaoClicavel from "./CartaoClicavel";

const desenhar = (props) => renderToStaticMarkup(<MemoryRouter><CartaoClicavel titulo="Saneamento de estoques com foco em IBS e CBS" detalhe="Data-base 31/10/2026 · Em coleta de documentos" {...props} /></MemoryRouter>);

describe("cartão inteiro clicável", () => {
  it("o link da ação cobre o cartão inteiro (clicar em qualquer ponto abre o projeto) e o foco contorna o cartão", () => {
    const h = desenhar({ acao: "Continuar projeto", para: "/diagnostico/projetos/p1" });
    expect(h).toMatch(/<article class="group relative [^"]*hover:bg-primary\/5[^"]*focus-within:ring-2/);
    expect(h).toMatch(/<a class="[^"]*after:absolute after:inset-0[^"]*" href="\/diagnostico\/projetos\/p1">Continuar projeto<\/a>/);
    expect(h).toContain("Data-base 31/10/2026 · Em coleta de documentos");
  });

  it("a ação também pode ser um botão (abrir o primeiro projeto), esticado do mesmo jeito", () => {
    const h = desenhar({ acao: "Abrir primeiro projeto", aoClicar: () => {} });
    expect(h).toMatch(/<button type="button" class="[^"]*after:absolute after:inset-0[^"]*">Abrir primeiro projeto<\/button>/);
  });

  it("desligado (outro formulário aberto) fica sem ação e sem realce", () => {
    const h = desenhar({ acao: "Abrir primeiro projeto", aoClicar: () => {}, desligado: true });
    expect(h).not.toContain("<button");
    expect(h).not.toContain("hover:bg-primary/5");
  });
});
