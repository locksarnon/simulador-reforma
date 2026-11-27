import { describe, expect, it, vi } from "vitest";
import {
  contadorDeGrupos, descricaoDoLoteDoGrupo, grupoDoGrupoDeCasos, idsDosGruposParaLote, problemaDoGrupoDeCasos, situacaoUnicaDoGrupo, textoDaPropostaDoGrupo, textoDasSituacoesDoGrupo,
  tituloDoCasoAberto, tituloDoGrupoDeCasos, vizinhosNaLista,
} from "./logica";

describe("casos agrupados: textos da linha", () => {
  it("proposta legível, sem as listas auxiliares; sem campos = sem proposta", () => {
    expect(textoDaPropostaDoGrupo({ unidade: "UN" })).toBe("Unidade: UN");
    expect(textoDaPropostaDoGrupo({ ativo: false })).toBe("Ativo: Não");
    expect(textoDaPropostaDoGrupo({ decisao: "INATIVAR", decisoesPossiveis: "INATIVAR | MANTER" })).not.toContain("MANTER");
    expect(textoDaPropostaDoGrupo({})).toBe("Sem proposta");
  });
  it("grupo, problema de exemplo, situações e contador", () => {
    expect(grupoDoGrupoDeCasos({ grupo: "Peças" })).toBe("Peças");
    expect(grupoDoGrupoDeCasos({ grupo: "" })).toBe("(sem grupo)");
    expect(grupoDoGrupoDeCasos({ conjunto: true, grupo: null })).toBe("Vários itens (conjunto)");
    expect(problemaDoGrupoDeCasos({ problema: "Item 1 parado", problemaVaria: true })).toBe("Ex.: Item 1 parado");
    expect(problemaDoGrupoDeCasos({ problema: "Itens parados", problemaVaria: false })).toBe("Itens parados");
    expect(textoDasSituacoesDoGrupo({ PROPOSTO: 3 })).toBe("Proposto");
    expect(textoDasSituacoesDoGrupo({ PROPOSTO: 1200, RASCUNHO: 1 })).toBe("Proposto 1.200; Rascunho 1");
    expect(situacaoUnicaDoGrupo({ PROPOSTO: 3 })).toBe("PROPOSTO");
    expect(situacaoUnicaDoGrupo({ PROPOSTO: 3, RASCUNHO: 1 })).toBeNull();
    expect(contadorDeGrupos(6900, 55275)).toBe("6.900 grupo(s) (55.275 caso(s))");
    expect(descricaoDoLoteDoGrupo({ tipo: "TAMANHO_EXCEDIDO", grupo: "Peças", casos: 10 })).toBe("10 caso(s) do grupo Tamanho acima do limite do ERP · Peças.");
  });
});

describe("casos agrupados: ids do lote", () => {
  const grupos = [
    { chave: "a", casos: 2, ids: ["c1", "c2"], idsCompletos: true },
    { chave: "b", casos: 600, ids: ["c3"], idsCompletos: false },
    { chave: "c", casos: 1, ids: ["c9"], idsCompletos: true },
  ];
  it("só os grupos marcados; o grupo maior que a lista busca todos os ids; sem repetir", async () => {
    const buscar = vi.fn(async (chave) => (chave === "b" ? ["c3", "c4", "c5", "c1"] : []));
    const ids = await idsDosGruposParaLote(grupos, new Set(["a", "b"]), buscar);
    expect(ids).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar).toHaveBeenCalledWith("b");
  });
  it("nada marcado: nenhum id e nenhuma busca", async () => {
    const buscar = vi.fn();
    expect(await idsDosGruposParaLote(grupos, new Set(), buscar)).toEqual([]);
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("painel sobreposto dos casos", () => {
  it("posição e vizinhas na lista carregada; nas pontas não há anterior ou próximo; fora da lista, nenhuma", () => {
    const lista = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(vizinhosNaLista(lista, "a")).toEqual({ posicao: 1, total: 3, anterior: null, proximo: "b" });
    expect(vizinhosNaLista(lista, "b")).toEqual({ posicao: 2, total: 3, anterior: "a", proximo: "c" });
    expect(vizinhosNaLista(lista, "c")).toEqual({ posicao: 3, total: 3, anterior: "b", proximo: null });
    expect(vizinhosNaLista(lista, "z")).toEqual({ posicao: 0, total: 3, anterior: null, proximo: null });
    expect(vizinhosNaLista([], "a")).toEqual({ posicao: 0, total: 0, anterior: null, proximo: null });
    expect(vizinhosNaLista([{ chave: "g1" }, { chave: "g2" }], "g2", (g) => g.chave)).toEqual({ posicao: 2, total: 2, anterior: "g1", proximo: null });
  });
  it("títulos: grupo com o nome da camada; caso com código e descrição do item", () => {
    expect(tituloDoGrupoDeCasos({ camada: "NOMES_UNIDADES" })).toBe("Grupo de casos iguais — Nomes e unidades");
    expect(tituloDoGrupoDeCasos({})).toBe("Grupo de casos iguais");
    expect(tituloDoCasoAberto({ item: { codigo: "2186", descricao: "RETENTOR" }, qtdItens: 1 })).toBe("Caso — 2186 — RETENTOR");
    expect(tituloDoCasoAberto({ item: { codigo: "2186" }, qtdItens: 12 })).toBe("Caso — 12 itens (1º: 2186)");
    expect(tituloDoCasoAberto(undefined)).toBe("Caso");
  });
});
