import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ConferenciaOficial, { compararComMotor, pedidoDeConferencia } from "./ConferenciaOficial";

const ANO = { ano: 2029, cbs_efetiva: 0.0921, ibs_uf_aliquota: 0.01477, ibs_mun_aliquota: 0.00393, pis_cofins_fator: 0, icms_fator: 0.9, iss_fator: 0.9 };
const CALC = (extra = {}, ib = {}) => ({ op: { direcao: "Saida", valor_bruto: 1000, ano: 2029, icms_pct: 0.18, pis_pct: 0.0165, cofins_pct: 0.076, ncm: "84714900", ...extra }, ibsCbs: { baseCalculo: 838, debitoCbs: 77.18, debitoIbs: 15.67, ...ib } });
const CT = { c_class_trib: "000001", cst: "000" };

describe("conferência da operação com a calculadora oficial", () => {
  it("o pedido leva os fatores do ano e as alíquotas em pontos percentuais", () => {
    const p = pedidoDeConferencia(CALC(), ANO, CT);
    expect(p).toMatchObject({ ano: 2029, cst: "000", cClassTrib: "000001", valorBruto: 1000, semAlcance: null, fatores: { pisCofins: 0, icms: 0.9, iss: 0.9 } });
    expect(p.aliquotas.cbs).toBeCloseTo(9.21, 4);
    expect(p.aliquotas.ibsUf).toBeCloseTo(1.477, 4);
  });
  it("casos que a calculadora não cobre voltam com o motivo (entrada, combustível, Imposto Seletivo, compra governamental, suspensão)", () => {
    expect(pedidoDeConferencia(CALC({ direcao: "Entrada" }), ANO, CT).semAlcance).toMatch(/saídas/);
    expect(pedidoDeConferencia(CALC(), ANO, CT).semAlcance).toBeNull();
    expect(pedidoDeConferencia(CALC({}, { combustivel: { aplicavel: true } }), ANO, CT).semAlcance).toMatch(/Combustível/);
    expect(pedidoDeConferencia(CALC({ is_pct: 0.2 }), ANO, CT).semAlcance).toMatch(/Imposto Seletivo/);
    expect(pedidoDeConferencia(CALC({ compra_governamental_informado: "Sim" }), ANO, CT).semAlcance).toMatch(/órgão público/);
    expect(pedidoDeConferencia(CALC({}, { naoRecolhido: "Suspensão" }), ANO, CT).semAlcance).toMatch(/Suspensão/);
  });
  it("compara base, CBS e IBS com tolerância de 1 centavo", () => {
    expect(compararComMotor({ baseCalculo: 838, debitoCbs: 77.18, debitoIbs: 15.67 }, { vBC: 838, vCBS: 77.19, vIBS: 15.67 }).confere).toBe(true);
    const r = compararComMotor({ baseCalculo: 1000, debitoCbs: 92.1, debitoIbs: 18.7 }, { vBC: 838, vCBS: 77.18, vIBS: 15.67 });
    expect(r.confere).toBe(false);
    expect(r.linhas[0]).toEqual({ rotulo: "Base de cálculo", motor: 1000, oficial: 838 });
  });
  it("renderiza o selo, a divergência e o motivo quando fora do alcance", () => {
    const render = (dados, calc = CALC()) => {
      const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
      qc.setQueryData(["conferir-operacao", pedidoDeConferencia(calc, ANO, CT)], dados);
      return renderToString(<QueryClientProvider client={qc}><ConferenciaOficial calc={calc} anoParams={ANO} classTrib={CT} /></QueryClientProvider>).replace(/<!-- -->/g, "");
    };
    const versao = { versaoApp: "1.6.1", versaoDb: "V0059" };
    expect(render({ estado: "COMPARAVEL", versao, oficial: { vBC: 838, vCBS: 77.18, vIBS: 15.67 }, erros: [] })).toContain("Conferido com a calculadora oficial da Receita (calculadora 1.6.1, banco V0059).");
    const div = render({ estado: "COMPARAVEL", versao, oficial: { vBC: 700, vCBS: 77.18, vIBS: 15.67 }, erros: [] });
    expect(div).toContain("Diverge da calculadora oficial da Receita");
    expect(div).toContain("Base de cálculo: motor");
    expect(render({ estado: "FORA_DO_ALCANCE", motivo: "A calculadora oficial ainda não calcula esta classificação.", erros: [], versao })).toContain("ainda não calcula esta classificação");
  });
});
