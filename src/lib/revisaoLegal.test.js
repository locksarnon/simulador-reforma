import { describe, expect, it } from "vitest";
import { agruparRevisoes, fraseDaRevisao, oQueMudou, resumoRevisao } from "./revisaoLegal";

describe("revisão pela lei: textos das telas", () => {
  it("resume o que voltou para revisão depois da atualização do texto, no singular e no plural", () => {
    expect(resumoRevisao(null)).toBe("");
    expect(resumoRevisao({ itens: 0 })).toBe("");
    expect(resumoRevisao({ cartoes: 1, cartoes_despublicados: 1, fundamentos: 0, marcos: 0, itens: 1 })).toBe("Para revisar: 1 cartão. 1 cartão publicado voltou para rascunho.");
    expect(resumoRevisao({ cartoes: 3, cartoes_despublicados: 2, fundamentos: 2, marcos: 1, itens: 7 })).toBe("Para revisar: 3 cartões, 2 notas do cálculo, 1 marco da agenda. 2 cartões publicados voltaram para rascunho.");
    expect(resumoRevisao({ cartoes: 0, cartoes_despublicados: 0, fundamentos: 1, marcos: 0, itens: 1 })).toBe("Para revisar: 1 nota do cálculo.");
  });

  it("descreve uma linha da fila com o dispositivo, a norma, a data e o motivo", () => {
    const l = { rotulo: "Art. 12", norma_numero: "LC 214/2025", mudanca: "alterado", mudou_em: "2026-11-12T15:00:00.000Z", detalhe: "O texto do dispositivo mudou." };
    expect(fraseDaRevisao(l)).toBe("Art. 12 (LC 214/2025) alterado em 12/11/2026. O texto do dispositivo mudou.");
    expect(fraseDaRevisao({ ...l, mudanca: "revogado", detalhe: null })).toBe("Art. 12 (LC 214/2025) revogado em 12/11/2026.");
    // a lista de cartões devolve o número da norma no campo "numero"
    expect(fraseDaRevisao({ rotulo: "Art. 12", numero: "LC 214/2025", mudanca: "alterado", mudou_em: "2026-11-12T15:00:00.000Z" })).toBe("Art. 12 (LC 214/2025) alterado em 12/11/2026.");
    // sem o nome do dispositivo (a tela já mostra o link dele)
    expect(oQueMudou(l)).toBe("(LC 214/2025) alterado em 12/11/2026. O texto do dispositivo mudou.");
    expect(oQueMudou({ mudanca: "alterado" })).toBe("alterado.");
  });

  it("agrupa por item: dois dispositivos do mesmo cartão viram um item só", () => {
    const grupos = agruparRevisoes([
      { id: "1", tipo: "cartao", alvo_id: "c1", alvo_titulo: "P1", rotulo: "Art. 164" },
      { id: "2", tipo: "cartao", alvo_id: "c1", alvo_titulo: "P1", rotulo: "Art. 167" },
      { id: "3", tipo: "fundamento", alvo_id: "c1", alvo_titulo: "Nota", rotulo: "Art. 12" },
    ]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0]).toMatchObject({ tipo: "cartao", alvo_id: "c1", titulo: "P1" });
    expect(grupos[0].linhas.map((l) => l.rotulo)).toEqual(["Art. 164", "Art. 167"]);
    expect(agruparRevisoes()).toEqual([]);
  });
});
