import { describe, expect, it } from "vitest";
import { CRITERIOS, criarTestes } from "./logica";
import { achadosDe, agruparAchados, calcularAchados, contarAchados, criteriosAprovados, criteriosPendentesDoGrupo, grupoPodeSanear, grupoTratado, situacaoCriterio } from "./analise";

const item = (linha, grupo, extra = {}) => ({ linha, codigo: `C${linha}`, descricao: `ITEM ${linha}`, unidade: "UN", grupo_atual: grupo, ultima_mov: "2026-01-10", problemas: [], ...extra });
const ncm = [{ codigo: "NCM_FORMATO", mensagem: "NCM errado" }];
const itens = [
  item(2, "Peças", { problemas: ncm }), item(3, "Peças"), item(4, "Insumos", { problemas: ncm, descricao: "ANEL  TRAVA" }), item(5, "Insumos", { ultima_mov: null }), item(6, "Peças", { problemas: ncm }),
];
const crit = (id) => CRITERIOS.find((c) => c.id === id);
const achados = calcularAchados(itens, criarTestes(itens, {}));
const contagem = contarAchados(achados, itens.length);
const ids = (lista) => lista.map((c) => c.id);

describe("achados por critério e por grupo", () => {
  it("só critério com teste automático tem achados; os conferidos à mão não", () => {
    expect(Object.keys(achados).sort()).toEqual(CRITERIOS.filter((c) => c.auto).map((c) => c.id).sort());
    expect(achados.identidade).toBeUndefined(); expect(achados.saldos).toBeUndefined(); expect(achados.cartilhas).toBeUndefined();
  });
  it("conta por critério e por grupo", () => {
    expect(contagem.porCriterio).toMatchObject({ ncm: 3, padrao: 1, utilizacao: 1, duplicidade: 0, descricao: 0, grupo: 0, unidade: 0 });
    expect(contagem.porGrupoCriterio).toEqual({ "Peças|ncm": 2, "Insumos|ncm": 1, "Insumos|padrao": 1, "Insumos|utilizacao": 1 });
    expect(achadosDe(contagem, crit("ncm"))).toBe(3); expect(achadosDe(contagem, crit("duplicidade"))).toBe(0);
    expect(achadosDe(contagem, crit("identidade"))).toBeNull(); expect(achadosDe(null, crit("ncm"))).toBeNull();
  });
  it("sem item em escopo não há contagem: não dá para dizer que não há achado", () => {
    expect(contarAchados(calcularAchados([], criarTestes([], {})), 0)).toBeNull();
  });
  it("agrupa os achados por grupo, do que tem mais para o que tem menos", () => {
    const g = agruparAchados(achados.ncm);
    expect(g.map((x) => [x.grupo, x.achados.length])).toEqual([["Peças", 2], ["Insumos", 1]]);
    expect(agruparAchados([])).toEqual([]);
  });
});

describe("critério sem achados abre aprovado, com a opção de revisar manualmente", () => {
  const vazio = { criterios: {}, tratados: {}, saneados: {} };
  it("teste automático sem achado abre aprovado; com achado e conferência manual esperam o analista", () => {
    expect(situacaoCriterio(vazio, crit("duplicidade"), contagem)).toBe("AUTO");
    expect(situacaoCriterio(vazio, crit("unidade"), contagem)).toBe("AUTO");
    expect(situacaoCriterio(vazio, crit("ncm"), contagem)).toBe("PENDENTE");
    expect(situacaoCriterio(vazio, crit("identidade"), contagem)).toBe("PENDENTE");
  });
  it("sem base não há como abrir aprovado", () => {
    expect(situacaoCriterio(vazio, crit("duplicidade"), null)).toBe("PENDENTE");
  });
  it("o analista aprova o que tem achado (e o que é manual)", () => {
    const e = { ...vazio, criterios: { ncm: { aprovado: true, por: "ana", em: "2026-10-22" }, identidade: { aprovado: true } } };
    expect(situacaoCriterio(e, crit("ncm"), contagem)).toBe("APROVADO"); expect(situacaoCriterio(e, crit("identidade"), contagem)).toBe("APROVADO");
  });
  it("revisar manualmente: reabrir vale mesmo sem achados, até o analista aprovar de novo", () => {
    const reaberto = { ...vazio, criterios: { duplicidade: { aprovado: false } } };
    expect(situacaoCriterio(reaberto, crit("duplicidade"), contagem)).toBe("PENDENTE");
    const aprovado = { ...vazio, criterios: { duplicidade: { aprovado: true, por: "ana" } } };
    expect(situacaoCriterio(aprovado, crit("duplicidade"), contagem)).toBe("APROVADO");
  });
  it("critério que perdeu a aprovação (sem a marca) volta a abrir aprovado se o teste continua sem achados", () => {
    expect(situacaoCriterio({ ...vazio, criterios: { unidade: { regra: "texto do analista" } } }, crit("unidade"), contagem)).toBe("AUTO");
  });
  it("a lista de aprovados traz os automáticos e os aprovados pelo analista, na ordem dos critérios", () => {
    expect(ids(criteriosAprovados(vazio, contagem))).toEqual(["duplicidade", "descricao", "grupo", "unidade"]);
    const e = { ...vazio, criterios: { ncm: { aprovado: true }, identidade: { aprovado: true } } };
    expect(ids(criteriosAprovados(e, contagem))).toEqual(["ncm", "identidade", "duplicidade", "descricao", "grupo", "unidade"]);
    expect(criteriosAprovados(vazio, null)).toEqual([]);
  });
});

