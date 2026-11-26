import { describe, expect, it } from "vitest";
import { converterProposta, converterValor, lerNumeroBr } from "./logica";

// Mesmos casos do servidor (backend/src/saneamento-estoques/importacao/normalizacao.spec.ts, lerNumero sem contexto de coluna).
describe("número digitado: a mesma regra do servidor", () => {
  it("lerNumeroBr", () => {
    expect(lerNumeroBr("1.234,56")).toBe(1234.56);
    expect(lerNumeroBr("1,234.56")).toBe(1234.56);
    expect(lerNumeroBr("1234,5")).toBe(1234.5);
    expect(lerNumeroBr("1234.5")).toBe(1234.5);
    expect(lerNumeroBr("1.234.567")).toBe(1234567);
    expect(lerNumeroBr("1,234,567")).toBe(1234567);
    expect(lerNumeroBr("1.234")).toBe(1234);
    expect(lerNumeroBr("1.000")).toBe(1000);
    expect(lerNumeroBr("0.001")).toBe(0.001);
    expect(lerNumeroBr("0,5")).toBe(0.5);
    expect(lerNumeroBr("12-")).toBe(-12);
    expect(lerNumeroBr("(7,5)")).toBe(-7.5);
    expect(lerNumeroBr("0")).toBe(0);
    expect(lerNumeroBr(0.001)).toBe(0.001);
    expect(lerNumeroBr("abc")).toBeNull();
    expect(lerNumeroBr("")).toBeNull();
    expect(lerNumeroBr("1,2,3")).toBeNull();
  });
  it('converterValor e converterProposta: "1.000" é mil (antes virava 1), "0,5" meio; texto que não é número fica inválido', () => {
    expect(converterValor("1.000", 0)).toBe(1000);
    expect(converterValor("1.000,5", 0)).toBe(1000.5);
    expect(converterValor("0.001", 0)).toBe(0.001);
    expect(converterProposta({ fatorConversao: "1.000" }, {}).valor.fatorConversao).toBe(1000);
    expect(converterProposta({ fatorConversao: "0,5" }, {}).valor.fatorConversao).toBe(0.5);
    expect(converterProposta({ saldo: "1.250" }, { saldo: 3 }).valor.saldo).toBe(1250);
    expect(converterProposta({ fatorConversao: "dez" }, {}).invalidos).toEqual(["fatorConversao"]);
  });
});
