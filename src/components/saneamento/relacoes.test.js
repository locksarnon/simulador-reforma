import { describe, expect, it } from "vitest";
import { aplicarEscopo } from "./logica";
import { COLUNAS_RELACAO, RELACOES, criarSituacao, criarWorkbookRelacao, descricaoRelacao, itensDaRelacao, linhasRelacao } from "./relacoes";

const item = (linha, ultima_mov, extra = {}) => ({ linha, codigo: `C${linha}`, descricao: `ITEM ${linha}`, unidade: "UN", grupo_atual: "Peças", ncm: "73181500", ultima_mov, problemas: [], ...extra });
const itens = [item(2, "2023-05-01"), item(3, "2024-12-31"), item(4, "2025-01-01"), item(5, "2026-01-10"), item(6, null), item(7, null, { grupo_atual: "", ncm: "", ncm_original: "7318" })];
const escopo = aplicarEscopo(itens, { desde: "2025-01-01" });
const linhas = (lista) => lista.map((i) => i.linha);

describe("relações dos cartões da triagem", () => {
  it("cada relação tem exatamente os itens que o cartão conta", () => {
    expect(linhas(itensDaRelacao("universo", itens, escopo))).toEqual([2, 3, 4, 5, 6, 7]);
    expect(linhas(itensDaRelacao("fora", itens, escopo))).toEqual([2, 3]);
    expect(linhas(itensDaRelacao("emEscopo", itens, escopo))).toEqual([4, 5, 6, 7]);
    expect(linhas(itensDaRelacao("semData", itens, escopo))).toEqual([6, 7]);
    const { resumo } = escopo;
    expect(itensDaRelacao("universo", itens, escopo)).toHaveLength(resumo.total);
    expect(itensDaRelacao("fora", itens, escopo)).toHaveLength(resumo.fora);
    expect(itensDaRelacao("emEscopo", itens, escopo)).toHaveLength(resumo.emEscopo);
    expect(itensDaRelacao("semData", itens, escopo)).toHaveLength(resumo.semData);
  });
  it("sem corte nada fica fora, e os sem data continuam sendo os mesmos", () => {
    const e = aplicarEscopo(itens, { desde: "" });
    expect(itensDaRelacao("fora", itens, e)).toEqual([]);
    expect(linhas(itensDaRelacao("emEscopo", itens, e))).toEqual([2, 3, 4, 5, 6, 7]);
    expect(linhas(itensDaRelacao("semData", itens, e))).toEqual([6, 7]);
  });
  it("a situação de cada item diz o porquê, com a data do corte", () => {
    const s = criarSituacao(escopo, "01/01/2025");
    expect(s(itens[0])).toBe("Fora do escopo (não movimentado desde 01/01/2025)");
    expect(s(itens[1])).toBe("Fora do escopo (não movimentado desde 01/01/2025)");
    expect(s(itens[2])).toBe("Em escopo"); // movimentado na própria data do corte continua
    expect(s(itens[4])).toBe("Em escopo, sem data de movimentação legível");
  });
  it("a frase de cada relação usa a data do corte, ou avisa que não há corte", () => {
    expect(descricaoRelacao("fora", "01/01/2025")).toBe("Itens não movimentados desde 01/01/2025: ficam fora do trabalho.");
    expect(descricaoRelacao("fora", "")).toContain("Sem corte");
    for (const id of Object.keys(RELACOES)) expect(descricaoRelacao(id, "01/01/2025").length).toBeGreaterThan(10);
  });
  it("as linhas da planilha trazem código, descrição, unidade, grupo, NCM, última movimentação, situação e linha", () => {
    const l = linhasRelacao(itensDaRelacao("semData", itens, escopo), escopo, "01/01/2025");
    expect(l).toHaveLength(2);
    expect(l[0]).toEqual({ codigo: "C6", descricao: "ITEM 6", unidade: "UN", grupo: "Peças", ncm: "73181500", ultima_mov: "", situacao: "Em escopo, sem data de movimentação legível", linha: 6 });
    expect(l[1]).toMatchObject({ grupo: "(sem grupo)", ncm: "7318" }); // sem grupo e NCM original quando a validada não existe
    expect(Object.keys(l[0])).toEqual(COLUNAS_RELACAO.map(([, chave]) => chave));
  });
  it("a planilha tem a lista e o resumo, e o filtro da tela fica registrado", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const lista = itensDaRelacao("fora", itens, escopo);
    const wb = criarWorkbookRelacao(ExcelJS, { id: "fora", lista, escopo, corte: "01/01/2025", nomeProjeto: "Projeto X", nomeBase: "itens.xlsx", filtro: "item 2" });
    const lido = new ExcelJS.Workbook(); await lido.xlsx.load(await wb.xlsx.writeBuffer());
    expect(lido.worksheets.map((w) => w.name)).toEqual(["Fora do escopo", "Resumo"]);
    const ws = lido.getWorksheet("Fora do escopo");
    expect(ws.getRow(1).values.slice(1)).toEqual(COLUNAS_RELACAO.map(([titulo]) => titulo));
    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(2).getCell(1).value).toBe("C2");
    expect(ws.getRow(2).getCell(7).value).toBe("Fora do escopo (não movimentado desde 01/01/2025)");
    const resumo = lido.getWorksheet("Resumo"); const texto = []; resumo.eachRow((r) => texto.push(r.values.slice(1).join(" | ")));
    expect(texto.some((t) => t.startsWith("Filtro aplicado na tela | item 2"))).toBe(true);
    expect(texto.some((t) => t.startsWith("Itens nesta planilha | 2"))).toBe(true);
    expect(texto.some((t) => t.includes("desconsiderar itens não movimentados desde 01/01/2025"))).toBe(true);
  });
  it("sem filtro e sem corte, o resumo não inventa nada", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const e = aplicarEscopo(itens, { desde: "" });
    const wb = criarWorkbookRelacao(ExcelJS, { id: "universo", lista: itens, escopo: e, corte: "", nomeProjeto: "P", nomeBase: "b.xlsx" });
    const lido = new ExcelJS.Workbook(); await lido.xlsx.load(await wb.xlsx.writeBuffer());
    const texto = []; lido.getWorksheet("Resumo").eachRow((r) => texto.push(r.values.slice(1).join(" | ")));
    expect(texto.some((t) => t.startsWith("Filtro aplicado"))).toBe(false);
    expect(texto.some((t) => t.includes("Parâmetro de saneamento | sem corte"))).toBe(true);
    expect(lido.getWorksheet("Universo").rowCount).toBe(7);
  });
});

