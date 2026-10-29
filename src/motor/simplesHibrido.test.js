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

/**
 * Reproduz o achado de QA: "passar de 0% para 100% de clientes empresas não
 * muda nenhum resultado" — o ponto neutro do cliente tem que mudar com o mix,
 * e cair pra zero quando 100% da carteira é consumidor final (que nunca
 * credita, nos dois cenários — logo nenhum repasse de preço é neutro pra ele).
 */
describe("ponto neutro do cliente pondera pelo mix da carteira (regressão do achado de QA)", () => {
  const anoParams = { ibs_efetivo: 0.001, cbs_efetiva: 0.089 };
  const base = { receitaMensal: 100_000, rbt12: 1_200_000, folha12: 360_000, modo: "Anexo III" };

  it("100% empresas: ponto neutro = fórmula clássica (igual à versão anterior)", () => {
    const r = simularSimplesHibrido({ ...base, pctClientesRegimeRegular: 1 }, anoParams);
    const esperado = (1 - r.puro.ibsCbsSimplesPct) / (1 - r.hibrido.ibsCbsRegularPct) - 1;
    expect(r.pontos.markupNeutroCliente).toBeCloseTo(esperado, 8);
  });

  it("0% empresas (só consumidor final): ponto neutro é exatamente 0", () => {
    const r = simularSimplesHibrido({ ...base, pctClientesRegimeRegular: 0 }, anoParams);
    expect(r.pontos.markupNeutroCliente).toBeCloseTo(0, 10);
  });

  it("0% e 100% empresas não podem dar o mesmo ponto neutro", () => {
    const r0 = simularSimplesHibrido({ ...base, pctClientesRegimeRegular: 0 }, anoParams);
    const r100 = simularSimplesHibrido({ ...base, pctClientesRegimeRegular: 1 }, anoParams);
    expect(r0.pontos.markupNeutroCliente).not.toBeCloseTo(r100.pontos.markupNeutroCliente, 4);
  });

  it("ponto de equilíbrio (lado do vendedor) NÃO muda com o mix de clientes", () => {
    const r0 = simularSimplesHibrido({ ...base, pctClientesRegimeRegular: 0 }, anoParams);
    const r100 = simularSimplesHibrido({ ...base, pctClientesRegimeRegular: 1 }, anoParams);
    expect(r0.pontos.markupEquilibrio).toBeCloseTo(r100.pontos.markupEquilibrio, 10);
  });
});

