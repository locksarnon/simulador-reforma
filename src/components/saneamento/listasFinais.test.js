import { describe, expect, it } from "vitest";
import { aplicarEscopo, criarTestes } from "./logica";
import { linhasQueSaem, montarListas, unificacoesAprovadas } from "./listasFinais";
import { aprovarLote } from "./inativacao";

const item = (linha, codigo, descricao, ultima_mov, extra = {}) => ({ linha, codigo, descricao, ultima_mov, unidade: "UN", grupo_atual: "Peças", problemas: [], ...extra });
const dup = (mestre) => ({ nivel: "EXATA", score: 1, grupo: 0, mestre, candidatos: [{ linha: mestre, score: 1, nivel: "EXATA", motivos: ["descrição idêntica"] }] });

const itens = [
  item(2, "A1", "ANEL  TRAVA 123", "2026-01-10", { duplicidade: dup(3) }),
  item(3, "A2", "ANEL TRAVA 123", "2026-02-01", { duplicidade: dup(3) }),
  item(4, "B1", "FILTRO DE AR", "2023-05-05"),
  item(5, "C1", "CORREIA A-72", "2025-12-01"),
];
// o corte só seleciona candidatos: a inativação entra nas tarefas só depois de aprovada (aqui, em lote, com a lista fechada do grupo)
const loteB1 = () => aprovarLote(null, "Peças", { lista: ["B1"], justificativa: "Item parado há mais de dois anos, conferido.", verificacoes: {}, base: { id: "v1", arquivo: "itens.xlsx" }, extraidaEm: "2026-10-21", corte: "2025-01-01", semData: "manter", por: "ana", em: "2026-10-22", saldoLidoEmTodos: true });
const base = (estado) => {
  const escopo = aplicarEscopo(itens, estado.params);
  return montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado, itens, escopo, testes: criarTestes(escopo.emEscopo, estado) });
};

