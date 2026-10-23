import { describe, expect, it } from "vitest";
import { aplicarEscopo } from "./logica";
import { indexar } from "./identidade";
import { aprovarLote, candidatosDaInativacao, coberturaDoLote, decidirIndividual, devolverALista, individualValida, inativacaoVazia, inativacoesAprovadas, lerCodigos, resumoInativacao, retirarDaLista, revogarLote, saldoLidoEmTodos, situacaoDoCandidato, validarAprovacaoLote } from "./inativacao";

const item = (linha, codigo, ultima_mov, extra = {}) => ({ linha, codigo, descricao: `ITEM ${codigo}`, unidade: "UN", grupo_atual: "Peças", ultima_mov, saldo: 0, problemas: [], ...extra });
const params = { desde: "2025-01-01" };
const monta = (itens) => ({ itens, escopo: aplicarEscopo(itens, params), indice: indexar(itens) });
const base = [
  item(2, "P1", "2023-05-01"), item(3, "P2", "2022-01-10", { saldo: 5000000 }), item(4, "P3", "2021-03-03", { saldo: null }), item(5, "I1", "2020-02-02", { grupo_atual: "Insumos" }),
  item(6, "", "2020-01-01"), item(7, "A9", "2026-03-01"),
];
const A = monta(base);
const ok = { documentos: { feito: true, nota: "consulta SAP: nenhum pedido aberto" }, dependencias: { feito: true, nota: "cartilhas conferidas com a manutenção" }, saldo: { feito: true, nota: "saldo conferido no SAP em 22/10" } };
const dadosBase = { grupo: "Peças", lista: ["P1", "P3"], justificativa: "Itens sem uso há mais de dois anos, conferidos.", verificacoes: ok, origem: { erp: "SAP", instancia: "PRD", empresa: "Crestani" }, extraidaEm: "2026-10-21", base: { id: "v1", arquivo: "itens.xlsx" }, corte: "2025-01-01", semData: "manter", por: "ana", em: "2026-10-23" };

describe("candidatos à inativação: o corte por data só seleciona, não autoriza", () => {
  it("agrupa os candidatos por grupo e diz a situação de cada um para entrar numa lista", () => {
    const c = candidatosDaInativacao(A.escopo, A.indice, null);
    expect(c.total).toBe(5); expect(c.grupos.map((g) => [g.grupo, g.candidatos.length])).toEqual([["Peças", 4], ["Insumos", 1]]);
    const pecas = c.grupos[0]; expect(pecas.candidatos.map((x) => [x.id, x.situacao])).toEqual([["P1", "ELEGIVEL"], ["P2", "SALDO"], ["P3", "ELEGIVEL"], ["", "SEM_IDENTIDADE"]]);
    expect(pecas.elegiveis.map((x) => x.id)).toEqual(["P1", "P3"]); expect(pecas.individuais.map((x) => x.id)).toEqual(["P2"]); expect(pecas.semIdentidade).toHaveLength(1);
  });
  it("NENHUMA inativação nasce só do corte: sem aprovação expressa, não há item aprovado (e portanto nenhuma tarefa)", () => {
    expect(inativacoesAprovadas(null, A.escopo, A.indice)).toEqual([]); expect(inativacoesAprovadas(inativacaoVazia(), A.escopo, A.indice)).toEqual([]);
    expect(resumoInativacao(null, A.escopo, A.indice)).toMatchObject({ candidatos: 5, aprovados: 0, lote: 0, individualInativar: 0, aguardando: 4, semIdentidade: 1 });
  });
  it("o código repetido na base também não identifica o item", () => {
    const rep = monta([item(2, "X", "2023-01-01"), item(3, "X", "2023-01-01")]);
    expect(candidatosDaInativacao(rep.escopo, rep.indice, null).grupos[0].candidatos.map((c) => c.situacao)).toEqual(["SEM_IDENTIDADE", "SEM_IDENTIDADE"]);
  });
});

