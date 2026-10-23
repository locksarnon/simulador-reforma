import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { CRITERIOS, agruparPorGrupo, aplicarEscopo, criarTestes } from "./logica";
import { calcularAchados, contarAchados } from "./analise";
import { montarListas } from "./listasFinais";
import { montarPolitica } from "./politica";
import { RESSALVAS, andamentoDosPassos, montarRelatorioFinal } from "./relatorioFinal";
import { desenharRelatorio, limparTextoPdf } from "./relatorioPdf";
import { aprovarLote } from "./inativacao";

// O jsPDF devolve o próprio objeto da função construtora: para gravar o texto desenhado, embrulha-se o método `text` do documento real.
class Gravador {
  constructor(...a) {
    const doc = new jsPDF(...a); const texto = doc.text.bind(doc); doc.textos = [];
    doc.text = (t, ...r) => { doc.textos.push(Array.isArray(t) ? t.join(" ") : String(t)); return texto(t, ...r); };
    return doc;
  }
}

const item = (linha, extra = {}) => ({ linha, codigo: `C${linha}`, descricao: "PARAFUSO SEXTAVADO", unidade: "UN", grupo_atual: "Peças", ultima_mov: "2026-03-01", ncm: "73181500", ncm_original: "73181500", problemas: [], c_class_trib_informado: "000001",
  sugestao: { c_class_trib: "000001", descricao: "Tributação integral", reducao: 0, confianca: "Sem enquadramento nos anexos consultados (padrão)", ambiguo: false, anexo: null, padrao: true }, ...extra });
const dup = (mestre) => ({ nivel: "EXATA", score: 1, grupo: 0, mestre, candidatos: [{ linha: mestre, score: 1, nivel: "EXATA", motivos: ["descrição idêntica"] }] });
const itens = [item(2, { descricao: "ANEL  TRAVA 123", duplicidade: dup(3) }), item(3, { descricao: "ANEL TRAVA 123", duplicidade: dup(3) }), item(4, { grupo_atual: "Insumos", descricao: "ADUBO", unidade: "QUILOGRAM" }), item(5, { ultima_mov: "2020-01-01" })];
const ok = { aprovado: true, por: "ana", em: "2026-10-20" }; const marca = { por: "ana", em: "2026-10-22" };
const estado = {
  // Peças é um grupo saneado de verdade: critérios aprovados (identidade, não aplicável, com justificativa) e tratados nele
  params: { desde: "2025-01-01", semData: "manter" }, criterios: { padrao: { ...ok, regra: "Regra registrada de padronização." }, duplicidade: ok, unidade: ok, saldos: ok, cartilhas: ok, identidade: { aprovado: false, naoAplicavel: { por: "ana", em: "2026-10-21", justificativa: "Um só fabricante por código neste cadastro." } } },
  tratados: { "Peças|padrao": marca, "Peças|duplicidade": marca, "Peças|saldos": marca, "Peças|cartilhas": marca },
  decisoes: { "C2|duplicidade": { acao: "ENC", status: "APR", grupo: "Peças", destino: "C3", decididoPor: "ana", decididoEm: "2026-10-21" }, "C4|unidade": { acao: "ENC", status: "PROP", grupo: "Insumos" } },
  saneados: { "Peças": true }, piloto: { "Unificar duplicados": { status: "Testado", evidencia: "doc SAP 123" } }, padronizacao: { regras: {}, abreviacoes: {} }, politicaUnidade: { ativa: true, regras: {} },
  fiscal: { decisoes: {}, grupos: {} }, politica: { secoes: { criar: { responsavel: "Gestor", controle: "Amostragem" } } }, gruposFora: {},
};
const escopo = aplicarEscopo(itens, estado.params, estado.gruposFora); const testes = criarTestes(escopo.emEscopo, estado);
const contagem = contarAchados(calcularAchados(escopo.emEscopo, testes), escopo.emEscopo.length); const grupos = agruparPorGrupo(escopo.emEscopo);
const listas = montarListas({ nomeProjeto: "Projeto X", nomeBase: "itens.xlsx", estado, itens, escopo, testes });
const politica = montarPolitica({ estado, contagem, escopo, grupos, nomeProjeto: "Projeto X", nomeBase: "itens.xlsx" });
const relatorio = montarRelatorioFinal({ nomeProjeto: "Projeto X", nomeBase: "itens.xlsx", quem: "ana", estado, itens, escopo, contagem, listas, politica, geradoEm: new Date(2026, 9, 23, 10, 0) });
const tabelaDe = (rel, primeiraColuna) => rel.blocos.find((b) => b.t === "tabela" && b.cols[0].label === primeiraColuna);
const textos = (rel) => rel.blocos.flatMap((b) => (b.t === "tabela" ? b.linhas.flat() : b.t === "kv" ? b.linhas.flat() : b.t === "lista" ? b.itens : [b.texto])).map(String);

