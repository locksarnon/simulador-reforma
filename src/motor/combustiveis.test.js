import { describe, it, expect } from "vitest";
import { PRODUTOS_COMBUSTIVEL, aliquotasCombustivelDoAno, calcCombustivel, nomeProdutoCombustivel } from "./combustiveis.js";
import { calcOperacao } from "./taxEngine.js";

/** Alíquotas de CBS de 2027: Anexo da Portaria MF nº 3.074/2026 (DOU 09/10/2026). */
const LINHAS = [
  ["gasolina", "litro", 0.7925], ["eac", "litro", 0.1922], ["diesel", "litro", 0.3515], ["b100", "litro", 0.148],
  ["glp", "kg", 0.1677], ["ehc", "litro", 0.1922], ["qav", "litro", 0.0712], ["oleo_combustivel", "kg", 0.3403],
].map(([produto, unidade, cbs]) => ({ produto, unidade, ano: 2027, cbs_por_unidade: cbs, ibs_por_unidade: null, fonte: "Portaria MF 3.074/2026" }));

const ano = (a, extra = {}) => ({
  ano: a, pis_cofins_fator: 0, ipi_fator_geral: 0, icms_fator: a >= 2033 ? 0 : 1, iss_fator: a >= 2033 ? 0 : 1,
  ibs_efetivo: a <= 2028 ? 0.001 : 0.0152, cbs_efetiva: a <= 2028 ? 0.112 : 0.113,
  ibs_uf_aliquota: a <= 2028 ? 0.0005 : 0.012, ibs_mun_aliquota: a <= 2028 ? 0.0005 : 0.0032,
  efeito_financeiro: 1, combustiveis: aliquotasCombustivelDoAno(LINHAS, a), ...extra,
});
const venda = (extra = {}) => ({ direcao: "Saida", valor_bruto: 6000, quantidade: 1000, combustivel_produto: "diesel", ...extra });

describe("catálogo de combustíveis", () => {
  it("lista os 8 produtos do art. 172, I a VIII, com a unidade certa", () => {
    expect(PRODUTOS_COMBUSTIVEL.map((p) => p.id)).toEqual(["gasolina", "eac", "diesel", "b100", "glp", "ehc", "qav", "oleo_combustivel"]);
    expect(PRODUTOS_COMBUSTIVEL.filter((p) => p.unidade === "kg").map((p) => p.id)).toEqual(["glp", "oleo_combustivel"]);
    expect(nomeProdutoCombustivel("diesel")).toContain("diesel");
  });
});

describe("aliquotasCombustivelDoAno", () => {
  it("2027 traz a CBS da Portaria e deixa o IBS por unidade pendente", () => {
    const t = aliquotasCombustivelDoAno(LINHAS, 2027);
    expect(t.diesel.cbs).toBe(0.3515);
    expect(t.diesel.cbsRepetidaDe).toBeNull();
    expect(t.diesel.ibs).toBeNull();
    expect(t.gasolina.cbs).toBe(0.7925);
  });
  it("anos sem divulgação repetem a CBS do último ano divulgado e dizem de onde veio", () => {
    const t = aliquotasCombustivelDoAno(LINHAS, 2030);
    expect(t.diesel.cbs).toBe(0.3515);
    expect(t.diesel.cbsRepetidaDe).toBe(2027);
  });
  it("não repete o IBS por unidade: só vale se o próprio ano tiver sido cadastrado", () => {
    const comIbs = [...LINHAS, { produto: "diesel", unidade: "litro", ano: 2029, cbs_por_unidade: 0.36, ibs_por_unidade: 0.02 }];
    expect(aliquotasCombustivelDoAno(comIbs, 2029).diesel.ibs).toBe(0.02);
    expect(aliquotasCombustivelDoAno(comIbs, 2029).diesel.cbs).toBe(0.36);
    expect(aliquotasCombustivelDoAno(comIbs, 2030).diesel.ibs).toBeNull();
  });
  it("ano anterior à primeira divulgação não inventa alíquota", () => {
    expect(aliquotasCombustivelDoAno(LINHAS, 2026).diesel.cbs).toBeNull();
  });
});

