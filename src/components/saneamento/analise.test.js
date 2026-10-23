import { describe, expect, it } from "vitest";
import { CRITERIOS, criarTestes } from "./logica";
import { achadosDe, agruparAchados, calcularAchados, contarAchados, coberturaDaBase, criterioResolvido, criteriosAprovados, criteriosPendentesDoGrupo, grupoPodeSanear, grupoSaneado, grupoTratado, naoAplicavelDe, situacaoCriterio } from "./analise";

const item = (linha, grupo, extra = {}) => ({ linha, codigo: `C${linha}`, descricao: `ITEM ${linha}`, unidade: "UN", grupo_atual: grupo, ultima_mov: "2026-01-10", problemas: [], ...extra });
const ncm = [{ codigo: "NCM_FORMATO", mensagem: "NCM errado" }];
const itens = [
  item(2, "Peças", { problemas: ncm }), item(3, "Peças"), item(4, "Insumos", { problemas: ncm, descricao: "ANEL  TRAVA" }), item(5, "Insumos", { ultima_mov: null }), item(6, "Peças", { problemas: ncm }),
];
const crit = (id) => CRITERIOS.find((c) => c.id === id);
const achados = calcularAchados(itens, criarTestes(itens, {}));
const contagem = contarAchados(achados, itens.length);
const ids = (lista) => lista.map((c) => c.id);
const aprov = (...cs) => Object.fromEntries(cs.map((c) => [c, { aprovado: true }]));
const justificativa = "O cliente não usa este controle no escopo do projeto.";

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

describe("análise que não rodou na importação não vira \"sem achados\"", () => {
  const vazio = { criterios: {}, tratados: {}, saneados: {} };
  const semGrupos = { opcoes: { cClassTrib: true, duplicidades: true, grupos: false }, itens: [] };
  it("a cobertura vem das opções registradas com a base", () => {
    expect(coberturaDaBase(semGrupos)).toEqual({ ncm: { completa: true, opcao: "cClassTrib", falta: "a conferência de cClassTrib" }, duplicidade: { completa: true, opcao: "duplicidades", falta: "a investigação de duplicidades" }, grupo: { completa: false, opcao: "grupos", falta: "a sugestão de grupos de produto" } });
    const nada = coberturaDaBase({ opcoes: { cClassTrib: false, duplicidades: false, grupos: false }, itens: [] });
    expect([nada.ncm.completa, nada.duplicidade.completa, nada.grupo.completa]).toEqual([false, false, false]);
  });
  it("base sem as opções registradas: a análise só conta se algum item traz o que ela produz", () => {
    const antiga = { itens: [{ sugestao: { c_class_trib: "000001" } }, { duplicidade: { nivel: "EXATA" } }, { grupo_flag: "IGUAL" }] };
    expect(Object.values(coberturaDaBase(antiga)).every((c) => c.completa)).toBe(true);
    const so = coberturaDaBase({ itens: [{ sugestao: null, duplicidade: null, grupo_flag: null }] });
    expect(Object.values(so).every((c) => !c.completa)).toBe(true);
    expect(coberturaDaBase(null).grupo.completa).toBe(false); // sem base nada foi executado
  });
  it("o critério com teste automático sem a análise fica SEM_ANALISE, mesmo sem achados e mesmo se já tinha sido aprovado", () => {
    const c = contarAchados(achados, itens.length, coberturaDaBase(semGrupos));
    expect(situacaoCriterio(vazio, crit("grupo"), c)).toBe("SEM_ANALISE"); // antes: "aprovado automaticamente: sem achados"
    expect(situacaoCriterio({ ...vazio, criterios: aprov("grupo") }, crit("grupo"), c)).toBe("SEM_ANALISE");
    expect(situacaoCriterio(vazio, crit("duplicidade"), c)).toBe("AUTO"); // a investigação de duplicidades rodou
    expect(ids(criteriosAprovados(vazio, c))).toEqual(["duplicidade", "descricao", "unidade"]);
  });
  it("sem a análise o grupo não está tratado nem a marca do analista substitui a análise que não houve", () => {
    const c = contarAchados(achados, itens.length, coberturaDaBase(semGrupos));
    expect(grupoTratado({ ...vazio, tratados: { "Peças|grupo": true } }, "Peças", crit("grupo"), c)).toBe(false);
    expect(grupoTratado(vazio, "Peças", crit("grupo"), contagem)).toBe(true); // com a análise e sem achado, o grupo está tratado
    expect(criteriosPendentesDoGrupo({ ...vazio, criterios: aprov("grupo") }, "Peças", c).map((x) => x.id)).toContain("grupo");
  });
  it("não se aplica, com justificativa, resolve o critério sem a análise; sem justificativa não vale", () => {
    const c = contarAchados(achados, itens.length, coberturaDaBase(semGrupos));
    const na = { ...vazio, criterios: { grupo: { aprovado: false, naoAplicavel: { por: "ana", em: "2026-10-23", justificativa } } } };
    expect(situacaoCriterio(na, crit("grupo"), c)).toBe("NAO_APLICAVEL");
    expect(naoAplicavelDe(na, crit("grupo")).por).toBe("ana");
    expect(criterioResolvido(na, crit("grupo"), c)).toBe(true);
    expect(ids(criteriosAprovados(na, c))).not.toContain("grupo"); // não aplicável não gera análise nem regra
    expect(criteriosPendentesDoGrupo(na, "Peças", c).map((x) => x.id)).not.toContain("grupo");
    const curta = { ...vazio, criterios: { grupo: { naoAplicavel: { por: "ana", em: "2026-10-23", justificativa: "não" } } } };
    expect(situacaoCriterio(curta, crit("grupo"), c)).toBe("SEM_ANALISE"); expect(naoAplicavelDe(curta, crit("grupo"))).toBeNull();
  });
});

