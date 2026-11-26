import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "a@b.c" } }) }));

import { chaves } from "./api";
import CasoDetalhe from "./CasoDetalhe";
import { avisoDeOutrosGrupos, propostaEditavel } from "./logica";

const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const montar = (ui, preparar) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  preparar?.(qc);
  return renderToStaticMarkup(<QueryClientProvider client={qc}><StaticRouter location="/">{ui}</StaticRouter></QueryClientProvider>);
};
const projeto = { id: "p1", versao: 3, modulos: {}, atividades: [], atividadesConfirmadas: true };
const conversao = (o = {}) => ({
  id: "c1", camada: "NOMES_UNIDADES", tipo: "UNIDADE_CONVERSAO", itens: ["i1", "i2", "i3"], problema: "Unidade TON", evidencia: [], atual: { unidade: "TON" },
  proposta: { unidade: "KG", unidadeCompra: "TON", fatorConversao: 1000, fatorSituacao: "DEFINIDO", exigeFator: "NAO" }, justificativa: "", fundamento: null, impactos: [], origem: "REGRA", situacao: "PROPOSTO", versao: 1, parecer_ia: null, ...o,
});

describe("BAIXO 5: exigeFator é só informativo", () => {
  it("exigeFator e fatorSituacao não são editáveis; o fator continua editável", () => {
    expect(propostaEditavel("exigeFator")).toBe(false);
    expect(propostaEditavel("fatorSituacao")).toBe(false);
    expect(propostaEditavel("fatorConversao")).toBe(true);
  });
  it("na tela do caso aparecem como texto, sem campo de edição", () => {
    const html = montar(<CasoDetalhe projeto={projeto} casoId="c1" />, (qc) => qc.setQueryData(chaves.caso("c1"), conversao()));
    expect(html).not.toContain('aria-label="Proposta para Exige fator (informativo)"');
    expect(html).not.toContain('aria-label="Proposta para Situação do fator"');
    expect(html).toContain('aria-label="Proposta para Fator de conversão"');
    expect(texto(html)).toContain("Exige fator (informativo)");
  });
});

describe("BAIXO 6: conjunto com itens de outros grupos", () => {
  const dados = { total: 1966, grupos: [{ grupo: "INSUMOS", itens: 1200 }, { grupo: "FERTILIZANTES", itens: 700 }, { grupo: "(sem grupo)", itens: 66 }] };
  it("conta só os itens fora do grupo do recorte e lista os grupos", () => {
    const a = avisoDeOutrosGrupos(dados, "FERTILIZANTES");
    expect(a.outros).toBe(1266);
    expect(a.texto).toContain("Este conjunto inclui 1.266 itens de outros grupos");
    expect(a.texto).toContain("INSUMOS (1.200), (sem grupo) (66)");
    expect(a.texto).toContain("Aprovar altera todos os 1.966 itens");
  });
  it("sem recorte, ou todos do mesmo grupo: sem aviso", () => {
    expect(avisoDeOutrosGrupos(dados, null)).toBeNull();
    expect(avisoDeOutrosGrupos({ total: 3, grupos: [{ grupo: "FERTILIZANTES", itens: 3 }] }, "FERTILIZANTES")).toBeNull();
  });
  it("o caso aberto no recorte mostra o aviso antes de aprovar", () => {
    const html = montar(<CasoDetalhe projeto={projeto} casoId="c1" grupoDoRecorte="FERTILIZANTES" />, (qc) => {
      qc.setQueryData(chaves.caso("c1"), conversao());
      qc.setQueryData(chaves.gruposDoCaso("p1", "c1"), dados);
    });
    expect(texto(html)).toContain("Este conjunto inclui 1.266 itens de outros grupos, além do grupo FERTILIZANTES");
    const sem = montar(<CasoDetalhe projeto={projeto} casoId="c1" />, (qc) => {
      qc.setQueryData(chaves.caso("c1"), conversao());
      qc.setQueryData(chaves.gruposDoCaso("p1", "c1"), dados);
    });
    expect(texto(sem)).not.toContain("de outros grupos");
  });
});
