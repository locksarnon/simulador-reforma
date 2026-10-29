import { describe, it, expect } from "vitest";
import {
  ANO_INICIO_CENARIO, CENARIOS_ALIQUOTA, GATILHO_SOMA_REFERENCIA,
  alertaGatilho, descricaoCurta, normalizarSelecao, pctRef, referenciasDaTabela, resolverTransicao,
} from "./cenariosAliquota.js";

/** Tabela TransicaoAno como está no banco em 29/10/2026 (conferida na produção). */
const linha = (ano, f, ibs, uf, mun, cbs, extra = {}) => ({
  ano, pis_cofins_fator: ano >= 2027 ? 0 : 1, ipi_fator_geral: ano >= 2027 ? 0 : 1, icms_fator: f, iss_fator: f,
  ibs_efetivo: ibs, ibs_uf_aliquota: uf, ibs_mun_aliquota: mun, cbs_efetiva: cbs,
  efeito_financeiro: ano === 2026 ? 0 : 1, carater: "Estimativa", fonte: "base", status: "Estimativa", ...extra,
});
const TABELA = [
  linha(2026, 1, 0.001, 0, 0, 0.009, { status: "Oficial", carater: "Informativo" }),
  linha(2027, 1, 0.001, 0.0005, 0.0005, 0.112),
  linha(2028, 1, 0.001, 0.0005, 0.0005, 0.112),
  linha(2029, 0.9, 0.0187, 0.01477, 0.00393, 0.0921),
  linha(2030, 0.8, 0.0374, 0.02955, 0.00785, 0.0921),
  linha(2031, 0.7, 0.0561, 0.04432, 0.01178, 0.0921),
  linha(2032, 0.6, 0.0748, 0.05909, 0.01571, 0.0921),
  linha(2033, 0, 0.187, 0.1477, 0.0393, 0.0921),
];
const ano = (linhas, a) => linhas.find((l) => l.ano === a);

describe("referenciasDaTabela", () => {
  it("lê a CBS de referência de 2027 somando de volta os 0,1 p.p. do art. 347", () => {
    const r = referenciasDaTabela(TABELA);
    expect(r.cbsReferencia2027).toBeCloseTo(0.113, 10);
    expect(r.cbsCadastrada).toBeCloseTo(0.0921, 10);
    expect(r.ibsCheioCadastrado).toBeCloseTo(0.187, 10);
  });
  it("sem a linha de 2027 ou de 2033 cai nos valores de segurança, sem quebrar", () => {
    const r = referenciasDaTabela([]);
    expect(r.cbsReferencia2027).toBe(0.113);
    expect(r.ibsCheioCadastrado).toBe(0.187);
    expect(r.cbsCadastrada).toBeNull();
  });
});

describe("resolverTransicao — cenário 'gatilho' (padrão)", () => {
  const { linhas, resumo } = resolverTransicao(TABELA, { id: "gatilho" });

  it("mantém a CBS na referência de 2027 (11,3%) de 2029 a 2033", () => {
    for (const a of [2029, 2030, 2031, 2032, 2033]) expect(ano(linhas, a).cbs_efetiva).toBeCloseTo(0.113, 10);
  });
  it("IBS cheio de 2033 = 26,5% − CBS = 15,2%, e a soma de referência fecha no gatilho sem disparar alerta", () => {
    expect(ano(linhas, 2033).ibs_efetivo).toBeCloseTo(0.152, 10);
    expect(resumo.somaReferencia).toBeCloseTo(GATILHO_SOMA_REFERENCIA, 10);
    expect(resumo.acimaDoGatilho).toBe(false);
    expect(alertaGatilho(resumo)).toBeNull();
  });
  it("o IBS dos anos de transição segue a escala do ADCT 128: 10%, 20%, 30%, 40% e 100% do cheio", () => {
    const esperado = { 2029: 0.0152, 2030: 0.0304, 2031: 0.0456, 2032: 0.0608, 2033: 0.152 };
    for (const [a, v] of Object.entries(esperado)) expect(ano(linhas, Number(a)).ibs_efetivo).toBeCloseTo(v, 10);
  });
  it("UF + município fecham no IBS do ano e mantêm a partilha da tabela", () => {
    for (const a of [2029, 2030, 2031, 2032, 2033]) {
      const l = ano(linhas, a);
      expect(l.ibs_uf_aliquota + l.ibs_mun_aliquota).toBeCloseTo(l.ibs_efetivo, 10);
    }
    const l33 = ano(linhas, 2033);
    expect(l33.ibs_uf_aliquota / l33.ibs_efetivo).toBeCloseTo(0.1477 / 0.187, 4);
  });
  it("não toca em 2026, 2027 e 2028 nem nos fatores de ICMS/ISS/PIS/IPI", () => {
    for (const a of [2026, 2027, 2028]) expect(ano(linhas, a)).toEqual(ano(TABELA, a));
    for (const a of [2029, 2030, 2031, 2032, 2033]) {
      expect(ano(linhas, a).icms_fator).toBe(ano(TABELA, a).icms_fator);
      expect(ano(linhas, a).efeito_financeiro).toBe(1);
    }
  });
  it("marca as linhas alteradas como Cenário, com a fonte, e não muda a tabela de entrada", () => {
    expect(ano(linhas, 2031).status).toBe("Cenário");
    expect(ano(linhas, 2031).cenario_id).toBe("gatilho");
    expect(ano(linhas, 2031).fonte).toContain("Gatilho de 26,5%");
    expect(ano(TABELA, 2031).status).toBe("Estimativa");
    expect(ano(TABELA, 2033).cbs_efetiva).toBe(0.0921);
  });
});

