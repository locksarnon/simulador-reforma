import { describe, expect, it } from "vitest";
import { CRITERIOS } from "./logica";
import { marcaDeOutroContexto, marcaValida } from "./analise";
import { assinaturaDoEscopo, assinaturaDoTeste, contextosDasConclusoes } from "./contexto";
import { aprovarPalavras, definirGrupo, observacaoInicial } from "./observacao";

const item = (linha, grupo) => ({ linha, codigo: `C${linha}`, grupo_atual: grupo });
const crit = (id) => CRITERIOS.find((c) => c.id === id);
const grupos = (...pares) => pares.map(([nome, linhas]) => ({ nome, itens: linhas.map((l) => item(l, nome)) }));

describe("contexto da conclusão de um grupo", () => {
  it("o escopo é o conjunto de itens do grupo: os mesmos itens dão a mesma assinatura, outros itens dão outra", () => {
    const a = grupos(["Peças", [2, 3, 6]])[0].itens;
    expect(assinaturaDoEscopo(a)).toBe(assinaturaDoEscopo(grupos(["Peças", [2, 3, 6]])[0].itens));
    expect(assinaturaDoEscopo(a)).not.toBe(assinaturaDoEscopo(grupos(["Peças", [2, 3]])[0].itens)); // o corte por data tirou um item
    expect(assinaturaDoEscopo(a)).not.toBe(assinaturaDoEscopo(grupos(["Peças", [2, 3, 7]])[0].itens)); // outro item no lugar
    expect(assinaturaDoEscopo([])).toBe(assinaturaDoEscopo([]));
  });

  it("padronização: as regras de formato e as abreviações aprovadas fazem parte do teste; a ordem das chaves e a abreviação não aprovada não", () => {
    const base = { padronizacao: { regras: { espacos: true, caixaAlta: true }, abreviacoes: { sext: { para: "SEXTAVADO", aprovada: true } } } };
    const sig = (e) => assinaturaDoTeste(e, crit("padrao"));
    expect(sig({ padronizacao: { regras: { caixaAlta: true, espacos: true }, abreviacoes: { sext: { para: "SEXTAVADO", aprovada: true } } } })).toBe(sig(base));
    expect(sig({ padronizacao: { ...base.padronizacao, regras: { espacos: true, caixaAlta: false } } })).not.toBe(sig(base));
    expect(sig({ padronizacao: { ...base.padronizacao, abreviacoes: {} } })).not.toBe(sig(base));
    expect(sig({ padronizacao: { ...base.padronizacao, abreviacoes: { ...base.padronizacao.abreviacoes, parafs: { para: "PARAFUSO", aprovada: false } } } })).toBe(sig(base)); // só vale a aprovada
    expect(sig({})).toBe(sig({ padronizacao: { regras: {}, abreviacoes: {} } })); // sem nada guardado = as regras padrão
  });

  it("unidade: a política da menor unidade, as regras e os nomes das unidades; duplicidade: os grupos e as palavras da regra de observação", () => {
    const un = (e) => assinaturaDoTeste(e, crit("unidade"));
    expect(un({})).toBe(un({ politicaUnidade: { ativa: true, regras: {}, rotulos: {} } }));
    expect(un({ politicaUnidade: { ativa: false } })).not.toBe(un({})); expect(un({ politicaUnidade: { regras: { saca: { manter: true } } } })).not.toBe(un({})); expect(un({ politicaUnidade: { rotulos: { massa: "QUILOGRAM" } } })).not.toBe(un({}));
    const nomes = ["LIMPEZA", "FERRAGENS"]; const dup = (e) => assinaturaDoTeste(e, crit("duplicidade"), nomes);
    expect(dup({ observacao: observacaoInicial() })).toBe(dup({})); expect(dup({ observacao: definirGrupo(observacaoInicial(), "LIMPEZA", true) })).toBe(dup({})); // marcar o que já é padrão não muda nada
    expect(dup({ observacao: definirGrupo(observacaoInicial(), "FERRAGENS", true) })).not.toBe(dup({})); expect(dup({ observacao: aprovarPalavras(observacaoInicial(), ["pasta"]) })).not.toBe(dup({}));
  });

  it("unidade: a grafia dominante vem dos itens de TODOS os grupos em escopo, então a conclusão de um grupo perde a validade se os outros mudam", () => {
    const g = (nome, unidades, inicio) => ({ nome, itens: unidades.map((u, i) => ({ linha: inicio + i, codigo: `C${inicio + i}`, grupo_atual: nome, unidade: u })) });
    const A = g("A", ["UN", "UND", "UND"], 1); const B = g("B", ["UN", "UN", "UN", "UN", "UN"], 10);
    const com = contextosDasConclusoes({}, [A, B]); const semB = contextosDasConclusoes({}, [A]);
    expect(semB["A|unidade"]).not.toBe(com["A|unidade"]); // com B a grafia dominante é UN; sem B passa a ser UND: os achados de A mudam
    expect(semB["A|ncm"]).toBe(com["A|ncm"]); // as demais checagens de A só leem os itens de A, que não mudaram
    expect(assinaturaDoTeste({}, crit("unidade"), [], { dominantes: { un: "UN" } })).not.toBe(assinaturaDoTeste({}, crit("unidade"), [], { dominantes: { un: "UND" } }));
    const mesmoA = contextosDasConclusoes({}, [A, g("C", ["UN", "UN", "UN", "UN"], 20)]); expect(mesmoA["A|unidade"]).toBe(com["A|unidade"]); // outro grupo com a mesma grafia dominante: nada muda para A
  });

  it("duplicidade: a regra de observação só muda o contexto dos grupos em que ela vale; no grupo desligado a conclusão não perde a validade", () => {
    const gs = grupos(["PEÇAS", [1, 2]], ["FERRAGENS", [3]], ["LIMPEZA", [4, 5]]); // LIMPEZA vale por padrão; PEÇAS e FERRAGENS estão desligados
    const antes = contextosDasConclusoes({}, gs); const depois = contextosDasConclusoes({ observacao: aprovarPalavras(observacaoInicial(), ["pasta"]) }, gs);
    expect(depois["PEÇAS|duplicidade"]).toBe(antes["PEÇAS|duplicidade"]); expect(depois["FERRAGENS|duplicidade"]).toBe(antes["FERRAGENS|duplicidade"]);
    expect(depois["LIMPEZA|duplicidade"]).not.toBe(antes["LIMPEZA|duplicidade"]); // onde a regra vale, aprovar uma palavra pode mudar os achados
    const ligando = contextosDasConclusoes({ observacao: definirGrupo(observacaoInicial(), "FERRAGENS", true) }, gs);
    expect(ligando["FERRAGENS|duplicidade"]).not.toBe(antes["FERRAGENS|duplicidade"]); // ligar a regra no grupo muda o contexto dele
    expect(contextosDasConclusoes({}, grupos(["PEÇAS", [1, 2]], ["FERRAGENS", [3]]))["PEÇAS|duplicidade"]).toBe(antes["PEÇAS|duplicidade"]); // um grupo com a regra ligada sair do escopo não mexe nos desligados
  });

  it("conferência manual: o roteiro escrito pelo analista é o que foi conferido; os testes que só leem os itens não têm configuração", () => {
    const man = (e) => assinaturaDoTeste(e, crit("identidade"));
    expect(man({ criterios: { identidade: { regra: "Roteiro A" } } })).not.toBe(man({ criterios: { identidade: { regra: "Roteiro B" } } }));
    expect(man({})).toBe(man({ criterios: { identidade: { aprovado: true, por: "ana" } } })); // o texto padrão do código não conta: mudar o código não invalida conclusão
    for (const id of ["ncm", "descricao", "grupo", "utilizacao"]) expect(assinaturaDoTeste({ padronizacao: { regras: { caixaAlta: false } } }, crit(id))).toBe("");
  });

  it("contextos: uma entrada por grupo e checagem; o grupo que não mudou mantém o contexto quando outro muda", () => {
    const e = {}; const antes = contextosDasConclusoes(e, grupos(["Peças", [2, 3, 6]], ["Insumos", [4, 5]]));
    expect(Object.keys(antes)).toHaveLength(2 * CRITERIOS.length); expect(antes["Peças|ncm"]).toMatch(/^[0-9a-z]+$/);
    const depois = contextosDasConclusoes(e, grupos(["Peças", [2, 3]], ["Insumos", [4, 5]]));
    expect(depois["Insumos|ncm"]).toBe(antes["Insumos|ncm"]); expect(depois["Peças|ncm"]).not.toBe(antes["Peças|ncm"]);
    expect(depois["Peças|padrao"]).not.toBe(antes["Peças|padrao"]); // o escopo vale para todas as checagens do grupo
    const outra = contextosDasConclusoes({ padronizacao: { regras: { caixaAlta: false } } }, grupos(["Peças", [2, 3, 6]], ["Insumos", [4, 5]]));
    expect(outra["Peças|padrao"]).not.toBe(antes["Peças|padrao"]); expect(outra["Peças|ncm"]).toBe(antes["Peças|ncm"]); // a configuração só atinge a checagem a que pertence
    expect(contextosDasConclusoes(e, grupos(["Peças", [2, 3, 6]], ["Insumos", [4, 5]]))).toEqual(antes); // estável
  });

  it("a marca com contexto só vale com o mesmo contexto; sem contexto registrado (marca antiga) ou sem contexto de hoje, vale como está", () => {
    const m = { por: "ana", em: "2026-10-22", base: "v1", contexto: "abc" };
    expect(marcaValida(m, "v1", "abc")).toBe(true); expect(marcaValida(m, "v1", "xyz")).toBe(false); expect(marcaValida(m, "v2", "abc")).toBe(false); // outra base
    expect(marcaValida(m, "v1")).toBe(true); expect(marcaValida({ por: "ana", base: "v1" }, "v1", "xyz")).toBe(true); expect(marcaValida(true, "v1", "xyz")).toBe(true); expect(marcaValida(false, "v1", "abc")).toBe(false);
    expect(marcaDeOutroContexto(m, "v1", "xyz")).toBe(true); expect(marcaDeOutroContexto(m, "v1", "abc")).toBe(false); expect(marcaDeOutroContexto(m, "v2", "xyz")).toBe(false); // outra base é outro aviso
    expect(marcaDeOutroContexto(true, "v1", "xyz")).toBe(false); expect(marcaDeOutroContexto(undefined, "v1", "xyz")).toBe(false);
  });
});