describe("avisos de tributo fora do DAS", () => {
  it("6ª faixa de qualquer Anexo avisa ICMS/ISS fora do DAS", () => {
    const r = calcularSimplesPuro({ receitaMensal: 400_000, rbt12: 4_000_000, folha12: 0, modo: "Anexo I" });
    expect(r.faixa).toBe(6);
    expect(r.avisoIcmsIssForaDas).toBe(true);
  });

  it("Anexo IV avisa CPP fora do DAS em qualquer faixa", () => {
    const r = calcularSimplesPuro({ receitaMensal: 100_000, rbt12: 1_200_000, folha12: 0, modo: "Anexo IV" });
    expect(r.avisoCppForaDas).toBe(true);
    expect(r.avisoIcmsIssForaDas).toBe(false);
  });

  it("Anexo I na 4ª faixa não dispara nenhum dos dois avisos", () => {
    const r = calcularSimplesPuro({ receitaMensal: 100_000, rbt12: 1_200_000, folha12: 0, modo: "Anexo I" });
    expect(r.avisoIcmsIssForaDas).toBe(false);
    expect(r.avisoCppForaDas).toBe(false);
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

/**
 * Crédito das compras da própria empresa no regime regular (LC 214/2025, art. 47): o híbrido deixa de cobrar o IBS/CBS
 * sobre a receita inteira e abate o IBS/CBS das compras de fornecedores do regime regular.
 */
describe("crédito das compras no híbrido", () => {
  const anoParams = { ibs_efetivo: 0.001, cbs_efetiva: 0.112 }; // regular: 11,3%
  const base = { receitaMensal: 100_000, aliquotaEfetivaSimples: 0.12, ibsCbsSimplesPct: 0.02 };

  it("sem compras informadas, o resultado é o de antes (carga = DAS residual + IBS/CBS sobre toda a receita)", () => {
    const h = calcularHibrido({ ...base, anoParams });
    expect(h.creditoCompras).toBe(0);
    expect(h.saldoCredor).toBe(0);
    expect(h.cargaHibridaMensal).toBeCloseTo(100_000 * 0.10 + 100_000 * 0.113, 6);
    expect(h.cargaHibridaPct).toBeCloseTo(0.10 + 0.113, 12);
  });

  it("compras de R$ 30.000 abatem 11,3% delas (R$ 3.390) do IBS/CBS a pagar", () => {
    const h = calcularHibrido({ ...base, anoParams, comprasCreditaveisMensais: 30_000 });
    expect(h.ibsCbsRegular).toBeCloseTo(11_300, 6);
    expect(h.creditoCompras).toBeCloseTo(3_390, 6);
    expect(h.ibsCbsAPagar).toBeCloseTo(7_910, 6);
    expect(h.cargaHibridaMensal).toBeCloseTo(10_000 + 7_910, 6);
    expect(h.cargaHibridaPct).toBeCloseTo(0.17910, 8);
    expect(h.saldoCredor).toBe(0);
  });

  it("crédito maior que o débito vira saldo credor e não reduz o DAS residual", () => {
    const h = calcularHibrido({ ...base, anoParams, comprasCreditaveisMensais: 120_000 });
    expect(h.creditoCompras).toBeCloseTo(13_560, 6);
    expect(h.ibsCbsAPagar).toBe(0);
    expect(h.saldoCredor).toBeCloseTo(2_260, 6);
    expect(h.cargaHibridaMensal).toBeCloseTo(10_000, 6);
  });

  it("compras negativas ou texto estranho não geram crédito", () => {
    expect(calcularHibrido({ ...base, anoParams, comprasCreditaveisMensais: -500 }).creditoCompras).toBe(0);
    expect(calcularHibrido({ ...base, anoParams, comprasCreditaveisMensais: "abc" }).creditoCompras).toBe(0);
  });

  it("o crédito dos clientes (lado do comprador) não muda com as compras do vendedor", () => {
    const sem = calcularHibrido({ ...base, anoParams, pctClientesRegimeRegular: 0.7 });
    const com = calcularHibrido({ ...base, anoParams, pctClientesRegimeRegular: 0.7, comprasCreditaveisMensais: 30_000 });
    expect(com.creditoClienteHibrido).toBeCloseTo(sem.creditoClienteHibrido, 8);
  });

  it("o ponto de equilíbrio cai com as compras creditáveis (menos repasse de preço para empatar com o Simples puro)", () => {
    const entrada = { receitaMensal: 100_000, rbt12: 1_200_000, folha12: 360_000, modo: "Anexo III", pctClientesRegimeRegular: 0.7 };
    const sem = simularSimplesHibrido(entrada, anoParams);
    const com = simularSimplesHibrido({ ...entrada, comprasCreditaveisMensais: 40_000 }, anoParams);
    expect(com.pontos.markupEquilibrio).toBeLessThan(sem.pontos.markupEquilibrio);
    expect(com.hibrido.cargaHibridaMensal).toBeLessThan(sem.hibrido.cargaHibridaMensal);
    expect(com.pontos.markupNeutroCliente).toBeCloseTo(sem.pontos.markupNeutroCliente, 10); // lado do cliente
    // o Simples puro não depende das compras
    expect(com.puro.dasMensal).toBeCloseTo(sem.puro.dasMensal, 8);
  });

  // O crédito das compras é um valor fixo em R$: não sobe junto com o preço. O equilíbrio tem que fechar na conta exata.
  const liquidoDoVendedor = (r, precoNovo) => {
    const { dasResidualPct, ibsCbsRegularPct, creditoCompras } = r.hibrido;
    return precoNovo - dasResidualPct * precoNovo - Math.max(0, ibsCbsRegularPct * precoNovo - creditoCompras);
  };

  it.each([
    ["sem compras", 0],
    ["compras que reduzem o IBS/CBS a pagar", 40_000],
    ["compras maiores (R$ 60 mil)", 60_000],
    ["compras tão grandes que sobra saldo credor mesmo no preço novo", 400_000],
  ])("no ponto de equilíbrio o líquido do vendedor é o do Simples puro (%s)", (_rotulo, compras) => {
    const receita = 100_000;
    const r = simularSimplesHibrido(
      { receitaMensal: receita, rbt12: 1_200_000, folha12: 360_000, modo: "Anexo III", pctClientesRegimeRegular: 0.7, comprasCreditaveisMensais: compras },
      anoParams,
    );
    const precoNovo = receita * (1 + r.pontos.markupEquilibrio);
    const liquidoSimples = receita * (1 - r.puro.aliquotaEfetiva);
    expect(liquidoDoVendedor(r, precoNovo)).toBeCloseTo(liquidoSimples, 6);
    // a carga exibida "no preço novo" é a da conta exata (DAS residual + IBS/CBS a pagar), não a carga de hoje esticada
    expect(r.pontos.cargaNoPrecoNovo).toBeCloseTo(precoNovo - liquidoSimples, 6);
  });

  it("caso conferido à mão: compras de R$ 40 mil, equilíbrio de 5,93% (a conta antiga dava 5,61%)", () => {
    const r = simularSimplesHibrido(
      { receitaMensal: 100_000, rbt12: 1_200_000, folha12: 360_000, modo: "Anexo III", pctClientesRegimeRegular: 0.7, comprasCreditaveisMensais: 40_000 },
      anoParams,
    );
    // Simples puro: líquido de R$ 86.970,00 (alíquota efetiva de 13,03%). Preço novo = 100.000 × 1,05932 = 105.932;
    // carga no preço novo = 105.932 − 86.970 = 18.962.
    expect(r.puro.aliquotaEfetiva).toBeCloseTo(0.1303, 4);
    expect(r.pontos.markupEquilibrio).toBeCloseTo(0.05932, 4);
    expect(r.pontos.cargaNoPrecoNovo).toBeCloseTo(18_962, -1);
  });
});