describe("calcCombustivel", () => {
  it("operação comum (sem produto) devolve null", () => {
    expect(calcCombustivel({ valor_bruto: 100 }, ano(2027))).toBeNull();
    expect(calcCombustivel({ combustivel_produto: "xyz", valor_bruto: 100 }, ano(2027))).toBeNull();
  });
  it("2027: 1.000 litros de diesel × R$ 0,3515 = R$ 351,50 de CBS, mais 0,1% de IBS sobre o valor", () => {
    const r = calcCombustivel(venda(), ano(2027));
    expect(r.aplicavel).toBe(true);
    expect(r.cbsAdRem).toBeCloseTo(351.5, 10);
    expect(r.ibsValor).toBeCloseTo(6, 10);
    expect(r.ibsPendente).toBe(false);
  });
  it("sem quantidade, não aplica o regime e pede a quantidade", () => {
    const r = calcCombustivel(venda({ quantidade: 0 }), ano(2027));
    expect(r.aplicavel).toBe(false);
    expect(r.avisos.join(" ")).toContain("quantidade");
  });
  it("sem alíquota cadastrada, não aplica o regime e orienta onde cadastrar", () => {
    const r = calcCombustivel(venda(), { ano: 2027, combustiveis: {} });
    expect(r.aplicavel).toBe(false);
    expect(r.avisos.join(" ")).toContain("Catálogos");
  });
  it("2029 em diante: IBS por unidade pendente fica de fora e avisa; a CBS repetida de 2027 também avisa", () => {
    const r = calcCombustivel(venda(), ano(2029));
    expect(r.ibsPendente).toBe(true);
    expect(r.ibsValor).toBe(0);
    expect(r.cbsRepetidaDe).toBe(2027);
    expect(r.avisos.join(" ")).toContain("IBS por unidade");
  });
  it("2026: as alíquotas de teste não se aplicam a combustíveis (art. 348, III, b)", () => {
    const r = calcCombustivel(venda(), { ano: 2026, combustiveis: {} });
    expect(r.aplicavel).toBe(true);
    expect(r.cbsAdRem).toBe(0);
    expect(r.ibsValor).toBe(0);
    expect(r.avisos.join(" ")).toContain("art. 348");
  });
  it("cClassTrib 620006 (cobrada anteriormente) vira saída sem débito; classe fora de 620 gera aviso", () => {
    expect(calcCombustivel(venda({ c_class_trib: "620006" }), ano(2027)).semDebito).toBe(true);
    expect(calcCombustivel(venda({ c_class_trib: "620001" }), ano(2027)).semDebito).toBe(false);
    expect(calcCombustivel(venda({ c_class_trib: "000001" }), ano(2027)).avisos.join(" ")).toContain("620001");
  });
});

describe("combustível dentro do motor (calcOperacao)", () => {
  it("2027, saída do produtor: débito de CBS = 351,50 − 6,00 de IBS deduzido, total de 351,50 (art. 347, §2º)", () => {
    const r = calcOperacao(venda({ credito_elegivel_pct: 0 }), ano(2027), {}, {}, {}, new Map());
    expect(r.ibsCbs.debitoIbs).toBeCloseTo(6, 10);
    expect(r.ibsCbs.debitoCbs).toBeCloseTo(345.5, 10);
    expect(r.ibsCbs.debitoIbs + r.ibsCbs.debitoCbs).toBeCloseTo(351.5, 10);
    expect(r.ibsCbs.combustivel.aplicavel).toBe(true);
  });
  it("a alíquota percentual do ano NÃO é aplicada além da específica (nada de 11,2% sobre o valor)", () => {
    const r = calcOperacao(venda(), ano(2027), {}, {}, {}, new Map());
    expect(r.ibsCbs.debitoCbs).toBeLessThan(6000 * 0.112);
    expect(r.ibsCbs.cbsEfetiva).toBeCloseTo(351.5 / 6000, 10);
  });
  it("entrada para consumo (ex.: diesel da lavoura) credita o valor registrado na nota; para revenda, 0% (art. 180)", () => {
    const consumo = calcOperacao(venda({ direcao: "Entrada", credito_elegivel_pct: 1 }), ano(2027), {}, {}, {}, new Map());
    expect(consumo.ibsCbs.creditoCbs).toBeCloseTo(351.5, 10);
    expect(consumo.ibsCbs.creditoIbs).toBeCloseTo(6, 10);
    const revenda = calcOperacao(venda({ direcao: "Entrada", credito_elegivel_pct: 0 }), ano(2027), {}, {}, {}, new Map());
    expect(revenda.ibsCbs.creditoCbs).toBe(0);
  });
  it("saída 620006 (distribuidor/posto) não tem débito", () => {
    const r = calcOperacao(venda({ c_class_trib: "620006" }), ano(2027), { c_class_trib: "620006", pct_reducao_ibs: 0, pct_reducao_cbs: 0 }, {}, {}, new Map());
    expect(r.ibsCbs.debitoCbs).toBe(0);
    expect(r.ibsCbs.debitoIbs).toBe(0);
  });
  it("redutor de compra governamental NÃO se aplica a combustível (art. 472, parágrafo único, II)", () => {
    const a = ano(2027, { redutor_compra_gov: 0.4416 });
    const r = calcOperacao(venda({ compra_governamental_informado: "Sim" }), a, {}, {}, {}, new Map());
    expect(r.ibsCbs.redutorCompraGov).toBe(0);
    expect(r.ibsCbs.debitoIbs + r.ibsCbs.debitoCbs).toBeCloseTo(351.5, 10);
  });
  it("etanol hidratado em quilos não existe: a unidade vem do produto (EHC em litro, GLP em kg)", () => {
    const glp = calcOperacao({ direcao: "Saida", valor_bruto: 1000, quantidade: 100, combustivel_produto: "glp" }, ano(2027), {}, {}, {}, new Map());
    expect(glp.ibsCbs.combustivel.unidade).toBe("kg");
    expect(glp.ibsCbs.combustivel.cbsAdRem).toBeCloseTo(16.77, 10);
  });
  it("repartição do IBS entre estado e município segue a proporção do ano e fecha no total", () => {
    const r = calcOperacao(venda(), ano(2027), {}, {}, {}, new Map());
    expect(r.ibsCbs.debitoIbsUf + r.ibsCbs.debitoIbsMun).toBeCloseTo(r.ibsCbs.debitoIbs, 10);
    expect(r.ibsCbs.debitoIbsUf).toBeCloseTo(r.ibsCbs.debitoIbsMun, 10);
  });
  it("operação sem produto de combustível continua igual: 11,2% de CBS e 0,1% de IBS sobre o valor", () => {
    const r = calcOperacao({ direcao: "Saida", valor_bruto: 1000 }, ano(2027), {}, {}, {}, new Map());
    expect(r.ibsCbs.debitoCbs).toBeCloseTo(112, 10);
    expect(r.ibsCbs.debitoIbs).toBeCloseTo(1, 10);
    expect(r.ibsCbs.combustivel).toBeNull();
  });
});

