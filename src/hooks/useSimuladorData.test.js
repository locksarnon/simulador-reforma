import { describe, it, expect } from "vitest";
import { calcularOperacoes } from "./useSimuladorData";
import { agruparPorCodigo } from "@/lib/vigencia";
import { chaveCredPres } from "@/motor/taxEngine";

/**
 * A cola entre o catálogo de cCredPres e o motor: o XML do DF-e traz o código com dois dígitos ("02") e a tabela oficial
 * lista "2". Os dois têm que cair no mesmo registro, senão o crédito presumido some em silêncio.
 */
const ano2027 = { ano: 2027, pis_cofins_fator: 0, ipi_fator_geral: 0, icms_fator: 1, iss_fator: 1, ibs_efetivo: 0.001, cbs_efetiva: 0.112, ibs_uf_aliquota: 0, ibs_mun_aliquota: 0, efeito_financeiro: 1 };
const transicaoMap = new Map([[2027, ano2027]]);
const registro = (codigo) => ({ c_cred_pres: codigo, ibs_aplicavel: "Sim", cbs_aplicavel: "Sim", metodo_calculo: "Por Fora", percentual_oficial: "Pendente de regulamentação", status: "Ativo" });
// Igual ao useSimuladorData: o catálogo é agrupado pela chave normalizada do código.
const agrupar = (lista) => agruparPorCodigo(lista, (c) => chaveCredPres(c.c_cred_pres));
const compra = (codigo) => ({ id_operacao: "OP-1", empresa_id: "E1", ano: 2027, direcao: "Entrada", valor_bruto: 1000, credito_elegivel_pct: 1, c_cred_pres: codigo, credito_presumido_cbs_pct: 0.02 });
const calcular = (op, catalogo) => calcularOperacoes([op], transicaoMap, new Map(), agrupar(catalogo), {}, {})[0];

describe("calcularOperacoes: crédito presumido do catálogo", () => {
  it.each(["2", "02", " 02 ", 2])("o código %j acha o registro cadastrado como '02' e calcula o crédito", (codigo) => {
    const r = calcular(compra(codigo), [registro("02")]);
    expect(r.ibsCbs.credPresCbs).toBeCloseTo((1000 * 0.02) / 1.02, 8);
    expect(r.ibsCbs.statusCredPres).toBe("Estimativa");
    expect(r.ibsCbs.creditoCbs).toBe(0); // o fornecedor não cobrou CBS na nota
  });

  it("registro cadastrado como '2' também é achado pelo código '02' do XML", () => {
    const r = calcular(compra("02"), [registro("2")]);
    expect(r.ibsCbs.credPresCbs).toBeCloseTo((1000 * 0.02) / 1.02, 8);
  });

  it("código fora do catálogo: 'Não localizado', sem crédito presumido e o crédito normal fica como era", () => {
    const r = calcular(compra("99"), [registro("02")]);
    expect(r.ibsCbs.statusCredPres).toBe("Não localizado");
    expect(r.ibsCbs.credPresTotal).toBe(0);
    expect(r.ibsCbs.creditoCbs).toBeCloseTo(1000 * 0.112, 8);
  });

  it("sem código a operação segue o caminho de sempre", () => {
    const r = calcular(compra(""), [registro("02")]);
    expect(r.ibsCbs.statusCredPres).toBe("Não informado");
    expect(r.ibsCbs.creditoCbs).toBeCloseTo(1000 * 0.112, 8);
  });
});
