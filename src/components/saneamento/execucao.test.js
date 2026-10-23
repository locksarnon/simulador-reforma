import { describe, expect, it } from "vitest";
import { aplicarEscopo } from "./logica";
import {
  COLUNAS_EXECUCAO, COLUNAS_FRENTE, FRENTES, TIPOS_TAREFA, aplicarRespostaExecucao, gerarTarefas, interpretarRespostaExecucao, lerRespostaExecucao, linhasExecucao,
  linhasListaFrente, mapearColunasExecucao, resumoExecucao, situacaoFrente, situacaoPorLinha, situacaoTarefa, tiposEfetivos,
} from "./execucao";

const item = (linha, codigo, descricao, extra = {}) => ({ linha, codigo, descricao, unidade: "UN", grupo_atual: "Peças", ultima_mov: "2026-01-10", problemas: [], ...extra });
const itens = [
  item(2, "A1", "ANEL  TRAVA 123", { duplicidade: { mestre: 3 } }), item(3, "A2", "ANEL TRAVA 123"),
  item(4, "B1", "FILTRO DE AR", { grupo_atual: "Insumos", unidade: "TONELADA", ultima_mov: "2023-05-05" }),
  item(5, "C1", "CORREIA A-72", { unidade: "KG" }), item(6, "D1", "SEMENTE", { unidade: "BB", grupo_atual: "Insumos" }),
];
const apr = (extra) => ({ acao: "ENC", status: "APR", grupo: "Peças", decididoPor: "ana", decididoEm: "2026-10-21", ...extra });
const decisoes = {
  "A1|duplicidade": apr({ destino: "A2" }),
  "A2|duplicidade": apr({ destino: "A2" }), // código mantido: nada a unificar
  "C1|padrao": apr({ sugerida: "CORREIA A72", final: "CORREIA A-72 TRAPEZOIDAL" }),
  "B1|unidade": apr({ grupo: "Insumos", tipo: "conversao", de: "TONELADA", para: "QUILOGRAM", fator: 1000, evidencia: "universal" }),
  "D1|unidade": apr({ grupo: "Insumos", tipo: "conversao", de: "BB", para: "QUILOGRAM", fator: null }),
  "C1|unidade": apr({ tipo: "grafia", de: "KG", para: "QUILOGRAM" }),
  "B1|ncm": apr({ grupo: "Insumos" }),
  "A1|padrao": { acao: "ENC", status: "PROP", sugerida: "X" }, // aguardando decisão: não é aprovação
  "A2|padrao": { acao: "ENC", status: "REJ", sugerida: "Y" },
  "ZZ|padrao": apr({ sugerida: "Z" }), // item que não existe mais na base
};
const params = { desde: "2025-01-01" };
const escopo = aplicarEscopo(itens, params);
const gerar = (tipos = {}) => gerarTarefas({ decisoes, tipos, itens, escopo, params });
const tarefa = (r, id) => r.tarefas.find((t) => t.id === id);

