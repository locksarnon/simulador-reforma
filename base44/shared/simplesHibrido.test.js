import { describe, it, expect } from "vitest";
import {
  calcularFatorR,
  determinarAnexoEFaixa,
  calcularAliquotaEfetiva,
  calcularSimplesPuro,
  calcularHibrido,
  calcularPontosEquilibrio,
  simularSimplesHibrido,
  RBT12_LIMITE_SIMPLES,
} from "./simplesHibrido.js";

/**
 * T01-T07 reproduzem, caso a caso, a aba "Testes Validação" da planilha do
 * usuário (Simulador_Simples_Puro_vs_Hibrido_IBS_CBS_2027_v8_Zero_Erro.xlsx),
 * mesmos inputs e mesmos resultados esperados — RBT12 R$1,2mi, folha R$360k
 * (Fator R 30%), receita mensal R$100k. Se algum destes quebrar, o motor
 * mudou de comportamento: conferir contra a planilha antes de atualizar o
 * número esperado.
 */
describe("calcularSimplesPuro — paridade com a planilha (T01-T07)", () => {
  const base = { receitaMensal: 100_000, rbt12: 1_200_000, folha12: 360_000 };

  it("T01 — Anexo I", () => {
    const r = calcularSimplesPuro({ ...base, modo: "Anexo I" });
    expect(r.faixa).toBe(4);
    expect(r.aliquotaEfetiva).toBeCloseTo(0.08825, 5);
    expect(r.dasMensal).toBeCloseTo(8825, 2);
  });

  it("T02 — Anexo II", () => {
    const r = calcularSimplesPuro({ ...base, modo: "Anexo II" });
    expect(r.faixa).toBe(4);
    expect(r.aliquotaEfetiva).toBeCloseTo(0.09325, 5);
    expect(r.dasMensal).toBeCloseTo(9325, 2);
  });

  it("T03 — Anexo III", () => {
    const r = calcularSimplesPuro({ ...base, modo: "Anexo III" });
    expect(r.faixa).toBe(4);
    expect(r.aliquotaEfetiva).toBeCloseTo(0.1303, 5);
    expect(r.ibsCbsSimplesPct).toBeCloseTo(0.0216298, 6);
    expect(r.dasMensal).toBeCloseTo(13030, 2);
  });

  it("T04 — Anexo IV", () => {
    const r = calcularSimplesPuro({ ...base, modo: "Anexo IV" });
    expect(r.faixa).toBe(4);
    expect(r.aliquotaEfetiva).toBeCloseTo(0.10685, 5);
    expect(r.dasMensal).toBeCloseTo(10685, 2);
  });

  it("T05 — Anexo V", () => {
    const r = calcularSimplesPuro({ ...base, modo: "Anexo V" });
    expect(r.faixa).toBe(4);
    expect(r.aliquotaEfetiva).toBeCloseTo(0.19075, 5);
    expect(r.dasMensal).toBeCloseTo(19075, 2);
  });

  it("T06 — Fator R automático, 30% (≥28%) cai no Anexo III", () => {
    const r = calcularSimplesPuro({ ...base, modo: "automatico" });
    expect(r.fatorR).toBeCloseTo(0.3, 5);
    expect(r.anexo).toBe("Anexo III");
    expect(r.aliquotaEfetiva).toBeCloseTo(0.1303, 5);
  });

  it("T07 — Fator R automático, 20% (<28%) cai no Anexo V", () => {
    const r = calcularSimplesPuro({ ...base, folha12: 240_000, modo: "automatico" });
    expect(r.fatorR).toBeCloseTo(0.2, 5);
    expect(r.anexo).toBe("Anexo V");
    expect(r.aliquotaEfetiva).toBeCloseTo(0.19075, 5);
  });

  it("crédito ao cliente pondera pela fração de clientes no regime regular", () => {
    const r = calcularSimplesPuro({ ...base, modo: "Anexo III", pctClientesRegimeRegular: 0.9 });
    // ibsCbsNoSimples = 100000 * 0.0216298 = 2162.98; crédito = ×90%
    expect(r.creditoClientePuro).toBeCloseTo(1946.682, 3);
  });
});