describe("aprovação em lote com lista fechada", () => {
  it("só aprova com a lista, a origem, a base e a data analisadas, as verificações atestadas com nota e a justificativa", () => {
    expect(validarAprovacaoLote({}).faltas.length).toBeGreaterThanOrEqual(6);
    const v = (extra) => validarAprovacaoLote({ ...dadosBase, ...extra });
    expect(v({}).ok).toBe(true);
    expect(v({ lista: [] }).faltas[0]).toContain("lista está vazia");
    expect(v({ origem: { erp: "SAP" } }).faltas.join(" ")).toContain("origem dos dados");
    expect(v({ extraidaEm: "" }).faltas.join(" ")).toContain("data da extração");
    expect(v({ base: null }).faltas.join(" ")).toContain("base vinculada");
    expect(v({ justificativa: "ok" }).faltas.join(" ")).toContain("justificativa");
    expect(v({ verificacoes: { ...ok, documentos: { feito: true, nota: "ok" } } }).faltas.join(" ")).toContain("Documentos abertos");
    expect(v({ verificacoes: { ...ok, dependencias: { feito: false, nota: "conferido na manutenção" } } }).faltas.join(" ")).toContain("Vínculos");
  });
  it("o saldo só precisa ser atestado quando algum item da lista não tem saldo lido na base", () => {
    const { saldo: _s, ...semSaldo } = ok;
    expect(validarAprovacaoLote({ ...dadosBase, verificacoes: semSaldo }).faltas.join(" ")).toContain("Saldo em estoque");
    expect(validarAprovacaoLote({ ...dadosBase, verificacoes: semSaldo, saldoLidoEmTodos: true }).ok).toBe(true);
    expect(saldoLidoEmTodos([base[0], base[1]])).toBe(true); expect(saldoLidoEmTodos([base[0], base[2]])).toBe(false); expect(saldoLidoEmTodos([])).toBe(false);
  });
  it("a aprovação fecha a lista: guarda os códigos, a base, a data, o corte, o aprovador e a movimentação conferida pela ferramenta", () => {
    const ina = aprovarLote(null, "Peças", dadosBase);
    const l = ina.lotes["Peças"];
    expect(l).toMatchObject({ grupo: "Peças", por: "ana", em: "2026-10-23", itens: ["P1", "P3"], extraidaEm: "2026-10-21", corte: "2025-01-01", base: { id: "v1", arquivo: "itens.xlsx" }, justificativa: "Itens sem uso há mais de dois anos, conferidos." });
    expect(l.verificacoes.movimentacao).toMatchObject({ feito: true, auto: true, por: "ferramenta" }); expect(l.verificacoes.movimentacao.nota).toContain("21/10/2026");
    expect(l.verificacoes.documentos.nota).toBe("consulta SAP: nenhum pedido aberto");
    const aprov = inativacoesAprovadas(ina, A.escopo, A.indice);
    expect(aprov.map((x) => [x.id, x.via, x.por, x.grupo])).toEqual([["P1", "LOTE", "ana", "Peças"], ["P3", "LOTE", "ana", "Peças"]]); // só a lista aprovada; o P2 (saldo) e o do grupo Insumos ficam de fora
    expect(situacaoDoCandidato(candidatosDaInativacao(A.escopo, A.indice, ina).grupos[0].candidatos[1], "Peças", ina)).toBe("SALDO");
    expect(resumoInativacao(ina, A.escopo, A.indice)).toMatchObject({ lote: 2, aprovados: 2, aguardando: 2, lotesAprovados: 1 });
  });
  it("se a lista muda, a aprovação anterior não cobre os itens novos; o que deixou de valer sai da cobertura", () => {
    const ina = aprovarLote(null, "Peças", dadosBase); // lista fechada: P1 e P3
    // nova extração: um item novo entra como candidato (P4), o P3 foi movimentado (não é mais candidato) e o P1 passou a ter saldo
    const nova = monta([item(2, "P1", "2023-05-01", { saldo: 3000000 }), item(3, "P2", "2022-01-10", { saldo: 5000000 }), item(4, "P3", "2026-06-06"), item(5, "I1", "2020-02-02", { grupo_atual: "Insumos" }), item(8, "P4", "2022-02-02")]);
    const g = candidatosDaInativacao(nova.escopo, nova.indice, ina).grupos.find((x) => x.grupo === "Peças");
    const cob = coberturaDoLote(g, ina);
    expect(cob.novos).toEqual(["P4"]); expect(cob.cobertos).toEqual([]); expect(cob.completa).toBe(false);
    expect(cob.naoValemMais.map((x) => [x.id, x.motivo])).toEqual([["P1", "passou a ter saldo"], ["P3", "não é mais candidato nesta base (movimentação mais recente, corte diferente ou fora da base)"]]);
    expect(inativacoesAprovadas(ina, nova.escopo, nova.indice)).toEqual([]); // nada novo é inativado por uma aprovação antiga
    expect(coberturaDoLote({ grupo: "Insumos", candidatos: [], elegiveis: [], individuais: [], semIdentidade: [] }, ina)).toBeNull(); // grupo sem lote aprovado
  });
  it("aprovar de novo o mesmo grupo substitui a lista e guarda a anterior no histórico; revogar também guarda", () => {
    const a1 = aprovarLote(null, "Peças", dadosBase); const a2 = aprovarLote(a1, "Peças", { ...dadosBase, lista: ["P1"], em: "2026-10-24", por: "bia" });
    expect(a2.lotes["Peças"].itens).toEqual(["P1"]); expect(a2.historico).toHaveLength(1); expect(a2.historico[0]).toMatchObject({ tipo: "LOTE_SUBSTITUIDO", grupo: "Peças", por: "bia" }); expect(a2.historico[0].lote.itens).toEqual(["P1", "P3"]);
    const a3 = revogarLote(a2, "Peças", { por: "ana", em: "2026-10-25", motivo: "achamos um pedido aberto" });
    expect(a3.lotes["Peças"]).toBeUndefined(); expect(a3.historico.at(-1)).toMatchObject({ tipo: "LOTE_REVOGADO", motivo: "achamos um pedido aberto", por: "ana" });
    expect(inativacoesAprovadas(a3, A.escopo, A.indice)).toEqual([]); expect(a1.lotes["Peças"].itens).toEqual(["P1", "P3"]); // não altera o que recebeu
    expect(revogarLote(a3, "Peças", { por: "x", em: "y" })).toEqual(a3);
  });
});

