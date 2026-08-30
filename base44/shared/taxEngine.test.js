import { describe, it, expect } from "vitest";
import {
  calcSistemaAtual,
  calcIbsCbs,
  calcTransicao,
  calcPrecoMargem,
  calcCaixaSplit,
  calcOperacao,
  apuracaoPorEmpresa,
  consolidarPorAno,
} from "./taxEngine.js";

/**
 * Caso de referência — os mesmos números usados na simulação de uso real
 * rodada em 2026-08-29 (operação OP-001, R$1.000, Saída, PIS 1,65%,
 * Cofins 7,6%, ICMS 18%, crédito elegível 100%). Os valores esperados foram
 * conferidos manualmente naquela sessão e batem com o que o Cockpit mostrou
 * na tela: R$272,50 de tributos atuais, R$10,00 de IBS/CBS, R$282,50 de
 * carga na transição. Se esse teste quebrar, o motor mudou de comportamento
 * — não é só "atualizar o número esperado" sem entender por quê.
 */
const opSaida = {
  direcao: "Saida",
  valor_bruto: 1000,
  pis_pct: 0.0165,
  cofins_pct: 0.076,
  icms_pct: 0.18,
  fcp_pct: 0,
  mva_st_pct: 0,
  iss_pct: 0,
  ipi_pct: 0,
  credito_elegivel_pct: 1,
};

const anoParams2026 = {
  pis_cofins_fator: 1,
  ipi_fator_geral: 1,
  icms_fator: 1,
  iss_fator: 1,
  ibs_efetivo: 0.001,
  cbs_efetiva: 0.009,
  ibs_uf_aliquota: 0,
  ibs_mun_aliquota: 0,
  efeito_financeiro: 1,
};

describe("calcSistemaAtual", () => {
  it("calcula PIS/Cofins/ICMS líquidos de uma saída sem crédito (caso de referência)", () => {
    const r = calcSistemaAtual(opSaida);
    expect(r.pis).toBeCloseTo(16.5);
    expect(r.cofins).toBeCloseTo(76);
    expect(r.icmsProprio).toBeCloseTo(180);
    expect(r.tributosBrutos).toBeCloseTo(272.5);
    expect(r.creditosAtuais).toBe(0); // saída não gera crédito
    expect(r.tributosLiquidos).toBeCloseTo(272.5);
    expect(r.cargaEfetiva).toBeCloseTo(0.2725);
  });

  it("uma entrada com os mesmos percentuais gera crédito e zera o líquido", () => {
    const r = calcSistemaAtual({ ...opSaida, direcao: "Entrada" });
    expect(r.creditosAtuais).toBeCloseTo(272.5);
    expect(r.tributosLiquidos).toBeCloseTo(0);
  });

  it("ICMS-ST só cobra a diferença sobre a base majorada pelo MVA", () => {
    const r = calcSistemaAtual({ ...opSaida, mva_st_pct: 0.4 });
    // baseST = 1000 * 1.4 = 1400; icmsSt = max(0, 1400*0.18 - 180) = 72
    expect(r.icmsSt).toBeCloseTo(72);
  });
});