describe("tarefas a partir das decisões aprovadas", () => {
  const r = gerar();
  it("só decisão aprovada vira tarefa; aguardando, rejeitada, código mantido e item que sumiu não", () => {
    expect(r.tarefas.map((t) => t.id)).toEqual(["B1|unidade", "D1|unidade", "B1|inativacao", "B1|ncm", "A1|duplicidade", "C1|padrao", "C1|unidade"]);
    expect(r.geradasPorTipo).toEqual({ unificacao: 1, descricao: 1, unidade: 2, grafia: 1, outro: 1, inativacao: 1 });
  });
  it("cada lote (grupo) traz as tarefas na ordem dos tipos", () => {
    expect([...new Set(r.tarefas.map((t) => t.grupo))]).toEqual(["Insumos", "Peças"]);
    expect(tarefa(r, "B1|inativacao").grupo).toBe("Insumos"); // inativação usa o grupo do item
  });
  it("unificação: administrativo transfere e inativa o de origem; almoxarifado realoca o saldo físico", () => {
    const t = tarefa(r, "A1|duplicidade");
    expect(t).toMatchObject({ tipo: "unificacao", codigo: "A1", aplica: { adm: true, alm: true } });
    expect(t.instrucao.adm).toContain("Unificar no código A2 (ANEL TRAVA 123)");
    expect(t.instrucao.adm).toContain("inativar o código de origem A1");
    expect(t.instrucao.alm).toBe("Realocar o saldo físico do código A1 para o endereço do código A2 e trocar a identificação (etiqueta).");
  });
  it("descrição: só administrativo por padrão", () => {
    const t = tarefa(r, "C1|padrao");
    expect(t).toMatchObject({ tipo: "descricao", aplica: { adm: true, alm: false } });
    expect(t.instrucao).toEqual({ adm: "Alterar a descrição para: CORREIA A-72 TRAPEZOIDAL", alm: "" });
  });
  it("unidade: conversão com unidade de compra e fator, recontagem física; sem fator fica a informar; grafia é só cadastro", () => {
    const a = tarefa(r, "B1|unidade");
    expect(a).toMatchObject({ tipo: "unidade", aplica: { adm: true, alm: true } });
    expect(a.instrucao.adm).toContain("Unidade de estoque: TONELADA → QUILOGRAM. Unidade de compra: TONELADA; itens por unidade de compra: 1.000.");
    expect(a.instrucao.adm).toContain("conforme o piloto");
    expect(a.instrucao.alm).toBe("Recontar o saldo físico em QUILOGRAM e trocar a identificação do endereço.");
    expect(tarefa(r, "D1|unidade").instrucao.adm).toContain("itens por unidade de compra: a informar");
    expect(tarefa(r, "C1|unidade")).toMatchObject({ tipo: "grafia", aplica: { adm: true, alm: false }, instrucao: { adm: "Trocar a grafia da unidade: KG → QUILOGRAM.", alm: "" } });
  });
  it("item fora do escopo pelo parâmetro vira tarefa de inativação com a data do corte", () => {
    const t = tarefa(r, "B1|inativacao");
    expect(t).toMatchObject({ tipo: "inativacao", aplica: { adm: true, alm: false } });
    expect(t.instrucao.adm).toBe("Inativar o item (não movimentado desde 01/01/2025).");
    expect(gerarTarefas({ decisoes: {}, tipos: {}, itens, escopo: aplicarEscopo(itens, { desde: "" }), params: { desde: "" } }).tarefas).toEqual([]);
  });
  it("item inativado por não ter data (tratado como anterior à data) leva o critério próprio na instrução", () => {
    const sem = [...itens, item(7, "F1", "SEM DATA", { ultima_mov: null })];
    const p = { desde: "2025-01-01", semData: "anterior" };
    const t = gerarTarefas({ decisoes: {}, tipos: {}, itens: sem, escopo: aplicarEscopo(sem, p), params: p }).tarefas;
    expect(t.map((x) => x.id)).toEqual(["B1|inativacao", "F1|inativacao"]);
    expect(t[0].instrucao.adm).toBe("Inativar o item (não movimentado desde 01/01/2025).");
    expect(t[1].instrucao.adm).toBe("Inativar o item (sem data de movimentação, tratado como anterior a 01/01/2025).");
  });
  it("critério sem receita própria vira tarefa genérica com o nome do critério", () => {
    expect(tarefa(r, "B1|ncm")).toMatchObject({ tipo: "outro", instrucao: { adm: 'Tratar conforme o critério "NCM e classificação cadastral" (aprovado no passo De/para).', alm: "" } });
  });
  it("o analista escolhe os tipos que entram e as frentes que participam; sem receita física não existe almoxarifado", () => {
    const c = gerar({ unificacao: { alm: false }, inativacao: { incluir: false }, descricao: { alm: true }, grafia: { alm: true } });
    expect(tarefa(c, "A1|duplicidade").aplica.alm).toBe(false); expect(tarefa(c, "A1|duplicidade").instrucao.alm).toBe("");
    expect(tarefa(c, "B1|inativacao")).toBeUndefined(); expect(c.geradasPorTipo.inativacao).toBe(1); // sai da execução, mas a contagem mostra o que foi tirado
    expect(tarefa(c, "C1|padrao").aplica.alm).toBe(true); expect(tarefa(c, "C1|padrao").instrucao.alm).toContain("etiqueta");
    expect(tarefa(c, "C1|unidade").aplica.alm).toBe(false);
    expect(tiposEfetivos({ grafia: { alm: true } }).grafia.alm).toBe(false);
    expect(tiposEfetivos({}).unificacao).toEqual({ incluir: true, alm: true });
  });
});

