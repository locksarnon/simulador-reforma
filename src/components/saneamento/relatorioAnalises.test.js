import { describe, expect, it } from "vitest";
import { criarTestes } from "./logica";
import { calcularAchados, contarAchados } from "./analise";
import { contarSelecao, criarWorkbookAnalises, criteriosDoRelatorio, montarRelatorioAnalises, nomeArquivoAnalises, textoDecisao } from "./relatorioAnalises";

const item = (linha, grupo, extra = {}) => ({ linha, codigo: `C${linha}`, descricao: "ITEM", unidade: "UN", grupo_atual: grupo, ultima_mov: "2026-01-10", problemas: [], ...extra });
const itens = [
  item(2, "Peças", { descricao: "ANEL  TRAVA", unidade: "QUILOGRAM" }), // padronização (espaço duplo) e unidade (QUILOGRAM → KG)
  item(3, "Peças", { descricao: "FILTRO", unidade: "BB" }), // unidade: embalagem
  item(4, "Insumos", { descricao: "CORANTE ALIMENTÍCIO LÍQ.CONFEITARIA ROSA" }), // padronização (ponto colado)
  item(5, "Insumos", { descricao: "ADUBO", unidade: "KG" }), // sem achado
];
const estado = { decisoes: { "2|padrao": { acao: "ENC", status: "APR", decididoPor: "ana", decididoEm: "2026-10-22" }, "3|unidade": { acao: "ENC", status: "PROP" } }, criterios: {} };
const achados = calcularAchados(itens, criarTestes(itens, estado)); const contagem = contarAchados(achados, itens.length);
const totaisGrupos = new Map([["Peças", 2], ["Insumos", 2]]); const itemPorLinha = new Map(itens.map((i) => [i.linha, i]));
const monta = (criterios, grupos = null, extra = {}) => montarRelatorioAnalises({ achados, criterios, grupos, estado, contagem, itemPorLinha, totaisGrupos, ...extra });

describe("Excel das análises: grupos e critérios escolhidos", () => {
  it("só os critérios com teste automático podem ser escolhidos", () => {
    expect(criteriosDoRelatorio().map((c) => c.id)).toEqual(["ncm", "duplicidade", "descricao", "padrao", "grupo", "unidade", "utilizacao"]);
  });
  it("uma linha por item, e o item com achado em dois critérios aparece uma vez, com os dois blocos preenchidos", () => {
    const r = monta(["padrao", "unidade"]);
    expect(r.criterios.map((c) => [c.id, c.total])).toEqual([["padrao", 2], ["unidade", 2]]);
    expect(r.linhas.map((l) => [l.grupo, l.linha])).toEqual([["Insumos", 4], ["Peças", 2], ["Peças", 3]]); // por grupo e depois pela linha da planilha
    const l2 = r.linhas.find((l) => l.linha === 2);
    expect(l2.porCriterio.padrao).toMatchObject({ como: "Descrição: ANEL  TRAVA", seria: "Descrição: ANEL TRAVA", porque: "espaços duplicados ou nas pontas", decisao: "Aprovado por ana em 22/10/2026" });
    expect(l2.porCriterio.unidade).toMatchObject({ como: "Unidade de estoque: QUILOGRAM", seria: "Unidade de estoque: KG", decisao: "Não encaminhado" });
    const l3 = r.linhas.find((l) => l.linha === 3);
    expect(l3.porCriterio.padrao).toBeUndefined(); expect(l3.porCriterio.unidade.decisao).toBe("Encaminhado (aguarda decisão)");
    expect(l3.porCriterio.unidade.seria).toContain("Unidade de compra: BB");
    expect(r.totais).toEqual({ itens: 3, achados: 4, grupos: 2 });
  });
  it("o filtro de grupos limita as linhas, os totais e o resumo por grupo", () => {
    const r = monta(["padrao", "unidade"], ["Peças"]);
    expect(r.linhas.map((l) => l.linha)).toEqual([2, 3]); expect(r.totais).toEqual({ itens: 2, achados: 3, grupos: 1 }); expect(r.gruposTodos).toBe(false);
    expect(r.porGrupo).toEqual([{ grupo: "Peças", itensEmEscopo: 2, itensComAchado: 2 }]);
    expect(monta(["padrao"]).gruposTodos).toBe(true);
  });
  it("critério sem achado na seleção continua como bloco vazio, e critério não escolhido não entra", () => {
    const r = monta(["duplicidade", "padrao"]);
    expect(r.criterios.map((c) => [c.id, c.total])).toEqual([["duplicidade", 0], ["padrao", 2]]);
    expect(monta(["padrao"]).criterios.map((c) => c.id)).toEqual(["padrao"]);
    expect(monta(["identidade"]).criterios).toEqual([]); // critério manual não tem achados calculados
  });
  it("conta itens e achados da seleção sem montar os textos", () => {
    expect(contarSelecao({ achados, criterios: ["padrao", "unidade"], grupos: null })).toEqual({ itens: 3, achados: 4 });
    expect(contarSelecao({ achados, criterios: ["padrao"], grupos: ["Insumos"] })).toEqual({ itens: 1, achados: 1 });
    expect(contarSelecao({ achados, criterios: [], grupos: null })).toEqual({ itens: 0, achados: 0 });
  });
  it("a decisão usa as palavras das telas", () => {
    expect(textoDecisao(undefined)).toBe("Não encaminhado"); expect(textoDecisao({ status: "PROP" })).toBe("Encaminhado (aguarda decisão)");
    expect(textoDecisao({ status: "APR", decididoPor: "ana", decididoEm: "2026-10-22" })).toBe("Aprovado por ana em 22/10/2026"); expect(textoDecisao({ status: "REJ" })).toBe("Rejeitado");
  });
  it("o nome do arquivo diz o critério e o grupo (ou quantos)", () => {
    const c = (t) => ({ titulo: t });
    expect(nomeArquivoAnalises({ slug: "crestani", criterios: [c("Unidade de medida")], grupos: ["Peças"], totalGrupos: 5 })).toBe("crestani-analises-unidade-de-medida-pecas.xlsx");
    expect(nomeArquivoAnalises({ slug: "crestani", criterios: [c("A"), c("B")], grupos: ["x", "y"], totalGrupos: 2 })).toBe("crestani-analises-2-criterios-todos-os-grupos.xlsx");
    expect(nomeArquivoAnalises({ slug: "", criterios: [c("A")], grupos: ["x", "y", "z"], totalGrupos: 9 })).toBe("projeto-analises-a-3-grupos.xlsx");
  });
});

