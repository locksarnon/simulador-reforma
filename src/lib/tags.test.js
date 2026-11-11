import { describe, expect, it } from "vitest";
import { aplicarCriterios, corDoTexto, criteriosVazios, filtrarPorColaborador, filtrarPorTags, mapaDeTags, tagsDaEmpresa } from "./tags";

const EMPRESAS = [{ id: "E1" }, { id: "E2" }, { id: "E3" }];
const TAGS = [{ id: "T1", nome: "Agro", cor: "#1E764D" }, { id: "T2", nome: "Prioridade", cor: "#BE123C" }, { id: "T0", nome: "Antiga", cor: "#2563EB" }];
const POR_EMPRESA = { E1: ["T1", "T2"], E2: ["T1"] };

describe("cor do texto da etiqueta", () => {
  it("usa texto claro sobre cores escuras e texto escuro sobre cores claras", () => {
    expect(corDoTexto("#1E764D")).toBe("#FFFFFF"); // verde da marca
    expect(corDoTexto("#BE123C")).toBe("#FFFFFF");
    expect(corDoTexto("#FFFFFF")).toBe("#111827");
    expect(corDoTexto("#FDE68A")).toBe("#111827");
  });
  it("cor inválida cai no texto claro, sem quebrar", () => {
    expect(corDoTexto(undefined)).toBe("#FFFFFF");
    expect(corDoTexto("verde")).toBe("#FFFFFF");
  });
});

describe("etiquetas por empresa", () => {
  it("devolve as etiquetas da empresa em ordem alfabética e ignora ids que não existem mais", () => {
    const mapa = mapaDeTags(TAGS);
    expect(tagsDaEmpresa(POR_EMPRESA, mapa, "E1").map((t) => t.nome)).toEqual(["Agro", "Prioridade"]);
    expect(tagsDaEmpresa({ E1: ["T1", "TX"] }, mapa, "E1").map((t) => t.id)).toEqual(["T1"]);
    expect(tagsDaEmpresa(POR_EMPRESA, mapa, "E3")).toEqual([]);
  });
});

describe("filtrar por etiquetas", () => {
  it("sem etiqueta escolhida mostra todas as empresas", () => {
    expect(filtrarPorTags(EMPRESAS, POR_EMPRESA, [])).toHaveLength(3);
    expect(filtrarPorTags(EMPRESAS, POR_EMPRESA, undefined)).toHaveLength(3);
  });
  it("qualquer: tem pelo menos uma; todas: tem todas", () => {
    expect(filtrarPorTags(EMPRESAS, POR_EMPRESA, ["T1", "T2"], "qualquer").map((e) => e.id)).toEqual(["E1", "E2"]);
    expect(filtrarPorTags(EMPRESAS, POR_EMPRESA, ["T1", "T2"], "todas").map((e) => e.id)).toEqual(["E1"]);
    expect(filtrarPorTags(EMPRESAS, POR_EMPRESA, ["T2"]).map((e) => e.id)).toEqual(["E1"]); // padrão = qualquer
  });
});

describe("filtrar pela carteira do colaborador", () => {
  const COLABORADORES = [{ id: "U1", empresa_ids: ["E1", "E2"] }, { id: "U2", empresa_ids: ["E2"] }];
  it("vazio devolve tudo, 'sem' devolve as que ninguém atende e um id devolve a carteira dele", () => {
    expect(filtrarPorColaborador(EMPRESAS, COLABORADORES, "")).toHaveLength(3);
    expect(filtrarPorColaborador(EMPRESAS, COLABORADORES, "sem").map((e) => e.id)).toEqual(["E3"]);
    expect(filtrarPorColaborador(EMPRESAS, COLABORADORES, "U1").map((e) => e.id)).toEqual(["E1", "E2"]);
    expect(filtrarPorColaborador(EMPRESAS, COLABORADORES, "U2").map((e) => e.id)).toEqual(["E2"]);
    expect(filtrarPorColaborador(EMPRESAS, COLABORADORES, "inexistente")).toEqual([]);
  });
});

describe("listas salvas", () => {
  const PADRAO = { busca: "", grupo: "", carteira: "", tags: [], tagModo: "qualquer", colaborador: "" };
  it("aplicar uma lista mantém só as chaves da página e completa o resto com o padrão", () => {
    const r = aplicarCriterios(PADRAO, { busca: "agro", carteira: "bpo", situacao: "ATIVO", tags: ["T1"] });
    expect(r).toEqual({ busca: "agro", grupo: "", carteira: "bpo", tags: ["T1"], tagModo: "qualquer", colaborador: "" });
    expect(r).not.toHaveProperty("situacao");
    expect(aplicarCriterios(PADRAO, null)).toEqual(PADRAO);
  });
  it("critérios no padrão não podem ser salvos; qualquer filtro ligado pode", () => {
    expect(criteriosVazios(PADRAO)).toBe(true);
    expect(criteriosVazios({ ...PADRAO, tagModo: "todas" })).toBe(true); // o modo sozinho não filtra nada
    expect(criteriosVazios({ ...PADRAO, busca: "x" })).toBe(false);
    expect(criteriosVazios({ ...PADRAO, tags: ["T1"] })).toBe(false);
    expect(criteriosVazios({ ...PADRAO, colaborador: "sem" })).toBe(false);
  });
});
