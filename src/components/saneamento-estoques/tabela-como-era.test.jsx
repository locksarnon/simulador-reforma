import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TabelaUnica, { textoParaMedir } from "./TabelaUnica";
import { chaves } from "./api";
import {
  colunasDoCadastro, colunasExtras, dicaDoPar, gravarExtrasEscolhidas, lerExtrasEscolhidas, montarFiltroItens, mudouPar, textoDoCadastro,
} from "./logica";

const armazenamento = (inicial = {}) => {
  const d = new Map(Object.entries(inicial));
  return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k), dados: d };
};
afterEach(() => { vi.unstubAllGlobals(); });

const projeto = { id: "p1", versao: 3, estabelecimentos: [], modulos: { conciliacao: false }, atividades: [], atividadesConfirmadas: true, parametros: {} };
const filtro = { busca: "", camada: "", situacao: "", grupo: "", revisar: false, ordem: "codigo" };
const COLUNAS = {
  fundamentais: [
    { campo: "descricao", rotulo: "Descrição", alteravel: true }, { campo: "unidade", rotulo: "Unidade", alteravel: true }, { campo: "ncm", rotulo: "NCM", alteravel: true },
    { campo: "ativo", rotulo: "Ativo", alteravel: true }, { campo: "saldo", rotulo: "Saldo", alteravel: false }, { campo: "ultimaMovimentacao", rotulo: "Última movimentação", alteravel: false },
  ],
  extras: ["Cor", "Peso bruto"],
};
const item = {
  id: "i1", codigo: "000123", estabelecimento: "", descricao: "PARAFUSO", grupo: "Ferragens", finalidade: "REVENDA", ativo: true, celulas: [],
  como: { descricao: ["PARAFUSO", "PARAFUSO"], unidade: ["PC", "UN"], ncm: ["73181500", "73181500"], ativo: [true, true], saldo: [10, 12], ultimaMovimentacao: ["2025-03-10", "2025-03-10"] },
};

function montar({ extras } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(chaves.colunasDosItens("p1"), COLUNAS);
  const comExtras = extras?.length ? { ...item, extras: { Cor: ["Azul", "Verde"] } } : item;
  qc.setQueryData(chaves.itens("p1", extras?.length ? { ...filtro, extras } : filtro), { pages: [{ itens: [comExtras], proximo: null, total: 1 }], pageParams: [undefined] });
  return renderToStaticMarkup(<QueryClientProvider client={qc}><TabelaUnica projeto={projeto} /></QueryClientProvider>);
}
const ordemDosTitulos = (html) => [...html.matchAll(/role="columnheader" data-coluna="([^"]+)"/g)].map((m) => m[1]);

describe("Tabela: dados do item como era × como ficou", () => {
  it("cada campo fundamental importado vira um par, na ordem do catálogo, antes das camadas", () => {
    vi.stubGlobal("localStorage", armazenamento());
    const html = montar();
    const ids = ordemDosTitulos(html);
    expect(ids.slice(0, 2)).toEqual(["codigo", "descricao"]); // fixas como antes
    expect(ids.slice(2, 12)).toEqual(["era:descricao", "ficou:descricao", "era:unidade", "ficou:unidade", "era:ncm", "ficou:ncm", "era:ativo", "ficou:ativo", "valor:saldo", "valor:ultimaMovimentacao"]);
    // As camadas continuam todas, depois dos pares.
    expect(ids.indexOf("situacao-IDENTIFICACAO")).toBeGreaterThan(ids.indexOf("ficou:ativo"));
    expect(ids).toContain("grupo");
    expect(ids).toContain("finalidade");
    expect(html).toContain("Unidade (como era)");
    expect(html).toContain("Unidade (como ficou)");
    expect(html).toContain("Ativo/inativo (como ficou)");
    expect(html).toContain("Dados do item");
  });

  it("o \"como ficou\" que mudou fica em verde-claro e a dica mostra os dois valores", () => {
    vi.stubGlobal("localStorage", armazenamento());
    const html = montar();
    expect(html).toMatch(/data-coluna="ficou:unidade" data-alterada="true" class="[^"]*celula-alterada/);
    expect(html).toContain('title="Como era: PC\nComo ficou: UN"');
    expect(html).not.toMatch(/data-coluna="ficou:ncm" data-alterada/);
    expect(html).not.toMatch(/data-coluna="era:unidade"[^>]*celula-alterada/);
    expect(html).toContain(">Ativo<");
    // Legenda no alto da Tabela, com a mesma amostra da célula alterada.
    expect(html).toMatch(/data-legenda="alterado"[^>]*><span class="amostra-celula-alterada"[^>]*><\/span>alterado no saneamento/);
  });
  it("a célula alterada é inconfundível nos dois temas: fundo verde forte, negrito e barra verde à esquerda", async () => {
    const fs = await import("node:fs");
    const css = fs.readFileSync(new URL("../../index.css", import.meta.url), "utf8");
    const regra = css.match(/\.celula-alterada \{([^}]*)\}/)?.[1] || "";
    expect(regra).toContain("background-color: hsl(var(--celula-alterada))");
    expect(regra).toContain("font-weight: 600");
    expect(regra).toContain("inset 3px 0 0 hsl(var(--primary))");
    expect(css).toContain("--celula-alterada: 98 51% 80%;"); // #C6E6B3 no tema claro
    expect(css).toContain("--celula-alterada: 130 45% 26%;"); // verde-escuro visível no tema escuro
  });

  it("colunas extras do ERP ficam ocultas por padrão e o botão Colunas aparece", () => {
    vi.stubGlobal("localStorage", armazenamento());
    const html = montar();
    expect(html).not.toContain('data-coluna="extra:Cor"');
    expect(html).toContain("Colunas");
    expect(html).not.toContain("Outras colunas do ERP");
  });

  it("a escolha guardada do projeto mostra a coluna extra (com o destaque se mudou)", () => {
    const a = armazenamento();
    vi.stubGlobal("localStorage", a);
    gravarExtrasEscolhidas("p1", ["Cor"]);
    expect(lerExtrasEscolhidas("p1")).toEqual(["Cor"]);
    expect(lerExtrasEscolhidas("outro")).toEqual([]); // por projeto
    const html = montar({ extras: ["Cor"] });
    const ids = ordemDosTitulos(html);
    expect(ids.indexOf("extra:Cor")).toBeGreaterThan(ids.indexOf("ficou:ativo"));
    expect(ids.indexOf("extra:Cor")).toBeLessThan(ids.indexOf("situacao-IDENTIFICACAO"));
    expect(html).not.toContain('data-coluna="extra:Peso bruto"');
    expect(html).toMatch(/data-coluna="extra:Cor" data-alterada="true"/);
    expect(html).toContain("Outras colunas do ERP");
    expect(html).toContain("Colunas (1)");
  });

  it("armazenamento quebrado não derruba a tela (nenhuma extra escolhida)", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } });
    expect(lerExtrasEscolhidas("p1")).toEqual([]);
    expect(() => gravarExtrasEscolhidas("p1", ["Cor"])).not.toThrow();
  });
});