describe("Excel das análises: a planilha", () => {
  const carregar = async (rel, meta = { nomeProjeto: "Projeto X", nomeBase: "itens.xlsx" }) => {
    const ExcelJS = (await import("exceljs")).default;
    const lido = new ExcelJS.Workbook(); await lido.xlsx.load(await criarWorkbookAnalises(ExcelJS, rel, meta).xlsx.writeBuffer()); return lido;
  };
  const FIXAS = ["Código", "Descrição", "Unidade", "Grupo", "NCM", "Última movimentação", "Linha da planilha"];
  const BLOCO = ["Como é", "Como seria", "Por quê", "Decisão"];

  it("cada critério ocupa o seu bloco de colunas, com faixa colorida e título, e o cabeçalho tem filtro e painel congelado", async () => {
    const lido = await carregar(monta(["padrao", "unidade"]));
    expect(lido.worksheets.map((w) => w.name)).toEqual(["Análises", "Resumo"]);
    const ws = lido.getWorksheet("Análises");
    expect(ws.getRow(2).values.slice(1)).toEqual([...FIXAS, ...BLOCO, ...BLOCO]);
    expect(ws.getCell("A1").value).toBe("Item"); expect(ws.getCell("H1").value).toBe("Padronização da descrição"); expect(ws.getCell("L1").value).toBe("Unidade de medida");
    expect(ws.getCell("K1").master.address).toBe("H1"); expect(ws.getCell("G1").master.address).toBe("A1"); expect(ws.getCell("O1").master.address).toBe("L1");
    expect(ws.getCell("H1").fill.fgColor.argb).not.toBe(ws.getCell("L1").fill.fgColor.argb); // uma cor por critério
    expect(ws.views[0]).toMatchObject({ state: "frozen", xSplit: 2, ySplit: 2 }); expect(ws.autoFilter).toBe("A2:O2"); // filtro na linha dos títulos, de ponta a ponta
    expect(ws.rowCount).toBe(2 + 3);
  });
  it("as linhas trazem o item e, em cada bloco, o que o critério achou (vazio quando o item não tem achado nele)", async () => {
    const ws = (await carregar(monta(["padrao", "unidade"]))).getWorksheet("Análises");
    const r = (n) => ws.getRow(n).values.slice(1).map((v) => v ?? "");
    expect(r(3)).toEqual(["C4", "CORANTE ALIMENTÍCIO LÍQ.CONFEITARIA ROSA", "UN", "Insumos", "", "10/01/2026", 4,
      "Descrição: CORANTE ALIMENTÍCIO LÍQ.CONFEITARIA ROSA", "Descrição: CORANTE ALIMENTÍCIO LÍQ. CONFEITARIA ROSA", "espaço depois do ponto da abreviação", "Não encaminhado", "", "", "", ""]);
    expect(r(4).slice(0, 7)).toEqual(["C2", "ANEL  TRAVA", "QUILOGRAM", "Peças", "", "10/01/2026", 2]);
    expect(r(4)[10]).toBe("Aprovado por ana em 22/10/2026"); expect(r(4)[11]).toBe("Unidade de estoque: QUILOGRAM"); expect(r(4)[12]).toBe("Unidade de estoque: KG");
    expect(r(5)[7]).toBe(""); expect(r(5)[14]).toBe("Encaminhado (aguarda decisão)");
  });
  it("um critério só: a mesma estrutura, sem bloco a mais; e o saldo só aparece quando a base tem", async () => {
    const lido = await carregar(monta(["unidade"]));
    expect(lido.getWorksheet("Análises").getRow(2).values.slice(1)).toEqual([...FIXAS, ...BLOCO]);
    const comSaldo = itens.map((i) => (i.linha === 3 ? { ...i, saldo: 5000000 } : i)); const a2 = calcularAchados(comSaldo, criarTestes(comSaldo, estado));
    const r = montarRelatorioAnalises({ achados: a2, criterios: ["unidade"], grupos: null, estado, contagem, itemPorLinha: new Map(comSaldo.map((i) => [i.linha, i])), totaisGrupos, escalaSaldo: 1e6 });
    expect(r.temSaldo).toBe(true);
    const ws = (await carregar(r)).getWorksheet("Análises");
    expect(ws.getRow(2).values.slice(1, 9)).toEqual(["Código", "Descrição", "Unidade", "Grupo", "NCM", "Última movimentação", "Saldo em estoque", "Linha da planilha"]);
    expect(ws.getRow(4).getCell(7).value).toBe(5); // 5.000.000 na escala ×1.000.000
  });
  it("duplicidade: o Como seria traz a escolha de quem fica (ou a sugestão pelo saldo) e o saldo aparece na planilha", async () => {
    const d = (c) => ({ nivel: "EXATA", score: 1, grupo: 0, mestre: null, candidatos: c.map((l) => ({ linha: l, score: 1, nivel: "EXATA", motivos: ["descrição idêntica"] })) });
    const its = [item(2, "Peças", { descricao: "ANEL", saldo: 3000000, duplicidade: d([3]) }), item(3, "Peças", { descricao: "ANEL", saldo: 12000000, duplicidade: d([2]) })];
    const ach = calcularAchados(its, criarTestes(its, {})); const cont = contarAchados(ach, its.length);
    const gera = (decisoes) => montarRelatorioAnalises({ achados: ach, criterios: ["duplicidade"], grupos: null, estado: { decisoes, criterios: {} }, contagem: cont, itemPorLinha: new Map(its.map((i) => [i.linha, i])), totaisGrupos: new Map([["Peças", 2]]), escalaSaldo: 1e6 });
    const r = gera({}); expect(r.temSaldo).toBe(true); expect(r.linhas.map((l) => l.saldo)).toEqual([3, 12]);
    expect(r.linhas[0].porCriterio.duplicidade.seria).toContain("Ação: unificar no código C3 (sugerido)"); expect(r.linhas[1].porCriterio.duplicidade.seria).toBe("Ação: manter este código (sugerido)");
    expect(r.linhas[1].porCriterio.duplicidade.porque).toBe("Sugestão: manter C3 (maior saldo em estoque (12 contra 3)).");
    const escolhido = gera({ "3|duplicidade": { acao: "ENC", status: "PROP", destino: 2, escolhaPor: "analista" } }); // o analista escolheu ficar com o código C2
    expect(escolhido.linhas[0].porCriterio.duplicidade.seria).toBe("Ação: fica este código (escolhido)"); expect(escolhido.linhas[1].porCriterio.duplicidade.seria).toContain("Ação: unificar no código C2 (escolhido)");
    expect(escolhido.linhas[1].porCriterio.duplicidade.decisao).toBe("Encaminhado (aguarda decisão)");
    const ws = (await carregar(r)).getWorksheet("Análises");
    expect(ws.getRow(2).values.slice(1, 9)).toEqual(["Código", "Descrição", "Unidade", "Grupo", "NCM", "Última movimentação", "Saldo em estoque", "Linha da planilha"]);
  });
  it("o resumo diz o que foi escolhido, os totais, a situação dos critérios e como ler, sem concluir nada", async () => {
    const lido = await carregar(monta(["padrao", "unidade"], ["Peças"]));
    const texto = []; lido.getWorksheet("Resumo").eachRow((r) => texto.push(r.values.slice(1).join(" | ")));
    expect(texto).toContain("Projeto | Projeto X"); expect(texto).toContain("Base importada | itens.xlsx");
    expect(texto).toContain("Grupos incluídos | 1: Peças");
    expect(texto.some((t) => t.startsWith("  Padronização da descrição | 1 achado · critério ainda não aprovado"))).toBe(true);
    expect(texto).toContain("Itens com achado | 2"); expect(texto).toContain("  Peças | 2 de 2 itens em escopo");
    expect(texto.some((t) => t.startsWith("Atenção | Os achados são indícios"))).toBe(true);
    const todos = (await carregar(monta(["padrao"]))).getWorksheet("Resumo"); const t2 = []; todos.eachRow((r) => t2.push(r.values.slice(1).join(" | ")));
    expect(t2).toContain("Grupos incluídos | todos os 2 grupos em escopo");
  });
});
