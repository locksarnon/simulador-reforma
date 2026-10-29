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
  baseIbsCbs,
  chaveCredPres,
  VERSAO_MOTOR,
} from "./taxEngine.js";
import { aliquotasCombustivelDoAno } from "./combustiveis.js";

/**
 * Caso de referência — os mesmos números usados na simulação de uso real
 * rodada em 2026-08-29 (operação OP-001, R$1.000, Saída, PIS 1,65%,
 * Cofins 7,6%, ICMS 18%, crédito elegível 100%). Os tributos atuais (R$272,50)
 * foram conferidos manualmente naquela sessão e batem com o que o Cockpit
 * mostrou na tela. Desde o motor 1.4.0 o IBS/CBS incide sobre a base do art. 12,
 * §2º, V da LC 214 (valor menos PIS, Cofins e ICMS: 1000 − 272,50 = 727,50),
 * então o IBS/CBS de 1% é R$7,275 (era R$10,00 sobre os R$1.000 inteiros) e a
 * carga na transição é R$279,775 (era R$282,50). Se esse teste quebrar, o motor
 * mudou de comportamento — não é só "atualizar o número esperado" sem entender
 * por quê.
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
  ano: 2026, // o caminho real traz o ano: sem ele a base do IBS/CBS não exclui nada (ver o bloco do art. 12)
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
    // base = 1000 − (1,65% + 7,6% + 18%) × 1000 = 727,50 (art. 12, §2º, V; em 2026 os fatores são 1)
    expect(r.baseCalculo).toBeCloseTo(727.5);
    expect(r.debitoIbs).toBeCloseTo(0.7275); // 727,50 * 0.001
    expect(r.debitoCbs).toBeCloseTo(6.5475); // 727,50 * 0.009
    expect(r.ibsCbsLiquido).toBeCloseTo(7.275);
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

  it("crédito presumido pendente (percentual_oficial contém 'pendente') e sem percentual na operação não é aplicado", () => {
    const opEntrada = { ...opSaida, direcao: "Entrada", c_cred_pres: "CP01" };
    const credPres = { c_cred_pres: "CP01", ibs_aplicavel: "Sim", metodo_calculo: "Direto", percentual_oficial: "Pendente de regulamentação" };
    const r = calcIbsCbs(opEntrada, anoParams2026, {}, {}, credPres);
    expect(r.credPresPendente).toBe(true);
    expect(r.credPresIbs).toBe(0);
    expect(r.statusCredPres).toBe("Pendente");
  });

  it("crédito presumido pendente COM percentual na operação (do documento fiscal ou do usuário) é calculado como estimativa", () => {
    const opEntrada = { ...opSaida, direcao: "Entrada", c_cred_pres: "CP01", credito_presumido_ibs_pct: 0.001 };
    const credPres = { c_cred_pres: "CP01", ibs_aplicavel: "Sim", metodo_calculo: "Direto", percentual_oficial: "Pendente de regulamentação" };
    const r = calcIbsCbs(opEntrada, anoParams2026, {}, {}, credPres);
    expect(r.credPresIbs).toBeCloseTo(1);
    expect(r.credPresEstimativa).toBe(true);
    expect(r.statusCredPres).toBe("Estimativa");
  });
});

describe("calcTransicao", () => {
  it("soma o remanescente do sistema atual com o financeiro do IBS/CBS (caso de referência)", () => {
    const sisAtual = calcSistemaAtual(opSaida);
    const ibsCbs = calcIbsCbs(opSaida, anoParams2026, {}, {}, {});
    const r = calcTransicao(opSaida, sisAtual, ibsCbs, anoParams2026);
    expect(r.sistemaAtualRemanescente).toBeCloseTo(272.5);
    expect(r.ibsCbsFinanceiro).toBeCloseTo(7.275);
    expect(r.cargaTotalTransicao).toBeCloseTo(279.775);
    expect(r.diferencaVsAtual).toBeCloseTo(7.275); // 279,775 - 272,5
  });

  it("fatores de extinção parciais reduzem só a parcela remanescente, não o IBS/CBS", () => {
    const sisAtual = calcSistemaAtual(opSaida);
    const ibsCbs = calcIbsCbs(opSaida, anoParams2026, {}, {}, {});
    const anoTransicaoAvancada = { ...anoParams2026, pis_cofins_fator: 0.5, icms_fator: 0.5 };
    const r = calcTransicao(opSaida, sisAtual, ibsCbs, anoTransicaoAvancada);
    expect(r.pisCofinsAtual).toBeCloseTo(46.25); // (16.5+76) * 0.5
    expect(r.icmsFcpStAtual).toBeCloseTo(90); // 180 * 0.5
    expect(r.ibsCbsFinanceiro).toBeCloseTo(7.275); // inalterado
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
    const ibsCbsAlto = calcIbsCbs(opComSplit, { ...anoParams2026, ibs_efetivo: 0.6, cbs_efetiva: 0 }, {}, {}, {});
    const transicao = calcTransicao(opComSplit, sisAtual, ibsCbsAlto, anoParams2026);
    const r = calcCaixaSplit(opComSplit, ibsCbsAlto, transicao, sisAtual, {});
    // splitRetido = 727,50 (base) * 0.6 = 436,50 vs tributosLiquidos = 272.5 → funding = 164 (>10% de 1000)
    expect(r.fundingTributario).toBeCloseTo(164);
    expect(r.classificacao).toBe("Crítica");
  });
});

describe("calcOperacao (orquestração completa)", () => {
  it("reproduz o painel do Cockpit para a operação de referência", () => {
    const credPresMap = new Map();
    const r = calcOperacao(opSaida, anoParams2026, {}, {}, {}, credPresMap);
    expect(r.sistemaAtual.tributosLiquidos).toBeCloseTo(272.5);
    expect(r.ibsCbs.ibsCbsLiquido).toBeCloseTo(7.275);
    expect(r.transicao.cargaTotalTransicao).toBeCloseTo(279.775);
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
    // base = 72,75% do valor (sem PIS, Cofins e ICMS, art. 12, §2º, V): 1000 − 272,50 = 727,50 por R$ 1.000
    // débito = 80000 * 0.7275 * (0.001+0.009) = 582; crédito = 45000 * 0.7275 * (0.001+0.009) = 327,375
    // soma ingênua (bug antigo): 582 + Math.max(0, 0-327,375) = 582
    // compensado por empresa/ano: 582 - 327,375 = 254,625
    expect(ano2026.ibsCbsLiquido).toBeCloseTo(254.625);
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
    // EMP-A apura 582 (sem crédito próprio); EMP-B apura 0 (crédito não gera débito) — soma 582, não 254,625
    expect(ano2026.ibsCbsLiquido).toBeCloseTo(582);
  });
});

describe('consolidarPorAno: débito e crédito separados', () => {
  it('soma débitos, créditos e crédito presumido de IBS/CBS por ano', () => {
    const oc = (empresa, ano, d) => ({
      op: { empresa_id: empresa, ano, valor_bruto: 1000 },
      sistemaAtual: { tributosLiquidos: 100 },
      ibsCbs: { debitoIbs: d.dI, debitoCbs: d.dC, creditoIbs: d.cI, creditoCbs: d.cC, credPresTotal: d.cp, splitRetido: 0 },
      transicao: { sistemaAtualRemanescente: 50 },
      precoMargem: { margemAtual: 10, margemTransicao: 9 },
      caixa: { creditoAcumulado: 0, fundingTributario: 0 },
    });
    const [a2027] = consolidarPorAno([
      oc('E1', 2027, { dI: 10, dC: 90, cI: 2, cC: 20, cp: 1 }),
      oc('E2', 2027, { dI: 5, dC: 45, cI: 1, cC: 10, cp: 0 }),
    ]);
    expect(a2027).toMatchObject({ ano: 2027, debitoIbs: 15, debitoCbs: 135, creditoIbs: 3, creditoCbs: 30, credPresTotal: 1 });
  });
});

describe('devolução de venda (receita negativa)', () => {
  const base = { empresa_id: 'E1', ano: 2027, direcao: 'Saida', pis_pct: 0.0165, cofins_pct: 0.076, icms_pct: 0.12, fcp_pct: 0, mva_st_pct: 0, iss_pct: 0, ipi_pct: 0, credito_elegivel_pct: 1, custo_base_pct: 0.65, margem_meta_pct: 0.18, split_pct: 0.5 };
  const ano = { pis_cofins_fator: 0, ipi_fator_geral: 0, icms_fator: 1, iss_fator: 1, ibs_efetivo: 0.001, cbs_efetiva: 0.0921, ibs_uf_aliquota: 0.05, ibs_mun_aliquota: 0.05, efeito_financeiro: 1 };
  const cen = { fator_volume: 1, fator_preco: 1, fator_custo: 1 };
  const calc = (v, extra = {}) => { const op = { ...base, ...extra, valor_bruto: v }; return { op, ...calcOperacao(op, ano, {}, cen, {}, {}) }; };
  const consolidar = (vs) => consolidarPorAno(vs.map((v) => calc(v)), new Map([[2027, ano]]))[0];

  it('uma venda de 1.000 com devolução de 200 dá exatamente o resultado de uma venda de 800', () => {
    const a = consolidar([1000, -200]);
    const b = consolidar([800]);
    for (const k of Object.keys(b)) {
      if (typeof b[k] === 'number') expect(a[k], k).toBeCloseTo(b[k], 6);
    }
  });

  it('a operação de estorno é o espelho da venda (valores em R$ trocam de sinal, percentuais não)', () => {
    const v = calc(200);
    const e = calc(-200);
    expect(e.estorno).toBe(true);
    expect(e.sistemaAtual.tributosLiquidos).toBeCloseTo(-v.sistemaAtual.tributosLiquidos, 6);
    expect(e.ibsCbs.debitoCbs).toBeCloseTo(-v.ibsCbs.debitoCbs, 6);
    expect(e.ibsCbs.ibsCbsLiquido).toBeCloseTo(-v.ibsCbs.ibsCbsLiquido, 6);
    expect(e.precoMargem.margemTransicao).toBeCloseTo(-v.precoMargem.margemTransicao, 6);
    expect(e.caixa.fundingTributario).toBeCloseTo(0, 6); // não vira funding falso
    expect(e.caixa.creditoAcumulado).toBeCloseTo(0, 6); // nem crédito acumulado falso
    expect(e.ibsCbs.cbsEfetiva).toBe(v.ibsCbs.cbsEfetiva); // alíquotas continuam positivas
    expect(e.ibsCbs.cargaEfetiva).toBeCloseTo(v.ibsCbs.cargaEfetiva, 6);
  });

  it('devolução maior que as vendas do ano reduz o total (a empresa passa a ter saldo a favor)', () => {
    const c = consolidar([100, -300]);
    expect(c.valorBruto).toBe(-200);
    expect(c.debitoCbs).toBeLessThan(0);
  });

  it('venda comum não é afetada (sem marca de estorno)', () => {
    expect(calc(1000).estorno).toBeUndefined();
  });
});

/**
 * Redutor das compras governamentais (LC 214/2025, arts. 349, III, 370 e 472). O TCU calculou 44,16% para 2027
 * (TC 006.529/2026-7), ainda sem a resolução do Senado.
 */
