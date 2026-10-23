import { describe, expect, it } from "vitest";
import { coerenciaDaDecisao, conciliarDecisoes, instantaneoDoItem } from "./aprovacao";
import { indexar } from "./identidade";

const item = (linha, codigo, extra = {}) => ({ linha, codigo, descricao: `ITEM ${codigo}`, unidade: "UN", grupo_atual: "Peças", ...extra });
const ix = (...its) => indexar(its);

describe("aprovação ligada à alteração específica", () => {
  it("o instantâneo guarda como o item está: descrição, unidade e grupo", () => {
    expect(instantaneoDoItem(item(2, "A", { descricao: " ANEL  ", unidade: "KG", grupo_atual: "" }))).toEqual({ descricao: "ANEL", unidade: "KG", grupo: "(sem grupo)" });
    expect(instantaneoDoItem(null)).toEqual({ descricao: "", unidade: "", grupo: "(sem grupo)" });
  });

  it("descrição: igual à de quando foi proposta vale; já com o texto aprovado é só reflexo; outra coisa não vale (aprovar uma descrição não aprova outra)", () => {
    const d = { status: "APR", sugerida: "ANEL TRAVA 10", antes: { descricao: "ANEL  TRAVA 10", unidade: "UN", grupo: "Peças" } };
    const igual = item(2, "A", { descricao: "ANEL  TRAVA 10" }); const aplicada = item(2, "A", { descricao: "ANEL TRAVA 10" }); const outra = item(2, "A", { descricao: "ANEL TRAVA 10 ZINCADO" });
    expect(coerenciaDaDecisao(d, "padrao", igual, ix(igual))).toMatchObject({ estado: "OK", ok: true });
    expect(coerenciaDaDecisao(d, "padrao", aplicada, ix(aplicada))).toMatchObject({ estado: "REFLETIDA", ok: true });
    const r = coerenciaDaDecisao(d, "padrao", outra, ix(outra)); expect(r).toMatchObject({ estado: "MUDOU", ok: false }); expect(r.motivo).toContain("A descrição mudou no cadastro");
    expect(coerenciaDaDecisao({ ...d, final: "ANEL TRAVA 10 ZINCADO" }, "padrao", outra, ix(outra)).estado).toBe("REFLETIDA"); // o texto aprovado foi o ajustado pelo cliente
  });

  it("unidade: a mesma lógica, pela unidade de estoque", () => {
    const d = { status: "APR", tipo: "conversao", de: "TONELADA", para: "KG", antes: { descricao: "MILHO", unidade: "TONELADA", grupo: "Peças" } };
    const igual = item(2, "A", { unidade: "TONELADA" }); const aplicada = item(2, "A", { unidade: "kg" }); const outra = item(2, "A", { unidade: "SACA" });
    expect(coerenciaDaDecisao(d, "unidade", igual, ix(igual)).estado).toBe("OK");
    expect(coerenciaDaDecisao(d, "unidade", aplicada, ix(aplicada)).estado).toBe("REFLETIDA");
    expect(coerenciaDaDecisao(d, "unidade", outra, ix(outra))).toMatchObject({ estado: "MUDOU", ok: false, motivo: "A unidade mudou no cadastro desde a decisão" });
  });

  it("duplicidade: o código que fica precisa existir, e a descrição de um dos dois não pode ter mudado para outra coisa", () => {
    const origem = item(2, "A", { descricao: "ANEL" }); const fica = item(3, "B", { descricao: "ANEL" });
    const d = { status: "APR", destino: "B", antes: { descricao: "ANEL", unidade: "UN", grupo: "Peças" }, destinoAntes: { descricao: "ANEL", unidade: "UN", grupo: "Peças" } };
    expect(coerenciaDaDecisao(d, "duplicidade", origem, ix(origem, fica))).toMatchObject({ estado: "OK", ok: true });
    expect(coerenciaDaDecisao(d, "duplicidade", origem, ix(origem))).toMatchObject({ estado: "AUSENTE", ok: true }); // o código que fica não está nesta extração: aviso, não bloqueio
    expect(coerenciaDaDecisao(d, "duplicidade", item(2, "A", { descricao: "ANEL ESPECIAL" }), ix(origem, fica)).estado).toBe("MUDOU");
    const outroFica = item(3, "B", { descricao: "ARRUELA" }); const r = coerenciaDaDecisao(d, "duplicidade", origem, ix(origem, outroFica));
    expect(r).toMatchObject({ estado: "MUDOU", ok: false }); expect(r.motivo).toContain("código que fica");
    expect(coerenciaDaDecisao({ status: "APR", destino: "B" }, "duplicidade", item(2, "A", { descricao: "OUTRO TEXTO" }), ix(origem, fica)).estado).toBe("OK"); // decisão migrada, sem o instantâneo: não há o que conferir
  });

  it("item que não está na base é aviso (AUSENTE); decisão sem instantâneo (migrada) e critérios sem alteração de cadastro não têm o que conferir", () => {
    expect(coerenciaDaDecisao({ status: "APR" }, "padrao", null, ix())).toMatchObject({ estado: "AUSENTE", ok: true });
    const it = item(2, "A", { descricao: "QUALQUER" });
    expect(coerenciaDaDecisao({ status: "APR", sugerida: "X" }, "padrao", it, ix(it)).estado).toBe("OK");
    expect(coerenciaDaDecisao({ status: "APR", antes: { descricao: "OUTRA", unidade: "UN", grupo: "Peças" } }, "ncm", it, ix(it)).estado).toBe("OK");
    expect(coerenciaDaDecisao(undefined, "padrao", it, ix(it)).ok).toBe(true);
  });
});

describe("conciliação das decisões com a base atual", () => {
  it("separa o que vale, o que o cadastro já reflete, o que mudou, o que saiu da base e o código repetido", () => {
    const itens = [item(2, "A", { descricao: "ANEL" }), item(3, "B", { descricao: "FILTRO NOVO" }), item(4, "C", { descricao: "CORREIA A72" }), item(5, "D"), item(6, "D")];
    const antes = (descricao) => ({ descricao, unidade: "UN", grupo: "Peças" });
    const decisoes = {
      "A|padrao": { status: "APR", sugerida: "ANEL 10", antes: antes("ANEL") }, "B|padrao": { status: "PROP", sugerida: "FILTRO", antes: antes("FILTRO") }, "C|padrao": { status: "APR", sugerida: "CORREIA A72", antes: antes("CORREIA  A72") },
      "Z|padrao": { status: "APR", sugerida: "X", antes: antes("X") }, "D|padrao": { status: "APR", sugerida: "Y", antes: antes("Y") },
    };
    const c = conciliarDecisoes(decisoes, itens);
    expect(c).toMatchObject({ total: 5, ok: 1, refletidas: 1 });
    expect(c.mudaram.map((x) => [x.id, x.status])).toEqual([["B", "PROP"]]); expect(c.ausentes.map((x) => x.id)).toEqual(["Z"]); expect(c.ambiguas.map((x) => x.id)).toEqual(["D"]);
    expect(conciliarDecisoes({}, itens).total).toBe(0);
  });
});
