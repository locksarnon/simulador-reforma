import { describe, expect, it } from "vitest";
import { andar, diaEHora, gradeDoMes, normalizarCamadas, periodoDaVisao, porDia, semanaDe, tituloDaVisao } from "./agenda";
import { instanteDeBrasilia, maisUmaHora, problemaDoPeriodo } from "@/components/agenda/DialogoEvento";

describe("período do evento na tela", () => {
  it("o fim sugerido é uma hora depois do início", () => {
    expect(maisUmaHora("14:00")).toBe("15:00");
    expect(maisUmaHora("09:30")).toBe("10:30");
    expect(maisUmaHora("23:15")).toBe("23:59");
  });
  it("avisa quando o fim fica antes do início", () => {
    expect(problemaDoPeriodo({ dia_inteiro: false, dia: "2026-11-12", hora: "14:00", dia_fim: "2026-11-12", hora_fim: "10:00" })).toMatch(/depois do início/);
    expect(problemaDoPeriodo({ dia_inteiro: false, dia: "2026-11-12", hora: "14:00", dia_fim: "2026-11-12", hora_fim: "15:00" })).toBeNull();
    expect(problemaDoPeriodo({ dia_inteiro: false, dia: "2026-11-12", hora: "14:00", hora_fim: "" })).toBeNull();
    expect(problemaDoPeriodo({ dia_inteiro: true, dia: "2026-11-12", dia_fim: "2026-11-10" })).toMatch(/antes da inicial/);
  });
});

describe("grade do calendário", () => {
  it("o mês começa na segunda-feira da semana do dia 1 e tem 6 semanas", () => {
    const g = gradeDoMes(2026, 11); // 1/11/2026 é domingo
    expect(g).toHaveLength(6);
    expect(g[0][0]).toEqual({ dia: "2026-10-26", doMes: false });
    expect(g[0][6]).toEqual({ dia: "2026-11-01", doMes: true });
    expect(g[5][6].dia).toBe("2026-12-06");
  });
  it("semana de segunda a domingo e o período de cada visão", () => {
    expect(semanaDe("2026-11-11")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    expect(periodoDaVisao("dia", "2026-11-11")).toEqual({ de: "2026-11-11", ate: "2026-11-11" });
    expect(periodoDaVisao("semana", "2026-11-11")).toEqual({ de: "2026-11-09", ate: "2026-11-15" });
    expect(periodoDaVisao("mes", "2026-11-11")).toEqual({ de: "2026-10-26", ate: "2026-12-06" });
  });
  it("anda mês, semana e dia, inclusive na virada do ano", () => {
    expect(andar("mes", "2026-12-15", 1)).toBe("2027-01-01");
    expect(andar("mes", "2026-01-15", -1)).toBe("2025-12-01");
    expect(andar("semana", "2026-11-11", 1)).toBe("2026-11-18");
    expect(andar("dia", "2026-12-31", 1)).toBe("2027-01-01");
  });
  it("títulos", () => {
    expect(tituloDaVisao("mes", "2026-11-11")).toBe("novembro de 2026");
    expect(tituloDaVisao("dia", "2026-11-11")).toBe("11 de novembro de 2026");
    expect(tituloDaVisao("semana", "2026-11-11")).toBe("Semana de 9/11 a 15/11");
  });
});

describe("horário de Brasília", () => {
  it("o evento das 22:30 de Brasília é do dia de Brasília, mesmo já sendo o dia seguinte em UTC", () => {
    expect(diaEHora({ inicio: "2026-11-13T01:30:00.000Z", dia_inteiro: false })).toEqual({ dia: "2026-11-12", hora: "22:30" });
    expect(diaEHora({ inicio: "2026-11-13T00:00:00.000Z", dia_inteiro: true })).toEqual({ dia: "2026-11-13", hora: null });
  });
  it("a hora digitada vira o instante certo (UTC−3)", () => {
    expect(instanteDeBrasilia("2026-11-12", "14:00")).toBe("2026-11-12T17:00:00.000Z");
    expect(instanteDeBrasilia("2026-11-12", "23:30")).toBe("2026-11-13T02:30:00.000Z");
  });
});

describe("camadas", () => {
  const camadas = {
    eventos: [
      { id: "E1", titulo: "Reunião", inicio: "2026-11-12T17:00:00.000Z", fim: null, dia_inteiro: false, tipo_id: "T1", local: "Sala 2", empresa_id: "EMP1" },
      { id: "E2", titulo: "Viagem", inicio: "2026-11-09T00:00:00.000Z", fim: "2026-11-11T00:00:00.000Z", dia_inteiro: true, tipo_id: null },
    ],
    tarefas: [{ id: "T9", titulo: "Conferir CT-e", prazo: "2026-11-12T00:00:00.000Z", empresa_id: "EMP1" }],
    obrigacoes: [{ obrigacao: "dctfweb", nome: "DCTFWeb", competencia: "2026-10", data: "2026-11-13", data_legal: "2026-11-15", movida: true, confirmado: false }],
    certificados: [{ id: "C1", empresa_id: "EMP1", titular: "X", dia: "2026-11-20" }],
  };
  const itens = normalizarCamadas({ camadas, reforma: [{ id: "R1", titulo: "Início da CBS", data: "2026-11-12", confirmado: true }], tipos: [{ id: "T1", cor: "#16A34A" }], nomeDaEmpresa: (id) => (id === "EMP1" ? "EXTRA AGRO" : "") });

  it("junta tudo num formato só, em ordem de dia e hora, com a cor do tipo do evento", () => {
    const dia12 = itens.filter((i) => i.dia === "2026-11-12");
    expect(dia12.map((i) => [i.camada, i.titulo, i.hora])).toEqual([["evento", "Reunião", "14:00"], ["tarefa", "Conferir CT-e", null], ["reforma", "Início da CBS", null]]);
    expect(dia12[0]).toMatchObject({ cor: "#16A34A", detalhe: "Sala 2 · EXTRA AGRO" });
  });
  it("evento de vários dias aparece em cada dia; obrigação mostra a data legal e o 'não confirmado'", () => {
    expect(itens.filter((i) => i.titulo === "Viagem").map((i) => i.dia)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(itens.find((i) => i.camada === "obrigacao").detalhe).toBe("Competência 2026-10 · data legal 15/11 · não confirmado");
    expect(itens.find((i) => i.camada === "certificado")).toMatchObject({ titulo: "Vence o certificado A1 de EXTRA AGRO", link: "/bpo/repositorio-xml/EMP1" });
  });
  it("desligar uma camada tira os itens dela", () => {
    const mapa = porDia(itens, ["evento"]);
    expect([...mapa.values()].flat().every((i) => i.camada === "evento")).toBe(true);
    expect(mapa.get("2026-11-12")).toHaveLength(1);
  });
});
