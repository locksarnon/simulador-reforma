import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TabelaPadrao from "./TabelaPadrao";
import TabelaDensa from "./saneamento-estoques/TabelaDensa";
import TabelaUnica from "./saneamento-estoques/TabelaUnica";
import { chaves } from "./saneamento-estoques/api";
import { chaveDasLarguras } from "@/lib/useLargurasColunas";
import { cabecalhoTabelaCls } from "@/lib/estiloTabela";

const armazenamento = (inicial = {}) => {
  const d = new Map(Object.entries(inicial));
  return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k) };
};
afterEach(() => { vi.unstubAllGlobals(); });

const COLUNAS = [{ chave: "nome", rotulo: "Nome" }, { chave: "valor", rotulo: "Valor", tipo: "moeda" }];
const LINHAS = [{ id: 1, nome: "Parafuso", valor: 10 }, { id: 2, nome: "Porca", valor: 5 }];

describe("tabela padrão: larguras, títulos e busca", () => {
  it("cada título tem a alça de largura, verde-escuro com texto branco, e o menu Colunas tem Restaurar larguras", () => {
    vi.stubGlobal("localStorage", armazenamento());
    const html = renderToStaticMarkup(<TabelaPadrao id="t-larg" colunas={COLUNAS} linhas={LINHAS} ariaLabel="Teste" />);
    expect(html).toContain('aria-label="Ajustar a largura da coluna Nome"');
    expect(html).toContain('aria-label="Ajustar a largura da coluna Valor"');
    expect(html).toContain(cabecalhoTabelaCls);
    expect(html).toContain('class="linha-filtros"'); // a linha de filtros fica clara
    expect(html).not.toContain("table-layout"); // sem largura escolhida e sem medir (servidor): layout automático
  });

  it("aplica a largura guardada (layout fixo, a coluna com a largura escolhida)", () => {
    vi.stubGlobal("localStorage", armazenamento({ [chaveDasLarguras("t-larg")]: JSON.stringify({ nome: 222 }) }));
    const html = renderToStaticMarkup(<TabelaPadrao id="t-larg" colunas={COLUNAS} linhas={LINHAS} ariaLabel="Teste" />);
    expect(html).toContain("table-layout:fixed");
    expect(html).toMatch(/data-coluna="nome"[^>]*style="width:222px"/);
    expect(html).toContain('aria-valuenow="222"');
    expect(html).toContain('title="Parafuso"'); // texto cortado mostra o inteiro ao parar o mouse
  });

  it("sem id, a largura fica guardada pelo nome da tabela e as colunas", () => {
    vi.stubGlobal("localStorage", armazenamento({ [chaveDasLarguras("auto:Sem id:nome,valor")]: JSON.stringify({ valor: 99 }) }));
    const html = renderToStaticMarkup(<TabelaPadrao colunas={COLUNAS} linhas={LINHAS} ariaLabel="Sem id" />);
    expect(html).toMatch(/data-coluna="valor"[^>]*style="width:99px"/);
  });

  it("tabela simples: busca só com 5 linhas ou mais", () => {
    vi.stubGlobal("localStorage", armazenamento());
    const poucas = renderToStaticMarkup(<TabelaPadrao simples colunas={COLUNAS} linhas={LINHAS} ariaLabel="Curta" />);
    expect(poucas).not.toContain("Buscar nesta lista");
    const muitas = Array.from({ length: 6 }, (_, i) => ({ id: i, nome: `Item ${i}`, valor: i }));
    expect(renderToStaticMarkup(<TabelaPadrao simples colunas={COLUNAS} linhas={muitas} ariaLabel="Longa" />)).toContain("Buscar nesta lista");
  });
});

describe("tabela densa (Saneamento): larguras e títulos", () => {
  const COLS = [{ chave: "codigo", rotulo: "Código", largura: 100, fixa: true }, { chave: "descricao", rotulo: "Descrição", largura: 200, elastica: true }];
  const LIN = [{ id: 1, codigo: "001", descricao: "Parafuso" }];

  it("alça em cada título, títulos verdes, busca e Restaurar larguras; antes de medir vale a largura configurada", () => {
    vi.stubGlobal("localStorage", armazenamento());
    const html = renderToStaticMarkup(<TabelaDensa id="d-larg" ariaLabel="Densa" colunas={COLS} linhas={LIN} />);
    expect(html).toContain('aria-label="Ajustar a largura da coluna Código"');
    expect(html).toContain('aria-label="Ajustar a largura da coluna Descrição"');
    expect(html).toContain("Buscar nesta lista");
    expect(html).toContain("bg-cabecalho");
    expect(html).toMatch(/data-coluna="descricao"[^>]*style="width:200px;flex-grow:1/);
  });

  it("aplica a largura guardada; a coluna elástica com largura escolhida para de crescer e a fixa seguinte anda junto", () => {
    vi.stubGlobal("localStorage", armazenamento({ [chaveDasLarguras("d-larg")]: JSON.stringify({ codigo: 160, descricao: 300 }) }));
    const html = renderToStaticMarkup(<TabelaDensa id="d-larg" ariaLabel="Densa" colunas={COLS} linhas={LIN} />);
    expect(html).toMatch(/role="columnheader" data-coluna="codigo"[^>]*style="width:160px;left:0"/);
    expect(html).toMatch(/role="columnheader" data-coluna="descricao"[^>]*style="width:300px"/);
    expect(html).not.toMatch(/data-coluna="descricao"[^>]*flex-grow/);
    expect(html).toContain("width:460px"); // a largura total das linhas segue a soma
  });
});

describe("tabela única (Saneamento): larguras e títulos", () => {
  const projeto = { id: "p1", versao: 3, estabelecimentos: [], modulos: { conciliacao: false }, atividades: [], atividadesConfirmadas: true, parametros: {} };
  const filtro = { busca: "", camada: "", situacao: "", grupo: "", revisar: false, ordem: "codigo" };
  const item = { id: "i1", codigo: "000123", estabelecimento: "", descricao: "PARAFUSO", grupo: "Ferragens", finalidade: "REVENDA", ativo: true, celulas: [] };
  const montar = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(chaves.itens("p1", filtro), { pages: [{ itens: [item], proximo: null, total: 1 }], pageParams: [undefined] });
    return renderToStaticMarkup(<QueryClientProvider client={qc}><TabelaUnica projeto={projeto} /></QueryClientProvider>);
  };

  it("alça nos títulos das colunas, cabeçalho verde nas duas faixas", () => {
    vi.stubGlobal("localStorage", armazenamento());
    const html = montar();
    expect(html).toContain('aria-label="Ajustar a largura da coluna Código"');
    expect(html).toContain('aria-label="Ajustar a largura da coluna Descrição"');
    expect((html.match(new RegExp(cabecalhoTabelaCls, "g")) || []).length).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/role="columnheader" data-coluna="descricao"[^>]*style="width:280px;left:116px"/);
  });

  it("largura guardada: muda a coluna, a posição da fixa seguinte e a largura das linhas", () => {
    vi.stubGlobal("localStorage", armazenamento({ [chaveDasLarguras("saneamento-estoques-tabela-unica")]: JSON.stringify({ codigo: 200 }) }));
    const html = montar();
    expect(html).toMatch(/role="columnheader" data-coluna="codigo"[^>]*style="width:200px;left:0"/);
    expect(html).toMatch(/role="columnheader" data-coluna="descricao"[^>]*style="width:280px;left:200px"/);
    expect(html).toContain("Restaurar larguras");
  });
});
