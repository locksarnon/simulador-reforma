import { describe, expect, it } from "vitest";
import { icmsInterestadual, sugerirTributosAtuais } from "./tabelasLegais";
import { fracaoParaTexto, textoParaFracao } from "./pctFormat";

describe("campo de percentual", () => {
  it("7,60 vira 0,076 e volta como 7,6 — sem 7,000000000000001", () => {
    expect(textoParaFracao("7,60")).toBe(0.076);
    expect(textoParaFracao("7.6")).toBe(0.076);
    expect(fracaoParaTexto(0.076)).toBe("7,6");
    expect(fracaoParaTexto(0.0165)).toBe("1,65");
    expect(fracaoParaTexto(0.07)).toBe("7");
  });

  it("digitação parcial e vazio não quebram", () => {
    expect(textoParaFracao("")).toBe(0);
    expect(textoParaFracao("7,")).toBe(0.07);
    expect(fracaoParaTexto(0)).toBe("0");
    expect(fracaoParaTexto(undefined)).toBe("0");
  });
});

describe("tabela da legislação", () => {
  it("PIS/Cofins pelo regime", () => {
    expect(sugerirTributosAtuais({ regime_atual: "Lucro Real" })).toMatchObject({ pis_pct: 0.0165, cofins_pct: 0.076 });
    expect(sugerirTributosAtuais({ regime_atual: "Lucro Presumido" })).toMatchObject({ pis_pct: 0.0065, cofins_pct: 0.03 });
    expect(sugerirTributosAtuais({ regime_atual: "Simples Nacional" })).toMatchObject({ pis_pct: 0, cofins_pct: 0 });
  });

  it("ICMS interestadual: 7% de Sul/Sudeste (menos ES) para N/NE/CO/ES; 12% nos demais casos", () => {
    expect(icmsInterestadual("MT", "SP").icms).toBe(0.12);
    expect(icmsInterestadual("SP", "MA").icms).toBe(0.07);
    expect(icmsInterestadual("SP", "ES").icms).toBe(0.07);
    expect(icmsInterestadual("SP", "RJ").icms).toBe(0.12);
    expect(icmsInterestadual("MA", "PA").icms).toBe(0.12);
    expect(icmsInterestadual("MA", "MA")).toBeNull();
  });

  it("operação interna não sugere ICMS (varia por UF/produto)", () => {
    const s = sugerirTributosAtuais({ regime_atual: "Lucro Real", uf_origem: "MA", uf_destino: "MA" });
    expect(s.icms_pct).toBeUndefined();
    expect(s.explicacao.join(" ")).toContain("alíquota interna");
  });
});
