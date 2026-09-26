import { describe, expect, it, vi } from "vitest";

const chamadas = { textos: [], salvo: null, paginas: 1 };

vi.mock("jspdf", () => ({
  jsPDF: class {
    setFont() {} setFontSize() {} setTextColor() {} setDrawColor() {} setFillColor() {} line() {} rect() {}
    text(t) { chamadas.textos.push(String(t)); }
    splitTextToSize(t) { return [String(t)]; }
    addPage() { chamadas.paginas += 1; }
    save(n) { chamadas.salvo = n; }
  },
}));

const { gerarRelatorioSimulacao } = await import("./pdfReport");

const consolidado = [2026, 2027, 2033].map((ano, i) => ({
  ano, valorBruto: 1000000 * (i + 1), tributosAtuaisLiquidos: 200000, ibsCbsLiquido: 90000, cargaTransicao: 250000,
  debitoIbs: 5000, debitoCbs: 92000, creditoIbs: 1000, creditoCbs: 8000, credPresTotal: 0,
  margemAtual: 300000, margemTransicao: 280000, splitRetido: 0, funding: 0,
}));
const totais = { valorBruto: 6e6, tributosAtuais: 6e5, cargaTransicao: 7.5e5, ibsCbs: 2.7e5, debitoIbs: 1.5e4, debitoCbs: 2.76e5, creditoIbs: 3e3, creditoCbs: 2.4e4, credPres: 1200, split: 0, funding: 0, margemAtual: 9e5, margemTransicao: 8.4e5 };
const transicao = Array.from({ length: 8 }, (_, i) => ({ ano: 2026 + i, pis_cofins_fator: i === 0 ? 1 : 0, icms_fator: 1, iss_fator: 1, ipi_fator_geral: 1, ibs_efetivo: 0.001 * (i + 1), cbs_efetiva: 0.0921, efeito_financeiro: 0 }));

describe("PDF do Painel Executivo", () => {
  it("traz o cronograma 2026–2033 completo, débitos/créditos e as ressalvas", () => {
    const nome = gerarRelatorioSimulacao({ totais, consolidado, versaoMotor: "t", versaoRegras: "t", grupoNome: "Grupo", transicaoAnos: transicao, ressalvas: ["Crédito presumido: percentuais definidos anualmente (LC 214, art. 168, §4º)."] });
    expect(nome).toMatch(/^simulacao-fal-\d{4}-\d{2}-\d{2}\.pdf$/);
    const tudo = chamadas.textos.join("|");
    for (const ano of ["2026", "2027", "2028", "2029", "2030", "2031", "2032", "2033"]) expect(tudo).toContain(ano);
    expect(tudo).toContain("Déb. IBS");
    expect(tudo).toContain("Crédito presumido");
    expect(tudo).toContain("art. 168");
    expect(tudo).toContain("arts. 31 a 35");
  });

  it("anos do cronograma sem operação aparecem com traço, não somem", () => {
    const traços = chamadas.textos.filter((t) => t === "—").length;
    expect(traços).toBeGreaterThan(10);
  });
});
