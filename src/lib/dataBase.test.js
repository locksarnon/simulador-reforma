import { describe, expect, it } from "vitest";
import { porDataBase, projetoPorDataBase, rotuloPeriodo, tituloPeriodo, valorPeriodo } from "./dataBase";

const fmt = (v) => String(v).slice(0, 10).split("-").reverse().join("/");

describe("data-base dos serviços", () => {
  it("homologação do ERP e crédito de estoque são por data-base; os demais, por período", () => {
    for (const id of ["pj-homologacao", "pf-homologacao", "credito-estoque", "credito-estoque-pf"]) expect(porDataBase(id), id).toBe(true);
    for (const id of ["pis-cofins", "lcdpr", "irpj-csll", "simulador-reforma", "tributos-pagos", undefined]) expect(porDataBase(id), String(id)).toBe(false);
  });
  it("mostra data-base só quando o projeto é de data-base (início = fim)", () => {
    const base = { servico_consultoria: "pj-homologacao", periodo_inicio: "2026-12-31T00:00:00.000Z", periodo_fim: "2026-12-31T00:00:00.000Z" };
    expect(valorPeriodo(base, fmt)).toBe("31/12/2026");
    expect(rotuloPeriodo(base, fmt)).toBe("Data-base 31/12/2026");
    expect(tituloPeriodo(base)).toBe("Data-base do projeto");
  });
  it("projeto antigo de homologação, com intervalo, continua mostrando o período", () => {
    const antigo = { servico_consultoria: "pj-homologacao", periodo_inicio: "2026-01-01", periodo_fim: "2026-06-30" };
    expect(rotuloPeriodo(antigo, fmt)).toBe("01/01/2026 a 30/06/2026");
    expect(tituloPeriodo(antigo)).toBe("Período do projeto");
  });
  it("serviço por período com início = fim (um dia) segue como período", () => {
    const dia = { servico_consultoria: "pis-cofins", periodo_inicio: "2026-03-01", periodo_fim: "2026-03-01" };
    expect(rotuloPeriodo(dia, fmt)).toBe("01/03/2026 a 01/03/2026");
  });
});
