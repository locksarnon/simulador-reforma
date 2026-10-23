import { describe, expect, it } from "vitest";
import { compararValores, ordenarPor, proximaOrdem } from "./ordenacao";

const linhas = [{ id: 1, nome: "Zebra", n: 10 }, { id: 2, nome: "árvore", n: 9 }, { id: 3, nome: "", n: null }, { id: 4, nome: "Abacate", n: 100 }, { id: 5, nome: "arvore", n: 9 }];
const acessores = { nome: (x) => x.nome, n: (x) => x.n };
const ids = (l) => l.map((x) => x.id);

describe("ordenação das tabelas", () => {
  it("o clique alterna crescente, decrescente e a ordem original", () => {
    const a = proximaOrdem(null, "nome"); expect(a).toEqual({ chave: "nome", dir: 1 });
    const b = proximaOrdem(a, "nome"); expect(b).toEqual({ chave: "nome", dir: -1 });
    expect(proximaOrdem(b, "nome")).toBeNull();
    expect(proximaOrdem(b, "n")).toEqual({ chave: "n", dir: 1 }); // outra coluna recomeça no crescente
  });
  it("número com número é numérico; texto ignora acento e caixa e respeita '10' depois de '9'", () => {
    expect(ids(ordenarPor(linhas, { chave: "n", dir: 1 }, acessores))).toEqual([2, 5, 1, 4, 3]); // 9, 9 (estável), 10, 100; vazio por último
    expect(compararValores("A10", "A9")).toBeGreaterThan(0);
    expect(compararValores("árvore", "ARVORE")).toBe(0);
    expect(ids(ordenarPor(linhas, { chave: "nome", dir: 1 }, acessores))).toEqual([4, 2, 5, 1, 3]); // Abacate, árvore, arvore (empate: ordem original), Zebra; vazio por último
  });
  it("vazio fica por último também no sentido decrescente, e o empate segue a ordem original", () => {
    expect(ids(ordenarPor(linhas, { chave: "n", dir: -1 }, acessores))).toEqual([4, 1, 2, 5, 3]);
    expect(ids(ordenarPor(linhas, { chave: "nome", dir: -1 }, acessores))).toEqual([1, 2, 5, 4, 3]);
  });
  it("sem ordem ou com coluna desconhecida devolve a própria lista, e nunca altera a original", () => {
    expect(ordenarPor(linhas, null, acessores)).toBe(linhas);
    expect(ordenarPor(linhas, { chave: "xx", dir: 1 }, acessores)).toBe(linhas);
    const antes = ids(linhas); ordenarPor(linhas, { chave: "n", dir: 1 }, acessores); expect(ids(linhas)).toEqual(antes);
  });
  it("zero é valor (não é vazio) e datas ISO ordenam como texto", () => {
    const l = [{ id: 1, v: 0 }, { id: 2, v: null }, { id: 3, v: -1 }];
    expect(ids(ordenarPor(l, { chave: "v", dir: 1 }, { v: (x) => x.v }))).toEqual([3, 1, 2]);
    const d = [{ id: 1, v: "2026-03-01" }, { id: 2, v: "2025-12-31" }];
    expect(ids(ordenarPor(d, { chave: "v", dir: 1 }, { v: (x) => x.v }))).toEqual([2, 1]);
  });
});
