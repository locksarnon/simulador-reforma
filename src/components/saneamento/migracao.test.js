import { describe, expect, it } from "vitest";
import { aplicarEscopo } from "./logica";
import { gerarTarefas } from "./execucao";
import { precisaMigrar } from "./identidade";
import { guardarComoLegado, planejarMigracao, totalLegado } from "./migracao";

const item = (linha, codigo, descricao, extra = {}) => ({ linha, codigo, descricao, unidade: "UN", grupo_atual: "Peças", ultima_mov: "2026-03-01", problemas: [], ncm: "73181500", ncm_original: "73181500", ...extra });
const dup = (cands) => ({ nivel: "EXATA", score: 1, grupo: 0, mestre: null, candidatos: cands.map((l) => ({ linha: l, score: 1, nivel: "EXATA", motivos: ["descrição idêntica"] })) });
const ncmRuim = { ncm: "123", ncm_original: "123", problemas: [{ codigo: "NCM_FORMATO", mensagem: "NCM com 3 dígitos" }] };

// A base original: o código 00123 começa com zeros e o texto precisa sobreviver
const itens = [
  item(2, "00123", "ANEL  TRAVA 10", { duplicidade: dup([3]) }), item(3, "00124", "ANEL TRAVA 10", { duplicidade: dup([2]) }),
  item(4, "B1", "MILHO GRAO", { unidade: "TONELADA", grupo_atual: "Insumos" }), item(5, "C1", "CORREIA  A72", ncmRuim),
];
const origem = { erp: "SAP B1", instancia: "CRESTANI_PRD", empresa: "Crestani Agro" };
const ctx = { base: { id: "val-1", arquivo: "itens.xlsx" }, origem, por: "ana@x.com", em: "2026-10-23" };

// O projeto como o formato antigo o guardava: tudo preso ao número da linha da planilha
const legado = () => ({
  passo: 4, saneados: { "Peças": true }, criterios: { padrao: { aprovado: true } },
  decisoes: {
    "2|duplicidade": { acao: "ENC", status: "APR", grupo: "Peças", destino: 3, escolhaPor: "sugestao", decididoPor: "ana", decididoEm: "2026-10-21" },
    "4|unidade": { acao: "ENC", status: "APR", grupo: "Insumos", tipo: "conversao", de: "TONELADA", para: "KG", fator: 1000, decididoPor: "ana", decididoEm: "2026-10-21" },
    "5|padrao": { acao: "ENC", status: "APR", grupo: "Peças", sugerida: "CORREIA A72", decididoPor: "ana", decididoEm: "2026-10-21" },
  },
  execucao: { tipos: { grafia: { alm: true } }, registros: { "2|duplicidade": { adm: { status: "FEITO", evidencia: "SAP 1" } }, "5|inativacao": { adm: { status: "FEITO", evidencia: "SAP 9" } } } },
  fiscal: { decisoes: { 5: { acao: "REVISAR", por: "ana", em: "2026-10-22" } }, grupos: {} },
});