describe("resolverTransicao — outros cenários", () => {
  it("'somadas' soma o IBS de 18,7% à CBS do TCU: 30,0%, acima do gatilho, com alerta do art. 475, §11", () => {
    const { linhas, resumo } = resolverTransicao(TABELA, { id: "somadas" });
    expect(ano(linhas, 2033).cbs_efetiva).toBeCloseTo(0.113, 10);
    expect(ano(linhas, 2033).ibs_efetivo).toBeCloseTo(0.187, 10);
    expect(resumo.somaReferencia).toBeCloseTo(0.3, 10);
    expect(resumo.acimaDoGatilho).toBe(true);
    expect(resumo.excesso).toBeCloseTo(0.035, 10);
    const texto = alertaGatilho(resumo);
    expect(texto).toContain("30,0%");
    expect(texto).toContain("26,5%");
    expect(texto).toContain("art. 475, §11");
  });

  it("'cadastrada' devolve a mesma tabela, sem ajuste, e informa a soma real (27,9%)", () => {
    const { linhas, resumo } = resolverTransicao(TABELA, { id: "cadastrada" });
    expect(linhas).toBe(TABELA);
    expect(resumo.somaReferencia).toBeCloseTo(0.2791, 10);
    expect(resumo.acimaDoGatilho).toBe(true);
  });

  it("'personalizado' usa a CBS e o IBS cheio informados", () => {
    const { linhas, resumo } = resolverTransicao(TABELA, { id: "personalizado", cbs: 0.1, ibs: 0.16 });
    expect(ano(linhas, 2029).cbs_efetiva).toBeCloseTo(0.1, 10);
    expect(ano(linhas, 2030).ibs_efetivo).toBeCloseTo(0.032, 10);
    expect(ano(linhas, 2033).ibs_efetivo).toBeCloseTo(0.16, 10);
    expect(resumo.somaReferencia).toBeCloseTo(0.26, 10);
    expect(resumo.acimaDoGatilho).toBe(false);
  });
  it("'personalizado' sem números cai no cenário do gatilho em vez de zerar a alíquota", () => {
    const { resumo } = resolverTransicao(TABELA, { id: "personalizado" });
    expect(resumo.somaReferencia).toBeCloseTo(GATILHO_SOMA_REFERENCIA, 10);
  });

  it("nunca altera uma linha que o administrador já gravou como Oficial", () => {
    const oficial = TABELA.map((l) => (l.ano === 2029 ? { ...l, status: "Oficial", cbs_efetiva: 0.105, ibs_efetivo: 0.02 } : l));
    const { linhas } = resolverTransicao(oficial, { id: "somadas" });
    expect(ano(linhas, 2029).cbs_efetiva).toBe(0.105);
    expect(ano(linhas, 2029).ibs_efetivo).toBe(0.02);
    expect(ano(linhas, 2030).status).toBe("Cenário");
  });

  it("sem linhas devolve lista vazia e resumo coerente", () => {
    const { linhas, resumo } = resolverTransicao(undefined, { id: "gatilho" });
    expect(linhas).toEqual([]);
    expect(resumo.somaReferencia).toBeCloseTo(GATILHO_SOMA_REFERENCIA, 10);
  });
});

