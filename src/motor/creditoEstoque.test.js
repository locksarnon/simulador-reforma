import { describe, it, expect } from "vitest";
import {
  ALIQUOTA_ESTOQUE_NACIONAL, DESTINOS_ESTOQUE, HIPOTESES_ESTOQUE, PARCELAS_ESTOQUE,
  calcCreditoEstoque, creditoDoItem, motivoDeInelegibilidade,
} from "./creditoEstoque.js";

const item = (extra = {}) => ({ descricao: "Peças", origem: "nacional", valor: 1_000_000, hipotese: "II", destino: "revenda", ...extra });

describe("parâmetros da lei", () => {
  it("9,25% sobre o estoque nacional e 12 parcelas (LC 214, art. 381, §§ 3º e 4º)", () => {
    expect(ALIQUOTA_ESTOQUE_NACIONAL).toBe(0.0925);
    expect(PARCELAS_ESTOQUE).toBe(12);
  });
  it("as três hipóteses do art. 381 mais a opção 'nenhuma'", () => {
    expect(HIPOTESES_ESTOQUE.map((h) => h.id)).toEqual(["I", "II", "III", "nenhuma"]);
  });
  it("só revenda, produção e serviços geram o crédito", () => {
    expect(DESTINOS_ESTOQUE.filter((d) => d.elegivel).map((d) => d.id)).toEqual(["revenda", "producao", "servicos"]);
  });
});

describe("elegibilidade por item", () => {
  it("item nacional em hipótese II, para revenda, é elegível", () => {
    expect(motivoDeInelegibilidade(item())).toBeNull();
  });
  it.each([
    [{ destino: "uso_consumo" }, "uso e consumo"],
    [{ destino: "imobilizado" }, "imobilizado"],
    [{ destino: "imovel" }, "Imóvel"],
    [{ bemUsado: true }, "novos"],
    [{ bemDeTerceiros: true }, "terceiros"],
    [{ compradoDePessoaFisica: true }, "pessoa jurídica"],
    [{ aquisicaoSemPisCofins: true }, "alíquota zero"],
    [{ hipotese: "nenhuma" }, "Fora das hipóteses"],
    [{ hipotese: "" }, "Fora das hipóteses"],
    [{ destino: "" }, "destino"],
    [{ valor: 0 }, "custo de aquisição"],
  ])("%j fica de fora (%s)", (extra, trecho) => {
    expect(motivoDeInelegibilidade(item(extra))).toContain(trecho);
  });
  it("hipótese I exige ter estado no regime cumulativo em 31/12/2026", () => {
    expect(motivoDeInelegibilidade(item({ hipotese: "I" }), { cumulativoEm31122026: false })).toContain("cumulativo");
    expect(motivoDeInelegibilidade(item({ hipotese: "I" }), { cumulativoEm31122026: true })).toBeNull();
    expect(motivoDeInelegibilidade(item({ hipotese: "I" }), { cumulativoEm31122026: null })).toBeNull();
  });
  it("quem não está no regime regular da CBS não apropria", () => {
    expect(motivoDeInelegibilidade(item(), { regimeRegular: false })).toContain("regime regular");
  });
  it("importação exige o PIS/Cofins-Importação pago", () => {
    expect(motivoDeInelegibilidade(item({ origem: "importado", valor: 0 }))).toContain("PIS/Cofins-Importação");
    expect(motivoDeInelegibilidade(item({ origem: "importado", valor: 0, pisCofinsImportacaoPago: 5000 }))).toBeNull();
  });
});

describe("valor do crédito", () => {
  it("nacional: 9,25% do valor do estoque", () => {
    expect(creditoDoItem(item())).toBeCloseTo(92_500, 8);
  });
  it("importado: o PIS/Cofins-Importação efetivamente pago, não 9,25%", () => {
    expect(creditoDoItem(item({ origem: "importado", valor: 1_000_000, pisCofinsImportacaoPago: 5000 }))).toBe(5000);
  });
});

