import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SeletorCenarioAliquotas from "./SeletorCenarioAliquotas";
import { resolverTransicao } from "@/motor/cenariosAliquota";

const linha = (ano, f, ibs, cbs, extra = {}) => ({ ano, icms_fator: f, iss_fator: f, ibs_efetivo: ibs, ibs_uf_aliquota: ibs * 0.79, ibs_mun_aliquota: ibs * 0.21, cbs_efetiva: cbs, status: "Estimativa", ...extra });
const TABELA = [linha(2026, 1, 0.001, 0.009, { status: "Oficial" }), linha(2027, 1, 0.001, 0.112, { redutor_compra_gov: 0.4416 }), linha(2029, 0.9, 0.0187, 0.0921), linha(2033, 0, 0.187, 0.0921)];

function desenhar(id) {
  const { resumo } = resolverTransicao(TABELA, { id });
  return renderToStaticMarkup(<SeletorCenarioAliquotas resumo={resumo} selecao={resumo.selecao} />);
}

describe("SeletorCenarioAliquotas", () => {
  it("no cenário padrão mostra o nome, a soma de 26,5% e o redutor repetido, sem alerta", () => {
    const html = desenhar("gatilho");
    expect(html).toContain("Cenário de alíquotas 2029–2033");
    expect(html).toContain("CBS na referência de 2027 e IBS no que falta para a soma fechar em 26,5%");
    expect(html).toContain("Não é o “Teto de Referência”");
    expect(html).toContain("CBS 11,3% + IBS 15,2% = 26,5%");
    expect(html).toContain("44,16%");
    expect(html).not.toContain('role="status"');
  });

  it("no cenário de estresse mostra o alerta do art. 475, §11, com a soma de 30,0%", () => {
    const html = desenhar("somadas");
    expect(html).toContain('role="status"');
    expect(html).toContain("30,0%");
    expect(html).toContain("art. 475, §11");
    expect(html).toContain("não como previsão");
  });

  it("no personalizado aparecem os dois campos de percentual", () => {
    const html = desenhar("personalizado");
    expect(html).toContain("CBS ref. (%)");
    expect(html).toContain("IBS cheio (%)");
  });

  it("sem resumo não desenha nada (tela ainda carregando)", () => {
    expect(renderToStaticMarkup(<SeletorCenarioAliquotas resumo={null} selecao={null} />)).toBe("");
  });
});
