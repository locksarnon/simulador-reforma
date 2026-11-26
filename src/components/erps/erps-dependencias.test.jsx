import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "A1", role: "admin", email: "a@fal" } }) }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }) => (open ? <div>{children}</div> : null), DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>, DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

import { chavesErps, SeletorErp } from "./erps";
import { vinculoErpParaSalvar } from "@/lib/erps";
import { origemCompleta, textoOrigem } from "@/components/saneamento/identidade";
import { ORIENTACOES } from "@/lib/orientacoes";
import ConhecimentoEmpresa from "@/components/ConhecimentoEmpresa";
import { CARGA_ERPS, idDoItemDaCarga } from "../../../backend/src/erps/carga";

/** Dependências do Cadastro de ERPs: cada tela e derivado que usa o ERP se serve do cadastro (lista e perfil). */

const ERPS = CARGA_ERPS.map((e) => ({ id: e.id, nome: e.nome, fabricante: e.fabricante, produto: e.produto ?? null, versoes: e.versoes, situacao: e.situacao, ativo: true }));
const perfilDaCarga = (id) => {
  const c = CARGA_ERPS.find((e) => e.id === id);
  return { id: c.id, nome: c.nome, situacao: c.situacao, ativo: true, itens: c.itens.map((i, ordem) => ({ id: idDoItemDaCarga(c.id, i.k), tipo: i.tipo, tipo_ajuste: i.tipo_ajuste ?? null, chave: i.chave, texto: i.texto, campo_erp: i.campo_erp ?? null, fonte_url: i.fonte_url, grau: i.grau, ordem, ativo: true })) };
};
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const montar = (ui, preparar) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(chavesErps.lista, ERPS);
  preparar?.(qc);
  return renderToStaticMarkup(<QueryClientProvider client={qc}><StaticRouter location="/">{ui}</StaticRouter></QueryClientProvider>);
};

describe("vínculo do ERP ao salvar (cadastro do cliente e Configuração do saneamento)", () => {
  it("sem a lista carregada (carregando ou falhou), o erp_id que o registro tem fica: nunca vai null por falta de lista", () => {
    expect(vinculoErpParaSalvar({ erp_id: "erp-sap-b1", erp: "SAP B1" }, [], false)).toEqual({ erp_id: "erp-sap-b1", erp: "SAP B1" });
    expect(vinculoErpParaSalvar({ erp_id: "erp-sap-b1", erp: "SAP B1" }, [])).toEqual({ erp_id: "erp-sap-b1", erp: "SAP B1" });
  });
  it("preserva o texto antigo e guarda o vínculo no erp_id; texto vazio recebe o nome do cadastro", () => {
    expect(vinculoErpParaSalvar({ erp: "Protheus" }, ERPS)).toEqual({ erp_id: "erp-totvs-protheus", erp: "Protheus" });
    expect(vinculoErpParaSalvar({ erp: "Protheus 12 (digitado)", erp_id: "erp-sap-b1" }, ERPS)).toEqual({ erp_id: "erp-sap-b1", erp: "Protheus 12 (digitado)" });
    expect(vinculoErpParaSalvar({ erp: "", erp_id: "erp-sap-b1" }, ERPS)).toEqual({ erp_id: "erp-sap-b1", erp: "SAP Business One" });
    expect(vinculoErpParaSalvar({ erp: "Sankhya" }, ERPS)).toEqual({ erp_id: null, erp: "Sankhya" });
  });
});

describe("tirar a seleção do ERP", () => {
  it("com um ERP escolhido (ou texto que casa), a opção vazia fica desabilitada: troca-se por outro da lista", () => {
    expect(montar(<SeletorErp registro={{ erp_id: "erp-sap-b1" }} aoMudar={() => {}} />)).toMatch(/<option value="" disabled="">Selecione o ERP/);
    expect(montar(<SeletorErp registro={{ erp: "Protheus" }} aoMudar={() => {}} />)).toMatch(/<option value="" disabled="">/);
  });
  it("sem ERP (ou com texto que não casa), a opção vazia continua disponível", () => {
    expect(montar(<SeletorErp registro={{}} aoMudar={() => {}} />)).toMatch(/<option value="" selected="">Selecione o ERP/);
    expect(montar(<SeletorErp registro={{ erp: "Sankhya" }} aoMudar={() => {}} />)).not.toMatch(/disabled=""/);
  });
});

describe("saneamento antigo: origem dos dados", () => {
  it("projeto salvo com o texto antigo continua com a origem completa (as decisões não se perdem)", () => {
    const antiga = { erp: "Protheus", instancia: "PRD", empresa: "X" };
    expect(origemCompleta(antiga)).toBe(true);
    expect(textoOrigem(antiga)).toBe("Protheus · PRD · X");
  });
  it("escolhido na lista: vale o nome do cadastro (erp_nome) e o texto antigo fica guardado", () => {
    const nova = { erp: "Protheus", erp_id: "erp-totvs-protheus", erp_nome: "TOTVS Protheus", instancia: "PRD", empresa: "X" };
    expect(origemCompleta(nova)).toBe(true);
    expect(textoOrigem(nova)).toBe("TOTVS Protheus · PRD · X");
    expect(origemCompleta({ erp_id: "erp-sap-b1", erp_nome: "SAP Business One", instancia: "", empresa: "X" })).toBe(false);
  });
});

describe("textos de ajuda e barra de sistemas", () => {
  it("ajuda do campo ERP: escolhido no Cadastro de ERPs e carrega o perfil", () => {
    expect(ORIENTACOES.empresas.erp).toMatch(/Cadastro de ERPs/);
    expect(ORIENTACOES.empresas.erp).toMatch(/consultas de extração, restrições/);
    expect(ORIENTACOES.empresas.erp).not.toMatch(/ex: SAP, Totvs/);
  });
  it("barra de sistemas: as orientações PIMS + Protheus vêm do perfil do ERP no cadastro", () => {
    const empresa = { erp: "Protheus", erp_id: "erp-totvs-protheus", addons: ["pims"], addons_versoes: { pims: { linha: "Multicultivos" } } };
    const t = texto(montar(<ConhecimentoEmpresa empresa={empresa} />, (qc) => qc.setQueryData(chavesErps.perfil("erp-totvs-protheus"), perfilDaCarga("erp-totvs-protheus"))));
    expect(t).toContain("3 orientações");
    const semPerfil = texto(montar(<ConhecimentoEmpresa empresa={{ ...empresa, erp: "SAP Business One", erp_id: "erp-sap-b1" }} />, (qc) => qc.setQueryData(chavesErps.perfil("erp-sap-b1"), perfilDaCarga("erp-sap-b1"))));
    expect(semPerfil).not.toContain("orientaç");
  });
});
