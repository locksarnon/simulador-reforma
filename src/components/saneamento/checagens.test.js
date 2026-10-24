import { describe, expect, it } from "vitest";
import { CRITERIOS, agruparPorGrupo, criarTestes } from "./logica";
import { calcularAchados, contarAchados } from "./analise";
import { checagemDe, checagens, linhasEvidencia, resumoChecagens, textoCausa, textoCobertura, textoConclusao } from "./checagens";

const item = (linha, grupo, extra = {}) => ({ linha, codigo: `C${linha}`, descricao: `ITEM ${linha}`, unidade: "UN", grupo_atual: grupo, ultima_mov: "2026-01-10", problemas: [], ...extra });
const ncm = [{ codigo: "NCM_FORMATO", mensagem: "NCM errado" }];
// Peças: 3 itens (2 com problema de NCM); Insumos: 2 itens (NCM, padronização e utilização com achado)
const itens = [item(2, "Peças", { problemas: ncm }), item(3, "Peças"), item(4, "Insumos", { problemas: ncm, descricao: "ANEL  TRAVA" }), item(5, "Insumos", { ultima_mov: null }), item(6, "Peças", { problemas: ncm })];
const grupos = agruparPorGrupo(itens);
const achados = calcularAchados(itens, criarTestes(itens, {}));
const contagem = (baseId = "v1", cobertura = {}) => contarAchados(achados, itens.length, cobertura, baseId);
const aprov = (...cs) => Object.fromEntries(cs.map((c) => [c, { aprovado: true, por: "ana", em: "2026-10-20" }]));
const crit = (id) => CRITERIOS.find((c) => c.id === id);
const justificativa = "O cliente não usa este controle no escopo do projeto.";
const manual = (extra = {}) => ({ por: "ana", em: "2026-10-23", base: "v1", resultado: "SEM_ACHADOS", nota: "conferido no ERP com o almoxarifado", ...extra });
const ch = (estado, id, c = contagem()) => checagemDe(estado, crit(id), c, grupos);

