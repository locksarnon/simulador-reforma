/** Tratamento para itens sem data de última movimentação: escolha obrigatória na importação, enviada à API e editável na Configuração. */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "a@b.c" } }) }));
const upload = vi.fn(async () => ({}));
vi.mock("@/api/client", () => ({ api: { upload: (...a) => upload(...a), get: vi.fn(async () => ({})), post: vi.fn(async () => ({})), put: vi.fn(async () => ({})), delete: vi.fn(async () => ({})), patch: vi.fn(async () => ({})) } }));

import { san } from "./api";
import { Mapeamento, Resultado, TratamentoSemData } from "./Importacao";
import Configuracao from "./Configuracao";
import Considerado from "./Considerado";
import {
  bloqueioDaConfirmacao, MENSAGEM_SEM_TRATAMENTO, rotuloTratamentoSemData, textoDecisaoSemData, textoItensSemData, textoTratamentoNaImportacao, TRATAMENTOS_SEM_DATA,
} from "./importacaoTela";

const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const montar = (ui) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><StaticRouter location="/">{ui}</StaticRouter></QueryClientProvider>);

const previa = {
  mapeamento: { codigo: "Cod", descricao: "Desc", ultimaMovimentacao: "Data Última Movimentação" },
  colunas: [{ indice: 0, nome: "Cod" }, { indice: 1, nome: "Desc" }, { indice: 2, nome: "Data Última Movimentação" }],
  sugestao: { colunas: [] }, relatorio: { aceitas: 3 },
  semDataMovimentacao: { itens: 1234, colunaMapeada: true, tratamentoAtual: null },
};

describe("Importação: tratamento para itens sem data de última movimentação", () => {
  it("as duas opções, com os nomes pedidos", () => {
    expect(TRATAMENTOS_SEM_DATA.map((t) => t.rotulo)).toEqual(["Considerar sem movimentação", "Deixar para tratar depois"]);
    expect(rotuloTratamentoSemData("DEPOIS")).toBe("Deixar para tratar depois");
  });

  it("aparece logo abaixo da linha Última movimentação do mapeamento, vazio por padrão, com a contagem de itens sem data", () => {
    const html = renderToStaticMarkup(<Mapeamento previa={previa} mapeamento={null} aoCorrigir={() => {}} aoAtualizar={() => {}} carregando={false} semData={null} aoEscolherSemData={() => {}} />);
    const t = texto(html);
    expect(t).toContain("Tratamento para itens sem data de última movimentação");
    expect(t.indexOf("Última movimentação")).toBeLessThan(t.indexOf("Tratamento para itens sem data"));
    expect(t).toContain("Considerar sem movimentação"); expect(t).toContain("Deixar para tratar depois");
    expect(html).not.toMatch(/type="radio"[^>]*checked/); // nada pré-selecionado
    expect(t).toContain("1.234 item(ns) do arquivo sem data de última movimentação");
    expect(t).toContain("Escolha uma opção para continuar");
  });

  it("escolha atual do projeto é só lembrada (não vem marcada); escolhida, fica marcada", () => {
    const comAtual = { ...previa, semDataMovimentacao: { ...previa.semDataMovimentacao, tratamentoAtual: "SEM_MOVIMENTACAO" } };
    const vazio = renderToStaticMarkup(<TratamentoSemData previa={comAtual} valor={null} aoEscolher={() => {}} />);
    expect(vazio).not.toMatch(/checked/); expect(texto(vazio)).toContain("Escolha atual do projeto: Considerar sem movimentação");
    const marcado = renderToStaticMarkup(<TratamentoSemData previa={comAtual} valor="DEPOIS" aoEscolher={() => {}} />);
    expect(marcado).toMatch(/value="DEPOIS"[^>]*checked|checked[^>]*value="DEPOIS"/);
  });

  it("mapeamento corrigido sem a escolha: 'Atualizar a prévia' desligado, com o motivo", () => {
    const html = renderToStaticMarkup(<Mapeamento previa={previa} mapeamento={{ ...previa.mapeamento, descricao: "Cod" }} aoCorrigir={() => {}} aoAtualizar={() => {}} carregando={false} semData={null} aoEscolherSemData={() => {}} />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Atualizar a prévia/);
    expect(texto(html)).toContain(MENSAGEM_SEM_TRATAMENTO);
    const escolhido = renderToStaticMarkup(<Mapeamento previa={previa} mapeamento={{ ...previa.mapeamento, descricao: "Cod" }} aoCorrigir={() => {}} aoAtualizar={() => {}} carregando={false} semData="DEPOIS" aoEscolherSemData={() => {}} />);
    expect(escolhido).not.toMatch(/<button[^>]*disabled=""[^>]*>Atualizar a prévia/);
  });

  it("confirmar fica bloqueado até escolher; o motivo diz onde escolher", () => {
    const ok = { podeImportar: true, faltam: [], mapeamentoPendente: false, aceitas: 3 };
    expect(bloqueioDaConfirmacao({ ...ok, semData: null })).toBe(MENSAGEM_SEM_TRATAMENTO);
    expect(MENSAGEM_SEM_TRATAMENTO).toContain("Última movimentação");
    expect(bloqueioDaConfirmacao({ ...ok, semData: "SEM_MOVIMENTACAO" })).toBeNull();
    expect(bloqueioDaConfirmacao({ ...ok, semData: "DEPOIS", aceitas: 0 })).toBeTruthy();
  });

  it("a escolha vai para a API na confirmação", async () => {
    upload.mockClear();
    const arquivo = { name: "itens.xlsx" };
    await san.importar("p1", arquivo, { codigo: "Cod" }, [], 1, "SEM_MOVIMENTACAO");
    expect(upload).toHaveBeenCalledWith("/saneamento-estoques/projetos/p1/importacoes", arquivo, expect.objectContaining({ semDataMovimentacao: "SEM_MOVIMENTACAO" }));
  });

  it("contagem: coluna não mapeada e base com data em todos", () => {
    expect(textoItensSemData({ semDataMovimentacao: { itens: 5, colunaMapeada: false } })).toContain("todos os 5");
    expect(textoItensSemData({ semDataMovimentacao: { itens: 0, colunaMapeada: true } })).toContain("Todos os itens do arquivo têm data");
    expect(textoItensSemData({})).toBeNull();
  });

  it("relatório da importação diz o tratamento e pede analisar de novo quando mudou", () => {
    const r = { aceitas: 3, rejeitadas: 0, pendentes: 0, novos: 3, semDataMovimentacao: { tratamento: "SEM_MOVIMENTACAO", itens: 2, alterouAnalise: true } };
    expect(textoTratamentoNaImportacao(r.semDataMovimentacao)).toContain("Considerar sem movimentação");
    const t = texto(renderToStaticMarkup(<Resultado r={r} />));
    expect(t).toContain("Itens sem data de última movimentação (2): Considerar sem movimentação");
    expect(t).toContain("analise a Qualidade e as Duplicidades de novo");
  });
});

