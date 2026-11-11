import { describe, expect, it } from "vitest";
import { diasDeAtraso, mesesOuFracao, multaDeDeclaracao, multaDePagamento, multaEcfReal, multaPorReceita } from "./multas";

describe("contagem", () => {
  it("dias de atraso e meses-calendário ou fração a partir do dia seguinte ao prazo", () => {
    expect(diasDeAtraso("2026-11-20", "2026-11-25")).toBe(5);
    expect(diasDeAtraso("2026-11-20", "2026-11-20")).toBe(0);
    expect(mesesOuFracao("2026-11-15", "2026-11-16")).toBe(1);
    expect(mesesOuFracao("2026-11-15", "2026-12-15")).toBe(1);
    expect(mesesOuFracao("2026-11-15", "2026-12-16")).toBe(2);
    expect(mesesOuFracao("2026-11-15", "2026-11-15")).toBe(0);
  });
});

describe("multas", () => {
  it("pagamento: 0,33% ao dia até 20%; juros só com a Selic informada (+1% no mês do pagamento)", () => {
    const a = multaDePagamento({ valor: 10_000, vencimento: "2026-10-20", pagamento: "2026-10-30" });
    expect(a).toMatchObject({ dias: 10, multa: 330, jurosPct: 0 });
    const b = multaDePagamento({ valor: 10_000, vencimento: "2026-01-20", pagamento: "2026-11-10", selicAcumuladaPct: 9 });
    expect(b.multa).toBe(2000); // limitada a 20%
    expect(b).toMatchObject({ jurosPct: 10, juros: 1000, total: 13000 });
    expect(multaDePagamento({ valor: 100, vencimento: "2026-01-20", pagamento: "2026-03-10" }).juros).toBeNull();
  });
  it("DCTFWeb: 2% ao mês até 20%, reduções e mínimos (sem movimento, porte)", () => {
    expect(multaDeDeclaracao({ tipo: "dctfweb", tributos: 100_000, prazo: "2026-01-30", entrega: "2026-04-05" }).multa).toBe(6000); // 3 meses
    expect(multaDeDeclaracao({ tipo: "dctfweb", tributos: 100_000, prazo: "2026-01-30", entrega: "2026-04-05", reducao: "espontanea" }).multa).toBe(3000);
    expect(multaDeDeclaracao({ tipo: "dctfweb", tributos: 1000, prazo: "2026-01-30", entrega: "2026-02-05" }).multa).toBe(500);
    expect(multaDeDeclaracao({ tipo: "dctfweb", tributos: 0, prazo: "2026-01-30", entrega: "2026-02-05", semMovimento: true }).multa).toBe(200);
    expect(multaDeDeclaracao({ tipo: "dctfweb", tributos: 0, prazo: "2026-01-30", entrega: "2026-02-05", porte: "MEI" }).multa).toBe(50);
    expect(multaDeDeclaracao({ tipo: "dctfweb", tributos: 1000, prazo: "2026-01-30", entrega: "2026-01-30" }).multa).toBe(0);
  });
  it("PGDAS-D e DASN-SIMEI: mínimo de R$ 50; DEFIS: R$ 200", () => {
    expect(multaDeDeclaracao({ tipo: "pgdas", tributos: 500, prazo: "2026-10-20", entrega: "2026-11-05" }).multa).toBe(50);
    expect(multaDeDeclaracao({ tipo: "defis", tributos: 1000, prazo: "2026-03-31", entrega: "2026-04-10" }).multa).toBe(200);
  });
  it("ECD/EFD-Contribuições: 0,02% ao dia da receita, até 1%", () => {
    expect(multaPorReceita({ receita: 10_000_000, prazo: "2026-06-30", entrega: "2026-07-10" }).multa).toBe(20000);
    expect(multaPorReceita({ receita: 10_000_000, prazo: "2026-06-30", entrega: "2026-12-31" }).multa).toBe(100000);
  });
  it("ECF do Lucro Real: 0,25% ao mês do lucro, teto e a maior redução", () => {
    const r = multaEcfReal({ lucro: 2_000_000, receitaAnoAnterior: 10_000_000, prazo: "2026-07-31", entrega: "2026-12-10" });
    expect(r).toMatchObject({ meses: 5, multa: 25000 });
    expect(multaEcfReal({ lucro: 2_000_000, receitaAnoAnterior: 10_000_000, prazo: "2026-07-31", entrega: "2026-08-20" }).multa).toBe(500); // até 30 dias: paga 10%
    expect(multaEcfReal({ lucro: 900_000_000, receitaAnoAnterior: 3_000_000, prazo: "2025-07-31", entrega: "2026-12-10" }).multa).toBe(100000);
  });
});