describe("quatro estados da checagem", () => {
  it("sem base nada foi verificado: toda checagem fica pendente, menos a declarada não aplicável", () => {
    const e = { criterios: { saldos: { aprovado: false, naoAplicavel: { por: "ana", em: "2026-10-23", justificativa } } }, tratados: {} };
    const lista = checagens(e, null, []);
    expect(lista.map((c) => c.id)).toEqual(CRITERIOS.map((c) => c.id));
    expect(lista.filter((c) => c.id !== "saldos").every((c) => c.conclusao === "PENDENTE" && c.causa === "SEM_BASE")).toBe(true);
    expect(lista.find((c) => c.id === "saldos")).toMatchObject({ conclusao: "NAO_APLICAVEL", causa: null });
    expect(lista[0].cobertura).toMatchObject({ itens: 0, grupos: 0 }); expect(textoCobertura(lista[0])).toBe("Sem base com itens em escopo: nada foi examinado");
  });

  it("teste automático que rodou por inteiro e não achou nada: verificada sem achados, com a cobertura e a evidência da própria execução", () => {
    const c = ch({ criterios: {}, tratados: {} }, "duplicidade");
    expect(c).toMatchObject({ tipo: "AUTOMATICA", conclusao: "SEM_ACHADOS", causa: null, achados: 0, situacaoRegra: "AUTO" });
    expect(c.cobertura).toMatchObject({ itens: 5, grupos: 2, gruposConcluidos: 2, gruposPendentes: [], analise: { executada: true } });
    expect(textoCobertura(c)).toBe("Teste automático em 5 itens de 2 grupos; análise da importação executada (a investigação de duplicidades)");
    expect(linhasEvidencia(c)).toEqual(["Teste automático sem achados: a regra abriu aprovada"]); expect(textoConclusao(c)).toBe("Verificada sem achados");
    const semDependencia = ch({ criterios: {}, tratados: {} }, "descricao"); // teste automático que não depende de análise opcional
    expect(semDependencia.cobertura.analise).toBeNull(); expect(textoCobertura(semDependencia)).toBe("Teste automático em 5 itens de 2 grupos");
  });

  it("a análise da importação que não rodou deixa a checagem pendente, mesmo sem achados e mesmo com a regra aprovada", () => {
    const sem = { duplicidade: { completa: false, opcao: "duplicidades", falta: "a investigação de duplicidades" } };
    const c = ch({ criterios: aprov("duplicidade"), tratados: {} }, "duplicidade", contagem("v1", sem));
    expect(c).toMatchObject({ conclusao: "PENDENTE", causa: "SEM_ANALISE", situacaoRegra: "SEM_ANALISE" });
    expect(c.cobertura.analise).toMatchObject({ executada: false }); expect(textoCobertura(c)).toContain("NÃO executada"); expect(textoConclusao(c)).toBe("Pendente: a análise de que o teste depende não foi executada nesta base");
  });

  it("regra sem aprovação (ou reaberta para revisão manual) deixa a checagem pendente", () => {
    expect(ch({ criterios: {}, tratados: {} }, "ncm")).toMatchObject({ conclusao: "PENDENTE", causa: "REGRA_NAO_APROVADA", achados: 3 });
    expect(ch({ criterios: { ncm: { aprovado: false } }, tratados: {} }, "ncm")).toMatchObject({ conclusao: "PENDENTE", causa: "REGRA_REABERTA" });
    expect(ch({ criterios: { duplicidade: { aprovado: false } }, tratados: {} }, "duplicidade")).toMatchObject({ conclusao: "PENDENTE", causa: "REGRA_REABERTA" }); // revisar manualmente vale mesmo sem achados
    expect(textoCausa(ch({ criterios: {}, tratados: {} }, "ncm"))).toBe("a regra ainda não foi aprovada"); expect(textoCausa({ causa: null })).toBe("");
  });

  it("regra aprovada com achados: pendente enquanto há grupo sem conclusão; verificada com achados quando todos concluem", () => {
    const parcial = ch({ criterios: aprov("ncm"), tratados: { "Peças|ncm": { por: "ana", em: "2026-10-22", base: "v1" } } }, "ncm");
    expect(parcial).toMatchObject({ conclusao: "PENDENTE", causa: "GRUPOS_SEM_CONCLUSAO" }); expect(parcial.cobertura).toMatchObject({ gruposConcluidos: 1, gruposPendentes: ["Insumos"] });
    expect(textoCausa(parcial)).toBe("há grupos sem conclusão: 1 de 2 grupos concluídos"); expect(textoCobertura(parcial)).toContain("5 itens de 2 grupos");
    const todos = ch({ criterios: aprov("ncm"), tratados: { "Peças|ncm": { por: "ana", em: "2026-10-22", base: "v1" }, "Insumos|ncm": { por: "bia", em: "2026-10-23", base: "v1" } } }, "ncm");
    expect(todos).toMatchObject({ conclusao: "COM_ACHADOS", causa: null, achados: 3 }); expect(textoConclusao(todos)).toBe("Verificada com achados (3 achados)");
    expect(todos.evidencia.regra).toEqual({ por: "ana", em: "2026-10-20" }); expect(todos.evidencia.grupos).toEqual({ concluidos: 2, comEvidencia: 0, ultima: { por: "bia", em: "2026-10-23", base: "v1" } });
    expect(linhasEvidencia(todos)).toEqual(["Regra aprovada por ana em 20/10/2026", "2 grupos com achados concluídos pelo analista; última por bia em 23/10/2026"]);
  });

  it("a conclusão feita sobre outra base não vale: a checagem volta a ter grupos sem conclusão", () => {
    const e = { criterios: aprov("ncm"), tratados: { "Peças|ncm": { por: "ana", em: "2026-10-22", base: "v1" }, "Insumos|ncm": { por: "ana", em: "2026-10-22", base: "v1" } } };
    expect(ch(e, "ncm", contagem("v1")).conclusao).toBe("COM_ACHADOS"); expect(ch(e, "ncm", contagem("v2"))).toMatchObject({ conclusao: "PENDENTE", causa: "GRUPOS_SEM_CONCLUSAO" });
    expect(ch({ ...e, tratados: { "Peças|ncm": true, "Insumos|ncm": true } }, "ncm", contagem("v2")).conclusao).toBe("COM_ACHADOS"); // a marca antiga (true) vale como estava
  });

  it("conferência manual: conclui o grupo com o resultado e a evidência escrita; sem isso fica pendente", () => {
    const base = { criterios: aprov("identidade") };
    const sem = ch({ ...base, tratados: { "Peças|identidade": manual(), "Insumos|identidade": manual({ em: "2026-10-24", por: "bia" }) } }, "identidade");
    expect(sem).toMatchObject({ tipo: "MANUAL", conclusao: "SEM_ACHADOS", achados: null }); expect(textoCobertura(sem)).toBe("Conferência manual: 2 de 2 grupos concluídos");
    expect(linhasEvidencia(sem)).toEqual(["Regra aprovada por ana em 20/10/2026", "2 grupos concluídos com evidência escrita; última por bia em 24/10/2026"]);
    const com = ch({ ...base, tratados: { "Peças|identidade": manual(), "Insumos|identidade": manual({ resultado: "COM_ACHADOS", nota: "2 itens com produtos misturados no mesmo código" }) } }, "identidade");
    expect(com).toMatchObject({ conclusao: "COM_ACHADOS", achados: null }); expect(textoConclusao(com)).toBe("Verificada com achados"); // o número de achados não é calculado na conferência manual
    const antiga = ch({ ...base, tratados: { "Peças|identidade": true, "Insumos|identidade": { por: "ana", em: "2026-10-22" } } }, "identidade"); // marcas antigas, sem resultado nem evidência
    expect(antiga).toMatchObject({ conclusao: "PENDENTE", causa: "GRUPOS_SEM_CONCLUSAO" }); expect(antiga.cobertura.gruposConcluidos).toBe(0); expect(textoCobertura(antiga)).toBe("Conferência manual: 0 de 2 grupos concluídos");
    const curta = ch({ ...base, tratados: { "Peças|identidade": manual({ nota: "ok" }), "Insumos|identidade": manual() } }, "identidade");
    expect(curta.cobertura).toMatchObject({ gruposConcluidos: 1, gruposPendentes: ["Peças"] });
    expect(ch({ criterios: {}, tratados: { "Peças|identidade": manual(), "Insumos|identidade": manual() } }, "identidade")).toMatchObject({ conclusao: "PENDENTE", causa: "REGRA_NAO_APROVADA" }); // a regra de uma conferência manual também precisa estar aprovada
  });

  it("não se aplica: só vale com a justificativa escrita (10 caracteres); sem ela a checagem segue pendente", () => {
    const na = (j) => ({ criterios: { saldos: { aprovado: false, naoAplicavel: { por: "ana", em: "2026-10-23", justificativa: j } } }, tratados: {} });
    const c = ch(na(justificativa), "saldos");
    expect(c).toMatchObject({ conclusao: "NAO_APLICAVEL", causa: null }); expect(textoConclusao(c)).toBe("Não se aplica"); expect(textoCobertura(c)).toBe("Não se aplica a este projeto: nada foi examinado");
    expect(linhasEvidencia(c)).toEqual([`Declarada não aplicável por ana em 23/10/2026: ${justificativa}`]);
    expect(ch(na("curta"), "saldos")).toMatchObject({ conclusao: "PENDENTE", causa: "REGRA_REABERTA" });
  });

  it("resumo: conta cada estado e separa as pendências, com as de conferência manual à vista", () => {
    const e = { criterios: { ...aprov("identidade", "ncm"), saldos: { aprovado: false, naoAplicavel: { por: "ana", em: "2026-10-23", justificativa } } },
      tratados: { "Peças|identidade": manual(), "Insumos|identidade": manual(), "Peças|ncm": { por: "ana", em: "2026-10-22", base: "v1" } } };
    const r = resumoChecagens(checagens(e, contagem(), grupos));
    // automáticos sem achados: duplicidade, descricao, grupo, unidade (AUTO); NCM com um grupo por concluir; padrão e utilização com achado e sem aprovação; identidade concluída sem achados; saldos n/a; cartilhas pendente
    expect(r).toMatchObject({ total: 10, SEM_ACHADOS: 5, COM_ACHADOS: 0, NAO_APLICAVEL: 1, PENDENTE: 4, concluidas: 6 });
    expect(r.pendentes.map((c) => c.id).sort()).toEqual(["cartilhas", "ncm", "padrao", "utilizacao"]); expect(r.manuaisPendentes.map((c) => c.id)).toEqual(["cartilhas"]);
    expect(r.SEM_ACHADOS + r.COM_ACHADOS + r.NAO_APLICAVEL + r.PENDENTE).toBe(r.total);
  });
});