describe("relatório do programa de trabalho", () => {
  it("resume o andamento de cada passo sem dar por feito o que não foi", () => {
    const a = andamentoDosPassos({ estado, itens, escopo, grupos, contagem, listas, politica });
    expect(a.map((x) => x[0])).toEqual(["1. Triagem", "2. Critérios", "3. Piloto SAP", "4. Análises", "5. De/para", "6. Execução", "7. Conferência", "8. Fiscal", "9. Política"]);
    const por = Object.fromEntries(a.map(([p, s, r]) => [p, [s, r]]));
    expect(por["1. Triagem"]).toEqual(["Concluído", "3 itens em escopo de 4"]); expect(por["2. Critérios"][0]).toBe("Em andamento"); expect(por["3. Piloto SAP"]).toEqual(["Em andamento", "1 de 4 casos testados"]);
    expect(por["4. Análises"]).toEqual(["Em andamento", "1 de 2 grupos saneados"]); expect(por["5. De/para"]).toEqual(["Em andamento", "1 de 2 casos decididos"]);
    expect(por["8. Fiscal"]).toEqual(["Não iniciado", "0 de 1 grupos liberados com a revisão fiscal concluída"]); expect(por["9. Política"]).toEqual(["Em andamento", "política rascunho"]);
  });
  it("traz o escopo, o parâmetro de saneamento, os critérios com a regra registrada, o piloto e as decisões por critério", () => {
    const t = textos(relatorio).join("\n");
    expect(t).toContain("Parâmetro de saneamento: desconsiderar itens não movimentados desde 01/01/2025. Itens sem data de movimentação legível permaneceram no escopo, sinalizados.");
    const grp = tabelaDe(relatorio, "Grupo de itens"); expect(grp.linhas).toEqual([["Peças", "3", "2", "Sim"], ["Insumos", "1", "1", "Sim"]]);
    const crit = tabelaDe(relatorio, "Critério"); expect(crit.linhas.find((l) => l[0] === "Padronização da descrição")).toEqual(["Padronização da descrição", "Automático", "Aprovado por ana em 20/10/2026", "1"]);
    expect(crit.linhas.find((l) => l[0] === "Identidade do produto")[2]).toBe("Não se aplica ao projeto (ana, 21/10/2026): Um só fabricante por código neste cadastro.");
    expect(crit.linhas.find((l) => l[0] === "Saldos e sinais de excesso")[2]).toBe("Aprovado por ana em 20/10/2026"); expect(crit.linhas).toHaveLength(CRITERIOS.length);
    expect(t).toContain("Critério declarado não aplicável a este projeto. Justificativa: Um só fabricante por código neste cadastro.");
    expect(t).toContain("Regra registrada de padronização.");
    const piloto = tabelaDe(relatorio, "Caso"); expect(piloto.linhas[0]).toEqual(["Unificar duplicados", "Testado", "doc SAP 123", "—"]); expect(piloto.linhas[1][1]).toBe("Não iniciado");
    const dec = relatorio.blocos.filter((b) => b.t === "tabela").find((b) => b.cols[1].label === "Encaminhadas");
    expect(dec.linhas).toEqual([["Duplicidade", "1", "1", "0", "0"], ["Unidade de medida", "1", "0", "0", "1"]]);
  });
  it("mostra os resultados aprovados, a execução, a revisão fiscal por grupo liberado e a política com responsável e controle", () => {
    const kv = relatorio.blocos.filter((b) => b.t === "kv").flatMap((b) => b.linhas); const k = (r) => kv.find((l) => l[0] === r)?.[1];
    expect(k("Unificações aprovadas")).toBe("1"); expect(k("Em escopo")).toBe("3"); expect(k("Fora do escopo (candidatos à inativação por data de uso)")).toBe("1"); expect(k("Inativação aprovada (lote com lista fechada ou individual)")).toBe("0"); expect(k("Política de uso")).toBe("em rascunho"); expect(k("Gerado por")).toBe("ana");
    const fisc = relatorio.blocos.find((b) => b.t === "tabela" && b.cols.some((c) => c.label === "A decidir")); expect(fisc.cols.map((c) => c.label)).toEqual(["Grupo", "Itens", "A decidir", "A revisar com especialista", "Decididos", "Situação"]);
    expect(fisc.linhas).toEqual([["Peças", "1", "0", "0", "0", "Em revisão"]]); // o item 2 sai por unificação aprovada: só o item mantido entra na revisão
    const t = textos(relatorio);
    expect(t).toContain("Responsável: Gestor. Controle: Amostragem."); expect(t).toContain("Responsável: a definir. Controle: a definir.");
    for (const r of RESSALVAS) expect(t).toContain(r);
    expect(t.some((x) => x.includes("não é probabilidade"))).toBe(true);
  });
  it("a inativação por data de uso aparece como candidatos e só como aprovada onde há aprovação (lote com lista fechada, base, data e aprovador)", () => {
    const sem = textos(relatorio).join(" | "); expect(sem).toContain("O corte por data seleciona candidatos para avaliação e não autoriza a inativação.");
    const g = tabelaDe(relatorio, "Grupo"); expect(g).toBeTruthy();
    const tab = relatorio.blocos.find((b) => b.t === "tabela" && b.cols[1]?.label === "Candidatos"); expect(tab.linhas).toEqual([["Peças", "1", "0", "0", "1"]]); // C5 é candidato e ninguém o aprovou
    const ina = aprovarLote(null, "Peças", { lista: ["C5"], justificativa: "Item parado, conferido pelo almoxarifado.", verificacoes: {}, base: { id: "v1", arquivo: "itens.xlsx" }, extraidaEm: "2026-10-21", corte: "2025-01-01", semData: "manter", por: "ana", em: "2026-10-22", saldoLidoEmTodos: true });
    const e2 = { ...estado, inativacao: ina }; const l2 = montarListas({ nomeProjeto: "Projeto X", nomeBase: "itens.xlsx", estado: e2, itens, escopo, testes });
    const r2 = montarRelatorioFinal({ nomeProjeto: "Projeto X", nomeBase: "itens.xlsx", quem: "ana", estado: e2, itens, escopo, contagem, listas: l2, politica, geradoEm: new Date(2026, 9, 23, 10, 0) });
    const tab2 = r2.blocos.find((b) => b.t === "tabela" && b.cols[1]?.label === "Candidatos"); expect(tab2.linhas).toEqual([["Peças", "1", "1", "0", "0"]]);
    const t2 = textos(r2); expect(t2.some((x) => x.startsWith("Grupo Peças: lista fechada de 1 item aprovada por ana em 22/10/2026, na base itens.xlsx (extração de 21/10/2026; corte 01/01/2025). Justificativa: Item parado"))).toBe(true);
    expect(r2.blocos.find((b) => b.t === "kv" && b.linhas.some((l) => l[0] === "Inativação aprovada (lote com lista fechada ou individual)")).linhas.find((l) => l[0].startsWith("Inativação aprovada"))[1]).toBe("1");
  });
  it("sem nada feito, o relatório diz que está pendente em vez de concluir", () => {
    const vazio = { ...estado, criterios: {}, decisoes: {}, saneados: {}, piloto: {}, politica: {}, fiscal: {} };
    const e2 = aplicarEscopo(itens, vazio.params); const t2 = criarTestes(e2.emEscopo, vazio); const c2 = contarAchados(calcularAchados(e2.emEscopo, t2), e2.emEscopo.length);
    const l2 = montarListas({ nomeProjeto: "P", nomeBase: "b", estado: vazio, itens, escopo: e2, testes: t2 }); const p2 = montarPolitica({ estado: vazio, contagem: c2, escopo: e2, grupos: agruparPorGrupo(e2.emEscopo), nomeProjeto: "P" });
    const r = montarRelatorioFinal({ nomeProjeto: "P", nomeBase: "b", quem: "x", estado: vazio, itens, escopo: e2, contagem: c2, listas: l2, politica: p2 });
    const t = textos(r); expect(t).toContain("Nenhum caso foi encaminhado para aprovação até agora."); expect(t.some((x) => x.startsWith("Nenhum grupo foi liberado para a revisão fiscal"))).toBe(true);
    expect(tabelaDe(r, "Caso").linhas.every((l) => l[1] === "Não iniciado")).toBe(true);
  });
});

