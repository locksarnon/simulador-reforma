import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const papel = vi.hoisted(() => ({ atual: "admin" }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "A1", role: papel.atual, email: "a@fal" } }) }));
// O Dialog (Radix) não renderiza no servidor: no teste, o conteúdo aparece direto.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }) => (open ? <div>{children}</div> : null), DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>, DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

import { AlertasErp, chavesErps, ConsultasErp, NomeErp, SeletorErp } from "./erps";
import { associarErp, erpDoRegistro, mesmoErp, perfilEspecifico, restricoesDoTipo } from "@/lib/erps";
import ErpsPagina, { diferencas, ErpFicha } from "@/pages/admin/ErpsPagina";
import EmpresaFormDialog from "@/components/empresas/EmpresaFormDialog";
import ConhecimentoEmpresa from "@/components/ConhecimentoEmpresa";
import ValidadorCadastro from "@/components/ferramentas/ValidadorCadastro";
import { OrigemDosDados } from "@/components/saneamento/OrigemDosDados";
import HomologacaoErp from "@/components/consultoria/HomologacaoErp";
import Configuracao from "@/components/saneamento-estoques/Configuracao";
import Importacao from "@/components/saneamento-estoques/Importacao";
import Impacto from "@/components/saneamento-estoques/Impacto";
import CasoDetalhe from "@/components/saneamento-estoques/CasoDetalhe";
import Unificacoes from "@/components/saneamento-estoques/Unificacoes";
import { chaves } from "@/components/saneamento-estoques/api";
import { paramsDoMapa } from "@/components/saneamento-estoques/logica";

const ERPS = [
  { id: "erp-sap-b1", nome: "SAP Business One", fabricante: "SAP", produto: "Business One (SQL Server e HANA)", versoes: ["10.0"], situacao: "COMPLETO", ativo: true, itens: 37, confirmados: 30, restricoes: 13, updatedAt: "2026-11-26T12:00:00Z" },
  { id: "erp-aliare-siagri", nome: "Aliare Siagri", fabricante: "Aliare", produto: "Siagri AgriBusiness", versoes: ["10.0.0.0"], situacao: "PARCIAL", ativo: true, itens: 28, confirmados: 12, restricoes: 9 },
  { id: "erp-totvs-protheus", nome: "TOTVS Protheus", fabricante: "TOTVS", produto: "Protheus (P12)", versoes: ["12.1.2410", "12.1.2510"], situacao: "PARCIAL", ativo: true, itens: 40, confirmados: 30, restricoes: 14 },
  { id: "erp-outro", nome: "Outro ERP (sem perfil)", fabricante: "—", produto: null, versoes: [], situacao: "A_DESENVOLVER", ativo: true, itens: 0, confirmados: 0, restricoes: 0 },
];
const item = (o) => ({ id: o.id, tipo: "RESTRICAO", tipo_ajuste: null, chave: "", texto: "", campo_erp: null, fonte_url: "https://help.sap.com/x", grau: "CONFIRMADO", ordem: 0, ativo: true, ...o });
const PERFIL_SAP = {
  ...ERPS[0], itens: [
    item({ id: "k1", tipo_ajuste: "MUDOU_UNIDADE", chave: "Unidade de estoque travada", texto: "A UdM de estoque não muda depois que o item tem transações." }),
    item({ id: "k2", tipo_ajuste: "INATIVOU", chave: "Antes de inativar", texto: "Zerar OITW.OnHand antes.", grau: "NAO_CONFIRMADO" }),
    item({ id: "k3", tipo: "CONSULTA_EXTRACAO", chave: "Consulta A: cadastro + NCM + última movimentação", texto: 'SELECT T0."ItemCode" FROM "OITM" T0 LEFT JOIN "ONCM" T2 ON T2."AbsEntry" = T0."NCMCode"' }),
    item({ id: "k4", tipo: "COLUNA_EXPORT", chave: "ncm", campo_erp: "NcmCode", texto: "NCM de ONCM" }),
    item({ id: "k5", tipo: "ACAO_NO_ERP", tipo_ajuste: "CONSOLIDOU_INATIVOU", chave: "Unificação", texto: "Saída OIGE de {sai}; entrada OIGN em {fica}; inativar {sai}" }),
  ],
};
const PERFIL_OUTRO = { ...ERPS[3], itens: [] };

const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/\s+/g, " ");
const montar = (ui, preparar, location = "/") => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(chavesErps.lista, ERPS);
  preparar?.(qc);
  return renderToStaticMarkup(<QueryClientProvider client={qc}><StaticRouter location={location}>{ui}</StaticRouter></QueryClientProvider>);
};