describe("migração das decisões da linha da planilha para o código do item", () => {
  it("contra a base original, cada decisão volta a ser do item de verdade: código como texto, destino pelo código e a base de então como instantâneo", () => {
    const antes = JSON.stringify(legado()); const e = legado();
    const { estado, relatorio } = planejarMigracao(e, itens, ctx);
    expect(JSON.stringify(e)).toBe(antes); // a simulação não mexe no projeto
    expect(Object.keys(estado.decisoes).sort()).toEqual(["00123|duplicidade", "B1|unidade", "C1|padrao"]); // 00123 mantém os zeros: é texto
    expect(estado.decisoes["00123|duplicidade"]).toMatchObject({ status: "APR", destino: "00124", migradaDe: "2|duplicidade", antes: { descricao: "ANEL  TRAVA 10", unidade: "UN", grupo: "Peças" }, destinoAntes: { descricao: "ANEL TRAVA 10" } });
    expect(estado.decisoes["B1|unidade"].antes).toEqual({ descricao: "MILHO GRAO", unidade: "TONELADA", grupo: "Insumos" });
    expect(estado.fiscal.decisoes).toEqual({ C1: { acao: "REVISAR", por: "ana", em: "2026-10-22" } });
    expect(estado.execucao.registros).toEqual({ "00123|duplicidade": { adm: { status: "FEITO", evidencia: "SAP 1" } } });
    expect(estado.execucao.tipos).toEqual({ grafia: { alm: true } }); expect(estado.saneados).toEqual({ "Peças": true }); expect(estado.passo).toBe(4); // o resto do projeto segue igual
    expect(estado.versaoChaves).toBe(2); expect(precisaMigrar(estado)).toBe(false); expect(precisaMigrar(e)).toBe(true);
    expect(estado.origem).toMatchObject({ ...origem, declaradaPor: "ana@x.com", declaradaEm: "2026-10-23" });
    expect(relatorio.verificacao).toMatchObject({ confere: true, fraca: false, falhas: 0 }); expect(relatorio.verificacao.verificacoes).toBeGreaterThanOrEqual(5);
    expect(relatorio.totais).toEqual({ decisoes: { total: 3, vinculadas: 3, ambiguas: 0, naoEncontradas: 0 }, execucao: { total: 2, vinculadas: 1, ambiguas: 1, naoEncontradas: 0 }, fiscal: { total: 1, vinculadas: 1, ambiguas: 0, naoEncontradas: 0 } });
  });

  it("a confirmação de inativação por data de uso não tem aprovação correspondente: fica no legado, com o motivo, e não vira confirmação de nada", () => {
    const { estado, relatorio } = planejarMigracao(legado(), itens, ctx);
    expect(estado.legado.execucaoRegistros).toEqual({ "5|inativacao": { adm: { status: "FEITO", evidencia: "SAP 9" } } });
    expect(estado.legado.motivos["execução 5|inativacao"]).toContain("aprovação de uma lista fechada");
    expect(totalLegado(estado)).toBe(1); expect(estado.legado.decisoes).toEqual({});
    const l = relatorio.linhas.find((x) => x.chaveAntiga === "5|inativacao"); expect(l).toMatchObject({ tipo: "execucao", resultado: "AMBIGUA", codigo: "C1", linha: 5 });
  });

  it("o projeto migrado gera as tarefas dos itens certos pelo código", () => {
    const { estado } = planejarMigracao(legado(), itens, ctx);
    const params = { desde: "" };
    const t = gerarTarefas({ decisoes: estado.decisoes, tipos: {}, itens, escopo: aplicarEscopo(itens, params), params }).tarefas;
    expect(t.map((x) => x.id).sort()).toEqual(["00123|duplicidade", "B1|unidade", "C1|padrao"]);
    expect(t.find((x) => x.id === "00123|duplicidade").instrucao.adm).toContain("Unificar no código 00124");
  });

  it("base que não é a original: UMA conferência que falha e nada é migrado de forma automática (tudo fica pendente no legado, intacto)", () => {
    const outra = [item(2, "X1", "PARAFUSO", { grupo_atual: "Insumos" }), item(3, "X2", "PORCA"), item(4, "X3", "MILHO GRAO", { unidade: "TONELADA", grupo_atual: "Insumos" }), item(5, "X4", "CORREIA  A72", ncmRuim)];
    const { estado, relatorio } = planejarMigracao(legado(), outra, ctx);
    expect(relatorio.verificacao.confere).toBe(false); expect(relatorio.verificacao.mensagem).toContain("NÃO confere"); expect(relatorio.verificacao.falhas).toBeGreaterThan(0);
    expect(estado.decisoes).toEqual({}); expect(estado.execucao.registros).toEqual({}); expect(estado.fiscal.decisoes).toEqual({});
    expect(Object.keys(estado.legado.decisoes).sort()).toEqual(["2|duplicidade", "4|unidade", "5|padrao"]);
    expect(estado.legado.decisoes["2|duplicidade"]).toEqual(legado().decisoes["2|duplicidade"]); // nenhuma decisão foi reescrita
    expect(relatorio.totais.decisoes).toMatchObject({ total: 3, vinculadas: 0, ambiguas: 3 });
    expect(relatorio.linhas.find((x) => x.chaveAntiga === "2|duplicidade").motivo).toContain("A conferência falhou"); // a que falhou diz por quê
    expect(relatorio.linhas.find((x) => x.chaveAntiga === "4|unidade").motivo).toContain("A base não confere"); // as que bateriam sozinhas também ficam pendentes: a base não é a original
  });

  it("linha que não existe na base é 'não encontrada' e prova que a base é outra: nada é migrado", () => {
    const curta = itens.slice(0, 2);
    const { estado, relatorio } = planejarMigracao(legado(), curta, ctx);
    expect(relatorio.verificacao.confere).toBe(false);
    expect(relatorio.linhas.find((x) => x.chaveAntiga === "4|unidade")).toMatchObject({ resultado: "NAO_ENCONTRADA" }); expect(relatorio.linhas.find((x) => x.chaveAntiga === "4|unidade").motivo).toContain("A linha 4 não existe");
    expect(relatorio.linhas.find((x) => x.chaveAntiga === "2|duplicidade")).toMatchObject({ resultado: "AMBIGUA" });
    expect(estado.decisoes).toEqual({}); expect(relatorio.totais.decisoes.naoEncontradas).toBe(2);
  });

  it("cada conferência pega o que a decisão guardou: unidade de origem, código que ficava, texto da sugestão e ação fiscal", () => {
    const muda = (fn) => { const e = legado(); fn(e); return planejarMigracao(e, itens, ctx).relatorio.verificacao; };
    expect(muda((e) => { e.decisoes["4|unidade"].de = "SACA"; }).confere).toBe(false);
    expect(muda((e) => { e.decisoes["2|duplicidade"].destino = 5; }).confere).toBe(false); // a linha 5 não é do conjunto de duplicados da 2
    expect(muda((e) => { e.decisoes["2|duplicidade"].destino = 99; }).confere).toBe(false);
    expect(muda((e) => { e.decisoes["5|padrao"].sugerida = "LUVA DE COURO TAMANHO G"; }).confere).toBe(false);
    expect(muda((e) => { e.fiscal.decisoes[5] = { acao: "ACEITAR" }; }).confere).toBe(false); // classe sugerida não existe para NCM a corrigir
    expect(muda((e) => { e.decisoes["5|padrao"].grupo = "Insumos"; }).confere).toBe(false);
    expect(muda(() => {}).confere).toBe(true);
  });

  it("item sem código, ou com código repetido, não tem como ser identificado: só essa decisão fica pendente, as outras migram", () => {
    const base = [...itens.slice(0, 3), item(5, "", "CORREIA  A72", ncmRuim)]; // o item da linha 5 perdeu o código
    const { estado, relatorio } = planejarMigracao(legado(), base, ctx);
    expect(relatorio.verificacao.confere).toBe(true); expect(Object.keys(estado.decisoes).sort()).toEqual(["00123|duplicidade", "B1|unidade"]);
    expect(estado.legado.decisoes["5|padrao"]).toBeTruthy(); expect(relatorio.linhas.find((x) => x.chaveAntiga === "5|padrao").motivo).toContain("não tem código");
    const repetido = [...itens.slice(0, 3), item(5, "B1", "CORREIA  A72", ncmRuim)]; // B1 aparece duas vezes
    const r = planejarMigracao(legado(), repetido, ctx);
    expect(Object.keys(r.estado.decisoes)).toEqual(["00123|duplicidade"]); expect(r.relatorio.linhas.find((x) => x.chaveAntiga === "4|unidade").motivo).toContain("aparece mais de uma vez");
  });

  it("sem nada que a base possa contrariar, a verificação é fraca: depende só da atestação do analista (e a confirmação sem decisão não migra)", () => {
    const so = { decisoes: {}, execucao: { registros: { "2|duplicidade": { adm: { status: "FEITO", evidencia: "x" } } } }, fiscal: { decisoes: {} } };
    const { estado, relatorio } = planejarMigracao(so, itens, ctx);
    expect(relatorio.verificacao).toMatchObject({ confere: true, fraca: true }); expect(relatorio.verificacao.mensagem).toContain("depende só da sua atestação");
    expect(estado.execucao.registros).toEqual({}); expect(estado.legado.execucaoRegistros["2|duplicidade"]).toBeTruthy(); expect(estado.legado.motivos["execução 2|duplicidade"]).toContain("Não há decisão migrada");
  });

  it("sem a base original: guardar tudo como legado (intacto, fora do trabalho) e seguir; nada é apagado", () => {
    const e = legado(); const antes = JSON.stringify(e);
    const g = guardarComoLegado(e, { por: "ana@x.com", em: "2026-10-23" });
    expect(JSON.stringify(e)).toBe(antes); expect(precisaMigrar(g)).toBe(false);
    expect(g.decisoes).toEqual({}); expect(g.execucao.registros).toEqual({}); expect(g.fiscal.decisoes).toEqual({});
    expect(g.legado.decisoes).toEqual(e.decisoes); expect(g.legado.execucaoRegistros).toEqual(e.execucao.registros); expect(g.legado.fiscalDecisoes).toEqual(e.fiscal.decisoes);
    expect(g.migracao).toMatchObject({ semBase: true, totais: { decisoes: { total: 3, ambiguas: 3 } } }); expect(totalLegado(g)).toBe(6);
    expect(g.legado.motivos["decisao 4|unidade"]).toContain("base original não está disponível");
  });

  it("chaves fora do formato antigo não são adivinhadas: ficam pendentes", () => {
    const e = legado(); e.decisoes.lixo = { status: "APR" }; e.fiscal.decisoes.abc = { acao: "REVISAR" };
    const { estado, relatorio } = planejarMigracao(e, itens, ctx);
    expect(estado.legado.decisoes.lixo).toEqual({ status: "APR" }); expect(estado.legado.fiscalDecisoes.abc).toEqual({ acao: "REVISAR" });
    expect(relatorio.linhas.find((x) => x.chaveAntiga === "lixo").motivo).toContain("não está no formato antigo");
  });
});
