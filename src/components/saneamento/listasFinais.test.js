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

  const estadoE0 = () => ({ ...estado, execucao: { tipos: {}, registros: {} } });
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
  it("a desduplicação traz o saldo do código de origem e o do mantido, na escala escolhida", () => {
    const comSaldo = itens.map((i) => (i.linha === 2 ? { ...i, saldo: 3000000 } : i.linha === 3 ? { ...i, saldo: 12000000 } : i));
    const escopo = aplicarEscopo(comSaldo, estado.params);
    const l = montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado, itens: comSaldo, escopo, testes: criarTestes(escopo.emEscopo, estado), escalaSaldo: 1e6 });
    expect(l.desduplicacoes[0]).toMatchObject({ saldoOrigem: 3, saldoDestino: 12 });
    expect(base(estado).desduplicacoes[0]).toMatchObject({ saldoOrigem: "", saldoDestino: "" }); // base sem saldo: colunas vazias, nunca zero inventado
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
  it("critério sem achados abre aprovado e consta no resumo como aprovado automaticamente; o com achados só entra nas análises depois de aprovado", () => {
    const sem = base({ ...estado, criterios: {} }); // o analista não aprovou nada
    const resumo = sem.resumo.map((x) => x.join(" | "));
    expect(resumo.some((x) => x.includes("NCM e classificação cadastral | aprovado automaticamente (sem achados na base)"))).toBe(true);
    expect(resumo.some((x) => x.startsWith("Critérios aprovados | nenhum"))).toBe(false);
    expect(sem.analises).toEqual([]); // duplicidade e padronização têm achados e ainda não foram aprovadas
    const aprovada = base({ ...estado, criterios: { duplicidade: { aprovado: true, por: "ana", em: "2026-10-20" } } });
    expect(aprovada.analises.filter((a) => a.criterio === "Duplicidade").length).toBeGreaterThan(0);
    expect(aprovada.resumo.map((x) => x.join(" | ")).some((x) => x.includes("Duplicidade | aprovado por ana em 20/10/2026"))).toBe(true);
  });
  it("análise que não rodou na importação não vira \"aprovado automaticamente\": o resumo diz que está pendente; critério não aplicável consta com a justificativa", () => {
    const escopo = aplicarEscopo(itens, estado.params);
    const cobertura = { grupo: { completa: false, opcao: "grupos", falta: "a sugestão de grupos de produto" } };
    const e = { ...estado, criterios: { identidade: { aprovado: false, naoAplicavel: { por: "ana", em: "2026-10-23", justificativa: "Um só fabricante por código." } } } };
    const l = montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado: e, itens, escopo, testes: criarTestes(escopo.emEscopo, e), cobertura });
    const resumo = l.resumo.map((x) => x.join(" | "));
    expect(resumo.some((x) => x.includes("Grupo de itens | aprovado automaticamente"))).toBe(false);
    expect(resumo).toContain("  Grupo de itens | pendente: a análise de que o teste depende não foi executada nesta base");
    expect(resumo).toContain("  Identidade do produto | não se aplica ao projeto: Um só fabricante por código.");
    expect(resumo).toContain("Critérios fora do trabalho | ");
  });
  it("com os sem data tratados como anteriores à data, entram nos inativados com o critério próprio e o resumo conta", () => {
    const sem = [...itens, item(6, "E1", "ITEM SEM DATA", null)];
    const e = { ...estado, params: { desde: "2025-01-01", semData: "anterior" } };
    const escopo = aplicarEscopo(sem, e.params);
    const l = montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado: e, itens: sem, escopo, testes: criarTestes(escopo.emEscopo, e) });
    expect(l.inativados.map((i) => [i.codigo, i.criterio])).toEqual([["B1", "não movimentado desde 01/01/2025"], ["E1", "sem data de movimentação, tratado como anterior a 01/01/2025"]]);
    const resumo = l.resumo.map((x) => x.join(" | "));
    expect(resumo.some((x) => x.includes("desconsiderar itens não movimentados desde 01/01/2025; itens sem data de movimentação tratados como anteriores à data"))).toBe(true);
    expect(resumo).toContain("Itens sem data de movimentação legível | 1"); expect(resumo).toContain("  Mantidos no escopo (sinalizados) | 0"); expect(resumo).toContain("  Tratados como anteriores à data (fora do escopo) | 1");
    expect(l.contagem).toMatchObject({ semData: 1, semDataFora: 1, semDataEmEscopo: 0, inativados: 2 });
  });
  it("sem a opção, o item sem data continua em escopo, sinalizado, e o resumo conta", () => {
    const sem = [...itens, item(6, "E1", "ITEM SEM DATA", null)];
    const escopo = aplicarEscopo(sem, estado.params);
    const l = montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado, itens: sem, escopo, testes: criarTestes(escopo.emEscopo, estado) });
    expect(l.inativados.map((i) => i.codigo)).toEqual(["B1"]);
    const resumo = l.resumo.map((x) => x.join(" | "));
    expect(resumo).toContain("  Mantidos no escopo (sinalizados) | 1"); expect(resumo).toContain("  Tratados como anteriores à data (fora do escopo) | 0");
    expect(resumo.some((x) => x.includes("tratados como anteriores à data") && x.startsWith("Parâmetro"))).toBe(false);
  });
  it("grupo fora do saneamento não entra nas listas nem é inativado, e o resumo conta os grupos e os itens", () => {
    const e = estadoE0();
    const escopo = aplicarEscopo(itens, e.params, { Peças: true });
    const l = montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado: e, itens, escopo, testes: criarTestes(escopo.emEscopo, e) });
    expect(l.finalCorrigida).toEqual([]); expect(l.inativados).toEqual([]); // todos os itens de teste são do grupo Peças
    expect(l.desduplicacoes).toEqual([]); expect(l.execucao).toEqual([]); // as decisões do grupo ficam guardadas, mas fora das listas e das tarefas
    const resumo = l.resumo.map((x) => x.join(" | "));
    expect(resumo).toContain("Grupos fora do saneamento (não marcados na triagem) | 1"); expect(resumo).toContain("Itens dos grupos fora do saneamento | 4");
    expect(resumo).toContain("Universo (códigos) | 4"); expect(resumo).toContain("Em escopo | 0");
    expect(l.contagem).toMatchObject({ universo: 4, emEscopo: 0, gruposFora: 1, itensForaGrupos: 4 });
  });
  it("sem grupo desmarcado, o resumo não traz as linhas de grupos", () => {
    const resumo = base(estado).resumo.map((x) => x.join(" | "));
    expect(resumo.some((x) => x.startsWith("Grupos fora do saneamento"))).toBe(false);
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
    params: {}, politicaUnidade: { ativa: true, regras: {}, rotulos: { massa: "QUILOGRAM" } }, // o analista manteve o nome que o ERP do cliente usa para a massa
    criterios: { unidade: { aprovado: true, por: "ana", em: "2026-10-20" } },
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

describe("listas finais: execução (administrativo e almoxarifado)", () => {
  const aprov = (extra) => ({ acao: "ENC", status: "APR", grupo: "Peças", decididoPor: "ana", decididoEm: "2026-10-21", ...extra });
  const estadoE = (registros = {}) => ({
    params: { desde: "2025-01-01" }, criterios: { duplicidade: { aprovado: true, por: "ana", em: "2026-10-20" } },
    decisoes: { "2|duplicidade": aprov({ destino: 3 }), "5|padrao": aprov({ sugerida: "CORREIA A72", final: "CORREIA A-72 TRAPEZOIDAL" }) },
    execucao: { tipos: {}, registros },
  });
  const ok = (e) => ({ status: "FEITO", evidencia: e, por: "ana", em: "2026-10-22" });
  it("as tarefas saem das decisões aprovadas e dos itens inativados, e a aba Execução mostra a confirmação de cada frente", () => {
    const l = base(estadoE({ "2|duplicidade": { adm: ok("SAP 1"), alm: ok("foto 2") } }));
    expect(l.execucao.map((x) => x.tarefa)).toEqual(["Unificar códigos duplicados", "Corrigir descrição", "Inativar item sem movimento"]);
    expect(l.execucao[0]).toMatchObject({ codigo: "A1", adm: "Confirmado", evidAdm: "SAP 1", alm: "Confirmado", situacao: "Concluída" });
    expect(l.execucao[1]).toMatchObject({ codigo: "C1", adm: "Pendente", alm: "Não se aplica", situacao: "Pendente" });
    expect(l.execucao[2]).toMatchObject({ codigo: "B1", tarefa: "Inativar item sem movimento" });
    expect(l.contagem).toMatchObject({ tarefas: 3, concluidas: 1, pendentes: 2, emAndamento: 0, divergencias: 0 });
  });
  it("a lista final corrigida diz a situação da execução de cada item, e o resumo conta as tarefas", () => {
    const l = base(estadoE({ "5|padrao": { adm: { status: "DIV", obs: "já alterada" } } }));
    expect(l.finalCorrigida.find((i) => i.codigo === "C1").execucao).toBe("Com divergência");
    expect(l.finalCorrigida.find((i) => i.codigo === "A2").execucao).toBe(""); // sem tarefa
    const resumo = l.resumo.map((x) => x.join(" | "));
    expect(resumo.some((x) => x.startsWith("Tarefas de execução (decisões aprovadas e itens inativados) | 3"))).toBe(true);
    expect(resumo.some((x) => x.startsWith("  Com divergência | 1"))).toBe(true);
  });
  it("tirar um tipo da execução tira as tarefas dele da aba e do resumo", () => {
    const e = estadoE(); e.execucao.tipos = { inativacao: { incluir: false } };
    expect(base(e).execucao.map((x) => x.codigo)).toEqual(["A1", "C1"]);
    expect(base(e).contagem.tarefas).toBe(2);
  });
  it("a planilha do pacote completo tem a aba Execução e a coluna na lista final", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { criarWorkbook } = await import("./listasFinais");
    const wb = criarWorkbook(ExcelJS, base(estadoE({ "2|duplicidade": { adm: ok("SAP 1") } })), ["final", "execucao"]);
    const lido = new ExcelJS.Workbook(); await lido.xlsx.load(await wb.xlsx.writeBuffer());
    expect(lido.worksheets.map((w) => w.name)).toEqual(["Lista final corrigida", "Execução"]);
    expect(lido.getWorksheet("Lista final corrigida").getRow(1).values.slice(1)).toContain("Execução");
    const ex = lido.getWorksheet("Execução"); expect(ex.rowCount).toBe(4);
    expect(ex.getRow(1).values.slice(1)).toEqual(expect.arrayContaining(["Lote (grupo)", "Administrativo", "Almoxarifado", "Situação da tarefa"]));
    expect(ex.getRow(2).getCell(6).value).toBe("Confirmado"); // administrativo da unificação
  });
});
