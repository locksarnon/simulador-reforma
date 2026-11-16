import { describe, expect, it } from "vitest";
import { POPS } from "./index";
import { AREAS, MODULOS, moduloPorId } from "@/lib/navegacao";

const TECNICOS = new Set(["roteiro-testes", "arquitetura"]);
const areaOculta = new Set(AREAS.filter((a) => a.oculto).map((a) => a.id));

describe("manual em POP", () => {
  it("toda tela do menu tem ao menos um POP (exceto as técnicas e as da área oculta)", () => {
    const semPop = MODULOS.filter((m) => !m.oculto && !TECNICOS.has(m.id) && !areaOculta.has(m.area) && !m.externo)
      .filter((m) => !POPS.some((p) => p.modulo === m.id)).map((m) => m.id);
    expect(semPop).toEqual([]);
  });

  it("cada POP tem código único, tela existente, objetivo, responsável, quando, caminho e ao menos 3 passos", () => {
    const codigos = POPS.map((p) => p.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const p of POPS) {
      expect(moduloPorId(p.modulo), `${p.codigo}: tela ${p.modulo}`).toBeTruthy();
      expect(p.codigo).toMatch(/^POP-[A-Z]{3}-\d{2}$/);
      for (const campo of ["titulo", "objetivo", "quem", "quando", "caminho"]) expect(String(p[campo] || "").trim(), `${p.codigo}: ${campo}`).not.toBe("");
      expect(p.passos.length, `${p.codigo}: passos`).toBeGreaterThanOrEqual(3);
      for (const passo of p.passos) expect(String(passo.acao || "").trim(), `${p.codigo}: passo vazio`).not.toBe("");
    }
  });

  it("sem termos internos de programação no texto", () => {
    const proibidos = /\b(endpoint|backend|frontend|componente|query|cron|api\/v1|prisma|json)\b/i;
    const achados = POPS.filter((p) => proibidos.test(JSON.stringify(p))).map((p) => p.codigo);
    expect(achados).toEqual([]);
  });
});
