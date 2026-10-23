import { describe, expect, it } from "vitest";
import { CRITERIOS, REGRAS_PADRAO, achadosDoCriterio, criarTestes, padronizarDescricao } from "./logica";
import { dadosDoItem, formatarNcm, leituraAchado, textoLinhas } from "./leituraAchados";
import { aplicarEscolha, montarConjuntos } from "./conjuntos";

const crit = (id) => CRITERIOS.find((c) => c.id === id);
const item = (linha, extra = {}) => ({ linha, codigo: `C${linha}`, descricao: "ITEM", unidade: "UN", grupo_atual: "Peças", problemas: [], ...extra });
const valor = (linhas, rotulo) => linhas.find((l) => l.rotulo === rotulo)?.valor;

describe("leitura dos achados: como é, como seria e por quê", () => {
  it("unidade (grafia): mostra a unidade de hoje e o nome padrão, e explica", () => {
    const itens = [item(2, { unidade: "QUILOGRAM" }), item(3, { unidade: "KG" })];
    const [a] = achadosDoCriterio(crit("unidade"), itens, criarTestes(itens, {}));
    const l = leituraAchado(crit("unidade"), a);
    expect(valor(l.como, "Unidade de estoque")).toBe("QUILOGRAM"); expect(valor(l.seria, "Unidade de estoque")).toBe("KG");
    expect(l.seria.find((x) => x.rotulo === "Unidade de estoque").destaque).toBe(true);
    expect(l.porque).toBe("A mesma unidade está escrita de outra forma; o padrão do projeto é KG.");
  });
  it("unidade (embalagem): estoque em KG, a embalagem vira unidade de compra e o fator fica 'a informar' (nunca inventado)", () => {
    const itens = [item(2, { unidade: "BB", descricao: "SEMENTE DE SOJA 22025HB4 (TMG 430 HB4)" })];
    const [a] = achadosDoCriterio(crit("unidade"), itens, criarTestes(itens, {}));
    const l = leituraAchado(crit("unidade"), a);
    expect(valor(l.como, "Unidade de estoque")).toBe("BB"); expect(valor(l.como, "Medida")).toBe("massa (embalagem)");
    expect(textoLinhas(l.seria)).toBe("Unidade de estoque: KG\nUnidade de compra: BB\nItens por unidade de compra: 1 BB = ? KG (a informar)");
    expect(l.porque).toContain("Embalagem de massa: o estoque passa a ser controlado em KG e a embalagem vira unidade de compra.");
    expect(l.porque).toContain("informe-o uma vez na tabela de unidades");
  });
  it("unidade (maior): fator exato por definição e conversão do saldo, na escala escolhida", () => {
    const itens = [item(2, { unidade: "TONELADA", descricao: "MILHO", saldo: 12000000 })];
    const [a] = achadosDoCriterio(crit("unidade"), itens, criarTestes(itens, {}));
    const l = leituraAchado(crit("unidade"), a, { escala: 1e6 });
    expect(valor(l.seria, "Itens por unidade de compra")).toBe("1 TONELADA = 1.000 KG");
    expect(valor(l.como, "Saldo")).toBe("12 TONELADA"); expect(valor(l.seria, "Saldo")).toBe("12.000 KG");
    expect(l.porque).toBe("TONELADA é maior que a unidade padrão de massa: o estoque passa a ser controlado em KG e TONELADA vira unidade de compra.");
  });
  it("unidade: fator lido da descrição fica para confirmar; sem unidade e sem regra mandam fazer o que falta", () => {
    const itens = [item(2, { unidade: "SACA", descricao: "SEMENTE MILHO SACO 60 KG" }), item(3, { unidade: "" }), item(4, { unidade: "ROLO" })];
    const t = criarTestes(itens, {}); const ach = achadosDoCriterio(crit("unidade"), itens, t);
    expect(valor(leituraAchado(crit("unidade"), ach[0]).seria, "Itens por unidade de compra")).toBe("1 SACA = 60 KG (lido da descrição: confirmar)");
    const vazia = leituraAchado(crit("unidade"), ach[1]); expect(valor(vazia.como, "Unidade de estoque")).toBe("(sem unidade)"); expect(valor(vazia.seria, "Unidade de estoque")).toBe("informar a unidade de estoque");
    expect(valor(leituraAchado(crit("unidade"), ach[2]).seria, "Unidade de estoque")).toContain("classificar a unidade na tabela de unidades");
  });
  it("padronização: descrição de hoje, descrição sugerida e os motivos", () => {
    const itens = [item(2, { descricao: "CORANTE ALIMENTÍCIO LÍQ.CONFEITARIA ROSA" })];
    const [a] = achadosDoCriterio(crit("padrao"), itens, criarTestes(itens, {}));
    const l = leituraAchado(crit("padrao"), a);
    expect(valor(l.como, "Descrição")).toBe("CORANTE ALIMENTÍCIO LÍQ.CONFEITARIA ROSA"); expect(valor(l.seria, "Descrição")).toBe("CORANTE ALIMENTÍCIO LÍQ. CONFEITARIA ROSA");
    expect(l.porque).toBe("espaço depois do ponto da abreviação");
  });
  it("duplicidade: os parecidos, a indicação e a ação (manter ou unificar)", () => {
    const dup = (mestre) => ({ nivel: "MUITO_PROVAVEL", score: 0.923, grupo: 0, mestre, candidatos: [{ linha: 3, score: 0.92, nivel: "MUITO_PROVAVEL", motivos: ["mesmas palavras em outra ordem"] }] });
    const a2 = item(2, { descricao: "ANEL TRAVA", duplicidade: dup(3) }); const a3 = item(3, { descricao: "TRAVA ANEL", duplicidade: dup(3) });
    const mapa = new Map([[2, a2], [3, a3]]);
    const l2 = leituraAchado(crit("duplicidade"), { item: a2, motivo: "x" }, { itemPorLinha: mapa });
    expect(valor(l2.como, "Parecido com")).toBe("C3 · TRAVA ANEL"); expect(valor(l2.como, "Indicação")).toBe("Indicação alta · similaridade 0,92");
    expect(valor(l2.seria, "Ação")).toBe("unificar no código C3"); expect(valor(l2.seria, "Fica")).toBe("TRAVA ANEL"); expect(l2.porque).toBe("mesmas palavras em outra ordem");
    const l3 = leituraAchado(crit("duplicidade"), { item: a3, motivo: "x" }, { itemPorLinha: mapa });
    expect(valor(l3.seria, "Ação")).toBe("manter este código");
  });
  it("duplicidade com conjunto: a ação é a escolha do analista ou, sem escolha, a sugestão (maior saldo)", () => {
    const dup = (c) => ({ nivel: "EXATA", score: 1, grupo: 0, mestre: 2, candidatos: c.map((l) => ({ linha: l, score: 1, nivel: "EXATA", motivos: ["descrição idêntica"] })) });
    const a2 = item(2, { descricao: "ANEL", saldo: 3, duplicidade: dup([3]) }); const a3 = item(3, { descricao: "ANEL", saldo: 12, duplicidade: dup([2]) });
    const [conj] = montarConjuntos([a2, a3]); const conjuntoDe = new Map([[2, conj], [3, conj]]); const itemPorLinha = new Map([[2, a2], [3, a3]]);
    const le = (a, decisoes) => leituraAchado(crit("duplicidade"), { item: a, motivo: "x" }, { itemPorLinha, conjuntoDe, decisoes });
    const l2 = le(a2, {});
    expect(valor(l2.como, "Parecido com")).toBe("C3 · ANEL (saldo 12)");
    expect(valor(l2.seria, "Ação")).toBe("unificar no código C3 (sugerido)"); expect(valor(l2.seria, "Fica")).toBe("ANEL (saldo 12)"); expect(l2.porque).toBe("Sugestão: manter C3 (maior saldo em estoque (12 contra 3)).");
    expect(valor(le(a3, {}).seria, "Ação")).toBe("manter este código (sugerido)");
    const escolhido = aplicarEscolha({}, conj, "C2", { quem: "ana", hoje: "2026-10-22" }); // o analista prefere ficar com o de menor saldo
    expect(valor(le(a2, escolhido).seria, "Ação")).toBe("fica este código (escolhido)");
    const l3 = le(a3, escolhido); expect(valor(l3.seria, "Ação")).toBe("unificar no código C2 (escolhido)"); expect(l3.porque).toContain("Escolha do analista diferente da sugestão.");
  });
  it("grupo, NCM, utilização e descrição ausente: hoje, sugestão e razão", () => {
    const g = leituraAchado(crit("grupo"), { item: item(2, { grupo_atual: "", grupo_sugerido: "Peças", grupo_evidencia: "9 de 10 outros itens com este NCM estão em Peças" }), motivo: "m" });
    expect(valor(g.como, "Grupo")).toBe("(sem grupo)"); expect(valor(g.seria, "Grupo")).toBe("Peças"); expect(g.porque).toContain("9 de 10");
    const n = leituraAchado(crit("ncm"), { item: item(3, { ncm_original: "7133319", ncm: "07133319", c_class_trib_informado: "000001", sugestao: { c_class_trib: "200003" } }), motivo: "NCM com 7 dígitos" });
    expect(valor(n.como, "NCM")).toBe("7133319"); expect(valor(n.como, "cClassTrib informado")).toBe("000001"); expect(valor(n.seria, "NCM")).toBe("0713.33.19"); expect(valor(n.seria, "cClassTrib sugerido")).toBe("200003");
    const sem = leituraAchado(crit("ncm"), { item: item(4, { ncm_original: "123", ncm: "123" }), motivo: "NCM inválido" });
    expect(valor(sem.seria, "Ação")).toBe("revisar o NCM e a classificação (sem sugestão automática)");
    const u = leituraAchado(crit("utilizacao"), { item: item(5), motivo: "Sem data de movimentação legível" });
    expect(valor(u.como, "Última movimentação")).toBe("sem data legível"); expect(valor(u.seria, "Ação")).toContain("obter a data com o cliente");
    const d = leituraAchado(crit("descricao"), { item: item(6, { descricao: "", codigo: "" }), motivo: "m" });
    expect(d.seria.map((x) => x.valor)).toEqual(["informar a descrição (NOME + REFERÊNCIA + COMPLEMENTO)", "informar o código"]);
  });
  it("dados de apoio do item: só o que existe, NCM com pontos e saldo na escala", () => {
    expect(formatarNcm("12092100")).toBe("1209.21.00"); expect(formatarNcm("123")).toBe("123");
    expect(dadosDoItem(item(2, { ncm: "12092100", ultima_mov: "2026-03-12", saldo: 5000000 }), 1e6)).toEqual([["Unidade", "UN"], ["NCM", "1209.21.00"], ["Últ. mov.", "12/03/2026"], ["Saldo", "5"]]);
    expect(dadosDoItem({ linha: 1 })).toEqual([]);
    expect(dadosDoItem(item(3, { saldo: 0 }))).toContainEqual(["Saldo", "0"]); // zero é saldo, não ausência
  });
  it("a regra do ponto da abreviação separa a palavra seguinte, mas não mexe em decimais, siglas nem referências", () => {
    const p = (d) => padronizarDescricao(d, REGRAS_PADRAO).sugerida;
    expect(p("CORANTE ALIMENTÍCIO LÍQ.CONFEITARIA ROSA")).toBe("CORANTE ALIMENTÍCIO LÍQ. CONFEITARIA ROSA");
    expect(p("TUBO 7.5MM")).toBe("TUBO 7.5MM"); expect(p("M.L X M.C")).toBe("M.L X M.C"); expect(p("ANEL R531.581")).toBe("ANEL R531.581");
    expect(padronizarDescricao("LÍQ.CONFEITARIA", { ...REGRAS_PADRAO, pontoColado: false }).sugerida).toBe("LÍQ.CONFEITARIA");
  });
});