describe("regras puras (src/lib/erps.js)", () => {
  it("associa o texto antigo sem ambiguidade; o resto fica não identificado", () => {
    expect(associarErp("Protheus", ERPS)?.id).toBe("erp-totvs-protheus");
    expect(associarErp("siagri", ERPS)?.id).toBe("erp-aliare-siagri");
    expect(associarErp("Outro", ERPS)?.id).toBe("erp-outro");
    expect(associarErp("Sankhya", ERPS)).toBeNull();
    expect(erpDoRegistro({ erp: "Sankhya" }, ERPS)).toEqual({ erp: null, texto: "Sankhya", naoIdentificado: true });
    expect(erpDoRegistro({ erp: "texto velho", erp_id: "erp-sap-b1" }, ERPS).erp.nome).toBe("SAP Business One");
    expect(mesmoErp("Protheus", "TOTVS Protheus")).toBe(true);
    expect(mesmoErp("Protheus", "SAP Business One")).toBe(false);
  });
  it("perfil a desenvolver não tem restrição específica", () => {
    expect(perfilEspecifico(PERFIL_OUTRO)).toBe(false);
    expect(restricoesDoTipo(PERFIL_SAP, ["MUDOU_UNIDADE"]).map((i) => i.id)).toEqual(["k1"]);
    expect(restricoesDoTipo(PERFIL_OUTRO, ["MUDOU_UNIDADE"])).toEqual([]);
  });
});

describe("peças comuns", () => {
  it("SeletorErp: lista do cadastro (nunca campo de texto), texto antigo que casa já selecionado", () => {
    const html = montar(<SeletorErp registro={{ erp: "Protheus" }} aoMudar={() => {}} />);
    expect(html).toMatch(/<select[^>]*aria-label="ERP"/);
    expect(html).not.toMatch(/<input[^>]*ERP/);
    for (const n of ERPS) expect(html).toContain(n.nome);
    expect(html).toMatch(/<option value="erp-totvs-protheus" selected="">TOTVS Protheus/);
    expect(texto(html)).toContain("Perfil parcial");
  });
  it("SeletorErp: texto antigo que não casa continua visível, com o aviso para selecionar", () => {
    const t = texto(montar(<SeletorErp registro={{ erp: "Sankhya" }} aoMudar={() => {}} />));
    expect(t).toContain("ERP não identificado: Sankhya — selecione na lista");
  });
  it("NomeErp mostra o nome do cadastro, o texto antigo ou o aviso", () => {
    expect(texto(montar(<NomeErp registro={{ erp_id: "erp-sap-b1", erp: "SAP B1" }} versao="10.0" />))).toContain("SAP Business One 10.0");
    expect(texto(montar(<NomeErp registro={{ erp: "Sankhya" }} />))).toContain("ERP não identificado: Sankhya — selecione na lista");
  });
  it("AlertasErp: restrições do tipo com grau e fonte; perfil a desenvolver não mostra nada", () => {
    const t = texto(montar(<AlertasErp perfil={PERFIL_SAP} tipos={["INATIVOU"]} />));
    expect(t).toContain("Restrições do SAP Business One para este ajuste");
    expect(t).toContain("Inativou código · Antes de inativar: Zerar OITW.OnHand antes. Não confirmado fonte");
    expect(montar(<AlertasErp perfil={PERFIL_OUTRO} tipos={["INATIVOU"]} />)).toBe("");
    expect(montar(<AlertasErp perfil={PERFIL_SAP} tipos={["MUDOU_NCM"]} />)).toBe("");
  });
  it("ConsultasErp: as consultas com o botão copiar", () => {
    const html = montar(<ConsultasErp perfil={PERFIL_SAP} />);
    expect(texto(html)).toContain("Como extrair do SAP Business One (1 consulta)");
    expect(html).toContain('aria-label="Copiar Consulta A: cadastro + NCM + última movimentação"');
    expect(texto(html)).toContain('LEFT JOIN "ONCM" T2 ON T2."AbsEntry" = T0."NCMCode"');
  });
});

