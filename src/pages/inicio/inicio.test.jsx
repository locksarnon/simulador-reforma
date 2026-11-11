import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const papel = vi.hoisted(() => ({ atual: "admin" }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "U1", role: papel.atual, email: "maria@fal", name: "Maria" } }) }));

const PainelCarteiraPagina = (await import("./PainelCarteiraPagina")).default;
const ResumoDoDia = (await import("@/components/inicio/ResumoDoDia")).default;
const { atalhosDaEmpresa } = await import("@/components/SeletorEmpresaEmFoco");
const { hojeBR } = await import("@/lib/tarefas");
const { somarDias } = await import("@/lib/agenda");

const RESUMO = {
  total: 3, ativas: 3, carteiras: { bpo: 2, diagnostico: 1, ambas: 1, sem: 1 },
  por_regime: [{ nome: "Lucro Presumido", total: 2 }, { nome: "Lucro Real", total: 1 }], por_porte: [{ nome: "DEMAIS", total: 2 }], por_uf: [{ nome: "MT", total: 3 }],
  por_setor: [], por_situacao: [{ nome: "Ativa", total: 3 }],
  por_municipio: [{ uf: "MT", municipio: "Cuiabá", total: 2, latitude: -15.5, longitude: -55.9 }, { uf: "MT", municipio: "Sorriso", total: 1, latitude: null, longitude: null }],
  por_cnae: [{ codigo: "0115600", descricao: "Cultivo de soja", total: 2 }], por_divisao_cnae: [],
  saude: { completas: 1, com_faltas: 2, faltas: [{ nome: "contato", total: 2 }], empresas_com_faltas: [{ id: "E2", razao_social: "Beta SA", faltas: ["contato"] }], pendentes_de_cnpj: 1, sem_ponto_no_mapa: 1 },
};

function renderizar(elemento, dados = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["painel-carteira"], dados.painel ?? RESUMO);
  qc.setQueryData(["tarefas", "resumo"], { minhas: 4, minhas_atrasadas: 1, hoje: 2, sem_responsavel: 3 });
  const hoje = hojeBR();
  qc.setQueryData(["agenda", "camadas", hoje, somarDias(hoje, 6), ""], { eventos: [], tarefas: [], certificados: [], obrigacoes: [{ obrigacao: "pis-cofins", nome: "PIS/Pasep e Cofins", competencia: "2026-10", data: hoje, data_legal: hoje, movida: false, confirmado: true }] });
  qc.setQueryData(["notificacoes", "inicio"], [{ id: "N1", titulo: "Suas tarefas: 1 atrasada", createdAt: new Date().toISOString() }]);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/inicio">{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Início: resumo do dia", () => {
  it("mostra tarefas, os próximos 7 dias, os avisos e a carteira, cada um com o atalho", () => {
    const html = renderizar(<ResumoDoDia />);
    for (const t of ["Suas tarefas", "Próximos 7 dias", "Avisos", "Carteira", "PIS/Pasep e Cofins", "Suas tarefas: 1 atrasada", "3 tarefa(s) sem responsável na equipe.", "2 empresa(s) com cadastro incompleto."]) expect(html).toContain(t);
    for (const href of ["/bpo/tarefas", "/bpo/agenda", "/notificacoes", "/inicio/carteira"]) expect(html).toContain(`href="${href}"`);
  });
});

describe("Painel da carteira", () => {
  it("cartões, distribuições, municípios (com e sem ponto), CNAE e saúde do cadastro", () => {
    const html = renderizar(<PainelCarteiraPagina />);
    for (const t of ["Empresas", "No BPO fiscal", "Com diagnóstico pontual", "Sem carteira", "Cadastro completo", "1 de 3", "Por regime tributário", "Por porte (Receita Federal)", "Onde ficam as empresas", "Cuiabá/MT", "(sem ponto)", "0115-6/00", "Cultivo de soja", "Saúde do cadastro", "Beta SA"]) expect(html).toContain(t);
    expect(html).toContain("Carregando o mapa…"); // o mapa carrega depois, no navegador
    expect(html).toContain("Completar pelo CNPJ");
  });

  it("consultor não vê o botão de completar; carteira vazia leva ao cadastro", () => {
    papel.atual = "user";
    expect(renderizar(<PainelCarteiraPagina />)).not.toContain("Completar pelo CNPJ");
    papel.atual = "admin";
    const vazio = renderizar(<PainelCarteiraPagina />, { painel: { ...RESUMO, total: 0 } });
    expect(vazio).toContain("Nenhuma empresa cadastrada ainda.");
  });
});

describe("Empresa em foco", () => {
  it("atalhos: XML sempre; diagnóstico só se a empresa tem grupo", () => {
    const com = atalhosDaEmpresa({ id: "E1", grupo: "090" }, [{ id: "G1", numero: "090" }]).map((a) => a.to);
    expect(com).toEqual(["/bpo/repositorio-xml/E1", "/workroom/G1/empresas/E1", "/bpo/tarefas", "/bpo/agenda"]);
    const sem = atalhosDaEmpresa({ id: "E1", grupo: null }, []).map((a) => a.rotulo);
    expect(sem).not.toContain("Diagnóstico da empresa");
  });
});
