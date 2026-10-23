import { describe, expect, it } from "vitest";
import { aplicarEscopo } from "./logica";
import { gerarTarefas } from "./execucao";
import { linhasQueSaem, unificacoesAprovadas } from "./listasFinais";
import { leituraFiscal, resumoDeLeituras } from "./fiscal";
import { aplicarEscolha, montarConjuntos } from "./conjuntos";
import { aplicarRespostas } from "./respostaCliente";
import { indexar } from "./identidade";

// A linha da planilha muda a cada extração; o código do item não. As decisões, as tarefas e a revisão fiscal ficam presas ao código: trocar a base nunca muda o produto de uma decisão.
const item = (linha, codigo, descricao, extra = {}) => ({ linha, codigo, descricao, unidade: "UN", grupo_atual: "Peças", ultima_mov: "2026-03-01", problemas: [], ncm: "73181500", ncm_original: "73181500", ...extra });
const dup = (grupo, cands) => ({ nivel: "EXATA", score: 1, grupo, mestre: null, candidatos: cands.map((l) => ({ linha: l, score: 1, nivel: "EXATA", motivos: ["descrição idêntica"] })) });
const params = { desde: "" };
const rodar = (decisoes, itens) => gerarTarefas({ decisoes, tipos: {}, itens, escopo: aplicarEscopo(itens, params), params }).tarefas;

// Base A: ANEL TRAVA duplicado (A1, A2), um filtro com unidade a ajustar e uma correia com descrição a corrigir
const baseA = [item(2, "A1", "ANEL TRAVA 10", { duplicidade: dup(0, [3]) }), item(3, "A2", "ANEL TRAVA 10", { duplicidade: dup(0, [2]) }), item(4, "B1", "FILTRO", { unidade: "TONELADA" }), item(5, "C1", "CORREIA  A72")];
// Base B: a mesma empresa, outra extração: linhas em outra ordem, um item novo no meio e a numeração diferente
const baseB = [item(2, "C1", "CORREIA  A72"), item(3, "X9", "PRODUTO NOVO"), item(4, "A2", "ANEL TRAVA 10", { duplicidade: dup(0, [6]) }), item(5, "B1", "FILTRO", { unidade: "TONELADA" }), item(6, "A1", "ANEL TRAVA 10", { duplicidade: dup(0, [4]) })];

const conjA = montarConjuntos(baseA)[0];
const decisoes = {
  ...aplicarEscolha({}, conjA, "A2", { quem: "ana", hoje: "2026-10-22", indice: indexar(baseA) }),
  "B1|unidade": { acao: "ENC", status: "PROP", grupo: "Peças", tipo: "conversao", de: "TONELADA", para: "KG", fator: 1000, antes: { descricao: "FILTRO", unidade: "TONELADA", grupo: "Peças" } },
  "C1|padrao": { acao: "ENC", status: "APR", grupo: "Peças", sugerida: "CORREIA A72", antes: { descricao: "CORREIA  A72", unidade: "UN", grupo: "Peças" }, decididoPor: "ana", decididoEm: "2026-10-22" },
};
decisoes["A1|duplicidade"] = { ...decisoes["A1|duplicidade"], status: "APR", decididoPor: "ana", decididoEm: "2026-10-22" };
decisoes["B1|unidade"].status = "APR";