describe("normalizarSelecao", () => {
  it("id desconhecido ou lixo vira o padrão", () => {
    expect(normalizarSelecao({ id: "xyz" }).id).toBe("gatilho");
    expect(normalizarSelecao(null).id).toBe("gatilho");
    expect(normalizarSelecao("teto").id).toBe("gatilho");
  });
  it("limita os números do personalizado a 0–60% e descarta o que não é número", () => {
    expect(normalizarSelecao({ id: "personalizado", cbs: 9, ibs: -1 })).toEqual({ id: "personalizado", cbs: 0.6, ibs: 0 });
    expect(normalizarSelecao({ id: "personalizado", cbs: "abc", ibs: "" })).toEqual({ id: "personalizado", cbs: null, ibs: null });
  });
});

describe("textos", () => {
  it("lista os 4 cenários, cada um com fonte e descrição", () => {
    expect(CENARIOS_ALIQUOTA.map((c) => c.id)).toEqual(["gatilho", "somadas", "cadastrada", "personalizado"]);
    for (const c of CENARIOS_ALIQUOTA) {
      expect(c.fonte.length).toBeGreaterThan(10);
      expect(c.descricao.length).toBeGreaterThan(40);
    }
  });
  it("formata percentuais com vírgula", () => {
    expect(pctRef(0.113)).toBe("11,3%");
    expect(pctRef(0.2791, 2)).toBe("27,91%");
  });
  it("a linha curta cita o cenário, os números e que quem fixa é o Senado", () => {
    const { resumo } = resolverTransicao(TABELA, { id: "gatilho" });
    const t = descricaoCurta(resumo);
    expect(t).toContain("Gatilho de 26,5%");
    expect(t).toContain("11,3%");
    expect(t).toContain("15,2%");
    expect(t).toContain("art. 349");
  });
  it("o ano inicial dos cenários é 2029", () => {
    expect(ANO_INICIO_CENARIO).toBe(2029);
  });
});

describe("redutor de compras governamentais nos anos sem valor cadastrado", () => {
  const comRedutor2027 = TABELA.map((l) => (l.ano === 2027 ? { ...l, redutor_compra_gov: 0.4416 } : { ...l, redutor_compra_gov: 0 }));

  it("repete o último redutor cadastrado nos anos seguintes e marca de onde veio (arts. 349, §1º, e 472)", () => {
    for (const id of ["gatilho", "somadas", "cadastrada", "personalizado"]) {
      const { linhas, resumo } = resolverTransicao(comRedutor2027, { id, cbs: 0.1, ibs: 0.16 });
      for (const a of [2028, 2029, 2033]) {
        expect(ano(linhas, a).redutor_compra_gov, `${id} ${a}`).toBe(0.4416);
        expect(ano(linhas, a).redutor_repetido_de).toBe(2027);
      }
      expect(ano(linhas, 2027).redutor_repetido_de).toBeUndefined();
      expect(resumo.redutorCompraGov).toEqual({ valor: 0.4416, ano: 2027 });
    }
  });
  it("não inventa redutor para o ano anterior ao primeiro cadastrado (2026) nem quando nenhum foi cadastrado", () => {
    const { linhas } = resolverTransicao(comRedutor2027, { id: "gatilho" });
    expect(ano(linhas, 2026).redutor_compra_gov).toBe(0);
    const { linhas: sem, resumo } = resolverTransicao(TABELA, { id: "gatilho" });
    expect(ano(sem, 2030).redutor_compra_gov).toBeUndefined();
    expect(resumo.redutorCompraGov).toBeNull();
  });
  it("um redutor novo cadastrado (ex.: o do Senado para 2028) passa a valer dali em diante", () => {
    const novo = comRedutor2027.map((l) => (l.ano === 2028 ? { ...l, redutor_compra_gov: 0.41 } : l));
    const { linhas, resumo } = resolverTransicao(novo, { id: "gatilho" });
    expect(ano(linhas, 2028).redutor_compra_gov).toBe(0.41);
    expect(ano(linhas, 2028).redutor_repetido_de).toBeUndefined();
    expect(ano(linhas, 2030).redutor_compra_gov).toBe(0.41);
    expect(ano(linhas, 2030).redutor_repetido_de).toBe(2028);
    expect(resumo.redutorCompraGov).toEqual({ valor: 0.41, ano: 2028 });
  });
  it("'cadastrada' sem redutor devolve exatamente a tabela de entrada (sem cópia)", () => {
    expect(resolverTransicao(TABELA, { id: "cadastrada" }).linhas).toBe(TABELA);
  });
});
