import { describe, expect, it } from "vitest";
import { achadosUnidade, agruparPorGrupo, aplicarEscopo, criarTestes, dataDoCorte, grupoDe, grupoPodeSanear, normalizarParams, SEM_GRUPO, unidadeCanonica } from "./logica";

const item = (linha, ultima_mov, extra = {}) => ({ linha, ultima_mov, problemas: [], ...extra });

describe("parâmetro de saneamento: não movimentados desde a data", () => {
  const itens = [item(2, "2023-05-01"), item(3, "2024-10-20"), item(4, "2024-10-21"), item(5, "2026-01-10"), item(6, null)];
  const linhas = (lista) => lista.map((i) => i.linha);

  it("desconsidera os itens cuja última movimentação é anterior à data; o movimentado nela ou depois continua", () => {
    const r = aplicarEscopo(itens, { desde: "2024-10-21" });
    expect(linhas(r.fora)).toEqual([2, 3]);
    expect(linhas(r.emEscopo)).toEqual([4, 5, 6]);
    expect(r.resumo).toEqual({ total: 5, fora: 2, emEscopo: 3, semData: 1 });
  });
  it("sem data, nada sai do escopo", () => {
    expect(aplicarEscopo(itens, { desde: "" }).resumo.fora).toBe(0);
    expect(aplicarEscopo(itens).resumo.fora).toBe(0);
    expect(aplicarEscopo(itens, {}).resumo.fora).toBe(0);
  });
  it("item sem data legível continua no escopo e fica sinalizado", () => {
    const r = aplicarEscopo(itens, { desde: "2030-01-01" });
    expect(r.semData).toEqual([6]);
    expect(linhas(r.emEscopo)).toEqual([6]);
  });
  it("a data do corte sai em DD/MM/AAAA", () => {
    expect(dataDoCorte({ desde: "2025-01-01" })).toBe("01/01/2025"); expect(dataDoCorte({ desde: "" })).toBe(""); expect(dataDoCorte(undefined)).toBe("");
  });
  it("projeto salvo com os dois cortes antigos vira uma data só: 'movimentados até X' = 'não movimentados desde X + 1 dia'", () => {
    expect(normalizarParams({ ateOn: true, ate: "2024-10-20", diasOn: false, dias: 540, dataBase: "2026-10-22" })).toEqual({ desde: "2024-10-21" });
    expect(linhas(aplicarEscopo(itens, { ateOn: true, ate: "2024-10-20" }).fora)).toEqual([2, 3]); // mesmo resultado de antes
    expect(linhas(aplicarEscopo(itens, { ateOn: true, ate: "2024-10-21" }).fora)).toEqual([2, 3, 4]);
    expect(normalizarParams({ ateOn: true, ate: "2024-02-28" })).toEqual({ desde: "2024-02-29" }); // ano bissexto
  });
  it("'parado há mais de N dias' antigo vira a data (data-base − N dias); com os dois cortes vale o mais recente", () => {
    expect(normalizarParams({ diasOn: true, dias: 365, dataBase: "2026-10-22" })).toEqual({ desde: "2025-10-22" });
    expect(linhas(aplicarEscopo(itens, { diasOn: true, dias: 365, dataBase: "2026-10-22" }).fora)).toEqual([2, 3, 4]);
    expect(normalizarParams({ ateOn: true, ate: "2024-10-20", diasOn: true, dias: 365, dataBase: "2026-10-22" })).toEqual({ desde: "2025-10-22" });
    expect(normalizarParams({ ateOn: true, ate: "2026-06-30", diasOn: true, dias: 365, dataBase: "2026-10-22" })).toEqual({ desde: "2026-07-01" });
  });
  it("o estado que estava salvo na tela (0 dias, data-base 01/01/2025) vira 'não movimentados desde 01/01/2025'", () => {
    expect(normalizarParams({ ateOn: false, ate: "", diasOn: true, dias: 0, dataBase: "2025-01-01" })).toEqual({ desde: "2025-01-01" });
  });
  it("corte antigo marcado mas incompleto ou inválido é ignorado, como antes", () => {
    expect(normalizarParams({ ateOn: true, ate: "" })).toEqual({ desde: "" });
    expect(normalizarParams({ diasOn: true, dias: -3, dataBase: "2026-10-22" })).toEqual({ desde: "" });
    expect(normalizarParams({ diasOn: true, dias: "x", dataBase: "2026-10-22" })).toEqual({ desde: "" });
    expect(normalizarParams({ diasOn: true, dias: 30, dataBase: "lixo" })).toEqual({ desde: "" });
    expect(normalizarParams(null)).toEqual({ desde: "" }); expect(normalizarParams({ ateOn: false, diasOn: false })).toEqual({ desde: "" });
  });
  it("formato novo passa como está", () => {
    expect(normalizarParams({ desde: "2025-03-01" })).toEqual({ desde: "2025-03-01" });
  });
});

describe("grupos e unidades", () => {
  it("agrupa pela coluna do cliente e junta os sem grupo", () => {
    const g = agruparPorGrupo([item(2, null, { grupo_atual: "Peças" }), item(3, null, { grupo_atual: " Peças " }), item(4, null)]);
    expect(g.map((x) => [x.nome, x.itens.length])).toEqual([["Peças", 2], [SEM_GRUPO, 1]]);
    expect(grupoDe(item(9, null, { grupo_atual: "" }))).toBe(SEM_GRUPO);
  });
  it("reconhece variações da mesma unidade e aponta as fora do padrão dominante", () => {
    expect(unidadeCanonica("KGS")).toBe("kg"); expect(unidadeCanonica("Lt.")).toBe("l"); expect(unidadeCanonica("xyz")).toBeNull();
    const us = ["KG", "KG", "KG", "Kgs", "UN", ""].map((u, i) => item(i + 2, null, { unidade: u }));
    const t = achadosUnidade(us);
    expect(us.map((u) => t(u).achado)).toEqual([false, false, false, true, false, true]);
  });
});

describe("testes por critério e saneamento do grupo", () => {
  it("mapeia os problemas do validador para os critérios", () => {
    const it1 = item(2, "2025-01-01", { problemas: [{ codigo: "NCM_FORMATO", mensagem: "NCM errado" }], unidade: "KG" });
    const it2 = item(3, "2025-01-01", { problemas: [{ codigo: "DUPLICIDADE_PROVAVEL", mensagem: "Cadastro muito provavelmente duplicado" }], unidade: "KG" });
    const it3 = item(4, null, { unidade: "KG" });
    const t = criarTestes([it1, it2, it3]);
    expect(t.ncm(it1).achado).toBe(true); expect(t.ncm(it2).achado).toBe(false);
    expect(t.duplicidade(it2).achado).toBe(true);
    expect(t.utilizacao(it3).achado).toBe(true); expect(t.utilizacao(it1).achado).toBe(false);
  });
  it("grupo só pode ser saneado com todos os critérios aprovados tratados", () => {
    const estado = { criterios: { ncm: { aprovado: true }, duplicidade: { aprovado: true } }, tratados: { "Peças|ncm": true } };
    expect(grupoPodeSanear(estado, "Peças")).toBe(false);
    estado.tratados["Peças|duplicidade"] = true;
    expect(grupoPodeSanear(estado, "Peças")).toBe(true);
    expect(grupoPodeSanear({ criterios: {}, tratados: {} }, "Peças")).toBe(false);
  });
});
