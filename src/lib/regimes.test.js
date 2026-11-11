import { describe, expect, it } from "vitest";
import { PERFIS } from "./calculadoraAgro";
import { compararRegimes, EMPATE, mapaDeVencedores, respostasDerivadas, viradas } from "./regimes";

const parametros = [
  { ano: 2027, pis_cofins_fator: 0, ipi_fator_geral: 0, icms_fator: 1, iss_fator: 1, ibs_efetivo: 0.001, cbs_efetiva: 0.112, ibs_uf_aliquota: 0, ibs_mun_aliquota: 0, efeito_financeiro: 1 },
  { ano: 2033, pis_cofins_fator: 0, ipi_fator_geral: 0, icms_fator: 0, iss_fator: 0, ibs_efetivo: 0.1, cbs_efetiva: 0.088, ibs_uf_aliquota: 0, ibs_mun_aliquota: 0, efeito_financeiro: 1 },
];
const racao = PERFIS.find((p) => p.id === "racao");
const base = { faturamentoAnual: 4_000_000, comprasPct: 60, creditoPct: 80, exportaPct: 0, respostas: {} };

describe("onde cada regime vence", () => {
  it("roda o motor para cada regime do perfil e aponta o de menor carga em cada ano", () => {
    const c = compararRegimes(base, racao, parametros, { dasPct: 8 });
    expect(c.regimes.map((r) => r.id).sort()).toEqual([...racao.regimes].filter((r) => r !== "produtor_pf").sort());
    expect(c.anos).toEqual([2027, 2033]);
    for (const l of c.linhas) {
      const ids = c.regimes.map((r) => r.id);
      const menor = Math.min(...ids.map((id) => l[id]));
      if (c.vencedorPorAno[l.ano] !== EMPATE) expect(l[c.vencedorPorAno[l.ano]]).toBe(menor);
    }
  });

  it("o Simples fica no DAS informado; muda o DAS, muda o resultado do Simples", () => {
    const a = compararRegimes(base, racao, parametros, { dasPct: 4 }).linhas[0].simples;
    const b = compararRegimes(base, racao, parametros, { dasPct: 12 }).linhas[0].simples;
    expect(a).toBeCloseTo(4, 1);
    expect(b).toBeCloseTo(12, 1);
  });

  it("o mapa traz um vencedor por combinação de compras e crédito", () => {
    const m = mapaDeVencedores(base, racao, parametros, { compras: [10, 90], creditos: [0, 100] });
    expect(m).toHaveLength(2);
    expect(m[0].celulas.map((c) => c.credito)).toEqual([0, 100]);
    for (const l of m) for (const c of l.celulas) expect([...racao.regimes, EMPATE]).toContain(c.vencedor);
  });

  it("respostas do perfil saem dos números: receita acima de R$ 3,6 milhões e exportação", () => {
    const pj = PERFIS.find((p) => p.id === "produtor_pj");
    expect(respostasDerivadas(pj, { faturamentoAnual: 2_000_000, exportaPct: 0 })).toMatchObject({ receita_3_6: "nao", exporta: "nao" });
    expect(respostasDerivadas(pj, { faturamentoAnual: 5_000_000, exportaPct: 10 })).toMatchObject({ receita_3_6: "sim", exporta: "sim" });
  });

  it("carga igual nos dois regimes é empate, não vitória do primeiro da lista", () => {
    const pj = PERFIS.find((p) => p.id === "produtor_pj");
    const c = compararRegimes({ ...base, faturamentoAnual: 2_000_000 }, pj, parametros, { dasPct: 8 }); // abaixo de R$ 3,6 mi: fora do IBS/CBS
    expect(c.vencedorPorAno[2033]).toBe(EMPATE);
  });

  it("as viradas listam só os anos em que o vencedor muda", () => {
    expect(viradas({ 2027: "presumido", 2028: "presumido", 2031: "real", 2033: "real" })).toEqual([{ ano: 2027, regime: "presumido" }, { ano: 2031, regime: "real" }]);
  });
});