describe('redutor de compras governamentais', () => {
  const ano2027 = {
    ano: 2027, pis_cofins_fator: 0, ipi_fator_geral: 0, icms_fator: 1, iss_fator: 1,
    ibs_efetivo: 0.001, ibs_uf_aliquota: 0.0005, ibs_mun_aliquota: 0.0005, cbs_efetiva: 0.112,
    efeito_financeiro: 1, redutor_compra_gov: 0.4416,
  };
  const venda = (extra = {}) => ({ direcao: 'Saida', valor_bruto: 1000, credito_elegivel_pct: 0, ...extra });
  const rodar = (op, ano = ano2027, ct = {}) => calcOperacao(op, ano, ct, {}, {}, new Map());

  it('venda comum: 11,2% de CBS e 0,1% de IBS, sem redutor', () => {
    const r = rodar(venda());
    expect(r.ibsCbs.debitoCbs).toBeCloseTo(112, 8);
    expect(r.ibsCbs.debitoIbs).toBeCloseTo(1, 8);
    expect(r.ibsCbs.redutorCompraGov).toBe(0);
  });

  it('venda a órgão público marcada como compra governamental: alíquotas × (1 − 44,16%)', () => {
    const r = rodar(venda({ compra_governamental_informado: 'Sim' }));
    expect(r.ibsCbs.redutorCompraGov).toBe(0.4416);
    expect(r.ibsCbs.debitoCbs).toBeCloseTo(112 * (1 - 0.4416), 8);
    expect(r.ibsCbs.debitoIbs).toBeCloseTo(1 * (1 - 0.4416), 8);
    expect(r.ibsCbs.cbsEfetiva).toBeCloseTo(0.112 * (1 - 0.4416), 10);
  });

  it('o redutor soma-se à redução da classe de forma uniforme (multiplicativa): classe de 60% e redutor de 44,16%', () => {
    const r = rodar(venda({ compra_governamental_informado: 'Sim' }), ano2027, { pct_reducao_ibs: 0.6, pct_reducao_cbs: 0.6 });
    expect(r.ibsCbs.debitoCbs).toBeCloseTo(112 * 0.4 * (1 - 0.4416), 8);
  });

  it('a partilha estado × município também recebe o redutor', () => {
    const r = rodar(venda({ compra_governamental_informado: 'Sim' }));
    expect(r.ibsCbs.debitoIbsUf).toBeCloseTo(1000 * 0.0005 * (1 - 0.4416), 8);
    expect(r.ibsCbs.debitoIbsUf + r.ibsCbs.debitoIbsMun).toBeCloseTo(r.ibsCbs.debitoIbs, 8);
  });

  it('não vale na compra (entrada): o redutor é de quem vende ao ente público', () => {
    const r = rodar(venda({ direcao: 'Entrada', credito_elegivel_pct: 1, compra_governamental_informado: 'Sim' }));
    expect(r.ibsCbs.redutorCompraGov).toBe(0);
    expect(r.ibsCbs.creditoCbs).toBeCloseTo(112, 8);
  });

  it('sem redutor cadastrado no ano (0), a marca não muda o resultado — e a coluna ausente também não quebra', () => {
    const semRedutor = { ...ano2027, redutor_compra_gov: 0 };
    expect(rodar(venda({ compra_governamental_informado: 'Sim' }), semRedutor).ibsCbs.debitoCbs).toBeCloseTo(112, 8);
    const { redutor_compra_gov, ...semColuna } = ano2027;
    expect(rodar(venda({ compra_governamental_informado: 'Sim' }), semColuna).ibsCbs.debitoCbs).toBeCloseTo(112, 8);
  });

  it("'Não', vazio e valores estranhos não ativam o redutor", () => {
    for (const v of ['Não', 'Nao', '', null, undefined, 'talvez']) {
      expect(rodar(venda({ compra_governamental_informado: v })).ibsCbs.debitoCbs, String(v)).toBeCloseTo(112, 8);
    }
  });

  it('redutor acima de 100% é limitado a 100% (alíquota zero) e negativo é ignorado', () => {
    expect(rodar(venda({ compra_governamental_informado: 'Sim' }), { ...ano2027, redutor_compra_gov: 1.7 }).ibsCbs.debitoCbs).toBe(0);
    expect(rodar(venda({ compra_governamental_informado: 'Sim' }), { ...ano2027, redutor_compra_gov: -0.3 }).ibsCbs.debitoCbs).toBeCloseTo(112, 8);
  });

  it('devolução de venda a órgão público espelha a venda e mantém o redutor positivo', () => {
    const v = rodar(venda({ compra_governamental_informado: 'Sim' }));
    const e = rodar(venda({ valor_bruto: -1000, compra_governamental_informado: 'Sim' }));
    expect(e.ibsCbs.debitoCbs).toBeCloseTo(-v.ibsCbs.debitoCbs, 8);
    expect(e.ibsCbs.redutorCompraGov).toBe(0.4416);
  });
});

