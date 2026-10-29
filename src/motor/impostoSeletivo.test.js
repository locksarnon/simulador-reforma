import { describe, it, expect } from "vitest";
import { ANEXO_XVII, TETO_IS_BENS_MINERAIS, calcImpostoSeletivo, classificarImpostoSeletivo } from "./impostoSeletivo.js";
import { calcOperacao, calcSistemaAtual, consolidarPorAno } from "./taxEngine.js";

const a2027 = { ano: 2027, pis_cofins_fator: 0, ipi_fator_geral: 0, icms_fator: 1, iss_fator: 1, ibs_efetivo: 0.001, cbs_efetiva: 0.112, efeito_financeiro: 1 };
const a2033 = { ano: 2033, pis_cofins_fator: 0, ipi_fator_geral: 0, icms_fator: 0, iss_fator: 0, ibs_efetivo: 0.152, cbs_efetiva: 0.113, efeito_financeiro: 1 };

describe("Anexo XVII — enquadramento por NCM", () => {
  it.each([
    ["8703.23.10", "veiculos"], ["87032310", "veiculos"], ["8704.21.10", "veiculos"], ["8704.60.00", "veiculos"],
    ["8802.40.10", "aeronaves_embarcacoes"], ["8903.92.00", "aeronaves_embarcacoes"],
    ["2402.20.00", "fumigenos"], ["2208.60.00", "bebidas_alcoolicas"], ["2204.21.00", "bebidas_alcoolicas"],
    ["2202.10.00", "bebidas_acucaradas"], ["2601.11.00", "bens_minerais"], ["2709.00.10", "bens_minerais"], ["2711.21.00", "bens_minerais"],
  ])("%s → %s", (ncm, categoria) => {
    expect(classificarImpostoSeletivo(ncm)?.categoria).toBe(categoria);
  });
  it.each(["8802.60.00", "2202.99.00", "1005.90.10", "2709.00.90", "2711.19.10", "8704.22.10", "123", "", null])("%s não está no Anexo XVII", (ncm) => {
    expect(classificarImpostoSeletivo(ncm)).toBeNull();
  });
  it("bens minerais trazem o teto de 0,25% do art. 422, §2º", () => {
    expect(classificarImpostoSeletivo("2601.11.00").teto).toBe(TETO_IS_BENS_MINERAIS);
    expect(TETO_IS_BENS_MINERAIS).toBe(0.0025);
  });
  it("veículos e embarcações avisam das ressalvas da lei (caminhões e uso militar)", () => {
    expect(classificarImpostoSeletivo("8703.23.10").confirmar).toContain("caminhões");
  });
  it("o Anexo tem os 6 grupos de bens (concursos de prognósticos são serviço, sem NCM)", () => {
    expect(ANEXO_XVII.map((g) => g.categoria)).toEqual(["veiculos", "aeronaves_embarcacoes", "fumigenos", "bebidas_alcoolicas", "bebidas_acucaradas", "bens_minerais"]);
  });
});

describe("calcImpostoSeletivo", () => {
  const venda = (extra = {}) => ({ direcao: "Saida", valor_bruto: 1000, is_pct: 0.25, icms_pct: 0.12, ...extra });

  it("2027: o ICMS fica fora da base e o IS está dentro do preço — IS = i × (V − ICMS) ÷ (1 + i)", () => {
    const op = venda();
    const r = calcImpostoSeletivo(op, calcSistemaAtual(op), a2027);
    expect(r.deducoesBase).toBeCloseTo(120, 10);
    expect(r.valor).toBeCloseTo(176, 10); // 0,25 × 880 ÷ 1,25
    expect(r.base).toBeCloseTo(704, 10);
    expect(r.base * 0.25).toBeCloseTo(r.valor, 10);
    expect(r.base + r.valor + r.deducoesBase).toBeCloseTo(1000, 10);
  });
  it("2033: ICMS/ISS não existem mais, logo nada sai da base — IS = i × V ÷ (1 + i)", () => {
    const op = venda({ icms_pct: 0 });
    const r = calcImpostoSeletivo(op, calcSistemaAtual(op), a2033);
    expect(r.deducoesBase).toBe(0);
    expect(r.valor).toBeCloseTo(200, 10);
  });
  it("de 2029 a 2032 o ICMS que sobra (fator do ano) é o que sai da base", () => {
    const op = venda();
    const r = calcImpostoSeletivo(op, calcSistemaAtual(op), { ...a2027, ano: 2030, icms_fator: 0.8 });
    expect(r.deducoesBase).toBeCloseTo(96, 10);
  });
  it("mineração no teto legal de 0,25%: IS de R$ 2,49 em R$ 1.000, sem ICMS", () => {
    const op = { direcao: "Saida", valor_bruto: 1000, is_pct: TETO_IS_BENS_MINERAIS };
    const r = calcImpostoSeletivo(op, calcSistemaAtual(op), a2027);
    expect(r.valor).toBeCloseTo(1000 * 0.0025 / 1.0025, 10);
  });
  it("não cobra na compra (art. 410), antes de 2027 nem sem alíquota informada", () => {
    const op = venda();
    expect(calcImpostoSeletivo({ ...op, direcao: "Entrada" }, calcSistemaAtual(op), a2027).valor).toBe(0);
    expect(calcImpostoSeletivo(op, calcSistemaAtual(op), { ...a2027, ano: 2026 }).valor).toBe(0);
    expect(calcImpostoSeletivo({ ...op, is_pct: 0 }, calcSistemaAtual(op), a2027).valor).toBe(0);
    expect(calcImpostoSeletivo({ ...op, is_pct: undefined }, calcSistemaAtual(op), a2027).aplicavel).toBe(false);
  });
});

