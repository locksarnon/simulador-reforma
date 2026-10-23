import { describe, expect, it } from "vitest";
import { planejarMigracao } from "./migracao";
import { criarWorkbookMigracao, relatorioDoLegado } from "./migracaoXlsx";

const item = (linha, codigo, descricao, extra = {}) => ({ linha, codigo, descricao, unidade: "UN", grupo_atual: "Peças", ultima_mov: "2026-03-01", problemas: [], ...extra });
const itens = [item(2, "00123", "ANEL  TRAVA 10"), item(3, "00124", "FILTRO")];
const legado = { decisoes: { "2|padrao": { acao: "ENC", status: "APR", grupo: "Peças", sugerida: "ANEL TRAVA 10" } }, execucao: { registros: { "2|padrao": { adm: { status: "FEITO", evidencia: "SAP 1" } }, "3|inativacao": { adm: { status: "FEITO", evidencia: "SAP 2" } } } }, fiscal: { decisoes: {} } };
const ctx = { base: { id: "v1", arquivo: "itens.xlsx" }, origem: { erp: "SAP B1", instancia: "PRD", empresa: "Crestani" }, por: "ana@x.com", em: "2026-10-23" };

describe("relatório da migração em Excel", () => {
  it("tem o resumo e uma aba por resultado, com o código como texto (os zeros à esquerda sobrevivem ao Excel)", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { relatorio } = planejarMigracao(legado, itens, ctx);
    const lido = new ExcelJS.Workbook(); await lido.xlsx.load(await criarWorkbookMigracao(ExcelJS, relatorio, { nomeProjeto: "Projeto X" }).xlsx.writeBuffer());
    expect(lido.worksheets.map((w) => w.name)).toEqual(["Resumo", "Vinculadas", "Ambíguas", "Não encontradas"]);
    const resumo = []; lido.getWorksheet("Resumo").eachRow((r) => resumo.push(r.values.slice(1).join(" | ")));
    expect(resumo).toContain("Origem dos dados | SAP B1 · PRD · Crestani"); expect(resumo).toContain("Base original usada | itens.xlsx");
    expect(resumo.some((t) => t.startsWith("Decisões | 1 no total: 1 vinculadas, 0 ambíguas"))).toBe(true);
    expect(resumo.some((t) => t.startsWith("Confirmações de execução | 2 no total: 1 vinculadas, 1 ambíguas"))).toBe(true);
    expect(resumo.some((t) => t.startsWith("Atenção | A migração só organiza"))).toBe(true);
    const v = lido.getWorksheet("Vinculadas"); expect(v.getRow(1).values.slice(1)).toContain("Código do item (texto)");
    const codigo = v.getRow(2).getCell(5).value; expect(codigo).toBe("00123"); expect(typeof codigo).toBe("string");
    expect(v.getRow(2).getCell(10).value).toBe("00123|padrao");
    const a = lido.getWorksheet("Ambíguas"); expect(a.rowCount).toBe(2); expect(a.getRow(2).getCell(5).value).toBe("00124"); expect(String(a.getRow(2).getCell(9).value)).toContain("lista fechada");
    expect(lido.getWorksheet("Não encontradas").rowCount).toBe(1);
  });
  it("depois da migração, o que ficou pendente no legado volta no mesmo formato, para baixar de novo", () => {
    const { estado } = planejarMigracao(legado, itens, ctx);
    const r = relatorioDoLegado(estado);
    expect(r.totais.execucao).toEqual({ total: 1, vinculadas: 0, ambiguas: 1, naoEncontradas: 0 }); expect(r.linhas).toHaveLength(1); expect(r.base).toEqual(ctx.base);
    expect(relatorioDoLegado({})).toBeNull();
  });
});