describe("exceções e decisões individuais", () => {
  it("retirar um item da lista (documento aberto, dependência) tira a cobertura do lote e leva o item à decisão individual; devolver não o aprova de novo", () => {
    const lote = aprovarLote(null, "Peças", dadosBase);
    const ret = retirarDaLista(lote, ["P1"], { motivo: "DOCUMENTO", nota: "pedido 4471 aberto", por: "ana", em: "2026-10-24" });
    expect(ret.excecoes.P1).toEqual({ motivo: "DOCUMENTO", nota: "pedido 4471 aberto", por: "ana", em: "2026-10-24" });
    expect(inativacoesAprovadas(ret, A.escopo, A.indice).map((x) => x.id)).toEqual(["P3"]);
    expect(candidatosDaInativacao(A.escopo, A.indice, ret).grupos[0].individuais.map((x) => x.id)).toEqual(["P1", "P2"]);
    const volta = devolverALista(ret, ["P1"]); expect(volta.excecoes.P1).toBeUndefined();
    expect(inativacoesAprovadas(volta, A.escopo, A.indice).map((x) => x.id)).toEqual(["P1", "P3"]); // a lista aprovada ainda é a mesma
  });
  it("decisão individual: inativar exige justificativa (com o saldo tratado, se houver); manter prevalece sobre a lista; desfazer volta ao que era", () => {
    const base0 = decidirIndividual(null, "P2", { acao: "INATIVAR", justificativa: "Saldo de 5 un transferido ao P1 pela nota 123 e histórico preservado.", por: "ana", em: "2026-10-24" });
    expect(individualValida(base0.individuais.P2)).toBe(true); expect(individualValida({ acao: "INATIVAR", justificativa: "curta" })).toBe(false); expect(individualValida({ acao: "MANTER" })).toBe(true); expect(individualValida(undefined)).toBe(false);
    expect(inativacoesAprovadas(base0, A.escopo, A.indice).map((x) => [x.id, x.via, x.detalhe.slice(0, 20)])).toEqual([["P2", "INDIVIDUAL", "Saldo de 5 un transf"]]);
    // inativar sem a justificativa escrita (ou curta demais) ainda não vale: não vira aprovação nem tarefa, e o item continua aguardando
    const semJust = decidirIndividual(null, "P2", { acao: "INATIVAR", justificativa: "curta", por: "ana", em: "2026-10-24" });
    expect(inativacoesAprovadas(semJust, A.escopo, A.indice)).toEqual([]); expect(resumoInativacao(semJust, A.escopo, A.indice)).toMatchObject({ aprovados: 0, individualInativar: 0 });
    expect(situacaoDoCandidato(candidatosDaInativacao(A.escopo, A.indice, semJust).grupos[0].candidatos[1], "Peças", semJust)).toBe("SALDO");
    const lote = aprovarLote(base0, "Peças", dadosBase); const manter = decidirIndividual(lote, "P1", { acao: "MANTER", justificativa: "ainda é comprado", por: "ana", em: "2026-10-24" });
    expect(inativacoesAprovadas(manter, A.escopo, A.indice).map((x) => x.id)).toEqual(["P2", "P3"]);
    expect(decidirIndividual(manter, "P1", { acao: null }).individuais.P1).toBeUndefined();
    expect(inativacoesAprovadas(decidirIndividual(manter, "P1", { acao: null }), A.escopo, A.indice).map((x) => x.id)).toEqual(["P1", "P2", "P3"]);
    expect(inativacoesAprovadas(decidirIndividual(null, "NAO_E_CANDIDATO", { acao: "INATIVAR", justificativa: "qualquer coisa escrita", por: "a", em: "b" }), A.escopo, A.indice)).toEqual([]); // só vale para candidato de hoje
  });
  it("item sem código não recebe decisão nenhuma: nem lote nem individual", () => {
    const ina = decidirIndividual(aprovarLote(null, "Peças", { ...dadosBase, lista: ["P1", ""] }), "", { acao: "INATIVAR", justificativa: "sem código mesmo assim", por: "ana", em: "2026-10-24" });
    expect(inativacoesAprovadas(ina, A.escopo, A.indice).map((x) => x.id)).toEqual(["P1"]);
  });
});

describe("leitura dos códigos colados", () => {
  it("aceita um por linha, vírgula, ponto e vírgula ou tabulação, como texto (zeros à esquerda ficam), sem repetir", () => {
    expect(lerCodigos("00123\n00124, 0045;P1\t P1 \n\n")).toEqual(["00123", "00124", "0045", "P1"]); expect(lerCodigos("")).toEqual([]); expect(lerCodigos(undefined)).toEqual([]);
  });
});