describe("Imposto Seletivo dentro do motor", () => {
  const venda = { direcao: "Saida", valor_bruto: 1000, is_pct: 0.25, icms_pct: 0.12, credito_elegivel_pct: 0 };

  it("entra na carga da transição e no efeito sobre a margem", () => {
    const sem = calcOperacao({ ...venda, is_pct: 0 }, a2027, {}, {}, {}, new Map());
    const com = calcOperacao(venda, a2027, {}, {}, {}, new Map());
    expect(com.impostoSeletivo.valor).toBeCloseTo(176, 10);
    expect(com.transicao.impostoSeletivo).toBeCloseTo(176, 10);
    expect(com.transicao.cargaTotalTransicao - sem.transicao.cargaTotalTransicao).toBeCloseTo(176, 10);
    expect(com.precoMargem.margemTransicao - sem.precoMargem.margemTransicao).toBeCloseTo(-176, 10);
  });
  it("o IBS/CBS não muda: a base já contém o IS (art. 12, §1º, V)", () => {
    const sem = calcOperacao({ ...venda, is_pct: 0 }, a2027, {}, {}, {}, new Map());
    const com = calcOperacao(venda, a2027, {}, {}, {}, new Map());
    expect(com.ibsCbs.debitoCbs).toBeCloseTo(sem.ibsCbs.debitoCbs, 10);
    expect(com.ibsCbs.debitoIbs).toBeCloseTo(sem.ibsCbs.debitoIbs, 10);
  });
  it("o preço-alvo sobe para cobrir o IS", () => {
    const sem = calcOperacao({ ...venda, is_pct: 0, custo_base_pct: 0.5 }, a2027, {}, {}, {}, new Map());
    const com = calcOperacao({ ...venda, custo_base_pct: 0.5 }, a2027, {}, {}, {}, new Map());
    expect(com.precoMargem.precoBrutoAlvo).toBeGreaterThan(sem.precoMargem.precoBrutoAlvo);
  });
  it("devolução (valor negativo) espelha a venda, inclusive o IS", () => {
    const venda1 = calcOperacao(venda, a2027, {}, {}, {}, new Map());
    const estorno = calcOperacao({ ...venda, valor_bruto: -1000 }, a2027, {}, {}, {}, new Map());
    expect(estorno.impostoSeletivo.valor).toBeCloseTo(-venda1.impostoSeletivo.valor, 10);
    expect(estorno.impostoSeletivo.aliquota).toBe(0.25);
  });
  it("a consolidação por ano soma o IS e o inclui na carga da transição", () => {
    const oc = calcOperacao({ ...venda, empresa_id: "E1", ano: 2027 }, a2027, {}, {}, {}, new Map());
    const [ano27] = consolidarPorAno([{ op: { ...venda, empresa_id: "E1", ano: 2027 }, ...oc }], new Map([[2027, a2027]]));
    expect(ano27.impostoSeletivo).toBeCloseTo(176, 10);
    expect(ano27.cargaTransicao).toBeGreaterThanOrEqual(176);
  });
});