describe("situação: só conta como concluída quando as duas pontas confirmam com evidência", () => {
  it("cada frente", () => {
    expect(situacaoFrente(false, { status: "FEITO", evidencia: "x" })).toBe("NA");
    expect(situacaoFrente(true, undefined)).toBe("PENDENTE");
    expect(situacaoFrente(true, { evidencia: "só digitou a evidência" })).toBe("PENDENTE");
    expect(situacaoFrente(true, { status: "FEITO", evidencia: "SAP 1" })).toBe("FEITO");
    expect(situacaoFrente(true, { status: "FEITO", evidencia: "  " })).toBe("SEM_EVIDENCIA"); // sem prova, pendente
    expect(situacaoFrente(true, { status: "DIV", obs: "SAP bloqueou" })).toBe("DIVERGENCIA");
  });
  it("tarefa com as duas frentes", () => {
    const t = { aplica: { adm: true, alm: true } }; const ok = { status: "FEITO", evidencia: "x" };
    expect(situacaoTarefa(t, undefined)).toEqual({ adm: "PENDENTE", alm: "PENDENTE", geral: "PENDENTE" });
    expect(situacaoTarefa(t, { adm: ok }).geral).toBe("EM_ANDAMENTO");
    expect(situacaoTarefa(t, { adm: ok, alm: { status: "FEITO" } }).geral).toBe("EM_ANDAMENTO"); // almoxarifado sem evidência
    expect(situacaoTarefa(t, { adm: ok, alm: ok }).geral).toBe("CONCLUIDA");
    expect(situacaoTarefa(t, { adm: ok, alm: { status: "DIV" } }).geral).toBe("DIVERGENCIA");
  });
  it("tarefa só do administrativo conclui com uma frente", () => {
    const t = { aplica: { adm: true, alm: false } };
    expect(situacaoTarefa(t, { adm: { status: "FEITO", evidencia: "x" } })).toEqual({ adm: "FEITO", alm: "NA", geral: "CONCLUIDA" });
    expect(situacaoTarefa(t, undefined).geral).toBe("PENDENTE");
  });
});

