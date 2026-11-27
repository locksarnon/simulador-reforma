/**
 * Comparativo de duplicidade: o usuário vê a linha real do arquivo (linha_planilha), não a chave interna `linha`, no título, no mestre
 * sugerido e em cada cadastro. A chave continua ligando candidatos, mestre e exclusões.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// O Sheet (Radix) abre num portal, que não renderiza no servidor: aqui ele vira um contêiner simples.
vi.mock("@/components/ui/sheet", () => {
  const Simples = ({ children }) => <div>{children}</div>;
  return { Sheet: Simples, SheetContent: Simples, SheetDescription: Simples, SheetHeader: Simples, SheetTitle: Simples };
});

const { default: ComparativoDuplicidade } = await import("./ComparativoDuplicidade");

const itens = [
  { linha: 2, linha_planilha: 3, codigo: "A1", descricao: "ADUBO NPK 20KG", candidatos_duplicidade: [5],
    duplicidade: { mestre: 5, candidatos: [{ linha: 5, nivel: "EXATA", score: 1, motivos: ["Mesma descrição"] }] } },
  { linha: 5, linha_planilha: 6, codigo: "A2", descricao: "ADUBO NPK 20KG", candidatos_duplicidade: [2] },
];

describe("ComparativoDuplicidade — linha mostrada", () => {
  it("título, mestre sugerido e cadastros mostram a linha do arquivo; a chave interna não aparece como linha", () => {
    const h = renderToStaticMarkup(
      <ComparativoDuplicidade item={itens[0]} itens={itens} excluir={[]} setExcluir={() => {}} podeExcluir onFechar={() => {}} />,
    );
    expect(h).toContain("Comparativo de duplicidade — linha 3");
    expect(h).toContain("<b>linha 6</b>");
    expect(h).toContain("Linha 3");
    expect(h).toContain("Linha 6");
    expect(h).not.toMatch(/[Ll]inha 2\b/);
    expect(h).not.toMatch(/[Ll]inha 5\b/);
  });

  it("item antigo, sem linha_planilha: mostra a chave (igual à linha do arquivo antes da logo)", () => {
    const antigos = itens.map(({ linha_planilha, ...x }) => x);
    const h = renderToStaticMarkup(
      <ComparativoDuplicidade item={antigos[0]} itens={antigos} excluir={[]} setExcluir={() => {}} podeExcluir={false} onFechar={() => {}} />,
    );
    expect(h).toContain("Comparativo de duplicidade — linha 2");
    expect(h).toContain("<b>linha 5</b>");
  });
});