describe("tratamento por grupo e grupo saneado", () => {
  // todos os critérios com achado ou de conferência manual aprovados; sobram para o grupo tratar os que têm achado nele e os manuais
  const completo = (extra = {}) => ({ criterios: aprov("ncm", "identidade", "padrao", "utilizacao", "saldos", "cartilhas"), tratados: {}, saneados: {}, ...extra });
  const marcas = (grupo, ...cs) => Object.fromEntries(cs.map((c) => [`${grupo}|${c}`, { por: "ana", em: "2026-10-23" }]));
  it("grupo sem achado no critério automático já está tratado; com achado precisa da marca do analista", () => {
    const e = completo();
    expect(grupoTratado(e, "Peças", crit("padrao"), contagem)).toBe(true); // nada a tratar em Peças
    expect(grupoTratado(e, "Insumos", crit("padrao"), contagem)).toBe(false);
    expect(grupoTratado(completo({ tratados: { "Insumos|padrao": true } }), "Insumos", crit("padrao"), contagem)).toBe(true); // marca antiga (true) continua valendo
    expect(grupoTratado(completo({ tratados: marcas("Insumos", "padrao") }), "Insumos", crit("padrao"), contagem)).toBe(true);
  });
  it("critério conferido à mão sempre precisa da marca; sem contagem nada é tratado sozinho", () => {
    expect(grupoTratado(completo(), "Peças", crit("identidade"), contagem)).toBe(false);
    expect(grupoTratado(completo({ tratados: marcas("Peças", "identidade") }), "Peças", crit("identidade"), contagem)).toBe(true);
    expect(grupoTratado(completo(), "Peças", crit("padrao"), null)).toBe(false);
  });
  it("o grupo só pode ser saneado com todos os critérios aprovados e tratados nele, os de conferência manual inclusive", () => {
    const e = completo();
    expect(grupoPodeSanear(e, "Peças", contagem)).toBe(false);
    expect(ids(criteriosPendentesDoGrupo(e, "Peças", contagem))).toEqual(["ncm", "identidade", "saldos", "cartilhas"]); // NCM tem achado em Peças; os três manuais esperam a conclusão
    const feito = completo({ tratados: marcas("Peças", "ncm", "identidade", "saldos", "cartilhas") });
    expect(grupoPodeSanear(feito, "Peças", contagem)).toBe(true);
    expect(criteriosPendentesDoGrupo(feito, "Peças", contagem)).toEqual([]);
  });
  it("antes só os critérios aprovados contavam: o manual não aprovado deixava o grupo ser saneado; agora é pendência", () => {
    const soAuto = { criterios: aprov("ncm"), tratados: marcas("Peças", "ncm"), saneados: {} };
    expect(grupoPodeSanear(soAuto, "Peças", contagem)).toBe(false);
    expect(ids(criteriosPendentesDoGrupo(soAuto, "Peças", contagem))).toEqual(["identidade", "padrao", "utilizacao", "saldos", "cartilhas"]); // identidade, saldos e cartilhas: manuais; padrão e utilização: achados na base ainda sem aprovação
  });
  it("critério não aplicável, com justificativa, dispensa a conclusão nos grupos", () => {
    const na = () => ({ aprovado: false, naoAplicavel: { por: "ana", em: "2026-10-23", justificativa } });
    const e = completo({ criterios: { ...aprov("ncm", "padrao", "utilizacao"), identidade: na(), saldos: na(), cartilhas: na() }, tratados: marcas("Peças", "ncm") });
    expect(grupoPodeSanear(e, "Peças", contagem)).toBe(true);
    expect(ids(criteriosPendentesDoGrupo(e, "Insumos", contagem))).toEqual(["ncm", "padrao", "utilizacao"]); // em Insumos os três têm achado
  });
  it("base sem achado: os critérios automáticos abrem aprovados, mas os manuais ainda pedem conclusão", () => {
    const limpos = [item(2, "Peças"), item(3, "Peças")]; const c = contarAchados(calcularAchados(limpos, criarTestes(limpos, {})), limpos.length);
    const vazio = { criterios: {}, tratados: {}, saneados: {} };
    expect(ids(criteriosPendentesDoGrupo(vazio, "Peças", c))).toEqual(["identidade", "saldos", "cartilhas"]); // sem achado, os automáticos (NCM inclusive) abrem aprovados e tratados
    expect(grupoPodeSanear(vazio, "Peças", c)).toBe(false);
    const manuais = { criterios: aprov("identidade", "saldos", "cartilhas"), tratados: marcas("Peças", "identidade", "saldos", "cartilhas"), saneados: {} };
    expect(grupoPodeSanear(manuais, "Peças", c)).toBe(true);
    expect(grupoPodeSanear(manuais, "Peças", null)).toBe(false); // sem base não há o que afirmar
  });
  it("critério automático aprovado sem achado no grupo não trava o saneamento", () => {
    const e = completo({ tratados: marcas("Peças", "ncm", "identidade", "saldos", "cartilhas") });
    expect(grupoPodeSanear(e, "Peças", contagem)).toBe(true); // padronização e utilização não acharam nada em Peças
    expect(grupoPodeSanear(e, "Insumos", contagem)).toBe(false); // em Insumos tem NCM, padronização, utilização e os manuais a tratar
  });
  it("sem nenhum critério aprovado, nenhum grupo pode ser saneado", () => {
    expect(grupoPodeSanear({ criterios: {}, tratados: {}, saneados: {} }, "Peças", null)).toBe(false);
  });
  it("grupo saneado de fato: a marca do analista vale enquanto não aparece pendência (critério reaberto depois tira o grupo)", () => {
    const e = completo({ tratados: marcas("Peças", "ncm", "identidade", "saldos", "cartilhas"), saneados: { "Peças": true } });
    expect(grupoSaneado(e, "Peças", contagem)).toBe(true);
    const reaberto = { ...e, criterios: { ...e.criterios, identidade: { aprovado: false } } };
    expect(grupoSaneado(reaberto, "Peças", contagem)).toBe(false); expect(reaberto.saneados["Peças"]).toBe(true); // a marca antiga continua guardada, mas não vale
    expect(grupoSaneado({ ...e, saneados: {} }, "Peças", contagem)).toBe(false);
  });
});
