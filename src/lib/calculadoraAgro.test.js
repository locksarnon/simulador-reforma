import { describe, it, expect } from "vitest";
import { estimar } from "./calculadoraAgro";

/**
 * A Calculadora pública usa as mesmas funções do motor, então herda a base do IBS/CBS do art. 12, §2º, V da LC 214:
 * de 2026 a 2032 o ICMS, o PIS e a Cofins ainda cobrados saem da base; em 2033 não há exclusão.
 */
describe("estimar (Calculadora pública): base do IBS/CBS", () => {
  const parametros = [
    { ano: 2027, pis_cofins_fator: 0, ipi_fator_geral: 0, icms_fator: 1, iss_fator: 1, ibs_efetivo: 0.001, cbs_efetiva: 0.112, ibs_uf_aliquota: 0, ibs_mun_aliquota: 0, efeito_financeiro: 1 },
    { ano: 2033, pis_cofins_fator: 0, ipi_fator_geral: 0, icms_fator: 0, iss_fator: 0, ibs_efetivo: 0.1, cbs_efetiva: 0.088, ibs_uf_aliquota: 0, ibs_mun_aliquota: 0, efeito_financeiro: 1 },
  ];
  // Rações: ICMS médio de 7% e redução de 60% do IBS/CBS; Lucro Presumido; sem compras, para isolar o lado da venda.
  const entrada = { perfil: "racao", regime: "presumido", faturamentoAnual: 10_000_000, comprasPct: 0, creditoPct: 0, respostas: {} };

  it("2027: o ICMS de 7% (R$ 700 mil) sai da base, que fica em R$ 9,3 milhões", () => {
    const r = estimar(entrada, parametros);
    // IBS = 9.300.000 × 0,1% × 40% = 3.720; CBS = 9.300.000 × 11,2% × 40% = 416.640; ICMS remanescente = 700.000
    expect(r.y2027.cargaRegular).toBeCloseTo(700_000 + 3_720 + 416_640, 2);
    expect(r.y2027.pctRegular).toBeCloseTo(11.2036, 4);
  });

  it("2033: sem exclusão, a base é o faturamento inteiro", () => {
    const r = estimar(entrada, parametros);
    // 10.000.000 × (10% + 8,8%) × 40% = 752.000 e nada do sistema atual
    expect(r.y2033.cargaRegular).toBeCloseTo(752_000, 2);
  });

  it("as premissas do relatório dizem qual é a base", () => {
    const r = estimar(entrada, parametros);
    expect(r.premissas.some((p) => p.includes("art. 12, §2º, V"))).toBe(true);
  });
});