describe("Administração > Configuração e ERPs > Cadastro de ERPs", () => {
  it("lista em tabela padrão; só o administrador vê o botão de novo ERP", () => {
    papel.atual = "admin";
    const html = montar(<ErpsPagina />, undefined, "/admin/erps");
    expect(html).toContain('aria-label="Cadastro de ERPs"');
    for (const t of ["Motor de cálculo", "Cadastro de ERPs", "SAP Business One", "Completo", "Parcial", "A desenvolver", "Novo ERP"]) expect(texto(html)).toContain(t);
    papel.atual = "user";
    expect(texto(montar(<ErpsPagina />, undefined, "/admin/erps"))).not.toContain("Novo ERP");
    papel.atual = "admin";
  });
  it("ficha: uma seção por tipo de conhecimento, grau, fonte e histórico; edição só do administrador", () => {
    const ficha = { ...ERPS[0], conhecimentos: PERFIL_SAP.itens, historico: [
      { id: "h1", acao: "ALTEROU", usuario: "adm@fal", createdAt: "2026-11-26T13:00:00Z", conhecimento_id: "k1", antes: { chave: "Unidade", grau: "NAO_CONFIRMADO" }, depois: { chave: "Unidade", grau: "CONFIRMADO" } },
      { id: "h0", acao: "CARGA", usuario: "sistema", createdAt: "2026-11-26T12:00:00Z", conhecimento_id: null, antes: null, depois: { nome: "SAP Business One" } },
    ] };
    const ui = <Routes><Route path="/admin/erps/:id" element={<ErpFicha />} /></Routes>;
    papel.atual = "admin";
    const html = montar(ui, (qc) => qc.setQueryData(chavesErps.ficha("erp-sap-b1"), ficha), "/admin/erps/erp-sap-b1");
    const t = texto(html);
    for (const s of ["Colunas do export (1)", "Consultas de extração (1)", "Restrições (2)", "Ação no ERP (1)", "Modelos de carga (0)", "Observações (0)", "Histórico de alterações", "grau: Não confirmado → Confirmado", "Carga inicial", "Editar dados do ERP", "Novo item de conhecimento", "Fonte oficial"]) expect(t, s).toContain(s);
    papel.atual = "user";
    const leitor = texto(montar(ui, (qc) => qc.setQueryData(chavesErps.ficha("erp-sap-b1"), ficha), "/admin/erps/erp-sap-b1"));
    expect(leitor).toContain("Somente administradores alteram o cadastro.");
    expect(leitor).not.toContain("Editar dados do ERP");
    papel.atual = "admin";
  });
  it("diferenças do histórico", () => {
    expect(diferencas({ antes: null, depois: { a: 1 } })).toBe("Criado");
    expect(diferencas({ antes: { versoes: ["1"] }, depois: { versoes: ["1", "2"] } })).toBe("versoes: 1 → 1, 2");
  });
});

describe("lista única nas telas que pediam o ERP", () => {
  it("cadastro do cliente: seleção do cadastro e versão da lista do ERP", () => {
    const html = montar(<EmpresaFormDialog open editing={{ id: "E1", razao_social: "X", erp: "SAP Business One", erp_id: "erp-sap-b1", erp_versao: "10.0", addons: [] }} onOpenChange={() => {}} />);
    expect(html).toMatch(/<select[^>]*id="empresa-erp"/);
    expect(html).toMatch(/<option value="erp-sap-b1" selected="">SAP Business One/);
    expect(html).toMatch(/<select aria-label="Versão do ERP"[^>]*>.*<option value="10.0" selected="">10.0/);
    expect(texto(montar(<EmpresaFormDialog open editing={{ id: "E2", razao_social: "Y", erp: "Sankhya", addons: [] }} onOpenChange={() => {}} />))).toContain("ERP não identificado: Sankhya — selecione na lista");
  });
  it("barra de sistemas da empresa (ficha do cliente e diagnóstico)", () => {
    expect(texto(montar(<ConhecimentoEmpresa empresa={{ erp: "Protheus", erp_versao: "12.1.2410", addons: [] }} />))).toContain("TOTVS Protheus · 12.1.2410");
  });
  it("validador de cadastro: ERPs de referência vêm do cadastro", () => {
    const t = texto(montar(<ValidadorCadastro empresa={{ erp: "Protheus" }} />));
    for (const n of ["SAP Business One", "Aliare Siagri", "TOTVS Protheus", "Outro ERP (sem perfil)", "Cadastro de ERPs"]) expect(t).toContain(n);
  });
  it("saneamento antigo: origem dos dados com o ERP da lista", () => {
    const html = montar(<OrigemDosDados origem={{ erp: "SAP Business One", instancia: "PRD", empresa: "X" }} onMudar={() => {}} />);
    expect(html).toMatch(/<option value="erp-sap-b1" selected="">SAP Business One/);
  });
  it("homologação do ERP: o ERP do cadastro do cliente", () => {
    const html = montar(<HomologacaoErp projetoId="P1" />, (qc) => qc.setQueryData(["homologacao-erp", "P1"], { empresas: [{ id: "E1", razao_social: "EMP", erp: "Protheus", erp_versao: "12.1.2510" }], resumo: { cenarios: 0, aprovados: 0, reprovados: 0, nao_cobertos: 0, sem_destaque: 0, notas: 0, itens: 0 }, cenarios: [] }));
    expect(texto(html)).toContain("ERP do cliente (do cadastro do cliente): TOTVS Protheus 12.1.2510");
  });
});