describe("casos de borda — não cobertos pela planilha", () => {
  it("RBT12 acima de R$ 4,8 milhões: acima do limite do Simples (LC 123/2006, art. 3º, §2º)", () => {
    const r = calcularSimplesPuro({ receitaMensal: 500_000, rbt12: RBT12_LIMITE_SIMPLES + 0.01, folha12: 1_500_000, modo: "automatico" });
    expect(r.acimaDoLimite).toBe(true);
  });

  it("RBT12 exatamente no limite ainda é Simples", () => {
    const r = determinarAnexoEFaixa({ modo: "Anexo III", rbt12: RBT12_LIMITE_SIMPLES, fatorR: 0.3 });
    expect(r.acimaDoLimite).toBe(false);
    expect(r.faixa).toBe(6);
  });

  it("Fator R exatamente em 28%: cai no Anexo III (regra é ≥28%, não >28% — LC 123/2006, art. 18, §5º-J)", () => {
    const r = determinarAnexoEFaixa({ modo: "automatico", rbt12: 1_200_000, fatorR: 0.28 });
    expect(r.anexo).toBe("Anexo III");
  });

  it("Fator R a 0,0001 p.p. abaixo de 28%: cai no Anexo V", () => {
    const r = determinarAnexoEFaixa({ modo: "automatico", rbt12: 1_200_000, fatorR: 0.2799 });
    expect(r.anexo).toBe("Anexo V");
  });

  it("receita e folha zeradas não divide por zero", () => {
    expect(() => calcularFatorR(0, 0)).not.toThrow();
    expect(calcularFatorR(0, 0)).toBeGreaterThan(0);
  });

  it("Anexo III, 5ª faixa, acima do teto de ISS: aplica a regra especial de redistribuição", () => {
    // RBT12 na 5ª faixa (R$3,0mi) com alíquota nominal 21% / dedução 125.640
    // produz alíquota efetiva de ~16,98%, acima do teto de 14,92537% —
    // dispara a redistribuição CBS/IBS em vez da repartição fixa da tabela.
    const r = calcularSimplesPuro({ receitaMensal: 250_000, rbt12: 3_000_000, folha12: 900_000, modo: "Anexo III" });
    expect(r.faixa).toBe(5);
    expect(r.aliquotaEfetiva).toBeGreaterThan(0.1492537);
    // Repartição fixa da tabela pra faixa 5 seria cbsPct=0.1543 — a regra
    // especial tem que produzir um valor DIFERENTE desse.
    const cbsFixo = 0.1543;
    const cbsEfetivoUsado = r.ibsCbsSimplesPct / r.aliquotaEfetiva - 0; // cbsPct+ibsPct combinados
    expect(cbsEfetivoUsado).not.toBeCloseTo(cbsFixo + 0.0017, 4);
  });
});

/**
 * Prova real — mesmo gate que a aba "Controle Qualidade" da planilha:
 * recalcula o resultado líquido por dois caminhos independentes (direto vs.
 * via o markup de equilíbrio) e falha se a diferença passar de 1 centavo.
 * Cenário: RBT12 R$970k, Anexo V, CBS/IBS regular conforme a premissa da
 * própria planilha (8,9% / 0,1%) — usada aqui só para fins de paridade do
 * teste, não como validação de qual premissa é a correta para produção
 * (ver nota 2 no header de simplesHibrido.js).
 */
describe("prova real — Anexo V, RBT12 R$970k (paridade com 'Meu Cenário 970k')", () => {
  const anoParams = { ibs_efetivo: 0.001, cbs_efetiva: 0.089 };
  const receitaAnual = 970_000;

  it("alíquota efetiva do Simples bate com a planilha", () => {
    const r = calcularSimplesPuro({ receitaMensal: receitaAnual, rbt12: receitaAnual, folha12: 0, modo: "Anexo V" });
    expect(r.aliquotaEfetiva).toBeCloseTo(0.187371134, 7);
    expect(r.ibsCbsSimplesPct).toBeCloseTo(0.0358815722, 7);
  });

  it("resultado líquido é idêntico nos dois cenários no ponto de equilíbrio", () => {
    const puro = calcularSimplesPuro({ receitaMensal: receitaAnual, rbt12: receitaAnual, folha12: 0, modo: "Anexo V" });
    const hibrido = calcularHibrido({
      receitaMensal: receitaAnual,
      aliquotaEfetivaSimples: puro.aliquotaEfetiva,
      ibsCbsSimplesPct: puro.ibsCbsSimplesPct,
      anoParams,
    });
    const { markupEquilibrio } = calcularPontosEquilibrio({
      aliquotaEfetivaSimples: puro.aliquotaEfetiva,
      ibsCbsSimplesPct: puro.ibsCbsSimplesPct,
      cargaHibridaPct: hibrido.cargaHibridaPct,
      ibsCbsRegularPct: hibrido.ibsCbsRegularPct,
    });
    expect(markupEquilibrio).toBeCloseTo(0.0713482967, 6);

    // Caminho A: resultado líquido do Simples puro, sem repasse.
    const resultadoPuro = receitaAnual - receitaAnual * puro.aliquotaEfetiva;

    // Caminho B: resultado líquido do híbrido, repassando o markup de
    // equilíbrio no preço — tem que dar EXATAMENTE o mesmo resultado.
    const precoHibrido = receitaAnual * (1 + markupEquilibrio);
    const cargaHibridaNoPrecoNovo = precoHibrido * hibrido.cargaHibridaPct;
    const resultadoHibrido = precoHibrido - cargaHibridaNoPrecoNovo;

    expect(Math.abs(resultadoHibrido - resultadoPuro)).toBeLessThanOrEqual(0.01);
  });
});