describe("devolução, exceções da Portaria e crédito do adquirente", () => {
  it("devolução de combustível (valor negativo) espelha a venda mesmo com a quantidade negativa ou positiva", () => {
    const venda1 = calcOperacao(venda({ credito_elegivel_pct: 0 }), ano(2027), {}, {}, {}, new Map());
    for (const quantidade of [1000, -1000]) {
      const e = calcOperacao(venda({ valor_bruto: -6000, quantidade, credito_elegivel_pct: 0 }), ano(2027), {}, {}, {}, new Map());
      expect(e.estorno).toBe(true);
      expect(e.ibsCbs.debitoCbs, `qtd ${quantidade}`).toBeCloseTo(-venda1.ibsCbs.debitoCbs, 10);
      expect(e.ibsCbs.debitoIbs).toBeCloseTo(-venda1.ibsCbs.debitoIbs, 10);
      expect(e.ibsCbs.combustivel.aplicavel).toBe(true);
    }
  });
  it("no detalhe da devolução, os valores em R$ do combustível também trocam de sinal", () => {
    const e = calcOperacao(venda({ valor_bruto: -6000 }), ano(2027), {}, {}, {}, new Map());
    expect(e.ibsCbs.combustivel.cbsAdRem).toBeCloseTo(-351.5, 10);
    expect(e.ibsCbs.combustivel.ibsValor).toBeCloseTo(-6, 10);
  });
  it("GLP e B100 avisam das exceções do anexo da Portaria (botijão doméstico e agricultura familiar)", () => {
    const glp = calcCombustivel({ combustivel_produto: "glp", quantidade: 100, valor_bruto: 1000 }, ano(2027));
    expect(glp.avisos.join(" ")).toContain("13 kg");
    const b100 = calcCombustivel({ combustivel_produto: "b100", quantidade: 100, valor_bruto: 1000 }, ano(2027));
    expect(b100.avisos.join(" ")).toContain("agricultura familiar");
    expect(calcCombustivel(venda(), ano(2027)).avisos.join(" ")).not.toContain("13 kg");
  });
  it("PREMISSA documentada: em 2027, o crédito do adquirente (CBS cheia + IBS da nota) passa em 0,1% do valor o que o fornecedor recolhe líquido", () => {
    const saida = calcOperacao(venda({ credito_elegivel_pct: 0 }), ano(2027), {}, {}, {}, new Map());
    const entrada = calcOperacao(venda({ direcao: "Entrada", credito_elegivel_pct: 1 }), ano(2027), {}, {}, {}, new Map());
    const recolhido = saida.ibsCbs.debitoIbs + saida.ibsCbs.debitoCbs; // 351,50
    const creditado = entrada.ibsCbs.creditoIbs + entrada.ibsCbs.creditoCbs; // 357,50
    expect(recolhido).toBeCloseTo(351.5, 10);
    expect(creditado - recolhido).toBeCloseTo(6000 * 0.001, 10);
  });
});