describe("resumo, listas e situação por item", () => {
  const { tarefas } = gerar();
  const ok = (evid) => ({ status: "FEITO", evidencia: evid, por: "ana", em: "2026-10-22" });
  const registros = {
    "A1|duplicidade": { adm: ok("SAP 123/2026"), alm: ok("foto 7") },
    "C1|padrao": { adm: { status: "DIV", obs: "descrição já alterada por outro processo", por: "ana", em: "2026-10-22" } },
    "B1|unidade": { adm: { status: "FEITO", evidencia: "" } },
  };
  it("totais gerais, por frente e por lote", () => {
    const r = resumoExecucao(tarefas, registros);
    expect(r).toMatchObject({ total: 7, CONCLUIDA: 1, EM_ANDAMENTO: 1, DIVERGENCIA: 1, PENDENTE: 4, semEvidencia: 1 });
    expect(r.adm).toEqual({ total: 7, feitas: 1 }); expect(r.alm).toEqual({ total: 3, feitas: 1 });
    expect(r.grupos.map((g) => [g.grupo, g.total, g.CONCLUIDA])).toEqual([["Insumos", 4, 0], ["Peças", 3, 1]]);
    expect(r.grupos[0].tipos.map((t) => [t.tipo, t.total])).toEqual([["unidade", 2], ["inativacao", 1], ["outro", 1]]);
  });
  it("a situação de cada item é a pior entre as tarefas dele", () => {
    const s = situacaoPorLinha(tarefas, registros);
    expect(s.get(2)).toBe("CONCLUIDA"); expect(s.get(5)).toBe("DIVERGENCIA"); expect(s.get(4)).toBe("EM_ANDAMENTO"); expect(s.get(6)).toBe("PENDENTE");
    expect(s.get(3)).toBeUndefined();
  });
  it("a lista de cada frente traz o que falta confirmar com evidência, com a coluna de resposta em branco", () => {
    const adm = linhasListaFrente("adm", tarefas, registros);
    expect(adm.map((l) => l[0])).toEqual(["B1|unidade", "D1|unidade", "B1|inativacao", "B1|ncm", "C1|padrao", "C1|unidade"]); // a unificação já está confirmada; a com divergência volta
    expect(adm.every((l) => l.length === COLUNAS_FRENTE.adm.length)).toBe(true);
    expect(adm[0].slice(0, 5)).toEqual(["B1|unidade", FRENTES.adm, "Insumos", TIPOS_TAREFA.unidade.titulo, "B1"]);
    expect(adm[0].slice(7)).toEqual(["", "", ""]);
    const alm = linhasListaFrente("alm", tarefas, registros);
    expect(alm.map((l) => l[0])).toEqual(["B1|unidade", "D1|unidade"]); // só onde há movimento físico e falta confirmar
    expect(alm.every((l) => l.length === COLUNAS_FRENTE.alm.length)).toBe(true);
    expect(COLUNAS_FRENTE.alm).toEqual(expect.arrayContaining(["Endereço de origem", "Endereço de destino", "Quantidade realocada"]));
  });
  it("a aba Execução das listas finais mostra situação, evidência, divergência e quem confirmou", () => {
    const l = linhasExecucao(tarefas, registros);
    expect(l).toHaveLength(7);
    expect(Object.keys(l[0])).toEqual(COLUNAS_EXECUCAO.map(([, chave]) => chave));
    const unif = l.find((x) => x.codigo === "A1");
    expect(unif).toMatchObject({ adm: "Confirmado", evidAdm: "SAP 123/2026", quemAdm: "ana em 22/10/2026", alm: "Confirmado", evidAlm: "foto 7", situacao: "Concluída" });
    expect(l.find((x) => x.tarefa === TIPOS_TAREFA.descricao.titulo)).toMatchObject({ adm: "Divergência", obsAdm: "descrição já alterada por outro processo", alm: "Não se aplica", situacao: "Com divergência" });
    expect(l.find((x) => x.tarefa === TIPOS_TAREFA.unidade.titulo && x.codigo === "B1")).toMatchObject({ adm: "Feito, sem evidência (pendente)", situacao: "Em andamento" });
  });
});

