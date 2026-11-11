import { describe, expect, it } from "vitest";
import { competenciaAtual, descreverRecorrencia, diasAte, filtrarTarefas, hojeBR, nomeDaCompetencia, situacaoDoPrazo } from "./tarefas";

const HOJE = "2026-11-11";
const tarefa = (extra) => ({ id: "T", titulo: "Conferir CT-e", descricao: null, status: "ABERTA", prazo: null, responsavel: null, empresa_id: null, ...extra });

describe("hoje em Brasília", () => {
  it("à noite em UTC ainda é o dia anterior", () => {
    expect(hojeBR(new Date("2026-11-12T01:30:00Z"))).toBe("2026-11-11");
    expect(hojeBR(new Date("2026-11-12T03:00:00Z"))).toBe("2026-11-12");
    expect(competenciaAtual(new Date("2027-01-01T02:59:00Z"))).toBe("2026-12");
  });
});

describe("prazo da tarefa", () => {
  it("conta os dias até o prazo a partir da data, sem mexer com fuso", () => {
    expect(diasAte("2026-11-20T00:00:00.000Z", HOJE)).toBe(9);
    expect(diasAte("2026-11-11T00:00:00.000Z", HOJE)).toBe(0);
    expect(diasAte("2026-11-10T00:00:00.000Z", HOJE)).toBe(-1);
    expect(diasAte(null, HOJE)).toBeNull();
  });

  it("diz em palavras e dá o tom: atrasada, hoje, breve, normal", () => {
    const s = (prazo, status = "ABERTA") => situacaoDoPrazo(tarefa({ prazo, status }), HOJE);
    expect(s("2026-11-08T00:00:00.000Z")).toEqual({ texto: "Atrasada há 3 dias", tom: "atrasada" });
    expect(s("2026-11-10T00:00:00.000Z")).toEqual({ texto: "Atrasada há 1 dia", tom: "atrasada" });
    expect(s("2026-11-11T00:00:00.000Z")).toEqual({ texto: "Vence hoje", tom: "hoje" });
    expect(s("2026-11-12T00:00:00.000Z")).toEqual({ texto: "Vence amanhã", tom: "breve" });
    expect(s("2026-11-15T00:00:00.000Z")).toEqual({ texto: "Vence em 4 dias", tom: "breve" });
    expect(s("2026-12-20T00:00:00.000Z")).toEqual({ texto: "20/12/2026", tom: "normal" });
    expect(s(null)).toEqual({ texto: "Sem prazo", tom: "nenhum" });
  });

  it("tarefa concluída ou cancelada mostra só a data, nunca 'atrasada'", () => {
    const r = situacaoDoPrazo(tarefa({ prazo: "2026-11-01T00:00:00.000Z", status: "CONCLUIDA" }), HOJE);
    expect(r).toEqual({ texto: "01/11/2026", tom: "normal" });
  });
});

describe("filtros da lista de tarefas", () => {
  const T = [
    tarefa({ id: "1", titulo: "Conferir apuração", prazo: "2026-11-05T00:00:00.000Z", responsavel: "U1", empresa_id: "E1" }),
    tarefa({ id: "2", titulo: "Enviar guia", prazo: "2026-11-11T00:00:00.000Z", responsavel: "U2", empresa_id: "E2" }),
    tarefa({ id: "3", titulo: "Revisar cadastro", prazo: "2026-11-14T00:00:00.000Z", responsavel: null, empresa_id: "E1", descricao: "NCM dos itens novos" }),
    tarefa({ id: "4", titulo: "Sem data", prazo: null }),
    tarefa({ id: "5", titulo: "Já feita", prazo: "2026-11-01T00:00:00.000Z", status: "CONCLUIDA" }),
  ];
  const ctx = { usuarioId: "U1", hoje: HOJE, nomeDaEmpresa: (id) => ({ E1: "Beta Comércio SA", E2: "Gama Serviços" })[id] || "" };
  const ids = (f) => filtrarTarefas(T, f, ctx).map((x) => x.id);

  it("sem filtro devolve tudo", () => expect(ids({})).toEqual(["1", "2", "3", "4", "5"]));
  it("responsável: eu, sem responsável e uma pessoa", () => {
    expect(ids({ responsavel: "eu" })).toEqual(["1"]);
    expect(ids({ responsavel: "sem" })).toEqual(["3", "4", "5"]);
    expect(ids({ responsavel: "U2" })).toEqual(["2"]);
  });
  it("atalhos de prazo só olham tarefas em aberto com prazo", () => {
    expect(ids({ atalho: "atrasadas" })).toEqual(["1"]);
    expect(ids({ atalho: "hoje" })).toEqual(["2"]);
    expect(ids({ atalho: "semana" })).toEqual(["2", "3"]);
  });
  it("busca no título, na descrição e no nome da empresa, sem acento", () => {
    expect(ids({ busca: "apuracao" })).toEqual(["1"]);
    expect(ids({ busca: "ncm" })).toEqual(["3"]);
    expect(ids({ busca: "gama" })).toEqual(["2"]);
  });
  it("empresa filtra pelo id", () => expect(ids({ empresa: "E1" })).toEqual(["1", "3"]));
});

describe("textos", () => {
  it("descreve a recorrência e a competência", () => {
    expect(descreverRecorrencia({ recorrencia: "MENSAL", dia: 20 })).toBe("Todo mês, dia 20");
    expect(descreverRecorrencia({ recorrencia: "ANUAL", mes: 3, dia: 31 })).toBe("Uma vez por ano, em março, dia 31");
    expect(descreverRecorrencia({ recorrencia: "TRIMESTRAL", dia: 15 })).toContain("dia 15");
    expect(nomeDaCompetencia("2026-11")).toBe("novembro de 2026");
    expect(nomeDaCompetencia("")).toBe("");
  });
});
