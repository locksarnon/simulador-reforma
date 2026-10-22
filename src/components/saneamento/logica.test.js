import { describe, expect, it } from "vitest";
import { achadosUnidade, agruparPorGrupo, aplicarEscopo, criarTestes, dataDoCorte, decisoesDoTrabalho, grupoDe, normalizarParams, SEM_GRUPO, unidadeCanonica } from "./logica";

const item = (linha, ultima_mov, extra = {}) => ({ linha, ultima_mov, problemas: [], ...extra });

describe("parâmetro de saneamento: não movimentados desde a data", () => {
  const itens = [item(2, "2023-05-01"), item(3, "2024-10-20"), item(4, "2024-10-21"), item(5, "2026-01-10"), item(6, null)];
  const linhas = (lista) => lista.map((i) => i.linha);

  it("desconsidera os itens cuja última movimentação é anterior à data; o movimentado nela ou depois continua", () => {
    const r = aplicarEscopo(itens, { desde: "2024-10-21" });
    expect(linhas(r.fora)).toEqual([2, 3]);
    expect(linhas(r.emEscopo)).toEqual([4, 5, 6]);
    expect(r.resumo).toEqual({ total: 5, foraGrupos: 0, fora: 2, emEscopo: 3, semData: 1, semDataFora: 0, semDataIgnorada: false });
  });
  it("sem data, nada sai do escopo", () => {
    expect(aplicarEscopo(itens, { desde: "" }).resumo.fora).toBe(0);
    expect(aplicarEscopo(itens).resumo.fora).toBe(0);
    expect(aplicarEscopo(itens, {}).resumo.fora).toBe(0);
  });
  it("item sem data legível continua no escopo e fica sinalizado", () => {
    const r = aplicarEscopo(itens, { desde: "2030-01-01" });
    expect(r.semData).toEqual([6]);
    expect(linhas(r.emEscopo)).toEqual([6]);
  });
  it("a data do corte sai em DD/MM/AAAA", () => {
    expect(dataDoCorte({ desde: "2025-01-01" })).toBe("01/01/2025"); expect(dataDoCorte({ desde: "" })).toBe(""); expect(dataDoCorte(undefined)).toBe("");
  });
  it("projeto salvo com os dois cortes antigos vira uma data só: 'movimentados até X' = 'não movimentados desde X + 1 dia'", () => {
    expect(normalizarParams({ ateOn: true, ate: "2024-10-20", diasOn: false, dias: 540, dataBase: "2026-10-22" })).toEqual({ desde: "2024-10-21", semData: "manter" });
    expect(linhas(aplicarEscopo(itens, { ateOn: true, ate: "2024-10-20" }).fora)).toEqual([2, 3]); // mesmo resultado de antes
    expect(linhas(aplicarEscopo(itens, { ateOn: true, ate: "2024-10-21" }).fora)).toEqual([2, 3, 4]);
    expect(normalizarParams({ ateOn: true, ate: "2024-02-28" })).toEqual({ desde: "2024-02-29", semData: "manter" }); // ano bissexto
  });
  it("'parado há mais de N dias' antigo vira a data (data-base − N dias); com os dois cortes vale o mais recente", () => {
    expect(normalizarParams({ diasOn: true, dias: 365, dataBase: "2026-10-22" })).toEqual({ desde: "2025-10-22", semData: "manter" });
    expect(linhas(aplicarEscopo(itens, { diasOn: true, dias: 365, dataBase: "2026-10-22" }).fora)).toEqual([2, 3, 4]);
    expect(normalizarParams({ ateOn: true, ate: "2024-10-20", diasOn: true, dias: 365, dataBase: "2026-10-22" })).toEqual({ desde: "2025-10-22", semData: "manter" });
    expect(normalizarParams({ ateOn: true, ate: "2026-06-30", diasOn: true, dias: 365, dataBase: "2026-10-22" })).toEqual({ desde: "2026-07-01", semData: "manter" });
  });
  it("o estado que estava salvo na tela (0 dias, data-base 01/01/2025) vira 'não movimentados desde 01/01/2025'", () => {
    expect(normalizarParams({ ateOn: false, ate: "", diasOn: true, dias: 0, dataBase: "2025-01-01" })).toEqual({ desde: "2025-01-01", semData: "manter" });
  });
  it("corte antigo marcado mas incompleto ou inválido é ignorado, como antes", () => {
    expect(normalizarParams({ ateOn: true, ate: "" })).toEqual({ desde: "", semData: "manter" });
    expect(normalizarParams({ diasOn: true, dias: -3, dataBase: "2026-10-22" })).toEqual({ desde: "", semData: "manter" });
    expect(normalizarParams({ diasOn: true, dias: "x", dataBase: "2026-10-22" })).toEqual({ desde: "", semData: "manter" });
    expect(normalizarParams({ diasOn: true, dias: 30, dataBase: "lixo" })).toEqual({ desde: "", semData: "manter" });
    expect(normalizarParams(null)).toEqual({ desde: "", semData: "manter" }); expect(normalizarParams({ ateOn: false, diasOn: false })).toEqual({ desde: "", semData: "manter" });
  });
  it("formato novo passa como está", () => {
    expect(normalizarParams({ desde: "2025-03-01" })).toEqual({ desde: "2025-03-01", semData: "manter" });
  });
});

