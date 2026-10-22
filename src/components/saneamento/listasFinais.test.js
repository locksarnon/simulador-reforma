import { describe, expect, it } from "vitest";
import { aplicarEscopo, criarTestes } from "./logica";
import { montarListas, unificacoesAprovadas } from "./listasFinais";

const item = (linha, codigo, descricao, ultima_mov, extra = {}) => ({ linha, codigo, descricao, ultima_mov, unidade: "UN", grupo_atual: "Peças", problemas: [], ...extra });
const dup = (mestre) => ({ nivel: "EXATA", score: 1, grupo: 0, mestre, candidatos: [{ linha: mestre, score: 1, nivel: "EXATA", motivos: ["descrição idêntica"] }] });

const itens = [
  item(2, "A1", "ANEL  TRAVA 123", "2026-01-10", { duplicidade: dup(3) }),
  item(3, "A2", "ANEL TRAVA 123", "2026-02-01", { duplicidade: dup(3) }),
  item(4, "B1", "FILTRO DE AR", "2023-05-05"),
  item(5, "C1", "CORREIA A-72", "2025-12-01"),
];
const base = (estado) => {
  const escopo = aplicarEscopo(itens, estado.params);
  return montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado, itens, escopo, testes: criarTestes(escopo.emEscopo, estado) });
};

describe("listas finais do saneamento", () => {
  const estado = {
    params: { ateOn: true, ate: "2024-12-31" },
    criterios: { duplicidade: { aprovado: true, por: "ana", em: "2026-10-20" } },
    decisoes: {
      "2|duplicidade": { acao: "ENC", status: "APR", grupo: "Peças", destino: 3, decididoPor: "ana", decididoEm: "2026-10-21" },
      "5|padrao": { acao: "ENC", status: "APR", sugerida: "CORREIA A72", final: "CORREIA A-72 TRAPEZOIDAL", origemFinal: "cliente", decididoPor: "cli", decididoEm: "2026-10-22" },
    },
  };

  it("lista de inativados por data de uso traz o critério do corte", () => {
    const l = base(estado);
    expect(l.inativados.map((i) => i.codigo)).toEqual(["B1"]);
    expect(l.inativados[0].criterio).toContain("movimento até 31/12/2024");
  });
  it("unificação aprovada tira o item de origem da lista final e entra em desduplicações", () => {
    const l = base(estado);
    expect(l.finalCorrigida.map((i) => i.codigo)).toEqual(["A2", "C1"]);
    expect(l.desduplicacoes).toHaveLength(1);
    expect(l.desduplicacoes[0]).toMatchObject({ codigoOrigem: "A1", codigoDestino: "A2", decisao: "Aprovado", aprovador: "ana", acao: "Unificar no código mantido" });
  });
  it("descrição final é a aprovada (do cliente, quando ele ajustou) e a original fica registrada", () => {
    const c1 = base(estado).finalCorrigida.find((i) => i.codigo === "C1");
    expect(c1).toMatchObject({ original: "CORREIA A-72", final: "CORREIA A-72 TRAPEZOIDAL", mudanca: "Descrição corrigida", origem: "Ajustada pelo cliente" });
  });
  it("decisão só proposta ou rejeitada não muda nada na lista final", () => {
    const e2 = { ...estado, decisoes: { "2|duplicidade": { acao: "ENC", status: "PROP", destino: 3 }, "5|padrao": { acao: "ENC", status: "REJ", sugerida: "X" } } };
    const l = base(e2);
    expect(l.finalCorrigida.map((i) => i.codigo)).toEqual(["A1", "A2", "C1"]);
    expect(l.finalCorrigida.find((i) => i.codigo === "C1").mudanca).toBe("Mantido");
    expect(l.contagem.unificacoesPendentes).toBe(1);
  });
  it("mestre da própria decisão não é baixado", () => {
    const e3 = { ...estado, decisoes: { "3|duplicidade": { acao: "ENC", status: "APR", destino: 3 } } };
    const l = base(e3);
    expect(l.finalCorrigida.map((i) => i.codigo)).toContain("A2");
    expect(l.desduplicacoes[0].acao).toContain("sem baixa");
    expect(unificacoesAprovadas(e3, itens)).toHaveLength(1);
  });
  it("resumo registra o parâmetro de saneamento e avisa que nada foi alterado no cadastro", () => {
    const r = base(estado).resumo.map((l) => l.join(" "));
    expect(r.some((l) => l.includes("desconsiderar movimentados até 31/12/2024"))).toBe(true);
    expect(r.some((l) => l.includes("nenhum cadastro foi alterado"))).toBe(true);
  });
});

describe("planilha das listas finais", () => {
  it("gera as 5 abas e lê de volta o conteúdo certo", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { criarWorkbook } = await import("./listasFinais");
    const estado = {
      params: { ateOn: true, ate: "2024-12-31" }, criterios: { duplicidade: { aprovado: true, por: "ana", em: "2026-10-20" } },
      decisoes: { "2|duplicidade": { acao: "ENC", status: "APR", grupo: "Peças", destino: 3, decididoPor: "ana", decididoEm: "2026-10-21" } },
    };
    const escopo = aplicarEscopo(itens, estado.params);
    const listas = montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado, itens, escopo, testes: criarTestes(escopo.emEscopo, estado) });
    const wb = criarWorkbook(ExcelJS, listas, ["resumo", "final", "dedup", "analises", "inativados"]);
    const buf = await wb.xlsx.writeBuffer();
    const lido = new ExcelJS.Workbook(); await lido.xlsx.load(buf);
    expect(lido.worksheets.map((w) => w.name)).toEqual(["Resumo", "Lista final corrigida", "Desduplicações", "Análises", "Inativados por data de uso"]);
    expect(lido.getWorksheet("Inativados por data de uso").getRow(2).getCell(1).value).toBe("B1");
    expect(lido.getWorksheet("Desduplicações").getRow(2).getCell(2).value).toBe("A1");
    expect(lido.getWorksheet("Lista final corrigida").rowCount).toBe(3);
  });
});