const projeto = (o = {}) => ({ id: "p1", versao: 3, erp: "SAP Business One", erp_id: "erp-sap-b1", erp_versao: "10.0", responsavel: "Ana", estabelecimentos: [], data_base: "2026-12-31T00:00:00.000Z", parametros: {}, modulos: {}, atividades: [], atividadesConfirmadas: true, atividades_confirmadas_em: "2026-11-20T12:00:00Z", cnpjDesatualizado: false, ...o });
const comPerfil = (perfil, extra) => (qc) => { qc.setQueryData(chavesErps.perfil(perfil.id), perfil); extra?.(qc); };

describe("perfil do ERP no Saneamento de estoques", () => {
  it("Configuração: ERP do projeto pela lista (abre com o do cliente)", () => {
    const html = montar(<Configuracao projeto={projeto()} recarregar={() => {}} />);
    expect(html).toMatch(/<option value="erp-sap-b1" selected="">SAP Business One/);
    expect(texto(montar(<Configuracao projeto={projeto({ erp: "ERP próprio", erp_id: null })} recarregar={() => {}} />))).toContain("ERP não identificado: ERP próprio — selecione na lista");
  });
  it("Importação: consulta de extração com copiar e aviso das colunas pré-mapeadas", () => {
    const t = texto(montar(<Importacao projeto={projeto()} />, comPerfil(PERFIL_SAP, (qc) => qc.setQueryData(chaves.importacoes("p1"), []))));
    expect(t).toContain("As colunas do export dele (NcmCode) já chegam mapeadas");
    expect(t).toContain("Como extrair do SAP Business One");
    const sem = texto(montar(<Importacao projeto={projeto({ erp_id: "erp-outro" })} />, comPerfil(PERFIL_OUTRO, (qc) => qc.setQueryData(chaves.importacoes("p1"), []))));
    expect(sem).not.toContain("Como extrair do");
  });
  it("Caso: restrições do ERP para o tipo de ajuste do caso", () => {
    const caso = { id: "c1", camada: "NOMES_UNIDADES", tipo: "UNIDADE", situacao: "PROPOSTO", versao: 1, itens: ["i1"], problema: "Unidade", evidencia: [], atual: { unidade: "UN" }, proposta: { unidade: "KG" }, justificativa: "", impactos: [], tiposAjuste: ["MUDOU_UNIDADE"] };
    const t = texto(montar(<CasoDetalhe projeto={projeto()} casoId="c1" />, comPerfil(PERFIL_SAP, (qc) => qc.setQueryData(chaves.caso("c1"), caso))));
    expect(t).toContain("Restrições do SAP Business One para este ajuste");
    expect(t).toContain("A UdM de estoque não muda depois que o item tem transações.");
  });
  it("Impacto no SPED: restrições do ERP para os ajustes do projeto", () => {
    const t = texto(montar(<Impacto projeto={projeto()} />, comPerfil(PERFIL_SAP, (qc) => qc.setQueryData(chaves.impactos("p1", ""), { pages: [{ linhas: [], proximo: null, total: 0, totalGeral: 1, porTipo: {}, tiposAjuste: ["INATIVOU"] }], pageParams: [undefined] }))));
    expect(t).toContain("Restrições do SAP Business One para os ajustes deste projeto");
  });
  it("Unificações: diz se a Ação no ERP segue o perfil do ERP", () => {
    const vazio = { linhas: [], pagina: 1, limite: 100, total: 0, totalGeral: 0, porSituacao: {}, porTipo: {}, comAlerta: 0, corteDefinido: true };
    const filtro = { situacao: "", tipo: "", busca: "", pagina: 1 };
    const t = texto(montar(<Unificacoes projeto={projeto()} />, comPerfil(PERFIL_SAP, (qc) => qc.setQueryData(chaves.unificacoes ? chaves.unificacoes("p1", paramsDoMapa(filtro)) : ["x"], vazio))));
    expect(t).toContain("segue o perfil do SAP Business One");
  });
});