/**
 * Base de cálculo do IBS/CBS (LC 214, art. 12, §2º, V): de 2026 a 2032 o ICMS, o ISS, o PIS e a Cofins ainda cobrados
 * na operação não entram na base. Caso de referência: venda de R$ 1.000 com ICMS de 18%, PIS de 1,65% e Cofins de 7,6%.
 */
describe('base de cálculo do IBS/CBS (art. 12, §2º, V)', () => {
  const anoBase = { ipi_fator_geral: 0, ibs_efetivo: 0.001, ibs_uf_aliquota: 0.0005, ibs_mun_aliquota: 0.0005, cbs_efetiva: 0.112, efeito_financeiro: 1 };
  const a2026 = { ...anoBase, ano: 2026, pis_cofins_fator: 1, icms_fator: 1, iss_fator: 1 };
  const a2027 = { ...anoBase, ano: 2027, pis_cofins_fator: 0, icms_fator: 1, iss_fator: 1 };
  const a2029 = { ...anoBase, ano: 2029, pis_cofins_fator: 0, icms_fator: 0.9, iss_fator: 0.9 };
  const a2032 = { ...anoBase, ano: 2032, pis_cofins_fator: 0, icms_fator: 0.6, iss_fator: 0.6 };
  const a2033 = { ...anoBase, ano: 2033, pis_cofins_fator: 0, icms_fator: 0, iss_fator: 0 };
  const venda = { direcao: 'Saida', valor_bruto: 1000, pis_pct: 0.0165, cofins_pct: 0.076, icms_pct: 0.18, credito_elegivel_pct: 0 };

  it('2027: só o ICMS sai da base (o PIS/Cofins já foi extinto) — R$ 820 em vez de R$ 1.000', () => {
    const b = baseIbsCbs(venda, a2027);
    expect(b.base).toBeCloseTo(820, 8);
    expect(b.excluido).toBeCloseTo(180, 8);
  });

  it('2026: PIS, Cofins e ICMS saem da base', () => {
    expect(baseIbsCbs(venda, a2026).base).toBeCloseTo(727.5, 8);
  });

  it('2029 a 2032: sai só a parte do ICMS ainda cobrada (90% em 2029, 60% em 2032)', () => {
    expect(baseIbsCbs(venda, a2029).base).toBeCloseTo(1000 - 162, 8);
    expect(baseIbsCbs(venda, a2032).base).toBeCloseTo(1000 - 108, 8);
  });

  it('2033 em diante: nada a excluir, a base é o valor da operação', () => {
    expect(baseIbsCbs(venda, a2033)).toEqual({ base: 1000, excluido: 0 });
    expect(baseIbsCbs(venda, { ...a2033, ano: 2034 })).toEqual({ base: 1000, excluido: 0 });
  });

  it('ISS (serviço) e FCP (parte do ICMS) também saem da base; IPI e ICMS-ST não', () => {
    expect(baseIbsCbs({ valor_bruto: 1000, iss_pct: 0.05 }, a2027).base).toBeCloseTo(950, 8);
    expect(baseIbsCbs({ valor_bruto: 1000, icms_pct: 0.18, fcp_pct: 0.02 }, a2027).base).toBeCloseTo(800, 8);
    expect(baseIbsCbs({ valor_bruto: 1000, ipi_pct: 0.1, mva_st_pct: 0.4, icms_pct: 0 }, a2027).base).toBe(1000);
  });

  it('sem ano na linha de transição nem na operação não há como saber a janela legal: base = valor da operação', () => {
    const { ano, ...semAno } = a2027;
    expect(baseIbsCbs(venda, semAno).base).toBe(1000);
    expect(baseIbsCbs({ ...venda, ano: 2027 }, semAno).base).toBeCloseTo(820, 8); // o ano da operação serve
  });

  it('a exclusão nunca passa do valor da operação', () => {
    expect(baseIbsCbs({ valor_bruto: 100, icms_pct: 1.5 }, a2027)).toEqual({ base: 0, excluido: 100 });
  });

  it('saída de R$ 1.000 em 2027: IBS/CBS de R$ 92,66 (e não R$ 113,00) — a diferença de −18,0% do achado da auditoria', () => {
    const r = calcIbsCbs(venda, a2027, {}, {}, {});
    expect(r.baseCalculo).toBeCloseTo(820, 8);
    expect(r.baseExcluida).toBeCloseTo(180, 8);
    expect(r.debitoCbs).toBeCloseTo(91.84, 8);
    expect(r.debitoIbs).toBeCloseTo(0.82, 8);
    expect(r.debitoCbs + r.debitoIbs).toBeCloseTo(92.66, 8);
    expect(r.debitoIbsUf + r.debitoIbsMun).toBeCloseTo(r.debitoIbs, 8);
    expect(r.debitoIbsUf).toBeCloseTo(0.41, 8);
  });

  it('a compra usa a mesma base: o crédito é o IBS/CBS da nota do fornecedor, que também exclui o ICMS embutido', () => {
    const r = calcIbsCbs({ ...venda, direcao: 'Entrada', credito_elegivel_pct: 1 }, a2027, {}, {}, {});
    expect(r.creditoCbs).toBeCloseTo(91.84, 8);
    expect(r.creditoIbs).toBeCloseTo(0.82, 8);
  });

  it('o redutor de compra governamental incide sobre a base já reduzida', () => {
    const r = calcIbsCbs({ ...venda, compra_governamental_informado: 'Sim' }, { ...a2027, redutor_compra_gov: 0.4416 }, {}, {}, {});
    expect(r.debitoCbs).toBeCloseTo(820 * 0.112 * (1 - 0.4416), 8);
  });

  it('o combustível (alíquota por unidade) não usa a base percentual', () => {
    const tabela = aliquotasCombustivelDoAno([{ produto: 'diesel', unidade: 'litro', ano: 2027, cbs_por_unidade: 0.3515, ibs_por_unidade: null }], 2027);
    const r = calcIbsCbs({ direcao: 'Saida', valor_bruto: 1000, icms_pct: 0.18, quantidade: 100, combustivel_produto: 'diesel' }, { ...a2027, combustiveis: tabela }, {}, {}, {});
    expect(r.combustivel.aplicavel).toBe(true);
    expect(r.baseExcluida).toBe(0);
    expect(r.baseCalculo).toBe(1000);
  });

  it('devolução de venda espelha a venda também na base', () => {
    const v = calcOperacao(venda, a2027, {}, {}, {}, new Map());
    const e = calcOperacao({ ...venda, valor_bruto: -1000 }, a2027, {}, {}, {}, new Map());
    expect(e.ibsCbs.baseCalculo).toBeCloseTo(-v.ibsCbs.baseCalculo, 8);
    expect(e.ibsCbs.debitoCbs).toBeCloseTo(-v.ibsCbs.debitoCbs, 8);
  });

  it('a carga da transição de 2027 cai na mesma proporção da base (o remanescente do ICMS não muda)', () => {
    const r = calcOperacao(venda, a2027, {}, {}, {}, new Map());
    expect(r.transicao.ibsCbsFinanceiro).toBeCloseTo(92.66, 8);
    expect(r.transicao.sistemaAtualRemanescente).toBeCloseTo(180, 8); // só o ICMS; PIS/Cofins extintos
  });
});

