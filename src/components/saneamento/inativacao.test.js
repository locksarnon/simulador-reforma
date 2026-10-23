import { describe, expect, it } from "vitest";
import { aplicarEscopo } from "./logica";
import { indexar } from "./identidade";
import { aprovarLote, candidatosDaInativacao, coberturaDoLote, decidirIndividual, devolverALista, individualDesatualizada, individualValida, inativacaoVazia, inativacoesAprovadas, lerCodigos, resumoInativacao, retirarDaLista, revogarLote, saldoLidoEmTodos, semDataNaLista, situacaoDoCandidato, validarAprovacaoLote } from "./inativacao";

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
  it("item da lista sem data de última movimentação: a ferramenta não tem o que conferir e o analista precisa atestar a movimentação", () => {
    expect(semDataNaLista([base[0], item(9, "S1", "")])).toBe(1); expect(semDataNaLista([base[0]])).toBe(0);
    const f = validarAprovacaoLote({ ...dadosBase, semDataNaLista: 1 });
    expect(f.ok).toBe(false); expect(f.faltas.join(" ")).toContain("1 item da lista não tem data"); expect(validarAprovacaoLote({ ...dadosBase, semDataNaLista: 3 }).faltas.join(" ")).toContain("3 itens da lista não têm data");
    const atestada = { ...ok, movimentacao: { feito: true, nota: "conferido no SAP com o almoxarifado" } };
    expect(validarAprovacaoLote({ ...dadosBase, semDataNaLista: 2, verificacoes: atestada }).ok).toBe(true);
    const ina = aprovarLote(null, "Peças", { ...dadosBase, semDataNaLista: 1, verificacoes: atestada });
    expect(ina.lotes["Peças"].verificacoes.movimentacao).toMatchObject({ feito: true, por: "ana", em: "2026-10-23", nota: "conferido no SAP com o almoxarifado" }); expect(ina.lotes["Peças"].verificacoes.movimentacao.auto).toBeUndefined();
  });
  it("a aprovação fecha a lista: guarda os códigos, a base, a data, o corte, o aprovador e a movimentação conferida pela ferramenta", () => {
    const ina = aprovarLote(null, "Peças", dadosBase);
    const l = ina.lotes["Peças"];
    expect(l).toMatchObject({ grupo: "Peças", por: "ana", em: "2026-10-23", itens: ["P1", "P3"], extraidaEm: "2026-10-21", corte: "2025-01-01", base: { id: "v1", arquivo: "itens.xlsx" }, justificativa: "Itens sem uso há mais de dois anos, conferidos." });
    expect(l.verificacoes.movimentacao).toMatchObject({ feito: true, auto: true, por: "ferramenta" }); expect(l.verificacoes.movimentacao.nota).toContain("21/10/2026");
    expect(l.verificacoes.documentos.nota).toBe("consulta SAP: nenhum pedido aberto"); expect(l.origem).toBe("SAP · PRD · Crestani"); // a origem dos dados fica registrada na aprovação
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
  it("retirar um item da lista (documento aberto, dependência) o tira da lista fechada e o leva à decisão individual; devolvê-lo à lista elegível NÃO o aprova de novo; tudo fica no histórico", () => {
    const lote = aprovarLote(null, "Peças", dadosBase);
    const ret = retirarDaLista(lote, ["P1"], { motivo: "DOCUMENTO", nota: "pedido 4471 aberto", por: "ana", em: "2026-10-24" });
    expect(ret.excecoes.P1).toEqual({ motivo: "DOCUMENTO", nota: "pedido 4471 aberto", por: "ana", em: "2026-10-24" });
    expect(ret.lotes["Peças"].itens).toEqual(["P3"]); expect(lote.lotes["Peças"].itens).toEqual(["P1", "P3"]); // a lista fechada encolhe; o que foi recebido não é alterado
    expect(ret.historico).toEqual([{ tipo: "ITEM_RETIRADO_DA_LISTA", grupo: "Peças", id: "P1", motivo: "DOCUMENTO", nota: "pedido 4471 aberto", por: "ana", em: "2026-10-24" }]);
    expect(inativacoesAprovadas(ret, A.escopo, A.indice).map((x) => x.id)).toEqual(["P3"]);
    expect(candidatosDaInativacao(A.escopo, A.indice, ret).grupos[0].individuais.map((x) => x.id)).toEqual(["P1", "P2"]);
    const volta = devolverALista(ret, ["P1"], { por: "bia", em: "2026-10-25" }); expect(volta.excecoes.P1).toBeUndefined();
    expect(volta.historico.at(-1)).toMatchObject({ tipo: "ITEM_DEVOLVIDO_A_LISTA", id: "P1", por: "bia", em: "2026-10-25", excecao: { motivo: "DOCUMENTO" } });
    expect(inativacoesAprovadas(volta, A.escopo, A.indice).map((x) => x.id)).toEqual(["P3"]); // o P1 voltou a ser elegível, mas não à lista aprovada
    const g = candidatosDaInativacao(A.escopo, A.indice, volta).grupos[0];
    expect(coberturaDoLote(g, volta)).toMatchObject({ cobertos: ["P3"], novos: ["P1"], completa: false });
    const nova = aprovarLote(volta, "Peças", { ...dadosBase, lista: ["P1", "P3"], em: "2026-10-26" }); // só uma nova aprovação cobre o P1 de novo
    expect(inativacoesAprovadas(nova, A.escopo, A.indice).map((x) => x.id)).toEqual(["P1", "P3"]);
  });
  it("aprovação salva antes de a lista encolher na retirada (a exceção existe, mas o código ainda consta na lista): devolver o item NÃO o aprova de novo", () => {
    const salvo = { ...aprovarLote(null, "Peças", dadosBase), excecoes: { P1: { motivo: "DOCUMENTO", nota: "pedido 4471 aberto", por: "ana", em: "2026-10-24" } } }; // como a versão anterior gravava: lote com [P1, P3] e a exceção de P1
    expect(inativacoesAprovadas(salvo, A.escopo, A.indice).map((x) => x.id)).toEqual(["P3"]);
    const volta = devolverALista(salvo, ["P1"], { por: "bia", em: "2026-10-25" });
    expect(inativacoesAprovadas(volta, A.escopo, A.indice).map((x) => x.id)).toEqual(["P3"]); expect(volta.lotes["Peças"].itens).toEqual(["P3"]); expect(salvo.lotes["Peças"].itens).toEqual(["P1", "P3"]); // o recebido não é alterado
    expect(volta.historico.map((h) => h.tipo)).toEqual(["ITEM_RETIRADO_DA_LISTA", "ITEM_DEVOLVIDO_A_LISTA"]); expect(volta.historico[0]).toMatchObject({ id: "P1", grupo: "Peças", motivo: "DOCUMENTO", por: "ana", em: "2026-10-24" }); // a saída da lista conta quem retirou e quando
    expect(coberturaDoLote(candidatosDaInativacao(A.escopo, A.indice, volta).grupos[0], volta)).toMatchObject({ cobertos: ["P3"], novos: ["P1"], completa: false });
    const so = { ...aprovarLote(null, "Peças", { ...dadosBase, lista: ["P1"] }), excecoes: { P1: { motivo: "OUTRO", nota: "", por: "ana", em: "2026-10-24" } } }; // a única da lista
    const vazio = devolverALista(so, ["P1"], { por: "bia", em: "2026-10-25" });
    expect(vazio.lotes["Peças"]).toBeUndefined(); expect(vazio.historico.map((h) => h.tipo)).toEqual(["ITEM_RETIRADO_DA_LISTA", "ITEM_DEVOLVIDO_A_LISTA", "LOTE_ESVAZIADO"]);
  });
  it("decidir de novo uma decisão desatualizada, mesmo com a mesma ação, guarda a anterior no histórico; repetir a decisão vigente (digitar a justificativa) não enche o histórico", () => {
    const antes = A.itens[1]; const mudou = { ...antes, saldo: 7 };
    const a = decidirIndividual(null, "P2", { acao: "INATIVAR", justificativa: "Saldo transferido ao P1 pela nota 123 e histórico preservado.", por: "ana", em: "d1", item: antes });
    const b = decidirIndividual(a, "P2", { acao: "INATIVAR", justificativa: "N", por: "bia", em: "d2", item: mudou }); // a decisão de antes foi tomada com outro saldo
    expect(b.historico).toHaveLength(1); expect(b.historico[0]).toMatchObject({ tipo: "INDIVIDUAL_SUBSTITUIDA", id: "P2", por: "bia", anterior: { acao: "INATIVAR", por: "ana", antes: { saldo: 5000000 } } });
    expect(b.individuais.P2.antes).toEqual({ saldo: 7, ultima_mov: "2022-01-10" });
    const c = decidirIndividual(b, "P2", { acao: "INATIVAR", justificativa: "Novo saldo de 7 un baixado pela nota 124.", por: "bia", em: "d2", item: mudou });
    expect(c.historico).toHaveLength(1); // o item agora é o mesmo da decisão: continuar a digitar não registra de novo
    expect(decidirIndividual(a, "P2", { acao: "INATIVAR", justificativa: "Saldo transferido ao P1 pela nota 123 e histórico preservado, ok.", por: "ana", em: "d1", item: antes }).historico).toEqual([]);
  });
  it("item sem identidade (código repetido) não mostra a decisão individual que o código tinha quando era único", () => {
    const rep = monta([item(2, "R1", "2023-01-01"), item(3, "R1", "2023-01-01"), item(4, "R2", "2023-01-01")]);
    const ina = { lotes: {}, individuais: { R1: { acao: "INATIVAR", justificativa: "Decidido quando o código era único.", por: "ana", em: "d1", antes: { saldo: 0, ultima_mov: "2023-01-01" } } }, excecoes: {}, historico: [] };
    const g = candidatosDaInativacao(rep.escopo, rep.indice, ina).grupos[0];
    expect(g.candidatos.filter((c) => c.id === "R1").map((c) => [c.situacao, c.individual, c.individualAntiga])).toEqual([["SEM_IDENTIDADE", null, null], ["SEM_IDENTIDADE", null, null]]);
    expect(g.individuais).toEqual([]); expect(inativacoesAprovadas(ina, rep.escopo, rep.indice)).toEqual([]);
  });
  it("retirar o último item do lote esvazia a aprovação e registra; retirar quem não está em nenhuma lista só cria a exceção", () => {
    const so = aprovarLote(null, "Peças", { ...dadosBase, lista: ["P1"] });
    const vazio = retirarDaLista(so, ["P1"], { motivo: "OUTRO", nota: "revisar com a manutenção", por: "ana", em: "2026-10-24" });
    expect(vazio.lotes["Peças"]).toBeUndefined(); expect(vazio.historico.map((h) => h.tipo)).toEqual(["ITEM_RETIRADO_DA_LISTA", "LOTE_ESVAZIADO"]); expect(vazio.historico[1].lote.itens).toEqual([]);
    const fora = retirarDaLista(null, ["P3"], { motivo: "DOCUMENTO", nota: "pedido aberto", por: "ana", em: "2026-10-24" });
    expect(fora.excecoes.P3.motivo).toBe("DOCUMENTO"); expect(fora.historico).toEqual([]);
  });
  it("a decisão individual vale para o item como estava (saldo e última movimentação): se mudou, ela pede nova avaliação", () => {
    const p2 = A.itens[1];
    const ina = decidirIndividual(null, "P2", { acao: "INATIVAR", justificativa: "Saldo de 5 un transferido ao P1 pela nota 123 e histórico preservado.", por: "ana", em: "2026-10-24", item: p2 });
    expect(ina.individuais.P2.antes).toEqual({ saldo: 5000000, ultima_mov: "2022-01-10" }); expect(individualDesatualizada(ina.individuais.P2, p2)).toBe(false);
    expect(inativacoesAprovadas(ina, A.escopo, A.indice).map((x) => x.id)).toEqual(["P2"]);
    const nova = monta([item(2, "P1", "2023-05-01"), item(3, "P2", "2022-01-10", { saldo: 7 }), item(4, "P3", "2021-03-03", { saldo: null })]);
    expect(individualDesatualizada(ina.individuais.P2, nova.itens[1])).toBe(true);
    const c = candidatosDaInativacao(nova.escopo, nova.indice, ina).grupos[0].candidatos.find((x) => x.id === "P2");
    expect(c.individual).toBeNull(); expect(c.individualAntiga).toMatchObject({ acao: "INATIVAR" });
    expect(inativacoesAprovadas(ina, nova.escopo, nova.indice)).toEqual([]); expect(situacaoDoCandidato(c, "Peças", ina)).toBe("SALDO");
    const novaMov = monta([item(2, "P1", "2023-05-01"), item(3, "P2", "2022-06-01", { saldo: 5000000 }), item(4, "P3", "2021-03-03", { saldo: null })]);
    expect(individualDesatualizada(ina.individuais.P2, novaMov.itens[1])).toBe(true); // mesma quantidade, outra data de movimentação
    expect(individualDesatualizada({ acao: "MANTER" }, p2)).toBe(false); // decisão sem instantâneo (antiga) segue valendo
  });
  it("trocar ou desfazer a decisão individual guarda a anterior no histórico", () => {
    const a = decidirIndividual(null, "P2", { acao: "INATIVAR", justificativa: "Saldo transferido pela nota 123 e histórico preservado.", por: "ana", em: "d1", item: A.itens[1] });
    const b = decidirIndividual(a, "P2", { acao: "MANTER", justificativa: "ainda é comprado", por: "bia", em: "d2", item: A.itens[1] });
    expect(b.historico).toHaveLength(1); expect(b.historico[0]).toMatchObject({ tipo: "INDIVIDUAL_SUBSTITUIDA", id: "P2", por: "bia", anterior: { acao: "INATIVAR" } });
    const c = decidirIndividual(b, "P2", { acao: null, por: "ana", em: "d3" });
    expect(c.individuais.P2).toBeUndefined(); expect(c.historico.at(-1)).toMatchObject({ tipo: "INDIVIDUAL_REMOVIDA", id: "P2", anterior: { acao: "MANTER" } });
    expect(a.historico).toEqual([]); // não altera o que recebeu
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