describe("calcIbsCbs", () => {
  it("débito de IBS/CBS de uma saída sem redução nem crédito presumido (caso de referência)", () => {
    const r = calcIbsCbs(opSaida, anoParams2026, {}, {}, {});
    expect(r.debitoIbs).toBeCloseTo(1); // 1000 * 0.001
    expect(r.debitoCbs).toBeCloseTo(9); // 1000 * 0.009
    expect(r.ibsCbsLiquido).toBeCloseTo(10);
    expect(r.statusClassificacao).toBe("Pendente"); // sem c_class_trib localizado
  });

  it("redução de alíquota via ClassTrib diminui a IBS/CBS efetiva", () => {
    const classTrib = { c_class_trib: "000001", pct_reducao_ibs: 0.6, pct_reducao_cbs: 0.6 };
    const r = calcIbsCbs(opSaida, anoParams2026, classTrib, {}, {});
    expect(r.ibsEfetiva).toBeCloseTo(0.0004); // 0.001 * (1 - 0.6)
    expect(r.statusClassificacao).toBe("Localizada");
  });

  it("crédito presumido método 'Direto' abate o líquido sem estourar negativo", () => {
    const opEntrada = { ...opSaida, direcao: "Entrada", c_cred_pres: "CP01", credito_presumido_ibs_pct: 0.001 };
    const credPres = { c_cred_pres: "CP01", ibs_aplicavel: "Sim", metodo_calculo: "Direto", percentual_oficial: "0.10%" };
    const r = calcIbsCbs(opEntrada, anoParams2026, {}, {}, credPres);
    expect(r.credPresIbs).toBeCloseTo(1); // 1000 * 0.001, método direto
    expect(r.ibsCbsLiquido).toBe(0); // entrada não gera débito — líquido não fica negativo
  });

  it("crédito presumido pendente (percentual_oficial contém 'pendente') não é aplicado", () => {
    const opEntrada = { ...opSaida, direcao: "Entrada", c_cred_pres: "CP01", credito_presumido_ibs_pct: 0.001 };
    const credPres = { c_cred_pres: "CP01", ibs_aplicavel: "Sim", metodo_calculo: "Direto", percentual_oficial: "Pendente de regulamentação" };
    const r = calcIbsCbs(opEntrada, anoParams2026, {}, {}, credPres);
    expect(r.credPresPendente).toBe(true);
    expect(r.credPresIbs).toBe(0);
    expect(r.statusCredPres).toBe("Pendente");
  });
});

describe("calcTransicao", () => {
  it("soma o remanescente do sistema atual com o financeiro do IBS/CBS (caso de referência)", () => {
    const sisAtual = calcSistemaAtual(opSaida);
    const ibsCbs = calcIbsCbs(opSaida, anoParams2026, {}, {}, {});
    const r = calcTransicao(opSaida, sisAtual, ibsCbs, anoParams2026);
    expect(r.sistemaAtualRemanescente).toBeCloseTo(272.5);
    expect(r.ibsCbsFinanceiro).toBeCloseTo(10);
    expect(r.cargaTotalTransicao).toBeCloseTo(282.5);
    expect(r.diferencaVsAtual).toBeCloseTo(10); // 282.5 - 272.5
  });

  it("fatores de extinção parciais reduzem só a parcela remanescente, não o IBS/CBS", () => {
    const sisAtual = calcSistemaAtual(opSaida);
    const ibsCbs = calcIbsCbs(opSaida, anoParams2026, {}, {}, {});
    const anoTransicaoAvancada = { ...anoParams2026, pis_cofins_fator: 0.5, icms_fator: 0.5 };
    const r = calcTransicao(opSaida, sisAtual, ibsCbs, anoTransicaoAvancada);
    expect(r.pisCofinsAtual).toBeCloseTo(46.25); // (16.5+76) * 0.5
    expect(r.icmsFcpStAtual).toBeCloseTo(90); // 180 * 0.5
    expect(r.ibsCbsFinanceiro).toBeCloseTo(10); // inalterado
  });

  it("regressão (2026-08-30): uma compra 100% creditável não deve pesar no remanescente — antes desta correção, uma compra de R$45.000 inflava a carga da transição em R$12.262,50 sem nunca ser compensada", () => {
    const opEntrada = { ...opSaida, direcao: "Entrada", valor_bruto: 45000, credito_elegivel_pct: 1 };
    const sisAtual = calcSistemaAtual(opEntrada);
    const ibsCbs = calcIbsCbs(opEntrada, anoParams2026, {}, {}, {});
    const r = calcTransicao(opEntrada, sisAtual, ibsCbs, anoParams2026);
    expect(sisAtual.tributosLiquidos).toBe(0); // o módulo 1 já net,ava — o bug era só na transição
    expect(r.sistemaAtualRemanescente).toBe(0);
  });

  it("crédito parcial (< 100%) deixa a parte não-creditável pesando normalmente na transição", () => {
    const opEntrada = { ...opSaida, direcao: "Entrada", credito_elegivel_pct: 0.4 }; // só 40% creditável
    const sisAtual = calcSistemaAtual(opEntrada);
    const ibsCbs = calcIbsCbs(opEntrada, anoParams2026, {}, {}, {});
    const r = calcTransicao(opEntrada, sisAtual, ibsCbs, anoParams2026);
    // netFactor = 1 - 0.4 = 0.6 → 60% do remanescente bruto (272.5) continua pesando
    expect(r.sistemaAtualRemanescente).toBeCloseTo(272.5 * 0.6);
  });

  it("ICMS-ST nunca é creditado, mesmo numa entrada 100% creditável", () => {
    const opEntrada = { ...opSaida, direcao: "Entrada", credito_elegivel_pct: 1, mva_st_pct: 0.3 };
    const sisAtual = calcSistemaAtual(opEntrada);
    const ibsCbs = calcIbsCbs(opEntrada, anoParams2026, {}, {}, {});
    const r = calcTransicao(opEntrada, sisAtual, ibsCbs, anoParams2026);
    // icmsProprio+fcp são zerados pelo crédito, mas icmsSt continua de pé
    expect(r.icmsFcpStAtual).toBeCloseTo(sisAtual.icmsSt * anoParams2026.icms_fator);
    expect(r.icmsFcpStAtual).toBeGreaterThan(0);
  });
});