describe("relações com os sem data tratados como anteriores à data", () => {
  const escopoAnt = aplicarEscopo(itens, { desde: "2025-01-01", semData: "anterior" });
  it("os sem data saem do escopo, e o cartão Sem data legível continua com todos", () => {
    expect(linhas(itensDaRelacao("fora", itens, escopoAnt))).toEqual([2, 3, 6, 7]);
    expect(linhas(itensDaRelacao("emEscopo", itens, escopoAnt))).toEqual([4, 5]);
    expect(linhas(itensDaRelacao("semData", itens, escopoAnt))).toEqual([6, 7]);
    expect(escopoAnt.resumo).toMatchObject({ fora: 4, emEscopo: 2, semData: 2, semDataFora: 2 });
  });
  it("a situação e as frases dizem o que aconteceu", () => {
    const s = criarSituacao(escopoAnt, "01/01/2025");
    expect(s(itens[0])).toBe("Fora do escopo (não movimentado desde 01/01/2025)");
    expect(s(itens[4])).toBe("Fora do escopo (sem data de movimentação, tratado como anterior a 01/01/2025)");
    expect(s(itens[2])).toBe("Em escopo");
    expect(descricaoRelacao("semData", "01/01/2025", true)).toBe("Itens sem data de última movimentação legível: tratados como anteriores a 01/01/2025, ficam fora do escopo.");
    expect(descricaoRelacao("fora", "01/01/2025", true)).toContain("inclusive os sem data de movimentação");
    expect(descricaoRelacao("emEscopo", "01/01/2025", true)).toBe("Itens que entram no trabalho.");
    expect(descricaoRelacao("semData", "01/01/2025", false)).toContain("continuam no escopo, sinalizados");
  });
  it("o Excel registra no resumo o que foi feito com os sem data", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = criarWorkbookRelacao(ExcelJS, { id: "fora", lista: itensDaRelacao("fora", itens, escopoAnt), escopo: escopoAnt, corte: "01/01/2025", nomeProjeto: "P", nomeBase: "b.xlsx", semDataFora: true });
    const lido = new ExcelJS.Workbook(); await lido.xlsx.load(await wb.xlsx.writeBuffer());
    const ws = lido.getWorksheet("Fora do escopo");
    expect(ws.rowCount).toBe(5);
    expect(ws.getRow(4).getCell(7).value).toBe("Fora do escopo (sem data de movimentação, tratado como anterior a 01/01/2025)");
    const texto = []; lido.getWorksheet("Resumo").eachRow((x) => texto.push(x.values.slice(1).join(" | ")));
    expect(texto.some((t) => t.includes("desconsiderar itens não movimentados desde 01/01/2025; itens sem data de movimentação tratados como anteriores à data"))).toBe(true);
  });
});
