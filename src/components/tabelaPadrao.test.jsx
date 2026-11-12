import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import TabelaPadrao, { aplicarTabela, textoDaColuna } from "./TabelaPadrao";
import { linhasDaLeitura } from "./monitoramento/LeituraSitfis";
import { linhasDaEsfera, situacaoPelaValidade } from "./monitoramento/CertidoesCliente";

const COLUNAS = [
  { chave: "nome", rotulo: "Nome" },
  { chave: "valor", rotulo: "Valor", tipo: "moeda" },
  { chave: "data", rotulo: "Data", tipo: "data" },
  { chave: "comp", rotulo: "Competência", tipo: "periodo" },
];
const LINHAS = [
  { id: 1, nome: "Declaração São Paulo", valor: 1500.5, data: "2026-11-10", comp: "202610" },
  { id: 2, nome: "Guia Cuiabá", valor: 20, data: "2026-01-05", comp: "202601" },
  { id: 3, nome: "Recibo Goiânia", valor: null, data: "20260301", comp: "202603" },
];

describe("tabela padrão do InTAX", () => {
  it("formata moeda, data (ISO e AAAAMMDD) e competência", () => {
    expect(textoDaColuna(COLUNAS[1], LINHAS[0])).toMatch(/R\$\s?1\.500,50/);
    expect(textoDaColuna(COLUNAS[2], LINHAS[0])).toBe("10/11/2026");
    expect(textoDaColuna(COLUNAS[2], LINHAS[2])).toBe("01/03/2026");
    expect(textoDaColuna(COLUNAS[3], LINHAS[1])).toBe("01/2026");
  });

  it("busca geral e filtro por coluna sem acento; ordena números, datas e deixa vazio no fim", () => {
    expect(aplicarTabela(LINHAS, COLUNAS, { busca: "cuiaba" }).map((l) => l.id)).toEqual([2]);
    expect(aplicarTabela(LINHAS, COLUNAS, { filtros: { nome: "GOIANIA" } }).map((l) => l.id)).toEqual([3]);
    expect(aplicarTabela(LINHAS, COLUNAS, { filtros: { comp: "10/2026" } }).map((l) => l.id)).toEqual([1]);
    expect(aplicarTabela(LINHAS, COLUNAS, { ordem: { chave: "valor", dir: 1 } }).map((l) => l.id)).toEqual([2, 1, 3]);
    expect(aplicarTabela(LINHAS, COLUNAS, { ordem: { chave: "valor", dir: -1 } }).map((l) => l.id)).toEqual([1, 2, 3]);
    expect(aplicarTabela(LINHAS, COLUNAS, { ordem: { chave: "data", dir: 1 } }).map((l) => l.id)).toEqual([2, 3, 1]);
  });

  it("tem busca, filtros por coluna, cabeçalhos que ordenam e arrastam, e documentos sempre na última coluna", () => {
    const html = renderToString(<TabelaPadrao id="teste" colunas={COLUNAS} linhas={LINHAS} ariaLabel="Teste" documentos={(l) => <button type="button">Ver {l.id}</button>} />);
    expect(html).toContain("Buscar em todas as colunas");
    expect(html).toContain('aria-label="Filtrar Nome"');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('aria-sort="none"');
    expect(html).toContain("Colunas");
    const cab = html.match(/<thead[\s\S]*?<\/tr>/)[0];
    expect(cab.lastIndexOf("Documentos")).toBeGreaterThan(cab.lastIndexOf("Competência"));
    expect(html).toContain("3 linha(s)");
  });
});

describe("relatório de situação fiscal e certidões em tabela", () => {
  const leitura = {
    certidao: { tipo: "Certidão Negativa", codigo: "ABCD", emissao: "25/06/2026", validade: "22/12/2026" },
    secoes: [
      { titulo: "Pendência - Débito (SIEF)", orgao: "RFB", tipo: "PENDENCIA", assunto: "DEBITO", linhas: ["Receita PA/Exerc. Dt. Vcto", "6912-01 - PIS 09/2025", "2172-01 - COFINS 09/2025"] },
      { titulo: "Parcelamento com Exigibilidade Suspensa (SISPAR)", orgao: "PGFN", tipo: "SUSPENSO", assunto: "PARCELAMENTO", linhas: ["Conta", "004760792 TRANSACAO"] },
    ],
  };
  it("uma linha por item, com a seção e o cabeçalho do próprio relatório", () => {
    const l = linhasDaLeitura(leitura);
    expect(l.map((x) => [x.orgao, x.secao, x.item])).toEqual([
      ["Receita Federal", "Pendência - Débito (SIEF)", "6912-01 - PIS 09/2025"],
      ["Receita Federal", "Pendência - Débito (SIEF)", "2172-01 - COFINS 09/2025"],
      ["PGFN", "Parcelamento com Exigibilidade Suspensa (SISPAR)", "004760792 TRANSACAO"],
    ]);
    expect(linhasDaLeitura(leitura, (s) => s.assunto === "PARCELAMENTO")).toHaveLength(1);
  });
  it("a esfera federal junta as certidões guardadas e a do relatório de situação fiscal, com a vigência pela validade", () => {
    const c = { tipo: "FEDERAL", historico: [{ id: "D1", descricao: "CND federal (Receita e PGFN): Negativa (API Consulta CND)", validade: "2027-01-10T12:00:00Z", situacao: "VALIDO" }] };
    const l = linhasDaEsfera(c, { leitura });
    expect(l.map((x) => [x.regularidade, x.origem ?? ""])).toEqual([["Negativa", ""], ["Certidão Negativa", "Relatório de situação fiscal (Receita e PGFN)"]]);
    expect(l[1].validade).toBe("2026-12-22");
    expect(situacaoPelaValidade("2026-12-22", Date.parse("2026-11-12T12:00:00-03:00"))).toBe("VALIDO");
    expect(situacaoPelaValidade("2026-11-20", Date.parse("2026-11-12T12:00:00-03:00"))).toBe("A_VENCER");
    expect(situacaoPelaValidade("2026-11-01", Date.parse("2026-11-12T12:00:00-03:00"))).toBe("VENCIDO");
    expect(linhasDaEsfera({ tipo: "ESTADUAL", historico: [] }, { leitura })).toHaveLength(0);
  });
});
