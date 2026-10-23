import { describe, expect, it } from "vitest";
import { COLUNAS_MATRIZ, ORDEM_SITUACOES, SITUACOES, linhasMatriz, mapaClasses, resumoFiscal } from "./fiscal";
import { NOTAS_FISCAIS, criarWorkbookFiscal } from "./matrizFiscal";

const sug = (extra = {}) => ({ c_class_trib: "200003", descricao: "Alimentação humana (Anexo I)", reducao: 1, confianca: "Alta (NCM completo no anexo)", ambiguo: false, anexo: "Anexo I, item 7", ...extra });
const item = (linha, extra = {}) => ({ linha, codigo: `C${linha}`, descricao: "FEIJAO CARIOCA", unidade: "KG", grupo_atual: "Grãos", ncm: "07133319", ncm_original: "07133319", problemas: [], c_class_trib_informado: "200003", sugestao: sug(), ...extra });
const classes = mapaClasses([{ c_class_trib: "200003", cst: "200", descricao_oficial: "Alimentação humana (Anexo I)", pct_reducao_ibs: 1, pct_reducao_cbs: 1, status: "Ativo" }]);
const itens = [item(2), item(3, { c_class_trib_informado: "" }), item(4, { ncm: "123", ncm_original: "123", problemas: [{ codigo: "NCM_FORMATO", severidade: "erro", mensagem: "NCM com 3 dígitos" }] })];
const decisoes = { 3: { acao: "ACEITAR", por: "ana", em: "2026-10-23" } };

describe("matriz fiscal em Excel", () => {
  it("uma linha por item, das situações mais graves às mais tranquilas, com a situação colorida; resumo por grupo com pendências e como ler", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const resumo = resumoFiscal(itens, classes, decisoes);
    const wb = criarWorkbookFiscal(ExcelJS, { linhas: linhasMatriz(itens, classes, decisoes), resumos: [{ grupo: "Grãos", resumo, concluida: null }], nomeProjeto: "Projeto X", nomeBase: "itens.xlsx" });
    const lido = new ExcelJS.Workbook(); await lido.xlsx.load(await wb.xlsx.writeBuffer());
    expect(lido.worksheets.map((w) => w.name)).toEqual(["Matriz fiscal", "Resumo"]);
    const ws = lido.getWorksheet("Matriz fiscal");
    expect(ws.getRow(1).values.slice(1)).toEqual(COLUNAS_MATRIZ.map(([t]) => t));
    expect(ws.rowCount).toBe(4);
    const col = (chave) => COLUNAS_MATRIZ.findIndex(([, k]) => k === chave) + 1;
    expect([2, 3, 4].map((r) => ws.getRow(r).getCell(col("codigo")).value)).toEqual(["C4", "C3", "C2"]); // NCM a corrigir, sem classe (decidido), confere
    expect(ws.getRow(2).getCell(col("rotuloSituacao")).value).toBe(SITUACOES.NCM.rotulo);
    expect(ws.getRow(3).getCell(col("decisao")).value).toBe("Adotar a classe sugerida"); expect(ws.getRow(3).getCell(col("classeFinal")).value).toBe("200003");
    expect(ws.getRow(3).getCell(col("cstSugerida")).value).toBe("200"); expect(ws.getRow(3).getCell(col("fundamento")).value).toBe("Anexo I, item 7 da LC 214/2025");
    expect(ws.getRow(2).getCell(col("validacao")).value).toBe("Pendente de decisão");
    expect(ws.getRow(2).getCell(col("rotuloSituacao")).fill.fgColor.argb).not.toBe(ws.getRow(4).getCell(col("rotuloSituacao")).fill.fgColor.argb);
    expect(ws.views[0]).toMatchObject({ state: "frozen", xSplit: 3, ySplit: 1 }); expect(ws.autoFilter).toBe(`A1:${String.fromCharCode(64 + COLUNAS_MATRIZ.length)}1`.replace("@", "A"));
    const texto = []; lido.getWorksheet("Resumo").eachRow((r) => texto.push(r.values.slice(1).join(" | ")));
    expect(texto).toContain("Projeto | Projeto X"); expect(texto.some((t) => t.startsWith("Grãos | 3 |"))).toBe(true);
    const linhaGrupo = texto.find((t) => t.startsWith("Grãos | 3 |")).split(" | ");
    expect(linhaGrupo[2 + ORDEM_SITUACOES.indexOf("NCM")]).toBe("1"); expect(linhaGrupo.slice(-3)).toEqual(["Em revisão", "", ""]);
    const primeiraColuna = []; lido.getWorksheet("Resumo").eachRow((r) => primeiraColuna.push(r.getCell(1).value));
    for (const n of NOTAS_FISCAIS) expect(primeiraColuna).toContain(n); // as notas ocupam a linha toda (células mescladas): o texto fica na primeira coluna
  });
  it("grupo concluído sai com quem concluiu e quando", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const resumo = resumoFiscal([item(2)], classes, {});
    const wb = criarWorkbookFiscal(ExcelJS, { linhas: linhasMatriz([item(2)], classes, {}), resumos: [{ grupo: "Grãos", resumo, concluida: { por: "ana", em: "2026-10-23" } }] });
    const lido = new ExcelJS.Workbook(); await lido.xlsx.load(await wb.xlsx.writeBuffer());
    const texto = []; lido.getWorksheet("Resumo").eachRow((r) => texto.push(r.values.slice(1).join(" | ")));
    expect(texto.find((t) => t.startsWith("Grãos | 1 |")).endsWith("Concluída | ana | 23/10/2026")).toBe(true);
  });
});
