import { describe, it, expect } from "vitest";
import { estaVigente, escolherVigente, agruparPorCodigo } from "./vigencia";

describe("estaVigente", () => {
  it("sem datas, é sempre vigente", () => {
    expect(estaVigente({}, new Date("2026-01-01"))).toBe(true);
  });

  it("respeita início e fim", () => {
    const row = { vigencia_inicio: "2026-01-01", vigencia_fim: "2026-12-31" };
    expect(estaVigente(row, new Date("2025-12-31"))).toBe(false);
    expect(estaVigente(row, new Date("2026-06-01"))).toBe(true);
    expect(estaVigente(row, new Date("2027-01-01"))).toBe(false);
  });
});

describe("escolherVigente", () => {
  it("escolhe a versão vigente na data da operação, não a primeira que existir no cadastro", () => {
    const antiga = { versao: "antiga", vigencia_inicio: "2026-01-01", vigencia_fim: "2026-12-31" };
    const nova = { versao: "nova", vigencia_inicio: "2027-01-01", vigencia_fim: null };
    expect(escolherVigente([antiga, nova], new Date("2026-06-01"))?.versao).toBe("antiga");
    expect(escolherVigente([antiga, nova], new Date("2027-06-01"))?.versao).toBe("nova");
  });

  it("retorna undefined se nada estava vigente na data (motor deve tratar como 'Pendente', não travar)", () => {
    const antiga = { vigencia_fim: "2025-12-31" };
    expect(escolherVigente([antiga], new Date("2026-06-01"))).toBeUndefined();
  });
});

describe("agruparPorCodigo", () => {
  it("agrupa linhas repetidas do mesmo código", () => {
    const grouped = agruparPorCodigo([{ c: "A" }, { c: "A" }, { c: "B" }], (r) => r.c);
    expect(grouped.get("A")).toHaveLength(2);
  });
});
