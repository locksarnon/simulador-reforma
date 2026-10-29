import { describe, it, expect } from "vitest";
import {
  OPCOES_INICIAIS, colunasRepetidas, faltaIndicar, mapeamentoParaEnvio, opcoesParaEnvio, podeConferir, rotuloDoCampo,
} from "./planilhaOperacoes";

const completo = { data: 1, valor_bruto: 3, empresa: 0, direcao: 2, icms_pct: null };

describe("o que falta indicar antes de conferir", () => {
  it("com os quatro campos essenciais mapeados, pode conferir", () => {
    expect(faltaIndicar(completo, OPCOES_INICIAIS)).toEqual([]);
    expect(podeConferir(completo, OPCOES_INICIAIS)).toBe(true);
  });

  it("data e valor sempre exigem coluna", () => {
    expect(faltaIndicar({ ...completo, data: null }, OPCOES_INICIAIS)).toEqual(["data"]);
    expect(faltaIndicar({ ...completo, valor_bruto: undefined }, OPCOES_INICIAIS)).toEqual(["valor_bruto"]);
  });

  it("empresa e direção podem vir da tela, para todas as linhas", () => {
    const semColunas = { data: 0, valor_bruto: 1 };
    expect(faltaIndicar(semColunas, OPCOES_INICIAIS)).toEqual(["empresa", "direcao"]);
    expect(faltaIndicar(semColunas, { ...OPCOES_INICIAIS, empresaPadrao: "TRANSP-01", direcaoPadrao: "Entrada" })).toEqual([]);
  });

  it("o índice 0 conta como coluna indicada (a primeira coluna da planilha)", () => {
    expect(faltaIndicar({ ...completo, empresa: 0 }, OPCOES_INICIAIS)).toEqual([]);
  });
});

describe("coluna usada por mais de um campo", () => {
  it("é detectada e impede a conferência", () => {
    const repetido = { ...completo, icms_pct: 3 };
    expect(colunasRepetidas(repetido)).toEqual([3]);
    expect(podeConferir(repetido, OPCOES_INICIAIS)).toBe(false);
  });
  it("campos sem coluna não contam como repetidos", () => {
    expect(colunasRepetidas({ a: null, b: null, c: "", d: undefined })).toEqual([]);
  });
});

describe("o que vai para o backend", () => {
  it("mapeamento: índices inteiros ou null (o Select da tela devolve texto)", () => {
    expect(mapeamentoParaEnvio({ data: "1", valor_bruto: 3, ncm: "", cfop_servico: null })).toEqual({ data: 1, valor_bruto: 3, ncm: null, cfop_servico: null });
  });

  it("opções: vazio vira null, crédito de compras vira fração e zero vira null", () => {
    expect(opcoesParaEnvio({})).toEqual({
      empresaPadrao: null, direcaoPadrao: null, tipoPadrao: "Mercadoria", unidadePct: "pontos", preencherTributos: true, creditoElegivelCompras: null, grupoId: null,
    });
    expect(opcoesParaEnvio({ empresaPadrao: "TRANSP-01", direcaoPadrao: "Entrada", tipoPadrao: "Servico", unidadePct: "fracao", preencherTributos: false, creditoElegivelCompras: 1, grupoId: "g-1" }))
      .toEqual({ empresaPadrao: "TRANSP-01", direcaoPadrao: "Entrada", tipoPadrao: "Servico", unidadePct: "fracao", preencherTributos: false, creditoElegivelCompras: 1, grupoId: "g-1" });
  });

  it("rótulo do campo vem da lista da prévia, com o id como reserva", () => {
    expect(rotuloDoCampo([{ id: "data", rotulo: "Data da operação" }], "data")).toBe("Data da operação");
    expect(rotuloDoCampo([], "x")).toBe("x");
    expect(rotuloDoCampo(undefined, "y")).toBe("y");
  });
});
