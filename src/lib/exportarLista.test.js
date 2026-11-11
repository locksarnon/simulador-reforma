import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { montarCsv, montarPdf, montarXlsx } from "./exportarLista";
import { linhasDaCarteira } from "@/pages/clientes/CarteiraColaboradoresPagina";

const COLS = [{ chave: "nome", rotulo: "Empresa" }, { chave: "valor", rotulo: "Valor", valor: (l) => l.n * 2 }];
const LINHAS = [{ nome: 'EXTRA "AGRO"; LTDA', n: 5 }, { nome: "Beta", n: 1 }];

describe("exportação padrão das listas", () => {
  it("CSV com ponto e vírgula, aspas quando precisa, BOM e só as colunas pedidas", () => {
    const csv = montarCsv(COLS, LINHAS);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")).toEqual(["﻿Empresa;Valor", '"EXTRA ""AGRO""; LTDA";10', "Beta;2"]);
  });
  it("Excel com cabeçalho e os valores calculados", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await montarXlsx("Serviços contratados", COLS, LINHAS));
    const ws = wb.worksheets[0];
    expect(ws.name).toBe("Serviços contratados");
    expect(ws.getRow(1).values.slice(1)).toEqual(["Empresa", "Valor"]);
    expect(ws.getRow(2).values.slice(1)).toEqual(['EXTRA "AGRO"; LTDA', 10]);
  });
  it("PDF com o título", async () => {
    const buf = await montarPdf("Tarefas", COLS, LINHAS);
    expect(new TextDecoder("latin1").decode(new Uint8Array(buf)).slice(0, 5)).toBe("%PDF-");
  });
  it("relatório empresa por colaborador: com quem atende e 'Sem colaborador'", () => {
    const r = linhasDaCarteira([{ id: "U1", name: "Maria", empresa_ids: ["E1"] }, { id: "U2", email: "joao@fal", empresa_ids: ["E1"] }], [{ id: "E1", razao_social: "EXTRA" }, { id: "E2", razao_social: "Beta", cnpj_cpf: "1" }]);
    expect(r).toEqual([{ razao_social: "EXTRA", cnpj_cpf: undefined, colaboradores: "Maria, joao@fal", total: 2 }, { razao_social: "Beta", cnpj_cpf: "1", colaboradores: "Sem colaborador", total: 0 }]);
  });
});