describe("base do IS: exclusões do art. 12, §2º, e aproximação do valor de referência", () => {
  it("minerais e fumígenos avisam que a base legal é o valor de referência (art. 414, III); os demais não", () => {
    expect(classificarImpostoSeletivo("2601.11.00").valorDeReferencia).toBe(true);
    expect(classificarImpostoSeletivo("2402.20.00").valorDeReferencia).toBe(true);
    expect(classificarImpostoSeletivo("2208.60.00").valorDeReferencia).toBe(false);
    expect(classificarImpostoSeletivo("8703.23.10").valorDeReferencia).toBe(false);
    expect(classificarImpostoSeletivo("2601.11.00").confirmar).toContain("valor de referência");
    expect(classificarImpostoSeletivo("2402.20.00").confirmar).toContain("valor de referência");
  });
  it("o aviso do carvão mineral aparece em bens minerais (art. 409, §1º inclui, e o Anexo não lista por NCM)", () => {
    expect(classificarImpostoSeletivo("2601.11.00").confirmar).toContain("carvão mineral");
  });
  it("o resultado traz a categoria e a marca de base aproximada quando o NCM é de minério ou fumígeno", () => {
    const op = { direcao: "Saida", valor_bruto: 1000, is_pct: 0.0025, ncm: "26011100" };
    const r = calcImpostoSeletivo(op, calcSistemaAtual(op), a2027);
    expect(r.categoria).toBe("bens_minerais");
    expect(r.aproximacaoBase).toBe(true);
    const veic = calcImpostoSeletivo({ ...op, ncm: "87032310", is_pct: 0.1 }, calcSistemaAtual(op), a2027);
    expect(veic.categoria).toBe("veiculos");
    expect(veic.aproximacaoBase).toBe(false);
    const semNcm = calcImpostoSeletivo({ direcao: "Saida", valor_bruto: 1000, is_pct: 0.1 }, calcSistemaAtual(op), a2027);
    expect(semNcm.categoria).toBeNull();
    expect(semNcm.aproximacaoBase).toBe(false);
  });
  it("alíquota acima de 0,25% em bem mineral dispara o aviso do teto (art. 422, §2º); no limite, não", () => {
    const op = { direcao: "Saida", valor_bruto: 1000, ncm: "26011100" };
    expect(calcImpostoSeletivo({ ...op, is_pct: 0.0025 }, calcSistemaAtual(op), a2027).acimaDoTeto).toBe(false);
    const acima = calcImpostoSeletivo({ ...op, is_pct: 0.005 }, calcSistemaAtual(op), a2027);
    expect(acima.acimaDoTeto).toBe(true);
    expect(acima.teto).toBe(TETO_IS_BENS_MINERAIS);
    expect(calcImpostoSeletivo({ ...op, ncm: "87032310", is_pct: 0.5 }, calcSistemaAtual(op), a2027).acimaDoTeto).toBe(false);
  });
  it("o IPI fica fora da base do IS (art. 415, V, com o art. 12, §2º, II), com o fator do ano", () => {
    const op = { direcao: "Saida", valor_bruto: 1000, is_pct: 0.25, ipi_pct: 0.1 };
    const comIpi = calcImpostoSeletivo(op, calcSistemaAtual(op), { ...a2027, ipi_fator_geral: 1 }); // ex.: produto da ZFM, com IPI
    expect(comIpi.deducoesBase).toBeCloseTo(100, 10);
    expect(comIpi.valor).toBeCloseTo((0.25 * 900) / 1.25, 10);
    const semIpi = calcImpostoSeletivo(op, calcSistemaAtual(op), a2027); // IPI zerado em 2027
    expect(semIpi.deducoesBase).toBe(0);
  });
  it("PIS e Cofins também ficam fora da base até 2032 (art. 12, §2º, V), com o fator do ano", () => {
    const op = { direcao: "Saida", valor_bruto: 1000, is_pct: 0.25, pis_pct: 0.0165, cofins_pct: 0.076 };
    const r = calcImpostoSeletivo(op, calcSistemaAtual(op), { ...a2027, pis_cofins_fator: 1 });
    expect(r.deducoesBase).toBeCloseTo(92.5, 10);
    expect(calcImpostoSeletivo(op, calcSistemaAtual(op), a2027).deducoesBase).toBe(0); // extintos em 2027
  });
  it("devolução espelha o IS sem trocar o sinal da alíquota nem do teto", () => {
    const op = { direcao: "Saida", valor_bruto: 1000, is_pct: 0.0025, ncm: "26011100", credito_elegivel_pct: 0 };
    const venda = calcOperacao(op, a2027, {}, {}, {}, new Map());
    const estorno = calcOperacao({ ...op, valor_bruto: -1000 }, a2027, {}, {}, {}, new Map());
    expect(estorno.impostoSeletivo.valor).toBeCloseTo(-venda.impostoSeletivo.valor, 10);
    expect(estorno.impostoSeletivo.teto).toBe(TETO_IS_BENS_MINERAIS);
    expect(estorno.impostoSeletivo.aproximacaoBase).toBe(true);
  });
});