/**
 * Crédito presumido do transportador autônomo (LC 214, art. 169; Decreto 12.955, arts. 250 a 254) e do produtor rural
 * (art. 168; Decreto, arts. 245 a 249): CP = VO×C/(1+C), percentual definido em ato conjunto anual.
 */
describe('crédito presumido "por fora" (arts. 168 e 169)', () => {
  const ano2027 = { ano: 2027, pis_cofins_fator: 0, ipi_fator_geral: 0, icms_fator: 1, iss_fator: 1, ibs_efetivo: 0.001, ibs_uf_aliquota: 0.0005, ibs_mun_aliquota: 0.0005, cbs_efetiva: 0.112, efeito_financeiro: 1 };
  const credTac = { c_cred_pres: '2', ibs_aplicavel: 'Sim', cbs_aplicavel: 'Sim', metodo_calculo: 'Por Fora', percentual_oficial: 'Pendente de regulamentação' };
  const credRural = { ...credTac, c_cred_pres: '1' };
  const frete = (extra = {}) => ({ direcao: 'Entrada', valor_bruto: 1000, credito_elegivel_pct: 1, c_cred_pres: '2', credito_presumido_cbs_pct: 0.02, ...extra });
  const rodar = (op, cred = credTac) => calcOperacao(op, ano2027, {}, {}, {}, new Map([[cred.c_cred_pres, cred]]));

  it('CP = VO × C / (1 + C): frete de R$ 1.000 com percentual de 2% dá R$ 19,61 (e não R$ 20,00)', () => {
    const r = rodar(frete());
    expect(r.ibsCbs.credPresCbs).toBeCloseTo(1000 * 0.02 / 1.02, 8);
    expect(r.ibsCbs.credPresIbs).toBe(0);
    expect(r.ibsCbs.statusCredPres).toBe('Estimativa'); // o ato conjunto do ano ainda está pendente
  });

  it('o valor líquido (VO − CP) vezes o percentual devolve o crédito: é a conta do documento fiscal do art. 169, § 2º', () => {
    const cp = rodar(frete()).ibsCbs.credPresCbs;
    expect(cp).toBeCloseTo((1000 - cp) * 0.02, 8);
  });

  it('o fornecedor não é contribuinte: a mesma compra não gera também o crédito normal de IBS/CBS', () => {
    const r = rodar(frete({ credito_elegivel_pct: 1 }));
    expect(r.ibsCbs.creditoCbs).toBe(0);
    expect(r.ibsCbs.creditoIbs).toBe(0);
  });

  it('a marca "crédito normal substituído" liga só na compra com código localizado e crédito elegível (a tela explica o zero)', () => {
    expect(rodar(frete()).ibsCbs.creditoNormalSubstituidoPorCredPres).toBe(true);
    expect(rodar(frete({ credito_presumido_cbs_pct: 0 })).ibsCbs.creditoNormalSubstituidoPorCredPres).toBe(true); // ato pendente: crédito 0 e a tela avisa
    expect(rodar(frete({ credito_elegivel_pct: 0 })).ibsCbs.creditoNormalSubstituidoPorCredPres).toBe(false);
    expect(rodar(frete({ direcao: 'Saida' })).ibsCbs.creditoNormalSubstituidoPorCredPres).toBe(false);
    expect(calcOperacao({ direcao: 'Entrada', valor_bruto: 1000, credito_elegivel_pct: 1 }, ano2027, {}, {}, {}, new Map()).ibsCbs.creditoNormalSubstituidoPorCredPres).toBe(false);
  });

  it('sem percentual na operação e com o ato pendente, o crédito não é calculado', () => {
    const r = rodar(frete({ credito_presumido_cbs_pct: 0 }));
    expect(r.ibsCbs.credPresTotal).toBe(0);
    expect(r.ibsCbs.statusCredPres).toBe('Pendente');
  });

  it('com IBS e CBS juntos há um só valor líquido (art. 169, § 2º, III): CP total = VO × ΣC / (1 + ΣC), e (VO − CP) × ΣC devolve o CP', () => {
    // R$ 1.000, IBS 4% + CBS 4%: com divisores separados sairia 38,46 + 38,46 = 76,92, mais do que a lei permite.
    const r = rodar(frete({ credito_presumido_ibs_pct: 0.04, credito_presumido_cbs_pct: 0.04 }));
    expect(r.ibsCbs.credPresIbs).toBeCloseTo(1000 * 0.04 / 1.08, 8);
    expect(r.ibsCbs.credPresCbs).toBeCloseTo(1000 * 0.04 / 1.08, 8);
    const cp = r.ibsCbs.credPresTotal;
    expect(cp).toBeCloseTo(1000 * 0.08 / 1.08, 8); // 74,07
    expect(cp).toBeCloseTo((1000 - cp) * 0.08, 8);
  });

  it('com só um dos percentuais o resultado é o de antes (a fórmula do Decreto, da CBS isolada)', () => {
    const soCbs = rodar(frete({ credito_presumido_ibs_pct: 0, credito_presumido_cbs_pct: 0.02 }));
    expect(soCbs.ibsCbs.credPresCbs).toBeCloseTo(1000 * 0.02 / 1.02, 8);
    const soIbs = rodar(frete({ credito_presumido_ibs_pct: 0.03, credito_presumido_cbs_pct: 0 }));
    expect(soIbs.ibsCbs.credPresIbs).toBeCloseTo(1000 * 0.03 / 1.03, 8);
  });

  it('o do transportador autônomo não é ressarcível (Decreto 12.955, art. 254): não vira crédito acumulado a realizar', () => {
    const r = rodar(frete());
    expect(r.ibsCbs.credPresRessarcivel).toBe(false);
    expect(r.caixa.credPresNaoRessarcivel).toBeCloseTo(1000 * 0.02 / 1.02, 8);
    expect(r.caixa.creditoAcumulado).toBe(0);
  });

  it('o do produtor rural admite o ressarcimento (art. 168, § 8º): entra no crédito acumulado', () => {
    const r = rodar(frete({ c_cred_pres: '1', credito_presumido_cbs_pct: 0.05 }), credRural);
    expect(r.ibsCbs.credPresRessarcivel).toBe(true);
    expect(r.caixa.credPresNaoRessarcivel).toBe(0);
    expect(r.caixa.creditoAcumulado).toBeCloseTo(1000 * 0.05 / 1.05, 8);
  });

  it('apuração: o crédito presumido de CBS abate a CBS, não o IBS (antes o crédito de CBS se perdia contra o IBS)', () => {
    const venda = { empresa_id: 'T1', ano: 2027, direcao: 'Saida', valor_bruto: 10000, credito_elegivel_pct: 0 };
    const oc = (op, cred) => ({ op, ...calcOperacao(op, ano2027, {}, {}, {}, new Map(cred ? [[cred.c_cred_pres, cred]] : [])) });
    const lista = [oc(venda), oc({ ...frete({ valor_bruto: 5000 }), empresa_id: 'T1', ano: 2027 }, credTac)];
    const cp = 5000 * 0.02 / 1.02;
    const debitoCbs = 10000 * 0.112;
    const debitoIbs = 10000 * 0.001;
    const [ap] = apuracaoPorEmpresa(lista);
    expect(ap.saldoIbs).toBeCloseTo(debitoIbs, 8);
    expect(ap.saldoCbs).toBeCloseTo(debitoCbs - cp, 8);
    const [ano] = consolidarPorAno(lista, new Map([[2027, ano2027]]));
    expect(ano.ibsCbsLiquido).toBeCloseTo(debitoIbs + debitoCbs - cp, 8);
    expect(ano.credPresCbs).toBeCloseTo(cp, 8);
    expect(ano.credPresIbs).toBe(0);
  });

  it('apuração: o crédito presumido sem ressarcimento não entra no crédito acumulado a realizar (igual ao da operação)', () => {
    const oc = (op, cred) => ({ op, ...calcOperacao(op, ano2027, {}, {}, {}, new Map([[cred.c_cred_pres, cred]])) });
    const so = [oc({ ...frete({ valor_bruto: 1000 }), empresa_id: 'T1', ano: 2027 }, credTac)];
    expect(so[0].caixa.creditoAcumulado).toBe(0);
    const [ap] = apuracaoPorEmpresa(so);
    expect(ap.credPresTotal).toBeGreaterThan(0);
    expect(ap.credPresNaoRessarcivelTotal).toBeCloseTo(ap.credPresTotal, 8);
    expect(ap.creditoAcumuladoApurado).toBe(0);
    // o do produtor rural é ressarcível: continua no acumulado
    const rural = [oc({ ...frete({ c_cred_pres: '1', credito_presumido_cbs_pct: 0.05 }), empresa_id: 'T1', ano: 2027 }, credRural)];
    const [apRural] = apuracaoPorEmpresa(rural);
    expect(apRural.creditoAcumuladoApurado).toBeCloseTo(1000 * 0.05 / 1.05, 8);
  });
});