describe("PDF do relatório", () => {
  it("limpa o que a fonte do PDF não desenha e mantém acentos e sinais comuns", () => {
    expect(limparTextoPdf("Ação → ≥ 5 ≈ 3 ✓ ç é ã ° · × ÷ — “ok” …")).toBe("Ação -> >= 5 ~ 3 ok ç é ã ° · × ÷ — “ok” …");
    expect(limparTextoPdf("sem emoji \u{1F600} nem ▲")).toBe("sem emoji  nem "); expect(limparTextoPdf(null)).toBe("");
  });
  it("desenha o relatório de verdade (jsPDF real): várias páginas, cabeçalho de tabela repetido, rodapé numerado e texto limpo", () => {
    const muitos = { ...relatorio, blocos: [...relatorio.blocos, { t: "tabela", cols: [{ label: "Linha longa", w: 30 }, { label: "Texto", w: 70 }, { label: "Valor", w: 14, align: "right" }], linhas: Array.from({ length: 120 }, (_, i) => [`Item ${i + 1}`, `Descrição ${i + 1} → ${"palavra ".repeat(12)}`, String(i)]) }] };
    const doc = desenharRelatorio(Gravador, muitos);
    const n = doc.getNumberOfPages(); expect(n).toBeGreaterThan(3);
    expect(doc.textos).toContain(`Página 1 de ${n}`); expect(doc.textos).toContain(`Página ${n} de ${n}`); expect(doc.textos.filter((t) => t === "Linha longa").length).toBeGreaterThan(2);
    expect(doc.textos).toContain("Saneamento de estoques"); expect(doc.textos.some((t) => t.includes("→"))).toBe(false); expect(doc.textos.some((t) => t.includes("->"))).toBe(true);
    expect(doc.textos).toContain("1. Escopo e parâmetros"); expect(doc.textos).toContain("8. Ressalvas"); expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(5000);
  });
});
