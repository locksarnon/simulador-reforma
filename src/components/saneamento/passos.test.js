import { describe, expect, it } from "vitest";
import { PASSO, TOTAL_PASSOS, VERSAO_PASSOS, migrarPassos, passoDoProjeto } from "./passos";

describe("passos do projeto de saneamento", () => {
  it("os passos são numerados de 0 ao último, sem repetir; Critérios e Análises viraram o passo Checagens", () => {
    expect(Object.values(PASSO)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]); expect(TOTAL_PASSOS).toBe(Object.keys(PASSO).length);
    expect(PASSO).toMatchObject({ TRIAGEM: 0, CHECAGENS: 1, PILOTO: 2, DEPARA: 3, EXECUCAO: 4, CONFERENCIA: 5, FISCAL: 6, POLITICA: 7 });
  });
  it("projeto salvo com a numeração antiga (sem versaoPassos) é convertido: Critérios e Análises vão para Checagens e os seguintes sobem uma casa", () => {
    // antigos: 0 Triagem, 1 Critérios, 2 Piloto SAP, 3 Análises, 4 De/para, 5 Execução, 6 Conferência, 7 Fiscal, 8 Política
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((passo) => passoDoProjeto({ passo }))).toEqual([PASSO.TRIAGEM, PASSO.CHECAGENS, PASSO.PILOTO, PASSO.CHECAGENS, PASSO.DEPARA, PASSO.EXECUCAO, PASSO.CONFERENCIA, PASSO.FISCAL, PASSO.POLITICA]);
    expect(passoDoProjeto({ passo: 4, versaoPassos: 1 })).toBe(PASSO.DEPARA);
  });
  it("projeto já na numeração nova mantém o passo; valor fora do intervalo ou inválido não quebra a tela", () => {
    expect(passoDoProjeto({ passo: 4, versaoPassos: VERSAO_PASSOS })).toBe(4); expect(passoDoProjeto({ passo: 7, versaoPassos: VERSAO_PASSOS })).toBe(7);
    expect(passoDoProjeto({ passo: 99, versaoPassos: VERSAO_PASSOS })).toBe(7); // limita ao último passo
    expect(passoDoProjeto({ passo: -1, versaoPassos: VERSAO_PASSOS })).toBe(0); expect(passoDoProjeto({ passo: "x", versaoPassos: VERSAO_PASSOS })).toBe(0); expect(passoDoProjeto({ versaoPassos: VERSAO_PASSOS })).toBe(0);
    expect(passoDoProjeto({ passo: 99 })).toBe(0); expect(passoDoProjeto({ passo: 1.5 })).toBe(0); expect(passoDoProjeto(null)).toBe(0); expect(passoDoProjeto(undefined)).toBe(0); // antigo e inválido: volta à Triagem
  });
  it("migrarPassos devolve o passo convertido com a versão nova e não converte duas vezes", () => {
    const antigo = { passo: 4 }; const novo = migrarPassos(antigo);
    expect(novo).toEqual({ passo: PASSO.DEPARA, versaoPassos: VERSAO_PASSOS }); expect(antigo).toEqual({ passo: 4 }); // não altera o recebido
    expect(migrarPassos({ ...antigo, ...novo })).toEqual(novo); // já convertido: o mesmo passo
    expect(migrarPassos({})).toEqual({ passo: 0, versaoPassos: VERSAO_PASSOS });
  });
});