describe("grupos e unidades", () => {
  it("agrupa pela coluna do cliente e junta os sem grupo", () => {
    const g = agruparPorGrupo([item(2, null, { grupo_atual: "Peças" }), item(3, null, { grupo_atual: " Peças " }), item(4, null)]);
    expect(g.map((x) => [x.nome, x.itens.length])).toEqual([["Peças", 2], [SEM_GRUPO, 1]]);
    expect(grupoDe(item(9, null, { grupo_atual: "" }))).toBe(SEM_GRUPO);
  });
  it("reconhece variações da mesma unidade e aponta as fora do padrão dominante", () => {
    expect(unidadeCanonica("KGS")).toBe("kg"); expect(unidadeCanonica("Lt.")).toBe("l"); expect(unidadeCanonica("xyz")).toBeNull();
    const us = ["KG", "KG", "KG", "Kgs", "UN", ""].map((u, i) => item(i + 2, null, { unidade: u }));
    const t = achadosUnidade(us);
    expect(us.map((u) => t(u).achado)).toEqual([false, false, false, true, false, true]);
  });
});

describe("testes por critério e saneamento do grupo", () => {
  it("mapeia os problemas do validador para os critérios", () => {
    const it1 = item(2, "2025-01-01", { problemas: [{ codigo: "NCM_FORMATO", mensagem: "NCM errado" }], unidade: "KG" });
    const it2 = item(3, "2025-01-01", { problemas: [{ codigo: "DUPLICIDADE_PROVAVEL", mensagem: "Cadastro muito provavelmente duplicado" }], unidade: "KG" });
    const it3 = item(4, null, { unidade: "KG" });
    const t = criarTestes([it1, it2, it3]);
    expect(t.ncm(it1).achado).toBe(true); expect(t.ncm(it2).achado).toBe(false);
    expect(t.duplicidade(it2).achado).toBe(true);
    expect(t.utilizacao(it3).achado).toBe(true); expect(t.utilizacao(it1).achado).toBe(false);
  });
});

describe("itens sem data de movimentação: manter no escopo ou tratar como anteriores à data", () => {
  const itens = [item(2, "2023-05-01"), item(3, "2025-06-10"), item(4, null), item(5, null)];
  const linhas = (l) => l.map((i) => i.linha);
  it("por padrão ficam no escopo, sinalizados", () => {
    const r = aplicarEscopo(itens, { desde: "2025-01-01" });
    expect(linhas(r.fora)).toEqual([2]); expect(linhas(r.emEscopo)).toEqual([3, 4, 5]); expect(r.semData).toEqual([4, 5]);
    expect(r.resumo).toMatchObject({ semData: 2, semDataFora: 0, semDataIgnorada: false });
  });
  it("tratados como anteriores à data, saem junto, e a lista de sem data continua com todos", () => {
    const r = aplicarEscopo(itens, { desde: "2025-01-01", semData: "anterior" });
    expect(linhas(r.fora)).toEqual([2, 4, 5]); expect(linhas(r.emEscopo)).toEqual([3]); expect(r.semData).toEqual([4, 5]);
    expect(r.resumo).toEqual({ total: 4, foraGrupos: 0, fora: 3, emEscopo: 1, semData: 2, semDataFora: 2, semDataIgnorada: false });
  });
  it("a opção só vale com uma data de corte", () => {
    const r = aplicarEscopo(itens, { desde: "", semData: "anterior" });
    expect(r.fora).toEqual([]); expect(r.emEscopo).toHaveLength(4); expect(r.resumo.semDataFora).toBe(0);
  });
  it("base sem nenhuma data: a opção é ignorada, para a base inteira não sair do escopo", () => {
    const sem = [item(2, null), item(3, null)];
    const r = aplicarEscopo(sem, { desde: "2025-01-01", semData: "anterior" });
    expect(r.fora).toEqual([]); expect(r.emEscopo).toHaveLength(2); expect(r.resumo).toMatchObject({ semDataFora: 0, semDataIgnorada: true });
  });
  it("normalizarParams: valor desconhecido vira manter, e projeto antigo vem como manter", () => {
    expect(normalizarParams({ desde: "2025-01-01", semData: "qualquer" }).semData).toBe("manter");
    expect(normalizarParams({ desde: "2025-01-01", semData: "anterior" })).toEqual({ desde: "2025-01-01", semData: "anterior" });
    expect(normalizarParams({ ateOn: true, ate: "2024-10-20" })).toEqual({ desde: "2024-10-21", semData: "manter" });
    expect(normalizarParams({ semData: "anterior" })).toEqual({ desde: "", semData: "anterior" });
  });
});

