import { describe, expect, it } from "vitest";
import { FUNDAMENTOS } from "./fundamentosLegais";
// O servidor guarda um espelho das ligações (chave, título e dispositivos) para devolver à revisão as notas cujo
// artigo mudou. Este teste falha se o espelho e a lista da tela divergirem.
import { FUNDAMENTOS_CALCULO } from "../../backend/src/base-legal/fundamentos-calculo";

describe("fundamentos legais do cálculo", () => {
  it("o espelho do servidor tem as mesmas notas, títulos e dispositivos da tela", () => {
    expect(FUNDAMENTOS_CALCULO.map((f) => f.chave).sort()).toEqual(Object.keys(FUNDAMENTOS).sort());
    for (const espelho of FUNDAMENTOS_CALCULO) {
      const tela = FUNDAMENTOS[espelho.chave];
      expect(espelho.titulo, espelho.chave).toBe(tela.titulo);
      expect(espelho.refs, espelho.chave).toEqual(tela.refs);
    }
  });

  it("toda nota tem título, explicação e ao menos um dispositivo", () => {
    for (const [chave, f] of Object.entries(FUNDAMENTOS)) {
      expect(f.titulo.length, chave).toBeGreaterThan(3);
      expect(f.nota.length, chave).toBeGreaterThan(20);
      expect(f.refs.length, chave).toBeGreaterThan(0);
    }
  });
});