describe("Configuração (1.1 Dados do projeto): tratamento dos itens sem data ao lado do corte", () => {
  const projeto = (parametros) => ({ id: "p1", versao: 3, erp: "SAP", erp_versao: "", responsavel: "", estabelecimentos: [], data_base: null, parametros, modulos: {}, atividades: [], atividadesConfirmadas: false });
  it("campo com as duas opções e o que foi escolhido na importação", () => {
    const html = montar(<Configuracao projeto={projeto({ corteMovimentacao: "2025-01-01", semDataMovimentacao: "DEPOIS" })} recarregar={() => {}} />);
    const t = texto(html);
    expect(t).toContain("Itens sem data de movimentação");
    expect(t.indexOf("Corte de movimentação")).toBeLessThan(t.indexOf("Itens sem data de movimentação"));
    expect(html).toMatch(/<option value="DEPOIS" selected="">Deixar para tratar depois/);
    expect(html).not.toContain("Escolhido na importação");
  });
  it("projeto sem escolha ainda: o campo diz que vem da importação", () => {
    expect(montar(<Configuracao projeto={projeto({})} recarregar={() => {}} />)).toContain("Escolhido na importação");
  });
  it("texto da decisão: tratamento, onde, quem e quando", () => {
    const t = textoDecisaoSemData({ tratamento: "SEM_MOVIMENTACAO", por: "ana@x.com", em: "2026-11-27T15:00:00Z", origem: "IMPORTACAO" });
    expect(t).toContain("Considerar sem movimentação, na importação, por ana@x.com, em 27/11/2026");
  });
});

describe("O que foi considerado: o tratamento aparece com o texto do servidor", () => {
  it("usa textoConfiguracao (não formata como data)", () => {
    const dados = { camada: "QUALIDADE", rotulo: "Qualidade", alteradoEm: null, manuais: [], criterios: [
      { id: "q-sem-data", texto: "Itens sem data de última movimentação (escolha feita na importação)", origem: "CONFIGURACAO", valorConfiguracao: "SEM_MOVIMENTACAO", textoConfiguracao: "considerados sem movimentação desde o corte" },
    ] };
    const t = texto(montar(<Considerado projetoId="p1" camada="QUALIDADE" rotulo="Qualidade" dados={dados} abertoInicial />));
    expect(t).toContain("Itens sem data de última movimentação (escolha feita na importação): considerados sem movimentação desde o corte");
  });
});
