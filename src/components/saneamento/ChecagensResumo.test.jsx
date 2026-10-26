import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChecagensResumo from "./ChecagensResumo";
import { resumoChecagens } from "./checagens";

const texto = (escopo) => renderToStaticMarkup(<ChecagensResumo lista={[]} resumo={resumoChecagens([])} escopo={escopo} nomeBase="base.xlsx" extraidaEm="2026-10-21" onAbrir={() => {}} />).replace(/<[^>]+>/g, "");

describe("visão geral das checagens: o que fica fora do que é checado", () => {
  it("sem itens fora do escopo e sem grupos fora do saneamento, não fala deles", () => {
    const t = texto({ emEscopo: 10, fora: 0, foraGrupos: 0 });
    expect(t).toContain("As checagens valem para os 10 itens em escopo da base base.xlsx (extração de 21/10/2026)."); expect(t).not.toContain("fora do escopo"); expect(t).not.toContain("candidatos à inativação");
    expect(t).toContain("Nada é alterado no cadastro: a ferramenta só verifica e sugere.");
  });
  it("o corte por data deixa candidatos à inativação, que dependem de aprovação", () => {
    const t = texto({ emEscopo: 8, fora: 2, foraGrupos: 0 });
    expect(t).toContain("Os 2 itens fora do escopo (corte por data) não são checados: ficam só como candidatos à inativação, que depende de aprovação."); expect(t).not.toContain("grupos fora do saneamento");
  });
  it("os grupos fora do saneamento não são checados nem inativados (não são candidatos à inativação)", () => {
    const t = texto({ emEscopo: 8, fora: 0, foraGrupos: 3 });
    expect(t).toContain("Os 3 itens de grupos fora do saneamento não são checados nem inativados."); expect(t).not.toContain("candidatos à inativação");
    const dois = texto({ emEscopo: 5, fora: 2, foraGrupos: 3 }); expect(dois).toContain("candidatos à inativação, que depende de aprovação."); expect(dois).toContain("não são checados nem inativados.");
  });
  it("sem base com itens em escopo, diz que nada foi verificado", () => { expect(texto(null)).toContain("Nenhuma base com itens em escopo: nada foi verificado."); });
});
