import { describe, expect, it } from "vitest";
import { coerenciaDaChave, coerenciaDaDecisao, conciliarDecisoes, instantaneoDoItem, propostaNcm, sugestaoMudou } from "./aprovacao";
import { indexar } from "./identidade";

const item = (linha, codigo, extra = {}) => ({ linha, codigo, descricao: `ITEM ${codigo}`, unidade: "UN", grupo_atual: "Peças", ...extra });
const ix = (...its) => indexar(its);

describe("aprovação ligada à alteração específica", () => {
  it("o instantâneo guarda o que o critério confere depois (mais a descrição, só para identificar o item) e nada para critério sem alteração de cadastro", () => {
    const it = item(2, "A", { descricao: " ANEL  ", unidade: "KG", grupo_atual: "", ncm_original: "7318.15.00", c_class_trib_informado: " 000001 " });
    expect(instantaneoDoItem(it, "padrao")).toEqual({ descricao: "ANEL" });
    expect(instantaneoDoItem(it, "duplicidade")).toEqual({ descricao: "ANEL" });
    expect(instantaneoDoItem(it, "unidade")).toEqual({ unidade: "KG", descricao: "ANEL" });
    expect(instantaneoDoItem(it, "grupo")).toEqual({ grupo: "(sem grupo)", descricao: "ANEL" });
    expect(instantaneoDoItem(it, "ncm")).toEqual({ ncm: "73181500", cClassTrib: "000001", descricao: "ANEL" });
    expect(instantaneoDoItem(it, "identidade")).toBeNull();
    expect(instantaneoDoItem(null, "padrao")).toEqual({ descricao: "" });
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
    expect(coerenciaDaDecisao({ status: "APR", antes: { descricao: "OUTRA", unidade: "UN", grupo: "Peças" } }, "ncm", it, ix(it)).estado).toBe("OK"); // instantâneo antigo (descrição/unidade/grupo) numa decisão de NCM: nada de NCM a conferir
    expect(coerenciaDaDecisao({ status: "APR", antes: { descricao: "OUTRA", unidade: "KG" }, para: "KG" }, "unidade", item(2, "A", { unidade: "UN" }), ix(it)).estado).toBe("MUDOU"); // o campo do critério foi guardado e mudou
    expect(coerenciaDaDecisao({ status: "APR", antes: { descricao: "QUALQUER" } }, "unidade", it, ix(it)).estado).toBe("OK"); // o campo da unidade não foi guardado: não há o que conferir
    const trocouDescricao = item(2, "A", { descricao: "OUTRA DESCRICAO", unidade: "KG" }); // a descrição guardada na decisão de unidade só identifica o item: mudar a descrição não invalida a unidade aprovada
    expect(coerenciaDaDecisao({ status: "APR", para: "KG", antes: { unidade: "KG", descricao: "ANTIGA" } }, "unidade", trocouDescricao, ix(trocouDescricao)).estado).toBe("OK");
    expect(coerenciaDaDecisao(undefined, "padrao", it, ix(it)).ok).toBe(true);
  });

  it("grupo e NCM: o cadastro igual ao de quando foi proposto vale; já no valor proposto é reflexo; outra coisa não vale", () => {
    const dg = { status: "APR", antes: { grupo: "Peças" }, proposto: { grupo: "Lubrificantes" } };
    expect(coerenciaDaDecisao(dg, "grupo", item(2, "A"), ix(item(2, "A"))).estado).toBe("OK");
    const noProposto = item(2, "A", { grupo_atual: "Lubrificantes" }); const outro = item(2, "A", { grupo_atual: "Rações" });
    expect(coerenciaDaDecisao(dg, "grupo", noProposto, ix(noProposto)).estado).toBe("REFLETIDA");
    expect(coerenciaDaDecisao(dg, "grupo", outro, ix(outro))).toMatchObject({ estado: "MUDOU", ok: false });
    const dn = { status: "APR", antes: { ncm: "73181500", cClassTrib: "" }, proposto: { ncm: "73181600" } };
    const igual = item(2, "A", { ncm_original: "7318.15.00" }); const novo = item(2, "A", { ncm_original: "73181600" }); const diferente = item(2, "A", { ncm_original: "73181900" });
    expect(coerenciaDaDecisao(dn, "ncm", igual, ix(igual)).estado).toBe("OK");
    expect(coerenciaDaDecisao(dn, "ncm", novo, ix(novo)).estado).toBe("REFLETIDA");
    expect(coerenciaDaDecisao(dn, "ncm", diferente, ix(diferente))).toMatchObject({ estado: "MUDOU", ok: false });
    expect(coerenciaDaDecisao({ status: "APR", antes: { ncm: "73181500" } }, "ncm", igual, ix(igual)).estado).toBe("OK"); // só o NCM foi guardado: a classe não é conferida
  });

  it("duplicidade: a correção de formato da descrição não invalida a unificação; código que fica repetido na base é ambíguo (não vale)", () => {
    const origem = item(2, "A", { descricao: "ANEL TRAVA 10" }); const fica = item(3, "B", { descricao: "ANEL TRAVA 10" });
    const d = { status: "APR", destino: "B", antes: { descricao: "ANEL  TRAVA 10" }, destinoAntes: { descricao: "ANEL TRAVA 10" } };
    expect(coerenciaDaDecisao(d, "duplicidade", origem, ix(origem, fica)).estado).toBe("OK"); // só o espaço duplo foi corrigido: continua o mesmo produto
    const ficaRepetido = item(4, "B", { descricao: "ANEL TRAVA 10" });
    expect(coerenciaDaDecisao(d, "duplicidade", origem, ix(origem, fica, ficaRepetido))).toMatchObject({ estado: "AMBIGUA", ok: false });
  });

  it("duplicidade: parecer com a descrição de antes não basta; a mudança de uma palavra de medida é outro produto, e só a correção de descrição APROVADA do mesmo item é aceita", () => {
    const d = { status: "APR", destino: "B1", antes: { descricao: "PARAFUSO M10 X 50 INOX" }, destinoAntes: { descricao: "PARAFUSO M10 X 50 INOX" } };
    const fica = item(3, "B1", { descricao: "PARAFUSO M10 X 50 INOX" });
    const mudouMedida = item(2, "A1", { descricao: "PARAFUSO M10 X 60 INOX" }); // 4 de 6 palavras iguais: antes passava como "o mesmo produto"
    expect(coerenciaDaDecisao(d, "duplicidade", mudouMedida, ix(mudouMedida, fica))).toMatchObject({ estado: "MUDOU", ok: false });
    const igual = item(2, "A1", { descricao: "parafuso m10 x 50 inox" }); expect(coerenciaDaDecisao(d, "duplicidade", igual, ix(igual, fica)).estado).toBe("OK"); // só caixa
    // a abreviação expandida por uma correção de descrição aprovada não invalida a unificação; sem a aprovação (ou com ela ainda em proposta, ou com outro texto), invalida
    const abrev = { status: "APR", destino: "B1", antes: { descricao: "PARAF SEXT M10" }, destinoAntes: { descricao: "PARAFUSO SEXTAVADO M10" } };
    const expandida = item(2, "A1", { descricao: "PARAFUSO SEXTAVADO M10" }); const dest = item(3, "B1", { descricao: "PARAFUSO SEXTAVADO M10" });
    const aprovada = { "A1|padrao": { status: "APR", sugerida: "PARAFUSO SEXTAVADO M10" } };
    expect(coerenciaDaDecisao(abrev, "duplicidade", expandida, ix(expandida, dest), aprovada).estado).toBe("OK");
    expect(coerenciaDaDecisao(abrev, "duplicidade", expandida, ix(expandida, dest), {}).estado).toBe("MUDOU");
    expect(coerenciaDaDecisao(abrev, "duplicidade", expandida, ix(expandida, dest), { "A1|padrao": { status: "PROP", sugerida: "PARAFUSO SEXTAVADO M10" } }).estado).toBe("MUDOU");
    expect(coerenciaDaDecisao(abrev, "duplicidade", expandida, ix(expandida, dest), { "A1|padrao": { status: "APR", sugerida: "PARAFUSO SEXTAVADO M12" } }).estado).toBe("MUDOU");
    expect(coerenciaDaDecisao(abrev, "duplicidade", expandida, ix(expandida, dest), { "B1|padrao": { status: "APR", sugerida: "PARAFUSO SEXTAVADO M10" } }).estado).toBe("MUDOU"); // a correção aprovada é de outro item: não vale para este
    // o mesmo vale do lado do código que fica
    const origemIgual = item(2, "A1", { descricao: "PARAF SEXT M10" }); const destExpandido = item(3, "B1", { descricao: "PARAFUSO SEXTAVADO M10" });
    expect(coerenciaDaDecisao({ ...abrev, antes: { descricao: "PARAF SEXT M10" }, destinoAntes: { descricao: "PARAF SEXT M10" } }, "duplicidade", origemIgual, ix(origemIgual, destExpandido), {}).estado).toBe("MUDOU");
    expect(coerenciaDaDecisao({ ...abrev, antes: { descricao: "PARAF SEXT M10" }, destinoAntes: { descricao: "PARAF SEXT M10" } }, "duplicidade", origemIgual, ix(origemIgual, destExpandido), { "B1|padrao": { status: "APR", final: "PARAFUSO SEXTAVADO M10" } }).estado).toBe("OK");
  });

  it("duplicidade: a descrição do item que mudou é conferida antes de saber se o código que fica ainda está na base", () => {
    const d = { status: "APR", destino: "B1", antes: { descricao: "ANEL" } }; const outraCoisa = item(2, "A1", { descricao: "BUCHA" });
    expect(coerenciaDaDecisao(d, "duplicidade", outraCoisa, ix(outraCoisa))).toMatchObject({ estado: "MUDOU", ok: false }); // B1 não está na base, mas o cadastro de A1 já é outro: não é só aviso
  });

  it("NCM: a proposta guarda o NCM corrigido e a classe sugerida (o que a tela mostra em como seria); já está como proposto só se o que a proposta muda tem o valor proposto e o resto não mudou", () => {
    const it0 = item(2, "A", { ncm: "73181500", ncm_original: "7318150", c_class_trib_informado: "", sugestao: { c_class_trib: "000001" } });
    expect(propostaNcm(it0)).toEqual({ ncm: "73181500", cClassTrib: "000001" });
    expect(propostaNcm(item(2, "A", { ncm: "73181500", ncm_original: "73181500" }))).toEqual({}); expect(propostaNcm(null)).toEqual({});
    expect(propostaNcm(item(2, "A", { ncm: "73181500", ncm_original: "73181500", sugestao: { c_class_trib: 1 } }))).toEqual({ cClassTrib: "1" });
    const d = { status: "APR", antes: { ncm: "7318150", cClassTrib: "" }, proposto: { ncm: "73181500", cClassTrib: "000001" } };
    const igual = item(2, "A", { ncm_original: "7318150", c_class_trib_informado: "" }); const corrigido = item(2, "A", { ncm_original: "73181500", c_class_trib_informado: "000001" });
    expect(coerenciaDaDecisao(d, "ncm", igual, ix(igual)).estado).toBe("OK"); expect(coerenciaDaDecisao(d, "ncm", corrigido, ix(corrigido)).estado).toBe("REFLETIDA");
    const soNcm = item(2, "A", { ncm_original: "73181500", c_class_trib_informado: "" }); expect(coerenciaDaDecisao(d, "ncm", soNcm, ix(soNcm)).estado).toBe("MUDOU"); // a classe proposta ainda não está lá
    // proposta só de classe: se o NCM do cadastro mudou para outra coisa, não é "já está como proposto"
    const dClasse = { status: "APR", antes: { ncm: "73181500", cClassTrib: "" }, proposto: { cClassTrib: "000001" } };
    const classeAplicada = item(2, "A", { ncm_original: "73181500", c_class_trib_informado: "000001" }); const ncmOutro = item(2, "A", { ncm_original: "73181900", c_class_trib_informado: "000001" });
    expect(coerenciaDaDecisao(dClasse, "ncm", classeAplicada, ix(classeAplicada)).estado).toBe("REFLETIDA"); expect(coerenciaDaDecisao(dClasse, "ncm", ncmOutro, ix(ncmOutro)).estado).toBe("MUDOU");
  });

  it("a decisão de um código repetido na base é ambígua (coerenciaDaChave)", () => {
    const a1 = item(2, "A"); const a2 = item(3, "A"); const b = item(4, "B");
    expect(coerenciaDaChave("A|padrao", { status: "APR", antes: { descricao: "ITEM A" } }, ix(a1, a2, b))).toMatchObject({ estado: "AMBIGUA", ok: false });
    expect(coerenciaDaChave("B|padrao", { status: "APR", antes: { descricao: "ITEM B" } }, ix(a1, a2, b)).estado).toBe("OK");
    expect(coerenciaDaChave("Z|padrao", { status: "APR" }, ix(a1, a2, b)).estado).toBe("AUSENTE");
    const abrev = { status: "APR", destino: "B", antes: { descricao: "ITEM A ANTIGO" } }; // a correção aprovada de A explica a descrição de hoje: o contexto das decisões chega até a conferência
    expect(coerenciaDaChave("A|duplicidade", abrev, ix(item(2, "A", { descricao: "ITEM A NOVO" }), b), { "A|padrao": { status: "APR", final: "ITEM A NOVO" } }).estado).toBe("OK");
    expect(coerenciaDaChave("A|duplicidade", abrev, ix(item(2, "A", { descricao: "ITEM A NOVO" }), b)).estado).toBe("MUDOU");
  });
});

describe("a aprovação vale só para a alteração decidida", () => {
  it("se a sugestão de hoje é outra, a decisão antiga não aprova a nova (descrição e unidade); sem sugestão ou em outro critério, nada a avisar", () => {
    expect(sugestaoMudou("padrao", { sugerida: "ANEL TRAVA 10", final: "ANEL TRAVA 10 ZINC" }, { sugerida: "ANEL TRAVA 10" })).toBe(false); // a decidida é a mesma de hoje (o ajuste do cliente não muda isso)
    expect(sugestaoMudou("padrao", { sugerida: "ANEL TRAVA 10" }, { sugerida: "ANEL TRAVA 10 MM" })).toBe(true);
    expect(sugestaoMudou("unidade", { para: "KG" }, { sugerida: "KG" })).toBe(false); expect(sugestaoMudou("unidade", { para: "KG" }, { sugerida: "L" })).toBe(true);
    expect(sugestaoMudou("padrao", { sugerida: "X" }, { sugerida: null })).toBe(false); expect(sugestaoMudou("padrao", undefined, { sugerida: "X" })).toBe(false); expect(sugestaoMudou("ncm", { sugerida: "A" }, { sugerida: "B" })).toBe(false);
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
