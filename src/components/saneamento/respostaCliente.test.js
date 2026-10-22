import { describe, expect, it } from "vitest";
import { aplicarRespostas, interpretarResposta, lerCsv, linhasListaCliente, mapearColunasResposta } from "./respostaCliente";
import { abreviacoesAprovadas, descobrirAbreviacoes, padronizarDescricao } from "./logica";

const it1 = (linha, codigo, descricao, extra = {}) => ({ linha, codigo, descricao, grupo_atual: "Peças", unidade: "UN", problemas: [], ...extra });

describe("sugestão de padronização (só sugere)", () => {
  it("espaços, parênteses de referência, unidade colada e caixa alta", () => {
    expect(padronizarDescricao("Anel  trava  1440478X1 ").sugerida).toBe("ANEL TRAVA 1440478X1");
    expect(padronizarDescricao("FILTRO AR CONDICIONADO G (11186)").sugerida).toBe("FILTRO AR CONDICIONADO G 11186");
    expect(padronizarDescricao("CHAVE COMBINADA 16 MM").sugerida).toBe("CHAVE COMBINADA 16MM");
    expect(padronizarDescricao("CAMISETE 1426 M.L GG").mudou).toBe(false);
    expect(padronizarDescricao("FILTRO (G)").sugerida).toBe("FILTRO (G)");
  });
  it("já padronizado não vira sugestão; descrição longa é sinalizada", () => {
    expect(padronizarDescricao("ARRUELA LISA 14MM").mudou).toBe(false);
    expect(padronizarDescricao("A".repeat(101)).longa).toBe(true);
  });
  it("abreviação só vale depois de aprovada, e troca palavra inteira", () => {
    expect(padronizarDescricao("PARAFUSO SEXT 10X60").sugerida).toBe("PARAFUSO SEXT 10X60");
    const aprov = abreviacoesAprovadas({ padronizacao: { abreviacoes: { sext: { para: "SEXTAVADO", aprovada: true }, flex: { para: "FLEXIVEL", aprovada: false } } } });
    expect(aprov).toEqual({ sext: "SEXTAVADO" });
    expect(padronizarDescricao("PARAFUSO SEXT 10X60 SEXTAVADO", undefined, aprov).sugerida).toBe("PARAFUSO SEXTAVADO 10X60 SEXTAVADO");
    expect(padronizarDescricao("PARAFUSO SEXTA 10X60", undefined, aprov).sugerida).toBe("PARAFUSO SEXTA 10X60");
  });
  it("descobre abreviações frequentes na própria base", () => {
    const base = [...Array(10).fill(0).map((_, i) => it1(i, "a" + i, "PARAFUSO SEXT M" + i)), ...Array(9).fill(0).map((_, i) => it1(20 + i, "b" + i, "PARAFUSO SEXTAVADO M" + i))];
    expect(descobrirAbreviacoes(base).map((a) => [a.de, a.para])).toContainEqual(["SEXT", "SEXTAVADO"]);
  });
});

describe("resposta do cliente", () => {
  const itens = [it1(2, "1001", "ANEL  TRAVA 1"), it1(3, "1002", "CHAVE 16 MM"), it1(4, "1003", "PINO  X"), it1(5, "1004", "BUCHA  Y")];
  const decisoes = { "2|padrao": { acao: "ENC", status: "PROP", sugerida: "ANEL TRAVA 1", grupo: "Peças" }, "3|padrao": { acao: "ENC", status: "PROP", sugerida: "CHAVE 16MM", grupo: "Peças" } };
  it("interpreta OK, ajuste, não e vazio", () => {
    expect(interpretarResposta("OK", "", "X")).toMatchObject({ status: "APR", final: "X", origemFinal: "sugestao" });
    expect(interpretarResposta("", "CHAVE COMBINADA 16MM", "CHAVE 16MM")).toMatchObject({ status: "APR", final: "CHAVE COMBINADA 16MM", origemFinal: "cliente" });
    expect(interpretarResposta("Não", "", "X")).toEqual({ status: "REJ" });
    expect(interpretarResposta("", "", "X")).toBeNull();
  });
  it("aplica as respostas por código, cria decisão quando só veio na planilha e conta o que sobrou", () => {
    const linhas = [{ codigo: "1001", resposta: "ok", comoFica: "" }, { codigo: "1002", resposta: "", comoFica: "CHAVE COMBINADA 16MM" }, { codigo: "1003", resposta: "OK", comoFica: "" }, { codigo: "1004", resposta: "", comoFica: "" }, { codigo: "9999", resposta: "ok", comoFica: "" }];
    const r = aplicarRespostas(decisoes, itens, linhas, { quem: "ana", hoje: "2026-10-22" });
    expect(r.decisoes["2|padrao"]).toMatchObject({ status: "APR", final: "ANEL TRAVA 1", origemFinal: "sugestao", decididoPor: "ana" });
    expect(r.decisoes["3|padrao"]).toMatchObject({ status: "APR", final: "CHAVE COMBINADA 16MM", origemFinal: "cliente" });
    expect(r.decisoes["4|padrao"]).toMatchObject({ status: "APR", final: "PINO X" });
    expect(r.decisoes["5|padrao"]).toBeUndefined();
    expect(r.resumo).toMatchObject({ aceitas: 2, ajustadas: 1, rejeitadas: 0, semResposta: 1, naoEncontradas: ["9999"] });
  });
  it("lista para o cliente traz código, atual e sugerida", () => {
    expect(linhasListaCliente(decisoes, itens)).toEqual([["1001", "ANEL  TRAVA 1", "ANEL TRAVA 1", "", "", ""], ["1002", "CHAVE 16 MM", "CHAVE 16MM", "", "", ""]]);
  });
  it("lê CSV com ; e aspas e acha colunas mesmo com títulos alterados", () => {
    expect(lerCsv('Código;Resposta;"Como deve ficar"\n1001;OK;\n1002;;"CHAVE; 16MM"\n')).toEqual([["Código", "Resposta", "Como deve ficar"], ["1001", "OK", ""], ["1002", "", "CHAVE; 16MM"]]);
    expect(mapearColunasResposta(["Código", "Descrição atual", "Descrição sugerida", "Resposta do cliente (OK ou deixe em branco)", "Como deve ficar (se não aceitar a sugestão)"])).toMatchObject({ codigo: 0, resposta: 3, comoFica: 4, ok: true });
  });
});
