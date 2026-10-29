import { describe, it, expect } from "vitest";
import { FAQ_SECOES, FAQ_ATUALIZADO_EM } from "./faqData";
import { SECAO_NOVIDADES } from "./faqAtualizacao";
import { ALIQUOTA_ESTOQUE_NACIONAL, PARCELAS_ESTOQUE } from "@/motor/creditoEstoque";
import { GATILHO_SOMA_REFERENCIA } from "@/motor/cenariosAliquota";
import { TETO_IS_BENS_MINERAIS } from "@/motor/impostoSeletivo";
import { calcIbsCbs } from "@/motor/taxEngine";

describe("FAQ do InTAX", () => {
  it("abre com as novidades da Reforma e traz as seções novas nos lugares certos", () => {
    const titulos = FAQ_SECOES.map((s) => s.titulo);
    expect(titulos[0]).toMatch(/^Novidades da Reforma/);
    expect(FAQ_ATUALIZADO_EM).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(titulos[0]).toContain(FAQ_ATUALIZADO_EM);
    const apos = (antes, depois) => expect(titulos.indexOf(depois)).toBe(titulos.indexOf(antes) + 1);
    apos("Cadastro de operações", "Importação de XML (NF-e, CT-e) e de planilhas");
    apos("Informações de DF-e", "Ferramentas abertas e consultas");
    apos("Ferramentas abertas e consultas", "Base legal, Radar e Saneamento de estoques");
  });

  it("cada item tem pergunta e resposta, e a fonte, quando existe, é texto", () => {
    for (const secao of FAQ_SECOES) {
      expect(secao.itens.length, secao.titulo).toBeGreaterThan(0);
      for (const item of secao.itens) {
        expect(typeof item.p === "string" && item.p.trim().length > 0, `${secao.titulo}: pergunta vazia`).toBe(true);
        expect(typeof item.r === "string" && item.r.trim().length > 0, `${secao.titulo}: resposta vazia em "${item.p}"`).toBe(true);
        if (item.f !== undefined) expect(typeof item.f === "string" && item.f.trim().length > 0, `fonte vazia em "${item.p}"`).toBe(true);
      }
    }
  });

  it("não repete pergunta dentro da mesma seção", () => {
    for (const secao of FAQ_SECOES) {
      const perguntas = secao.itens.map((i) => i.p.trim().toLowerCase());
      expect(new Set(perguntas).size, secao.titulo).toBe(perguntas.length);
    }
  });

  it("as respostas de novidades que trazem número, prazo ou dispositivo citam a fonte oficial", () => {
    const semFonteOk = ["O InTAX já reflete todas essas atualizações?", "Onde acompanhar os atos oficiais?"];
    for (const item of SECAO_NOVIDADES.itens) {
      if (semFonteOk.includes(item.p)) continue;
      expect(item.f, `falta a fonte em "${item.p}"`).toBeTruthy();
    }
  });

  it("não sobrou menção ao nome antigo nem à plataforma de origem", () => {
    const texto = JSON.stringify(FAQ_SECOES);
    expect(texto).not.toMatch(/Simulador FAL v0\.16/i);
    expect(texto).not.toMatch(/base44/i);
  });

  it("as respostas sobre os regimes que o motor calcula citam os mesmos números do motor", () => {
    const resposta = (trecho) => SECAO_NOVIDADES.itens.find((i) => i.p.includes(trecho))?.r || "";
    const virgula = (v, casas) => (v * 100).toFixed(casas).replace(".", ",");
    // Combustíveis: a CBS de 2027 da Portaria MF nº 3.074/2026 (mesmos valores da migração que alimenta o catálogo).
    const comb = resposta("combustíveis, inclusive o etanol");
    for (const v of ["0,7925", "0,1922", "0,3515", "0,1480", "0,1677", "0,0712", "0,3403"]) expect(comb, v).toContain(v);
    expect(comb).toContain("Portaria MF nº 3.074");
    // Crédito de estoque, gatilho de 26,5% e teto do IS de mineração.
    expect(resposta("crédito presumido de CBS sobre o estoque")).toContain(virgula(ALIQUOTA_ESTOQUE_NACIONAL, 2) + "%");
    expect(resposta("crédito presumido de CBS sobre o estoque")).toContain(String(PARCELAS_ESTOQUE));
    expect(resposta("alíquotas de 2029 a 2033")).toContain(virgula(GATILHO_SOMA_REFERENCIA, 1) + "%");
    expect(resposta("Imposto Seletivo já tem")).toContain(virgula(TETO_IS_BENS_MINERAIS, 2) + "%");
  });

  it("não diz mais que o InTAX deixa de calcular o que o motor agora calcula", () => {
    const todas = JSON.stringify(SECAO_NOVIDADES.itens.map((i) => i.r));
    expect(todas).not.toMatch(/ainda não aplica o redutor|ainda não calcula esse crédito|ainda trata combustíveis por alíquota percentual|ainda não calcula o Imposto Seletivo/i);
  });

  it("o exemplo da base de cálculo (R$ 1.000, ICMS de 18%, 2027) bate com o motor", () => {
    const resposta = SECAO_NOVIDADES.itens.find((i) => i.p.includes("base de cálculo do IBS e da CBS"))?.r || "";
    const ano2027 = { ano: 2027, pis_cofins_fator: 0, icms_fator: 1, iss_fator: 1, ibs_efetivo: 0.001, cbs_efetiva: 0.112, efeito_financeiro: 1 };
    const venda = { direcao: "Saida", valor_bruto: 1000, icms_pct: 0.18, pis_pct: 0.0165, cofins_pct: 0.076, credito_elegivel_pct: 0 };
    const com = calcIbsCbs(venda, ano2027, {}, {}, {});
    const virgula = (v) => v.toFixed(2).replace(".", ",");
    expect(com.baseCalculo).toBeCloseTo(820, 8);
    expect(resposta).toContain("R$ 820");
    expect(resposta).toContain(virgula(com.debitoIbs + com.debitoCbs)); // 92,66
    // o valor antigo, sem a exclusão: a alíquota de 11,3% sobre o valor inteiro
    expect(resposta).toContain(virgula(1000 * (0.001 + 0.112))); // 113,00
  });

  it("nenhuma resposta antiga diz que o IBS/CBS incide sobre o valor bruto inteiro (a base exclui ICMS, ISS, PIS e Cofins até 2032)", () => {
    const itens = FAQ_SECOES.flatMap((s) => s.itens);
    const velhas = itens.filter((i) => /o valor bruto é multiplicado pelas alíquotas|calculados sobre o valor bruto original|aplicados de forma simplificada sobre o valor bruto|O crédito presumido não será calculado\./i.test(i.r));
    expect(velhas.map((i) => i.p)).toEqual([]);
    const base = itens.find((i) => i.p === "As alíquotas são aplicadas sobre qual base?")?.r || "";
    expect(base).toContain("art. 12, §2º, V");
  });

  it("o crédito presumido do transportador autônomo é descrito com a fórmula, sem ressarcimento e sem o percentual de 2027", () => {
    const r = SECAO_NOVIDADES.itens.find((i) => i.p.includes("transportador autônomo de carga"))?.r || "";
    expect(r).toContain("× C ÷ (1 + C)");
    expect(r).toMatch(/não pode ser ressarcido/);
    expect(r).toMatch(/Não localizamos/);
  });
});