describe("calcCreditoEstoque", () => {
  it("soma só os itens elegíveis e separa o que ficou de fora, com o motivo", () => {
    const r = calcCreditoEstoque([item(), item({ valor: 200_000, destino: "imobilizado" }), item({ origem: "importado", valor: 0, pisCofinsImportacaoPago: 5000 })]);
    expect(r.total).toBeCloseTo(97_500, 2);
    expect(r.valorElegivel).toBe(1_000_000);
    expect(r.valorFora).toBe(200_000);
    expect(r.linhas[1].elegivel).toBe(false);
    expect(r.linhas[1].motivo).toContain("imobilizado");
  });

  it("12 parcelas mensais a partir do mês seguinte à apropriação, somando exatamente o total", () => {
    const r = calcCreditoEstoque([item()], { mesApropriacao: "2027-06" });
    expect(r.cronograma).toHaveLength(12);
    expect(r.cronograma[0].mes).toBe("2027-07");
    expect(r.cronograma[11].mes).toBe("2028-06");
    expect(r.parcelaMensal).toBeCloseTo(7708.33, 2);
    expect(r.cronograma.reduce((s, p) => s + p.parcela, 0)).toBeCloseTo(92_500, 2);
  });

  it("apropriar em janeiro de 2027 começa as parcelas em fevereiro", () => {
    const r = calcCreditoEstoque([item()], { mesApropriacao: "2027-01" });
    expect(r.cronograma[0].mes).toBe("2027-02");
    expect(r.cronograma[11].mes).toBe("2028-01");
  });

  it("depois de junho de 2027 não pode: o motor trava em 2027-06 e avisa", () => {
    const r = calcCreditoEstoque([item()], { mesApropriacao: "2027-09" });
    expect(r.mesApropriacao).toBe("2027-06");
    expect(r.avisos.join(" ")).toContain("junho de 2027");
  });

  it("o direito de usar vence 5 anos depois do último dia do período da apropriação (art. 383)", () => {
    expect(calcCreditoEstoque([item()], { mesApropriacao: "2027-06" }).venceEm).toBe("2032-06-30");
    expect(calcCreditoEstoque([item()], { mesApropriacao: "2027-02" }).venceEm).toBe("2032-02-28");
  });

  it("com a CBS mensal informada, abate da CBS e carrega o saldo para os meses seguintes", () => {
    const r = calcCreditoEstoque([item()], { mesApropriacao: "2027-06", cbsMensal: 5000 });
    expect(r.cronograma[0].compensado).toBe(5000);
    expect(r.cronograma[0].cbsLiquida).toBe(0);
    expect(r.cronograma[0].saldoAposCompensar).toBeCloseTo(2708.34, 2); // 1ª parcela de R$ 7.708,34 − R$ 5.000
    expect(r.compensadoNoCronograma + r.saldoNaoCompensado).toBeCloseTo(92_500, 2);
    expect(r.saldoNaoCompensado).toBeGreaterThan(0);
    expect(r.avisos.join(" ")).toContain("art. 383");
  });

  it("com CBS mensal grande, usa tudo nas 12 parcelas e não sobra saldo", () => {
    const r = calcCreditoEstoque([item()], { cbsMensal: 50_000 });
    expect(r.saldoNaoCompensado).toBe(0);
    expect(r.compensadoNoCronograma).toBeCloseTo(92_500, 2);
  });

  it("sem itens, tudo zerado", () => {
    const r = calcCreditoEstoque([]);
    expect(r.total).toBe(0);
    expect(r.cronograma.every((p) => p.parcela === 0)).toBe(true);
  });

  it("Simples fora do regime regular não gera crédito algum", () => {
    expect(calcCreditoEstoque([item()], { regimeRegular: false }).total).toBe(0);
  });
});

describe("aquisição de pessoa física e ordem dos motivos (art. 381, §1º)", () => {
  it("compra de pessoa física (ex.: produtor rural PF) não gera o crédito, e o motivo cita o inciso I", () => {
    const m = motivoDeInelegibilidade(item({ compradoDePessoaFisica: true }));
    expect(m).toContain("pessoa jurídica");
    expect(m).toContain("art. 381, §1º, I");
    expect(calcCreditoEstoque([item({ compradoDePessoaFisica: true })]).total).toBe(0);
  });
  it("o mesmo bem importado não é compra de pessoa física no País: a marca é ignorada", () => {
    expect(motivoDeInelegibilidade(item({ origem: "importado", valor: 0, pisCofinsImportacaoPago: 5000, compradoDePessoaFisica: true }))).toBeNull();
  });
  it("com mais de um impedimento, o motivo mostrado segue o texto do §1º: I (novo, pessoa jurídica), II (PIS/Cofins), depois III e IV (destino)", () => {
    expect(motivoDeInelegibilidade(item({ destino: "imobilizado", aquisicaoSemPisCofins: true }))).toContain("§1º, II");
    expect(motivoDeInelegibilidade(item({ destino: "uso_consumo", compradoDePessoaFisica: true }))).toContain("§1º, I");
    expect(motivoDeInelegibilidade(item({ destino: "imobilizado", bemUsado: true }))).toContain("§1º, I");
  });
});

describe("parcelas em centavos inteiros", () => {
  const somaCentavos = (r) => r.cronograma.reduce((s, p) => s + Math.round(p.parcela * 100), 0);

  it("fecha o total exato e nenhuma parcela difere de outra em mais de um centavo, para muitos valores", () => {
    for (let i = 0; i < 400; i += 1) {
      const valor = 1000 + i * 7919 + (i % 100) / 100; // valores com centavos variados
      const r = calcCreditoEstoque([item({ valor })]);
      expect(somaCentavos(r), `valor ${valor}`).toBe(Math.round(r.total * 100));
      const centavos = r.cronograma.map((p) => Math.round(p.parcela * 100));
      expect(Math.max(...centavos) - Math.min(...centavos), `valor ${valor}`).toBeLessThanOrEqual(1);
    }
  });
  it("R$ 92.500,00 em 12 vezes: quatro parcelas de R$ 7.708,34 e oito de R$ 7.708,33", () => {
    const r = calcCreditoEstoque([item()]);
    expect(r.cronograma.filter((p) => p.parcela === 7708.34)).toHaveLength(4);
    expect(r.cronograma.filter((p) => p.parcela === 7708.33)).toHaveLength(8);
    expect(r.parcelaMensal).toBe(7708.33);
  });
  it("total que divide por 12 não deixa centavo solto (R$ 120,00 → 12 × R$ 10,00)", () => {
    const r = calcCreditoEstoque([item({ origem: "importado", valor: 0, pisCofinsImportacaoPago: 120 })]);
    expect(r.cronograma.every((p) => p.parcela === 10)).toBe(true);
  });
});
