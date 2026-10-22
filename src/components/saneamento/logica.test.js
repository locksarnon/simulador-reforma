import { describe, expect, it } from "vitest";
import { achadosUnidade, agruparPorGrupo, aplicarEscopo, criarTestes, dataPorDias, grupoDe, grupoPodeSanear, SEM_GRUPO, unidadeCanonica } from "./logica";

const item = (linha, ultima_mov, extra = {}) => ({ linha, ultima_mov, problemas: [], ...extra });

describe("parâmetro de saneamento", () => {
  const itens = [item(2, "2023-05-01"), item(3, "2024-10-20"), item(4, "2024-10-21"), item(5, "2026-01-10"), item(6, null)];

  it("desconsidera itens movimentados ATÉ a data (inclusive) e mantém os posteriores", () => {
    const r = aplicarEscopo(itens, { ateOn: true, ate: "2024-10-20" });
    expect(r.fora.map((f) => f.item.linha)).toEqual([2, 3]);
    expect(r.emEscopo.map((i) => i.linha)).toEqual([4, 5, 6]);
  });
  it("sem checkbox marcado, nada sai", () => {
    expect(aplicarEscopo(itens, { ateOn: false, ate: "2024-10-20" }).resumo.fora).toBe(0);
  });
  it("item sem data legível continua no escopo e fica sinalizado", () => {
    const r = aplicarEscopo(itens, { ateOn: true, ate: "2030-01-01" });
    expect(r.semData).toEqual([6]);
    expect(r.emEscopo.map((i) => i.linha)).toEqual([6]);
  });
  it("corte por dias parados conta da data-base", () => {
    expect(dataPorDias("2026-10-22", 365)).toBe("2025-10-22");
    const r = aplicarEscopo(itens, { diasOn: true, dias: 365, dataBase: "2026-10-22" });
    expect(r.fora.map((f) => f.item.linha)).toEqual([2, 3, 4]);
  });
  it("os dois cortes juntos não contam o mesmo item duas vezes", () => {
    const r = aplicarEscopo(itens, { ateOn: true, ate: "2024-10-20", diasOn: true, dias: 365, dataBase: "2026-10-22" });
    expect(r.resumo).toMatchObject({ fora: 3, porAte: 2, porDias: 3, ambos: 2, emEscopo: 2 });
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