describe("calcCaixaSplit", () => {
  it("uma saída sem split nem crédito acumulado não gera funding (caso de referência)", () => {
    const sisAtual = calcSistemaAtual(opSaida);
    const ibsCbs = calcIbsCbs(opSaida, anoParams2026, {}, {}, {});
    const transicao = calcTransicao(opSaida, sisAtual, ibsCbs, anoParams2026);
    const r = calcCaixaSplit(opSaida, ibsCbs, transicao, sisAtual, {});
    expect(r.fundingTributario).toBe(0);
    expect(r.classificacao).toBe("Baixa");
  });

  it("classifica funding como Crítico quando o split retido supera muito o caixa do sistema atual", () => {
    // Split retém mais caixa na hora (imediato) do que o sistema atual jamais
    // reteria (tributosLiquidos) — a diferença vira "funding" a descoberto.
    const opComSplit = { ...opSaida, split_pct: 1 };
    const sisAtual = calcSistemaAtual(opComSplit); // tributosLiquidos = 272.5
    const ibsCbsAlto = calcIbsCbs(opComSplit, { ...anoParams2026, ibs_efetivo: 0.5, cbs_efetiva: 0 }, {}, {}, {});
    const transicao = calcTransicao(opComSplit, sisAtual, ibsCbsAlto, anoParams2026);
    const r = calcCaixaSplit(opComSplit, ibsCbsAlto, transicao, sisAtual, {});
    // splitRetido = 500 vs tributosLiquidos = 272.5 → funding = 227.5 (>10% de 1000)
    expect(r.fundingTributario).toBeCloseTo(227.5);
    expect(r.classificacao).toBe("Crítica");
  });
});

describe("calcOperacao (orquestração completa)", () => {
  it("reproduz o painel do Cockpit para a operação de referência", () => {
    const credPresMap = new Map();
    const r = calcOperacao(opSaida, anoParams2026, {}, {}, {}, credPresMap);
    expect(r.sistemaAtual.tributosLiquidos).toBeCloseTo(272.5);
    expect(r.ibsCbs.ibsCbsLiquido).toBeCloseTo(10);
    expect(r.transicao.cargaTotalTransicao).toBeCloseTo(282.5);
  });
});