describe("Tabela: campo que nenhuma camada altera fica numa coluna só", () => {
  it("saldo e última movimentação: uma coluna com o valor da base, sem \"como era\"/\"como ficou\" nem destaque", () => {
    vi.stubGlobal("localStorage", armazenamento());
    const html = montar();
    const ids = ordemDosTitulos(html);
    expect(ids).not.toContain("era:saldo");
    expect(ids).not.toContain("ficou:saldo");
    expect(ids).not.toContain("era:ultimaMovimentacao");
    expect(html).not.toContain("Saldo (como");
    expect(html).toMatch(/role="columnheader" data-coluna="valor:saldo"[^>]*><span class="truncate">Saldo<\/span>/);
    // Valor da base (o atual), sem o destaque mesmo que a reimportação tenha trazido outro número.
    expect(html).toMatch(/data-coluna="valor:saldo" class="[^"]*"[^>]*><span[^>]*title="12"/);
    expect(html).not.toMatch(/data-coluna="valor:saldo" data-alterada/);
    expect(html).toContain(">10/03/2025<");
  });
});

describe("lógica dos pares", () => {
  it("colunas do cadastro e extras", () => {
    expect(colunasDoCadastro([{ campo: "unidade", rotulo: "Unidade", alteravel: true }]).map((c) => c.titulo)).toEqual(["Unidade (como era)", "Unidade (como ficou)"]);
    expect(colunasDoCadastro([{ campo: "saldo", rotulo: "Saldo", alteravel: false }])).toEqual([expect.objectContaining({ id: "valor:saldo", titulo: "Saldo", tipo: "valor" })]);
    expect(colunasDoCadastro([{ campo: "fabricante", rotulo: "Fabricante" }]).map((c) => c.id)).toEqual(["valor:fabricante"]);
    expect(colunasExtras(["Cor"])[0]).toMatchObject({ id: "extra:Cor", titulo: "Cor", tipo: "extra" });
  });
  it("mudou, texto e dica", () => {
    expect(mudouPar(["PC", "UN"])).toBe(true);
    expect(mudouPar([10, 10])).toBe(false);
    expect(mudouPar([null, undefined])).toBe(false);
    expect(textoDoCadastro("ativo", false)).toBe("Inativo");
    expect(textoDoCadastro("saldo", 1234.5)).toBe("1.234,5");
    expect(textoDoCadastro("ultimaMovimentacao", "2025-03-10")).toBe("10/03/2025");
    expect(textoDoCadastro("finalidade", "REVENDA")).toBe("Revenda");
    expect(textoDoCadastro("ncm", null)).toBe("—");
    expect(dicaDoPar("unidade", ["PC", "UN"])).toBe("Como era: PC\nComo ficou: UN");
    expect(dicaDoPar("unidade", ["UN", "UN"])).toBe("UN");
  });
  it("mede o texto dos pares para a largura automática", () => {
    expect(textoParaMedir(item, "era:unidade")).toEqual({ texto: "PC" });
    expect(textoParaMedir(item, "ficou:unidade")).toEqual({ texto: "UN" });
  });
  it("só pede ao servidor as extras escolhidas", () => {
    expect(montarFiltroItens({}, { extras: ["Cor"] })).toEqual({ extras: '["Cor"]', limite: 300 });
    expect(montarFiltroItens({}, { extras: [] })).toEqual({ limite: 300 });
  });
});