describe("grupos do saneamento: os desmarcados saem do trabalho sem serem inativados", () => {
  const g = (linha, ultima_mov, grupo) => item(linha, ultima_mov, { grupo_atual: grupo });
  const itens = [g(2, "2023-05-01", "Peças"), g(3, "2026-01-10", "Peças"), g(4, "2023-05-01", "Insumos"), g(5, "2026-01-10", "Insumos"), g(6, null, "Insumos"), g(7, "2026-02-01", "")];
  const linhas = (l) => l.map((i) => i.linha);
  it("sem escolha, todos os grupos entram (e dois argumentos continuam valendo)", () => {
    const r = aplicarEscopo(itens, { desde: "2025-01-01" });
    expect(r.foraGrupos).toEqual([]); expect(r.resumo.foraGrupos).toBe(0);
    expect(linhas(r.fora)).toEqual([2, 4]); expect(linhas(r.emEscopo)).toEqual([3, 5, 6, 7]);
    expect(aplicarEscopo(itens, { desde: "2025-01-01" }, {})).toEqual(r);
  });
  it("grupo desmarcado sai antes do corte: não é fora do escopo, não é inativado e não conta como sem data", () => {
    const r = aplicarEscopo(itens, { desde: "2025-01-01", semData: "anterior" }, { Insumos: true });
    expect(linhas(r.foraGrupos)).toEqual([4, 5, 6]);
    expect(linhas(r.fora)).toEqual([2]); expect(linhas(r.emEscopo)).toEqual([3, 7]);
    expect(r.semData).toEqual([]); expect(r.resumo).toMatchObject({ total: 6, foraGrupos: 3, fora: 1, emEscopo: 2, semData: 0, semDataFora: 0 });
  });
  it("vale a partição: universo = grupos fora + fora do escopo + em escopo, em qualquer escolha", () => {
    for (const fora of [{}, { Peças: true }, { Insumos: true, "(sem grupo)": true }, { Peças: true, Insumos: true, "(sem grupo)": true }]) {
      for (const sem of ["manter", "anterior"]) { const r = aplicarEscopo(itens, { desde: "2025-01-01", semData: sem }, fora); expect(r.resumo.foraGrupos + r.resumo.fora + r.resumo.emEscopo).toBe(itens.length); }
    }
  });
  it("o item sem grupo é o grupo '(sem grupo)'", () => {
    const r = aplicarEscopo(itens, { desde: "" }, { "(sem grupo)": true });
    expect(linhas(r.foraGrupos)).toEqual([7]); expect(r.emEscopo).toHaveLength(5);
  });
  it("com todos os grupos desmarcados não há escopo (e a opção de sem data não quebra)", () => {
    const r = aplicarEscopo(itens, { desde: "2025-01-01", semData: "anterior" }, { Peças: true, Insumos: true, "(sem grupo)": true });
    expect(r.emEscopo).toEqual([]); expect(r.fora).toEqual([]); expect(r.foraGrupos).toHaveLength(6);
    expect(r.resumo.semDataIgnorada).toBe(true); // nenhum dos grupos marcados tem data: a opção não vale
  });
  it("a opção de tratar sem data como anterior só olha as datas dos grupos marcados", () => {
    const so = [g(2, "2026-01-10", "Peças"), g(3, null, "Insumos"), g(4, null, "Insumos")];
    const r = aplicarEscopo(so, { desde: "2025-01-01", semData: "anterior" }, { Peças: true });
    expect(r.resumo).toMatchObject({ foraGrupos: 1, semDataIgnorada: true, semDataFora: 0, emEscopo: 2 });
  });
  it("as decisões de itens de grupos fora do saneamento ficam guardadas, mas não contam no trabalho", () => {
    const e = aplicarEscopo(itens, { desde: "" }, { Insumos: true });
    const d = { "2|padrao": { status: "APR" }, "4|padrao": { status: "APR" }, "5|duplicidade": { status: "PROP" }, "3|unidade": { status: "PROP" } };
    expect(Object.keys(decisoesDoTrabalho(d, e))).toEqual(["2|padrao", "3|unidade"]);
    expect(decisoesDoTrabalho(d, aplicarEscopo(itens, { desde: "" }))).toBe(d); // sem grupo fora, é a mesma coisa
    expect(decisoesDoTrabalho(undefined, e)).toEqual({});
    expect(Object.keys(d)).toHaveLength(4); // nada foi apagado do projeto
  });
});
