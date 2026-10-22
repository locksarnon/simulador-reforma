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
    params: { desde: "2025-01-01" },
    criterios: { duplicidade: { aprovado: true, por: "ana", em: "2026-10-20" } },
    decisoes: {
      "2|duplicidade": { acao: "ENC", status: "APR", grupo: "Peças", destino: 3, decididoPor: "ana", decididoEm: "2026-10-21" },
      "5|padrao": { acao: "ENC", status: "APR", sugerida: "CORREIA A72", final: "CORREIA A-72 TRAPEZOIDAL", origemFinal: "cliente", decididoPor: "cli", decididoEm: "2026-10-22" },
    },
  };

  it("lista de inativados por data de uso traz o critério do corte", () => {
    const l = base(estado);
    expect(l.inativados.map((i) => i.codigo)).toEqual(["B1"]);
    expect(l.inativados[0].criterio).toBe("não movimentado desde 01/01/2025");
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
  it("projeto salvo com o corte no formato antigo gera as mesmas listas", () => {
    const antigo = { ...estado, params: { ateOn: true, ate: "2024-12-31", diasOn: false, dias: 540, dataBase: "2026-10-22" } };
    const l = base(antigo);
    expect(l.inativados.map((i) => i.codigo)).toEqual(["B1"]);
    expect(l.inativados[0].criterio).toBe("não movimentado desde 01/01/2025");
    expect(l.resumo.some((x) => x.join(" ").includes("desconsiderar itens não movimentados desde 01/01/2025"))).toBe(true);
  });
  it("sem corte, ninguém é inativado e o resumo diz 'sem corte'", () => {
    const l = base({ ...estado, params: { desde: "" } });
    expect(l.inativados).toEqual([]);
    expect(l.resumo.find((x) => x[0] === "Parâmetro de saneamento")[1]).toBe("sem corte");
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
    expect(r.some((l) => l.includes("desconsiderar itens não movimentados desde 01/01/2025"))).toBe(true);
    expect(r.some((l) => l.includes("nenhum cadastro foi alterado"))).toBe(true);
  });
});