describe("trocar a base: as decisões seguem o código do item, não a linha da planilha", () => {
  it("as mesmas decisões geram as mesmas tarefas para os mesmos itens, nas duas extrações (mesmo com as linhas em outra ordem)", () => {
    const a = rodar(decisoes, baseA); const b = rodar(decisoes, baseB);
    const resumo = (ts) => ts.map((t) => [t.id, t.tipo, t.codigo, t.descricao]).sort((x, y) => x[0].localeCompare(y[0]));
    expect(resumo(a)).toEqual([["A1|duplicidade", "unificacao", "A1", "ANEL TRAVA 10"], ["B1|unidade", "unidade", "B1", "FILTRO"], ["C1|padrao", "descricao", "C1", "CORREIA  A72"]]);
    expect(resumo(b)).toEqual(resumo(a));
    expect(b.find((t) => t.id === "A1|duplicidade").linha).toBe(6); // a linha é só informação: na nova base o A1 está na linha 6
    expect(b.find((t) => t.id === "A1|duplicidade").instrucao.adm).toContain("Unificar no código A2");
    expect(b.some((t) => t.codigo === "X9")).toBe(false); // o item novo não herda decisão nenhuma
  });
  it("a unificação aprovada tira da lista final o mesmo item (o A1), que mudou de linha", () => {
    expect([...linhasQueSaem({ decisoes }, baseA)]).toEqual([2]); expect([...linhasQueSaem({ decisoes }, baseB)]).toEqual([6]);
    const u = unificacoesAprovadas({ decisoes }, baseB)[0]; expect(u.origem.codigo).toBe("A1"); expect(u.destino.codigo).toBe("A2"); expect(u.vale).toBe(true);
  });
  it("numeração igual à antiga não cola a decisão em outro produto: o código \"3\" é o item de código 3, e não a linha 3", () => {
    const antes = [item(2, "7", "MILHO"), item(3, "3", "SOJA")]; const depois = [item(2, "3", "SOJA"), item(3, "7", "MILHO")]; // nova extração: as duas trocaram de linha
    const d = { "3|padrao": { status: "APR", grupo: "Peças", sugerida: "SOJA GRAO", antes: { descricao: "SOJA", unidade: "UN", grupo: "Peças" } } };
    for (const itens of [antes, depois]) { const t = rodar(d, itens); expect(t.map((x) => [x.codigo, x.descricao])).toEqual([["3", "SOJA"]]); }
  });
  it("o item que saiu da base não vira tarefa em outro item: a tarefa vem do que foi aprovado (ou nem existe, sem o que foi guardado)", () => {
    const semC1 = baseB.filter((i) => i.codigo !== "C1");
    const t = rodar(decisoes, semC1).find((x) => x.id === "C1|padrao");
    expect(t).toMatchObject({ codigo: "C1", descricao: "CORREIA  A72", ausenteNaBase: true, linha: null }); expect(t.instrucao.adm).toContain("o item não está na base atual");
    expect(rodar({ "C1|padrao": { ...decisoes["C1|padrao"], antes: undefined } }, semC1)).toEqual([]); // decisão de projeto migrado, sem o instantâneo: nada a executar
  });
  it("o cadastro mudou para outra coisa depois da aprovação: a aprovação não cobre o que está lá e não gera tarefa", () => {
    const mudou = baseB.map((i) => (i.codigo === "C1" ? { ...i, descricao: "CORREIA DENTADA A72" } : i));
    expect(rodar(decisoes, mudou).some((t) => t.id === "C1|padrao")).toBe(false);
    expect(rodar(decisoes, mudou).some((t) => t.id === "A1|duplicidade")).toBe(true);
    const jaAplicada = baseB.map((i) => (i.codigo === "C1" ? { ...i, descricao: "CORREIA A72" } : i)); // já está como foi aprovado: nada a trocar
    expect(rodar(decisoes, jaAplicada).some((t) => t.id === "C1|padrao")).toBe(false);
  });
  it("o código repetido na base não identifica o item: nenhuma tarefa nasce dele", () => {
    const repetido = [...baseB, item(7, "C1", "OUTRA CORREIA")];
    expect(rodar(decisoes, repetido).some((t) => t.codigo === "C1")).toBe(false);
  });
  it("a revisão fiscal é do código do item: a decisão acompanha o item na nova extração", () => {
    const f = (itens) => resumoDeLeituras(itens.map((it) => leituraFiscal(it, new Map(), indexar(itens))), { C1: { acao: "REVISAR", por: "ana", em: "2026-10-22" } });
    const a = f([item(5, "C1", "CORREIA", { ncm: "123", ncm_original: "123", problemas: [{ codigo: "NCM_FORMATO", mensagem: "x" }] })]);
    const b = f([item(9, "X1", "OUTRO", { ncm: "123", ncm_original: "123", problemas: [{ codigo: "NCM_FORMATO", mensagem: "x" }] }), item(2, "C1", "CORREIA", { ncm: "123", ncm_original: "123", problemas: [{ codigo: "NCM_FORMATO", mensagem: "x" }] })]);
    expect(a).toMatchObject({ revisar: 1, pendentes: 0 }); expect(b).toMatchObject({ revisar: 1, pendentes: 1 }); // o X1, sem decisão, fica pendente; o C1 mantém a dele
  });
  it("a resposta do cliente liga ao código, e o código repetido não se liga a nenhum item", () => {
    const itens = [item(2, "1001", "ANEL  TRAVA 1"), item(3, "1001", "ANEL TRAVA 1 OUTRO"), item(4, "1002", "CHAVE  16")];
    const r = aplicarRespostas({}, itens, [{ codigo: "1001", resposta: "ok" }, { codigo: "1002", resposta: "ok" }], { quem: "ana", hoje: "2026-10-22" });
    expect(Object.keys(r.decisoes)).toEqual(["1002|padrao"]); expect(r.resumo.ambiguas).toEqual(["1001"]); expect(r.decisoes["1002|padrao"].antes).toEqual({ descricao: "CHAVE  16" });
  });
});
