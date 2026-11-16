import { describe, expect, it } from "vitest";
import { competenciaDaConsulta, rotuloDoDocumento } from "./PainelUnificado";

describe("DCTFWeb e MIT numa tabela só", () => {
  it("o documento é o rótulo do serviço sem o prefixo do sistema", () => {
    expect(rotuloDoDocumento({ rotulo: "DCTFWeb: recibo de transmissão" })).toBe("Recibo de transmissão");
    expect(rotuloDoDocumento({ rotulo: "MIT: apurações" })).toBe("Apurações");
  });
  it("a competência sai dos parâmetros da consulta", () => {
    expect(competenciaDaConsulta({ periodo: "202510" })).toBe("2025-10");
    expect(competenciaDaConsulta({ ano: "2025" })).toBe("2025");
    expect(competenciaDaConsulta({ id: "123" })).toBe("Apuração 123");
    expect(competenciaDaConsulta({})).toBe("");
  });
});