describe("resposta das equipes", () => {
  it("interpreta a resposta; em branco ou texto solto continua pendente", () => {
    for (const x of ["FEITO", "feito.", "Feita", "ok", "Concluído", "realizado", "Executado", "confirmado", "sim"]) expect(interpretarRespostaExecucao(x), x).toBe("FEITO");
    for (const x of ["DIVERGÊNCIA", "divergente", "Divergência: não achei o saldo", "NÃO", "problema", "impedimento"]) expect(interpretarRespostaExecucao(x), x).toBe("DIV");
    for (const x of ["", "  ", "talvez", "em andamento", undefined]) expect(interpretarRespostaExecucao(x), String(x)).toBeNull();
  });
  it("acha as colunas mesmo com ordem e títulos um pouco diferentes", () => {
    expect(mapearColunasExecucao(COLUNAS_FRENTE.adm)).toMatchObject({ id: 0, frente: 1, resposta: 7, evidencia: 8, obs: 9, origem: -1, ok: true });
    expect(mapearColunasExecucao(COLUNAS_FRENTE.alm)).toMatchObject({ id: 0, origem: 7, destino: 8, qtd: 9, resposta: 10, evidencia: 11, obs: 12, ok: true });
    expect(mapearColunasExecucao(["Observação", "RESPOSTA", "Id da Tarefa", "Evidência"])).toMatchObject({ id: 2, resposta: 1, evidencia: 3, obs: 0, ok: true });
    expect(mapearColunasExecucao(["Código", "Descrição"]).ok).toBe(false);
  });
  it("lê a planilha devolvida em CSV, com a frente deduzida quando não há coluna de frente", async () => {
    const csv = "ID da tarefa;Endereço de origem;Endereço de destino;Quantidade realocada;Resposta;Evidência;Observação\nA1|duplicidade;A-01;B-07;12;FEITO;foto 7;\nB1|unidade;;;;DIVERGÊNCIA;;SAP bloqueou\n";
    const linhas = await lerRespostaExecucao(new File([csv], "almoxarifado.csv"));
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toEqual({ id: "A1|duplicidade", frente: "alm", resposta: "FEITO", evidencia: "foto 7", obs: "", origem: "A-01", destino: "B-07", qtd: "12" });
    expect(linhas[1]).toMatchObject({ id: "B1|unidade", frente: "alm", resposta: "DIVERGÊNCIA", obs: "SAP bloqueou" });
    await expect(lerRespostaExecucao(new File(["Código;Descrição\n1;X\n"], "errada.csv"))).rejects.toThrow('"ID da tarefa" e "Resposta"');
    await expect(lerRespostaExecucao(new File([""], "vazia.csv"))).rejects.toThrow("vazia");
  });
  it("lê a planilha Excel emitida pelo sistema e preenchida pela equipe", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Tarefas");
    ws.addRow(COLUNAS_FRENTE.adm);
    const { tarefas } = gerar(); const l = linhasListaFrente("adm", tarefas, {});
    const primeira = l[0]; primeira[7] = "FEITO"; primeira[8] = "SAP 55/2026"; ws.addRow(primeira); ws.addRow(l[1]);
    const buf = await wb.xlsx.writeBuffer();
    const lidas = await lerRespostaExecucao(new File([buf], "administrativo.xlsx"));
    expect(lidas).toHaveLength(2);
    expect(lidas[0]).toMatchObject({ id: "B1|unidade", frente: "adm", resposta: "FEITO", evidencia: "SAP 55/2026" });
    expect(lidas[1].resposta).toBe("");
  });
  it("aplica as respostas: confirma com evidência, registra divergência, avisa o que não encaixa e não mexe no que já existia", () => {
    const { tarefas } = gerar();
    const antes = { "C1|padrao": { adm: { status: "FEITO", evidencia: "antigo" } } };
    const copia = JSON.parse(JSON.stringify(antes));
    const linhas = [
      { id: "A1|duplicidade", frente: "adm", resposta: "FEITO", evidencia: "SAP 1", obs: "" },
      { id: "A1|duplicidade", frente: "alm", resposta: "FEITO", evidencia: "", origem: "A-01", destino: "B-07", qtd: "12" },
      { id: "C1|padrao", frente: "alm", resposta: "FEITO", evidencia: "x" }, // descrição não tem frente física
      { id: "ZZ99|padrao", frente: "adm", resposta: "FEITO", evidencia: "x" }, // tarefa que não existe
      { id: "B1|unidade", frente: "adm", resposta: "DIVERGÊNCIA", evidencia: "", obs: "SAP bloqueou a troca" },
      { id: "D1|unidade", frente: "adm", resposta: "" },
      { id: "", frente: "adm", resposta: "FEITO" },
    ];
    const r = aplicarRespostaExecucao(antes, tarefas, linhas, { quem: "ana@x.com", hoje: "2026-10-22" });
    expect(antes).toEqual(copia);
    expect(r.resumo).toEqual({ feitas: 2, divergencias: 1, semResposta: 1, semEvidencia: 1, naoEncontradas: ["ZZ99|padrao"], naoAplicaveis: 1 });
    expect(r.registros["A1|duplicidade"].adm).toMatchObject({ status: "FEITO", evidencia: "SAP 1", por: "planilha (Administrativo (SAP))", em: "2026-10-22", registradoPor: "ana@x.com", via: "planilha" });
    expect(r.registros["A1|duplicidade"].alm).toMatchObject({ status: "FEITO", evidencia: "", origem: "A-01", destino: "B-07", qtd: "12" });
    expect(r.registros["B1|unidade"].adm).toMatchObject({ status: "DIV", obs: "SAP bloqueou a troca" });
    expect(r.registros["C1|padrao"]).toEqual(antes["C1|padrao"]);
    const t = (id) => tarefas.find((x) => x.id === id);
    expect(situacaoTarefa(t("A1|duplicidade"), r.registros["A1|duplicidade"]).geral).toBe("EM_ANDAMENTO"); // o almoxarifado respondeu sem evidência
    expect(situacaoTarefa(t("B1|unidade"), r.registros["B1|unidade"]).geral).toBe("DIVERGENCIA");
  });
});