/** Créditos presumidos cujo percentual a própria lei fixa: resíduos (art. 170, §2º) e bem móvel usado (art. 171, §1º). */
describe('crédito presumido com percentual de lei (arts. 170 e 171)', () => {
  const ano = (a) => ({ ano: a, pis_cofins_fator: 0, ipi_fator_geral: 0, icms_fator: 1, iss_fator: 1, ibs_efetivo: a <= 2028 ? 0.001 : 0.0187, cbs_efetiva: 0.112, efeito_financeiro: 1 });
  const credResiduos = { c_cred_pres: '3', ibs_aplicavel: 'Sim', cbs_aplicavel: 'Sim', metodo_calculo: 'Direto', percentual_oficial: 'Fixado em lei' };
  const credUsado = { ...credResiduos, c_cred_pres: '4' };
  const compra = (cod, extra = {}) => ({ direcao: 'Entrada', valor_bruto: 1000, credito_elegivel_pct: 1, c_cred_pres: cod, ...extra });
  const rodar = (op, cred, a) => calcOperacao(op, ano(a), {}, {}, {}, new Map([[cred.c_cred_pres, cred]]));

  it('resíduos: CBS de 7% desde 2027 e IBS de 1,3% (2029), 2,6%, 3,9%, 5,2% e 13% (2033 em diante) sobre o valor da aquisição', () => {
    expect(rodar(compra('3'), credResiduos, 2027).ibsCbs).toMatchObject({ credPresCbs: 70, credPresIbs: 0 });
    const ibs = (a) => rodar(compra('3'), credResiduos, a).ibsCbs.credPresIbs;
    expect([2029, 2030, 2031, 2032, 2033, 2035].map(ibs).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([13, 26, 39, 52, 130, 130]);
    expect(rodar(compra('3'), credResiduos, 2029).ibsCbs.credPresCbs).toBe(70);
  });

  it('o percentual informado na operação prevalece sobre o da lei', () => {
    expect(rodar(compra('3', { credito_presumido_cbs_pct: 0.05 }), credResiduos, 2027).ibsCbs.credPresCbs).toBeCloseTo(50, 8);
  });

  it('bem móvel usado de pessoa física: as alíquotas de IBS e de CBS do ano sobre o valor da aquisição', () => {
    const r = rodar(compra('4'), credUsado, 2027).ibsCbs;
    expect(r.credPresCbs).toBeCloseTo(112, 8);
    expect(r.credPresIbs).toBeCloseTo(1, 8);
  });

  it('antes de 2027 não há crédito presumido; resíduos e bem usado só compensam tributo devido (sem ressarcimento)', () => {
    expect(rodar(compra('3'), credResiduos, 2026).ibsCbs.credPresTotal).toBe(0);
    expect(rodar(compra('4'), credUsado, 2026).ibsCbs.credPresTotal).toBe(0);
    expect(rodar(compra('3'), credResiduos, 2027).ibsCbs.credPresRessarcivel).toBe(false);
    expect(rodar(compra('4'), credUsado, 2027).caixa.creditoAcumulado).toBe(0);
  });

  it('produtor rural e transportador autônomo não têm percentual de lei: sem o da operação, nada é calculado', () => {
    const rural = { ...credResiduos, c_cred_pres: '1', percentual_oficial: 'Pendente de regulamentação', metodo_calculo: 'Por Fora' };
    expect(rodar(compra('1'), rural, 2027).ibsCbs.credPresTotal).toBe(0);
  });
});

describe('código do crédito presumido (XML traz dois dígitos)', () => {
  it('"02", "2" e " 02 " são o mesmo código; o antigo CP-RURAL e códigos de outra forma ficam como estão', () => {
    expect(chaveCredPres('02')).toBe('2');
    expect(chaveCredPres('2')).toBe('2');
    expect(chaveCredPres(' 02 ')).toBe('2');
    expect(chaveCredPres(4)).toBe('4');
    expect(chaveCredPres('10')).toBe('10');
    expect(chaveCredPres('cp-rural')).toBe('CP-RURAL');
    expect(chaveCredPres(null)).toBe('');
    expect(chaveCredPres(undefined)).toBe('');
  });

  it('operação gravada com "02" (como vem do XML) é o crédito do transportador autônomo: sem ressarcimento', () => {
    const ano = { ano: 2027, pis_cofins_fator: 0, icms_fator: 1, iss_fator: 1, ibs_efetivo: 0.001, cbs_efetiva: 0.112, efeito_financeiro: 1 };
    const cred = { c_cred_pres: '02', ibs_aplicavel: 'Sim', cbs_aplicavel: 'Sim', metodo_calculo: 'Por Fora', percentual_oficial: 'Pendente de regulamentação' };
    const r = calcOperacao({ direcao: 'Entrada', valor_bruto: 1000, credito_presumido_cbs_pct: 0.02, c_cred_pres: '02' }, ano, {}, {}, {}, new Map([['02', cred]]));
    expect(r.ibsCbs.credPresRessarcivel).toBe(false);
    expect(r.ibsCbs.credPresCbs).toBeCloseTo(1000 * 0.02 / 1.02, 8);
  });

  it('resíduos gravados como "03" usam o percentual da lei', () => {
    const ano = { ano: 2027, pis_cofins_fator: 0, icms_fator: 1, iss_fator: 1, ibs_efetivo: 0.001, cbs_efetiva: 0.112, efeito_financeiro: 1 };
    const cred = { c_cred_pres: '03', ibs_aplicavel: 'Sim', cbs_aplicavel: 'Sim', metodo_calculo: 'Direto', percentual_oficial: 'Fixado em lei' };
    const r = calcOperacao({ direcao: 'Entrada', valor_bruto: 1000, c_cred_pres: '03' }, ano, {}, {}, {}, new Map([['03', cred]]));
    expect(r.ibsCbs.credPresCbs).toBeCloseTo(70, 8);
  });
});

describe('versão do motor', () => {
  it('é a 1.4.0 depois da base de cálculo do art. 12 e do crédito presumido por fora', () => {
    expect(VERSAO_MOTOR).toBe('1.4.0');
  });
});