describe("apuracaoPorEmpresa", () => {
  it("compensa débito e crédito da empresa antes de zerar em zero (não soma o Math.max por operação)", () => {
    const debito = { op: { empresa_id: "E1", ano: 2026, direcao: "Saida", valor_bruto: 1000 }, ...calcOperacao({ ...opSaida, empresa_id: "E1" }, anoParams2026, {}, {}, {}) };
    const credito = { op: { empresa_id: "E1", ano: 2026, direcao: "Entrada", valor_bruto: 1000 }, ...calcOperacao({ ...opSaida, direcao: "Entrada", empresa_id: "E1" }, anoParams2026, {}, {}, {}) };
    const [apurado] = apuracaoPorEmpresa([debito, credito]);
    // débito IBS = 1 (saída) ; crédito IBS = 1 (entrada) => saldo líquido zero, não 1+1
    expect(apurado.saldoIbs).toBeCloseTo(0);
  });
});

describe("consolidarPorAno", () => {
  it("agrupa por ano e soma valor bruto de múltiplas operações", () => {
    const oc1 = { op: { ano: 2026, valor_bruto: 1000 }, ...calcOperacao(opSaida, anoParams2026, {}, {}, {}) };
    const oc2 = { op: { ano: 2026, valor_bruto: 500 }, ...calcOperacao({ ...opSaida, valor_bruto: 500 }, anoParams2026, {}, {}, {}) };
    const [ano2026] = consolidarPorAno([oc1, oc2]);
    expect(ano2026.valorBruto).toBe(1500);
  });

  it("regressão (2026-08-30): compensa débito de uma saída com o crédito de uma entrada da mesma empresa/ano antes de truncar em zero — cenário real do Grupo Piloto Reforma, onde o Painel mostrava R$800 em vez de R$350", () => {
    const venda = {
      op: { empresa_id: "EMP-001", ano: 2026, valor_bruto: 80000 },
      ...calcOperacao({ ...opSaida, valor_bruto: 80000 }, anoParams2026, {}, {}, {}),
    };
    const compra = {
      op: { empresa_id: "EMP-001", ano: 2026, valor_bruto: 45000 },
      ...calcOperacao(
        { ...opSaida, direcao: "Entrada", valor_bruto: 45000, credito_elegivel_pct: 1 },
        anoParams2026, {}, {}, {}
      ),
    };
    const [ano2026] = consolidarPorAno([venda, compra], new Map([[2026, anoParams2026]]));
    // débito = 80000 * (0.001+0.009) = 800; crédito = 45000 * (0.001+0.009) = 450
    // soma ingênua (bug antigo): 800 + Math.max(0, 0-450) = 800
    // compensado por empresa/ano: 800 - 450 = 350
    expect(ano2026.ibsCbsLiquido).toBeCloseTo(350);
  });

  it("não compensa entre empresas diferentes — cada empresa apura o próprio saldo", () => {
    const vendaEmpA = {
      op: { empresa_id: "EMP-A", ano: 2026, valor_bruto: 80000 },
      ...calcOperacao({ ...opSaida, valor_bruto: 80000 }, anoParams2026, {}, {}, {}),
    };
    const compraEmpB = {
      op: { empresa_id: "EMP-B", ano: 2026, valor_bruto: 45000 },
      ...calcOperacao(
        { ...opSaida, direcao: "Entrada", valor_bruto: 45000, credito_elegivel_pct: 1 },
        anoParams2026, {}, {}, {}
      ),
    };
    const [ano2026] = consolidarPorAno([vendaEmpA, compraEmpB], new Map([[2026, anoParams2026]]));
    // EMP-A apura 800 (sem crédito próprio); EMP-B apura 0 (crédito não gera débito) — soma 800, não 350
    expect(ano2026.ibsCbsLiquido).toBeCloseTo(800);
  });
});
