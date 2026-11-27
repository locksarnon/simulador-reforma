import { describe, expect, it, vi } from "vitest";
import {
  contadorDeGrupos, descricaoDoLoteDoGrupo, grupoDoGrupoDeCasos, idsDosGruposParaLote, problemaDoGrupoDeCasos, situacaoUnicaDoGrupo, textoDaPropostaDoGrupo, textoDasSituacoesDoGrupo,
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