describe("tratamento por grupo e grupo saneado", () => {
  const aprovado = (extra = {}) => ({ criterios: { ncm: { aprovado: true } }, tratados: {}, saneados: {}, ...extra });
  it("grupo sem achado no critério automático já está tratado; com achado precisa da marca do analista", () => {
    const e = aprovado();
    expect(grupoTratado(e, "Peças", crit("padrao"), contagem)).toBe(true); // nada a tratar em Peças
    expect(grupoTratado(e, "Insumos", crit("padrao"), contagem)).toBe(false);
    expect(grupoTratado(aprovado({ tratados: { "Insumos|padrao": true } }), "Insumos", crit("padrao"), contagem)).toBe(true);
  });
  it("critério conferido à mão sempre precisa da marca; sem contagem nada é tratado sozinho", () => {
    expect(grupoTratado(aprovado(), "Peças", crit("identidade"), contagem)).toBe(false);
    expect(grupoTratado(aprovado({ tratados: { "Peças|identidade": true } }), "Peças", crit("identidade"), contagem)).toBe(true);
    expect(grupoTratado(aprovado(), "Peças", crit("padrao"), null)).toBe(false);
  });
  it("o grupo só pode ser saneado com todos os critérios aprovados tratados nele", () => {
    const e = aprovado();
    expect(grupoPodeSanear(e, "Peças", contagem)).toBe(false); // NCM aprovado e com achado em Peças
    expect(ids(criteriosPendentesDoGrupo(e, "Peças", contagem))).toEqual(["ncm"]);
    const tratadoPecas = aprovado({ tratados: { "Peças|ncm": true } });
    expect(grupoPodeSanear(tratadoPecas, "Peças", contagem)).toBe(true);
    expect(criteriosPendentesDoGrupo(tratadoPecas, "Peças", contagem)).toEqual([]);
  });
  it("achado em critério ainda sem aprovação trava o saneamento do grupo, e o painel mostra o que falta", () => {
    const tratadoPecas = aprovado({ tratados: { "Peças|ncm": true } });
    expect(ids(criteriosPendentesDoGrupo(tratadoPecas, "Insumos", contagem))).toEqual(["ncm", "padrao", "utilizacao"]); // NCM a tratar; padronização e utilização têm achado e não foram aprovadas
    expect(grupoPodeSanear(tratadoPecas, "Insumos", contagem)).toBe(false);
    const vazio = { criterios: {}, tratados: {}, saneados: {} };
    expect(ids(criteriosPendentesDoGrupo(vazio, "Peças", contagem))).toEqual(["ncm"]); // só os automáticos sem achado abriram aprovados: Peças ainda tem NCM sem aprovação
    expect(grupoPodeSanear(vazio, "Peças", contagem)).toBe(false);
  });
  it("base sem achado: os critérios automáticos abrem aprovados e o grupo já pode ser saneado", () => {
    const limpos = [item(2, "Peças"), item(3, "Peças")]; const c = contarAchados(calcularAchados(limpos, criarTestes(limpos, {})), limpos.length);
    const vazio = { criterios: {}, tratados: {}, saneados: {} };
    expect(grupoPodeSanear(vazio, "Peças", c)).toBe(true);
    expect(grupoPodeSanear(vazio, "Peças", null)).toBe(false); // sem base não há o que afirmar
  });
  it("critério automático aprovado sem achado no grupo não trava o saneamento", () => {
    const e = aprovado({ criterios: { ncm: { aprovado: true }, padrao: { aprovado: true }, utilizacao: { aprovado: true } }, tratados: { "Peças|ncm": true } });
    expect(grupoPodeSanear(e, "Peças", contagem)).toBe(true); // padronização e utilização não acharam nada em Peças
    expect(grupoPodeSanear(e, "Insumos", contagem)).toBe(false); // em Insumos tem NCM, padronização e utilização a tratar
  });
  it("sem nenhum critério aprovado, nenhum grupo pode ser saneado", () => {
    expect(grupoPodeSanear({ criterios: {}, tratados: {}, saneados: {} }, "Peças", null)).toBe(false);
  });
});