describe("listas finais do saneamento", () => {
  const estado = {
    params: { desde: "2025-01-01" },
    criterios: { duplicidade: { aprovado: true, por: "ana", em: "2026-10-20" } },
    decisoes: {
      "A1|duplicidade": { acao: "ENC", status: "APR", grupo: "Peças", destino: "A2", decididoPor: "ana", decididoEm: "2026-10-21" },
      "C1|padrao": { acao: "ENC", status: "APR", sugerida: "CORREIA A72", final: "CORREIA A-72 TRAPEZOIDAL", origemFinal: "cliente", decididoPor: "cli", decididoEm: "2026-10-22" },
    },
  };

  const estadoE0 = () => ({ ...estado, execucao: { tipos: {}, registros: {} } });
  it("a lista de candidatos à inativação traz o critério do corte e a situação: sem aprovação o item só aguarda; aprovado em lote, traz o aprovador e a data", () => {
    const l = base(estado);
    expect(l.candidatos.map((i) => i.codigo)).toEqual(["B1"]);
    expect(l.candidatos[0]).toMatchObject({ criterio: "não movimentado desde 01/01/2025", situacao: "Elegível: aguarda a aprovação da lista", aprovador: "", data: "" });
    expect(l.contagem).toMatchObject({ candidatosInativacao: 1, inativacaoAprovada: 0, inativacaoAguardando: 1 }); // nenhuma tarefa de inativação nasce do corte
    expect(l.execucao.some((x) => x.tarefa.startsWith("Inativar"))).toBe(false);
    const aprov = base({ ...estado, inativacao: loteB1() });
    expect(aprov.candidatos[0]).toMatchObject({ situacao: "Aprovado em lote", aprovador: "ana", data: "22/10/2026" });
    expect(aprov.contagem).toMatchObject({ candidatosInativacao: 1, inativacaoAprovada: 1, inativacaoAguardando: 0 });
    expect(aprov.execucao.some((x) => x.tarefa === "Inativar item aprovado por data de uso" && x.codigo === "B1")).toBe(true);
    const resumo = aprov.resumo.map((x) => x.join(" | "));
    expect(resumo).toContain("Candidatos à inativação por data de uso (fora do escopo) | 1"); expect(resumo).toContain("  Com a inativação aprovada (lote ou individual) | 1"); expect(resumo).toContain("  Aguardando aprovação | 0");
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
  it("sem o código que fica na decisão, o item não sai da lista final: o mestre de hoje não decide por quem aprovou; e a pontuação da regra de observação não vira similaridade", () => {
    const semDestino = { ...estado, decisoes: { "A1|duplicidade": { ...estado.decisoes["A1|duplicidade"], destino: null } } };
    expect(linhasQueSaem(semDestino, itens).has(2)).toBe(false); expect(linhasQueSaem(estado, itens).has(2)).toBe(true);
    expect(base(estado).desduplicacoes[0].similaridade).toBe(1); // do detector: a pontuação
    const daRegra = itens.map((i) => (i.linha === 2 ? { ...i, duplicidade: { ...i.duplicidade, candidatos: [{ linha: 3, score: 0.95, nivel: "MUITO_PROVAVEL", motivos: ["mesmo produto"], origem: "observacao" }] } } : i));
    const escopo = aplicarEscopo(daRegra, estado.params); const l = montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado, itens: daRegra, escopo, testes: criarTestes(escopo.emEscopo, estado) });
    expect(l.desduplicacoes[0].similaridade).toBe(""); expect(l.desduplicacoes[0].motivos).toBe("mesmo produto");
  });
  it("a desduplicação traz a variante (observação) de quem sai para o campo adicional do mantido; o código mantido não leva observação", () => {
    const comObs = { ...estado, decisoes: { ...estado.decisoes, "A1|duplicidade": { ...estado.decisoes["A1|duplicidade"], observacao: ["CLEAR", "INCOLOR"] } } };
    expect(base(comObs).desduplicacoes[0].observacao).toBe("CLEAR, INCOLOR"); expect(base(estado).desduplicacoes[0].observacao).toBe("");
    const indicacaoDeHoje = itens.map((i) => (i.linha === 2 ? { ...i, duplicidade: { ...i.duplicidade, observacao: { palavras: ["AZUL"] } } } : i)); const esc = aplicarEscopo(indicacaoDeHoje, estado.params);
    expect(montarListas({ nomeProjeto: "P", nomeBase: "b.xlsx", estado, itens: indicacaoDeHoje, escopo: esc, testes: criarTestes(esc.emEscopo, estado) }).desduplicacoes[0].observacao).toBe(""); // a decisão não guardou nota: a indicação de hoje não vira nota
    const mantido = { ...estado, decisoes: { "A1|duplicidade": { ...estado.decisoes["A1|duplicidade"], destino: "A1", observacao: ["CLEAR"] } } }; // o próprio código fica: sem baixa
    expect(base(mantido).desduplicacoes[0]).toMatchObject({ acao: "Código mantido (sem baixa)", observacao: "" });
  });
  it("descrição final é a aprovada (do cliente, quando ele ajustou) e a original fica registrada", () => {
    const c1 = base(estado).finalCorrigida.find((i) => i.codigo === "C1");
    expect(c1).toMatchObject({ original: "CORREIA A-72", final: "CORREIA A-72 TRAPEZOIDAL", mudanca: "Descrição corrigida", origem: "Ajustada pelo cliente" });
  });
  it("decisão só proposta ou rejeitada não muda nada na lista final", () => {
    const e2 = { ...estado, decisoes: { "A1|duplicidade": { acao: "ENC", status: "PROP", destino: "A2" }, "C1|padrao": { acao: "ENC", status: "REJ", sugerida: "X" } } };
    const l = base(e2);
    expect(l.finalCorrigida.map((i) => i.codigo)).toEqual(["A1", "A2", "C1"]);
    expect(l.finalCorrigida.find((i) => i.codigo === "C1").mudanca).toBe("Mantido");
    expect(l.contagem.unificacoesPendentes).toBe(1);
  });
  it("critério sem achados abre aprovado e consta no resumo como aprovado automaticamente; o com achados só entra nas análises depois de aprovado", () => {
    const sem = base({ ...estado, criterios: {} }); // o analista não aprovou nada
    const resumo = sem.resumo.map((x) => x.join(" | "));
    expect(resumo).toContain("  NCM e classificação cadastral | Verificada sem achados · Teste automático sem achados: a regra abriu aprovada");
    expect(resumo.some((x) => x.startsWith("Checagens | ") && x.includes("pendentes"))).toBe(true); // o resumo conta as checagens por estado
    expect(sem.analises).toEqual([]); // duplicidade e padronização têm achados e ainda não foram aprovadas
    const aprovada = base({ ...estado, criterios: { duplicidade: { aprovado: true, por: "ana", em: "2026-10-20" } } });
    expect(aprovada.analises.filter((a) => a.criterio === "Duplicidade").length).toBeGreaterThan(0);
    expect(aprovada.resumo.map((x) => x.join(" | ")).some((x) => x.startsWith("  Duplicidade | Pendente: ") && x.includes("Regra aprovada por ana em 20/10/2026"))).toBe(true); // regra aprovada, mas os grupos com achado ainda não foram concluídos
  });
  it("análise que não rodou na importação não vira \"aprovado automaticamente\": o resumo diz que está pendente; critério não aplicável consta com a justificativa", () => {
    const escopo = aplicarEscopo(itens, estado.params);
    const cobertura = { grupo: { completa: false, opcao: "grupos", falta: "a sugestão de grupos de produto" } };
    const e = { ...estado, criterios: { identidade: { aprovado: false, naoAplicavel: { por: "ana", em: "2026-10-23", justificativa: "Um só fabricante por código." } } } };
    const l = montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado: e, itens, escopo, testes: criarTestes(escopo.emEscopo, e), cobertura });
    const resumo = l.resumo.map((x) => x.join(" | "));
    expect(resumo.some((x) => x.includes("Grupo de itens | Verificada sem achados"))).toBe(false);
    expect(resumo).toContain("  Grupo de itens | Pendente: a análise de que o teste depende não foi executada nesta base");
    expect(resumo).toContain("  Identidade do produto | Não se aplica · Declarada não aplicável por ana em 23/10/2026: Um só fabricante por código.");
  });
  it("com os sem data tratados como anteriores à data, entram nos candidatos à inativação com o critério próprio e o resumo conta", () => {
    const sem = [...itens, item(6, "E1", "ITEM SEM DATA", null)];
    const e = { ...estado, params: { desde: "2025-01-01", semData: "anterior" } };
    const escopo = aplicarEscopo(sem, e.params);
    const l = montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado: e, itens: sem, escopo, testes: criarTestes(escopo.emEscopo, e) });
    expect(l.candidatos.map((i) => [i.codigo, i.criterio])).toEqual([["B1", "não movimentado desde 01/01/2025"], ["E1", "sem data de movimentação, tratado como anterior a 01/01/2025"]]); // ambos candidatos: o corte não os inativa
    const resumo = l.resumo.map((x) => x.join(" | "));
    expect(resumo.some((x) => x.includes("desconsiderar itens não movimentados desde 01/01/2025; itens sem data de movimentação tratados como anteriores à data"))).toBe(true);
    expect(resumo).toContain("Itens sem data de movimentação legível | 1"); expect(resumo).toContain("  Mantidos no escopo (sinalizados) | 0"); expect(resumo).toContain("  Tratados como anteriores à data (fora do escopo) | 1");
    expect(l.contagem).toMatchObject({ semData: 1, semDataFora: 1, semDataEmEscopo: 0, candidatosInativacao: 2 });
  });
  it("sem a opção, o item sem data continua em escopo, sinalizado, e o resumo conta", () => {
    const sem = [...itens, item(6, "E1", "ITEM SEM DATA", null)];
    const escopo = aplicarEscopo(sem, estado.params);
    const l = montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado, itens: sem, escopo, testes: criarTestes(escopo.emEscopo, estado) });
    expect(l.candidatos.map((i) => i.codigo)).toEqual(["B1"]);
    const resumo = l.resumo.map((x) => x.join(" | "));
    expect(resumo).toContain("  Mantidos no escopo (sinalizados) | 1"); expect(resumo).toContain("  Tratados como anteriores à data (fora do escopo) | 0");
    expect(resumo.some((x) => x.includes("tratados como anteriores à data") && x.startsWith("Parâmetro"))).toBe(false);
  });
  it("grupo fora do saneamento não entra nas listas nem é candidato à inativação, e o resumo conta os grupos e os itens", () => {
    const e = estadoE0();
    const escopo = aplicarEscopo(itens, e.params, { Peças: true });
    const l = montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado: e, itens, escopo, testes: criarTestes(escopo.emEscopo, e) });
    expect(l.finalCorrigida).toEqual([]); expect(l.candidatos).toEqual([]); // todos os itens de teste são do grupo Peças
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
    expect(l.candidatos.map((i) => i.codigo)).toEqual(["B1"]);
    expect(l.candidatos[0].criterio).toBe("não movimentado desde 01/01/2025");
    expect(l.resumo.some((x) => x.join(" ").includes("desconsiderar itens não movimentados desde 01/01/2025"))).toBe(true);
  });
  it("sem corte, ninguém é candidato à inativação e o resumo diz 'sem corte'", () => {
    const l = base({ ...estado, params: { desde: "" } });
    expect(l.candidatos).toEqual([]);
    expect(l.resumo.find((x) => x[0] === "Parâmetro de saneamento")[1]).toBe("sem corte");
  });
  it("mestre da própria decisão não é baixado", () => {
    const e3 = { ...estado, decisoes: { "A2|duplicidade": { acao: "ENC", status: "APR", destino: "A2" } } };
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
      decisoes: { "A1|duplicidade": { acao: "ENC", status: "APR", grupo: "Peças", destino: "A2", decididoPor: "ana", decididoEm: "2026-10-21" } },
    };
    const escopo = aplicarEscopo(itens, estado.params);
    const listas = montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado, itens, escopo, testes: criarTestes(escopo.emEscopo, estado) });
    const wb = criarWorkbook(ExcelJS, listas, ["resumo", "final", "dedup", "analises", "candidatos"]);
    const buf = await wb.xlsx.writeBuffer();
    const lido = new ExcelJS.Workbook(); await lido.xlsx.load(buf);
    expect(lido.worksheets.map((w) => w.name)).toEqual(["Resumo", "Lista final corrigida", "Desduplicações", "Análises", "Candidatos à inativação"]);
    expect(lido.getWorksheet("Candidatos à inativação").getRow(2).getCell(1).value).toBe("B1");
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
      "T1|unidade": aprovada({ tipo: "conversao", de: "TONELADA", para: "QUILOGRAM", fator: 1000, evidencia: "universal" }),
      "B1|unidade": aprovada({ tipo: "conversao", de: "BB", para: "QUILOGRAM", fator: null, fatorFinal: 25 }),
      "G1|unidade": aprovada({ tipo: "grafia", de: "KG", para: "QUILOGRAM" }),
      "G1|padrao": aprovada({ sugerida: "GRAXA MULTIUSO" }),
      "C1|unidade": { ...aprovada({ tipo: "conversao", de: "CAIXA", para: "UNIDADE", fator: null }), status: "PROP" },
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
    const e = { ...estadoU, decisoes: { "C1|unidade": aprovada({ tipo: "conversao", de: "CAIXA", para: "UNIDADE", fator: null }) } };
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
    decisoes: { "A1|duplicidade": aprov({ destino: "A2" }), "C1|padrao": aprov({ sugerida: "CORREIA A72", final: "CORREIA A-72 TRAPEZOIDAL" }) },
    inativacao: loteB1(), execucao: { tipos: {}, registros },
  });
  const ok = (e) => ({ status: "FEITO", evidencia: e, por: "ana", em: "2026-10-22" });
  it("as tarefas saem das decisões aprovadas e dos itens inativados, e a aba Execução mostra a confirmação de cada frente", () => {
    const l = base(estadoE({ "A1|duplicidade": { adm: ok("SAP 1"), alm: ok("foto 2") } }));
    expect(l.execucao.map((x) => x.tarefa)).toEqual(["Unificar códigos duplicados", "Corrigir descrição", "Inativar item aprovado por data de uso"]);
    expect(l.execucao[0]).toMatchObject({ codigo: "A1", adm: "Confirmado", evidAdm: "SAP 1", alm: "Confirmado", situacao: "Concluída" });
    expect(l.execucao[1]).toMatchObject({ codigo: "C1", adm: "Pendente", alm: "Não se aplica", situacao: "Pendente" });
    expect(l.execucao[2]).toMatchObject({ codigo: "B1", tarefa: "Inativar item aprovado por data de uso" });
    expect(l.contagem).toMatchObject({ tarefas: 3, concluidas: 1, pendentes: 2, emAndamento: 0, divergencias: 0 });
  });
  it("a lista final corrigida diz a situação da execução de cada item, e o resumo conta as tarefas", () => {
    const l = base(estadoE({ "C1|padrao": { adm: { status: "DIV", obs: "já alterada" } } }));
    expect(l.finalCorrigida.find((i) => i.codigo === "C1").execucao).toBe("Com divergência");
    expect(l.finalCorrigida.find((i) => i.codigo === "A2").execucao).toBe(""); // sem tarefa
    const resumo = l.resumo.map((x) => x.join(" | "));
    expect(resumo.some((x) => x.startsWith("Tarefas de execução (decisões e inativações aprovadas) | 3"))).toBe(true);
    expect(resumo.some((x) => x.startsWith("  Com divergência | 1"))).toBe(true);
  });
  it("item com código repetido na base não recebe a decisão do outro: nem a lista final, nem as análises, nem as desduplicações a leem", () => {
    const rep = [item(2, "R1", "ANEL  TRAVA 9", "2026-01-10"), item(3, "R1", "OUTRO PRODUTO", "2026-01-10"), item(4, "R2", "PINO  X", "2026-01-10")];
    const e = { params: { desde: "2025-01-01" }, criterios: { padrao: { aprovado: true, por: "ana", em: "2026-10-20" } }, decisoes: {
      "R1|padrao": { acao: "ENC", status: "APR", sugerida: "ANEL TRAVA 9", decididoPor: "ana", decididoEm: "2026-10-21" },
      "R2|padrao": { acao: "ENC", status: "APR", sugerida: "PINO X", antes: { descricao: "PINO  X" }, decididoPor: "ana", decididoEm: "2026-10-21" } } };
    const escopo = aplicarEscopo(rep, e.params);
    const l = montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado: e, itens: rep, escopo, testes: criarTestes(escopo.emEscopo, e) });
    const finais = (cod) => l.finalCorrigida.filter((x) => x.codigo === cod).map((x) => x.final);
    expect(finais("R1")).toEqual(["ANEL  TRAVA 9", "OUTRO PRODUTO"]); // a decisão do código repetido não vale para nenhum dos dois
    expect(finais("R2")).toEqual(["PINO X"]);
    const padrao = l.analises.filter((x) => x.criterio === "Padronização da descrição");
    expect(padrao.find((x) => x.codigo === "R1").decisao).toBe("Não encaminhado"); expect(padrao.find((x) => x.codigo === "R2").decisao).toBe("Aprovado");
    expect(l.execucao.map((x) => x.codigo)).toEqual(["R2"]); // só o item identificável gera tarefa
  });
  it("a decisão aprovada de um cadastro que mudou depois não conta como aprovada nas listas nem gera tarefa", () => {
    const mud = [item(2, "M1", "PARAFUSO NOVO NOME", "2026-01-10"), item(3, "M2", "ANEL  TRAVA 9", "2026-01-10")];
    const e = { params: { desde: "2025-01-01" }, criterios: { padrao: { aprovado: true, por: "ana", em: "2026-10-20" } }, decisoes: {
      "M1|padrao": { acao: "ENC", status: "APR", sugerida: "PARAFUSO 10", antes: { descricao: "PARAFUSO  10" }, decididoPor: "ana", decididoEm: "2026-10-21" }, // o cadastro virou outra coisa
      "M2|padrao": { acao: "ENC", status: "APR", sugerida: "ANEL TRAVA 9", antes: { descricao: "ANEL  TRAVA 9" }, decididoPor: "ana", decididoEm: "2026-10-21" } } };
    const escopo = aplicarEscopo(mud, e.params);
    const l = montarListas({ nomeProjeto: "Projeto", nomeBase: "itens.xlsx", estado: e, itens: mud, escopo, testes: criarTestes(escopo.emEscopo, e) });
    expect(l.finalCorrigida.find((x) => x.codigo === "M1").final).toBe("PARAFUSO NOVO NOME"); expect(l.finalCorrigida.find((x) => x.codigo === "M2").final).toBe("ANEL TRAVA 9");
    expect(l.execucao.map((x) => x.codigo)).toEqual(["M2"]);
  });
  it("tirar um tipo da execução tira as tarefas dele da aba e do resumo", () => {
    const e = estadoE(); e.execucao.tipos = { inativacao: { incluir: false } };
    expect(base(e).execucao.map((x) => x.codigo)).toEqual(["A1", "C1"]);
    expect(base(e).contagem.tarefas).toBe(2);
  });
  it("a planilha do pacote completo tem a aba Execução e a coluna na lista final", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { criarWorkbook } = await import("./listasFinais");
    const wb = criarWorkbook(ExcelJS, base(estadoE({ "A1|duplicidade": { adm: ok("SAP 1") } })), ["final", "execucao"]);
    const lido = new ExcelJS.Workbook(); await lido.xlsx.load(await wb.xlsx.writeBuffer());
    expect(lido.worksheets.map((w) => w.name)).toEqual(["Lista final corrigida", "Execução"]);
    expect(lido.getWorksheet("Lista final corrigida").getRow(1).values.slice(1)).toContain("Execução");
    const ex = lido.getWorksheet("Execução"); expect(ex.rowCount).toBe(4);
    expect(ex.getRow(1).values.slice(1)).toEqual(expect.arrayContaining(["Lote (grupo)", "Administrativo", "Almoxarifado", "Situação da tarefa"]));
    expect(ex.getRow(2).getCell(6).value).toBe("Confirmado"); // administrativo da unificação
  });
});