describe("planilha das listas finais", () => {
  it("gera as 5 abas e lê de volta o conteúdo certo", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { criarWorkbook } = await import("./listasFinais");
    const estado = {
      params: { desde: "2025-01-01" }, criterios: { duplicidade: { aprovado: true, por: "ana", em: "2026-10-20" } },
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

describe("listas finais: unidade de estoque (menor unidade, com a unidade maior como unidade de compra)", () => {
  const itensU = [
    item(2, "T1", "MILHO GRAO", "2026-01-10", { unidade: "TONELADA" }),
    item(3, "K1", "ADUBO", "2026-01-10", { unidade: "QUILOGRAM" }),
    item(4, "K2", "OUTRO ADUBO", "2026-01-10", { unidade: "QUILOGRAM" }),
    item(5, "B1", "SEMENTE DE SOJA", "2026-01-10", { unidade: "BB" }),
    item(6, "G1", "GRAXA  MULTIUSO", "2026-01-10", { unidade: "KG" }),
    item(7, "C1", "LUVA", "2026-01-10", { unidade: "CAIXA" }),
  ];
  const aprovada = (extra) => ({ acao: "ENC", status: "APR", grupo: "Peças", decididoPor: "ana", decididoEm: "2026-10-22", ...extra });
  const estadoU = {
    params: {}, criterios: { unidade: { aprovado: true, por: "ana", em: "2026-10-20" } },
    decisoes: {
      "2|unidade": aprovada({ tipo: "conversao", de: "TONELADA", para: "QUILOGRAM", fator: 1000, evidencia: "universal" }),
      "5|unidade": aprovada({ tipo: "conversao", de: "BB", para: "QUILOGRAM", fator: null, fatorFinal: 25 }),
      "6|unidade": aprovada({ tipo: "grafia", de: "KG", para: "QUILOGRAM" }),
      "6|padrao": aprovada({ sugerida: "GRAXA MULTIUSO" }),
      "7|unidade": { ...aprovada({ tipo: "conversao", de: "CAIXA", para: "UNIDADE", fator: null }), status: "PROP" },
    },
  };
  const listasU = (estado = estadoU) => {
    const escopo = aplicarEscopo(itensU, estado.params);
    return montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado, itens: itensU, escopo, testes: criarTestes(escopo.emEscopo, estado) });
  };
  const linha = (l, codigo) => l.finalCorrigida.find((i) => i.codigo === codigo);

  it("unidade aprovada traz a unidade de estoque proposta, a unidade de compra e os itens por unidade de compra", () => {
    const l = listasU();
    expect(linha(l, "T1")).toMatchObject({ unidade: "TONELADA", unidadeProposta: "QUILOGRAM", unidadeCompra: "TONELADA", itensPorCompra: 1000, mudanca: "Unidade de estoque ajustada" });
    expect(linha(l, "B1")).toMatchObject({ unidadeProposta: "QUILOGRAM", unidadeCompra: "BB", itensPorCompra: 25 }); // fator informado pelo analista
  });
  it("só mudança de grafia não cria unidade de compra, e soma com a correção de descrição", () => {
    const g1 = linha(listasU(), "G1");
    expect(g1).toMatchObject({ unidadeProposta: "QUILOGRAM", unidadeCompra: "", itensPorCompra: "", final: "GRAXA MULTIUSO", mudanca: "Descrição corrigida + Unidade de estoque ajustada" });
  });
  it("decisão só proposta não muda a lista, e a contagem separa descrição de unidade", () => {
    const l = listasU();
    expect(linha(l, "C1")).toMatchObject({ unidadeProposta: "", unidadeCompra: "", itensPorCompra: "", mudanca: "Mantido" });
    expect(l.contagem).toMatchObject({ descricoesCorrigidas: 1, unidadesAjustadas: 3 });
    expect(l.resumo.some((x) => x[0] === "Unidades de estoque ajustadas (aprovadas)" && x[1] === 3)).toBe(true);
  });
  it("conversão aprovada sem nenhum fator sai como 'a informar' (nunca um número inventado)", () => {
    const e = { ...estadoU, decisoes: { "7|unidade": aprovada({ tipo: "conversao", de: "CAIXA", para: "UNIDADE", fator: null }) } };
    expect(linha(listasU(e), "C1")).toMatchObject({ unidadeProposta: "UNIDADE", unidadeCompra: "CAIXA", itensPorCompra: "a informar" });
  });
  it("a aba de análises mostra a proposta com a unidade de compra e o fator (a confirmar quando vem da descrição)", () => {
    const an = listasU().analises.filter((a) => a.criterio === "Unidade de medida");
    const t1 = an.find((a) => a.codigo === "T1"); const b1 = an.find((a) => a.codigo === "B1"); const g1 = an.find((a) => a.codigo === "G1");
    expect(t1).toMatchObject({ achado: expect.stringContaining("1 TONELADA = 1.000 QUILOGRAM"), proposta: "QUILOGRAM · unidade de compra TONELADA · itens por unidade de compra: 1.000", decisao: "Aprovado", aprovador: "ana" });
    expect(b1.proposta).toBe("QUILOGRAM · unidade de compra BB · itens por unidade de compra: a informar"); // o sistema não sabia; o analista informou depois
    expect(g1.proposta).toBe("QUILOGRAM");
  });
  it("a planilha da lista final tem as colunas novas", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { criarWorkbook } = await import("./listasFinais");
    const wb = criarWorkbook(ExcelJS, listasU(), ["final"]);
    const lido = new ExcelJS.Workbook(); await lido.xlsx.load(await wb.xlsx.writeBuffer());
    const cab = lido.getWorksheet("Lista final corrigida").getRow(1).values.slice(1);
    expect(cab).toEqual(expect.arrayContaining(["Unidade de estoque (atual)", "Unidade de estoque (proposta)", "Unidade de compra (proposta)", "Itens por unidade de compra"]));
    const t1 = lido.getWorksheet("Lista final corrigida").getRow(2).values.slice(1);
    expect(t1).toEqual(expect.arrayContaining(["TONELADA", "QUILOGRAM", 1000]));
  });
});
