import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const papel = vi.hoisted(() => ({ atual: "admin" }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "U1", role: papel.atual, email: "maria@fal" } }) }));

const TarefasPagina = (await import("./TarefasPagina")).default;
const { AbaProcessos, AbaTarefas } = await import("./TarefasPagina");
const { buscarEmpresasPorTexto } = await import("@/components/SeletorDeEmpresa");

const hoje = new Date().toISOString().slice(0, 10);
const EMPRESAS = [
  { id: "E1", id_empresa: "EXTRA-AGRO", razao_social: "EXTRA AGRO LTDA", cnpj_cpf: "58.509.112/0001-52" },
  { id: "E2", id_empresa: "EMP-2", razao_social: "Beta Comércio SA", cnpj_cpf: null },
];
const COLABORADORES = [{ id: "U1", email: "maria@fal", name: "Maria", empresa_ids: ["E1"] }, { id: "U2", email: "joao@fal", name: null, empresa_ids: [] }];
const TAREFAS = [
  { id: "T1", titulo: "Conferir apuração — 11/2026", descricao: "ICMS e PIS/COFINS", status: "ABERTA", prioridade: "ALTA", empresa_id: "E1", responsavel: "U1", prazo: "2020-01-10T00:00:00.000Z", modelo_id: "M1", competencia: "2020-01", criado_por: "processo" },
  { id: "T2", titulo: "Ligar para o contador", descricao: null, status: "EM_ANDAMENTO", prioridade: "NORMAL", empresa_id: null, responsavel: "U2", prazo: `${hoje}T00:00:00.000Z`, modelo_id: null, competencia: null, criado_por: "U1" },
  { id: "T3", titulo: "Arquivar contratos", descricao: null, status: "ABERTA", prioridade: "BAIXA", empresa_id: "E2", responsavel: null, prazo: null, modelo_id: null, competencia: null, criado_por: "U2" },
];
const RESUMO = { abertas: 3, atrasadas: 1, hoje: 1, semana: 1, sem_responsavel: 1, minhas: 1, minhas_atrasadas: 1, concluidas_no_mes: 4 };
const PROCESSOS = [
  { id: "M1", nome: "Conferir apuração", descricao: "Apuração do mês", recorrencia: "MENSAL", dia: 20, mes: null, escopo: "POR_EMPRESA_BPO", responsavel: null, prioridade: "ALTA", ativo: true },
  { id: "M2", nome: "Entregar DEFIS", descricao: null, recorrencia: "ANUAL", dia: 31, mes: 3, escopo: "GERAL", responsavel: "U1", prioridade: "NORMAL", ativo: false },
];

function renderizar(elemento, { tarefas = TAREFAS, processos = PROCESSOS } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["empresas", "carteiras"], EMPRESAS);
  qc.setQueryData(["carteira", "colaboradores"], COLABORADORES);
  qc.setQueryData(["tarefas", "abertas"], tarefas);
  qc.setQueryData(["tarefas", "resumo"], RESUMO);
  qc.setQueryData(["processos"], processos);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/bpo/tarefas">{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Processos e tarefas: aba Tarefas", () => {
  it("mostra os cartões, cada tarefa com empresa, responsável, prazo e prioridade", () => {
    papel.atual = "admin";
    const html = renderizar(<TarefasPagina />);
    for (const t of ["Minhas em aberto", "Atrasadas", "Vencem hoje", "Próximos 7 dias", "Sem responsável"]) expect(html).toContain(t);
    expect(html).toContain("Conferir apuração — 11/2026");
    expect(html).toContain("EXTRA AGRO LTDA");
    expect(html).toContain("Maria");
    expect(html).toContain("joao@fal"); // sem nome, mostra o e-mail
    expect(html).toContain("Atrasada há"); // prazo de 2020
    expect(html).toContain("Vence hoje");
    expect(html).toContain("Sem prazo");
    expect(html).toContain("Alta");
    expect(html).toContain("Em andamento");
    expect(html).toContain("Processo recorrente");
    expect(html).toContain("Nova tarefa");
  });

  it("tarefa de processo se cancela e tarefa avulsa se exclui (só quem criou ou administrador)", () => {
    const html = renderizar(<TarefasPagina />);
    expect(html).toContain('aria-label="Cancelar Conferir apuração — 11/2026"');
    expect(html).toContain('aria-label="Excluir Ligar para o contador"'); // criada pelo próprio usuário
    expect(html).toContain('aria-label="Excluir Arquivar contratos"'); // administrador exclui qualquer uma
    papel.atual = "user";
    const consultor = renderizar(<TarefasPagina />);
    expect(consultor).toContain('aria-label="Excluir Ligar para o contador"'); // criada por ele
    expect(consultor).not.toContain('aria-label="Excluir Arquivar contratos"'); // criada por outro
    papel.atual = "admin";
  });

  it("tarefa em aberto tem o botão de iniciar e a caixa de concluir; a lista vazia explica o que fazer", () => {
    const html = renderizar(<TarefasPagina />);
    expect(html).toContain('aria-label="Iniciar Conferir apuração — 11/2026"');
    expect(html).not.toContain('aria-label="Iniciar Ligar para o contador"'); // já em andamento
    expect(html).toContain('aria-label="Concluir Arquivar contratos"');
    const vazia = renderizar(<TarefasPagina />, { tarefas: [] });
    expect(vazia).toContain("Nenhuma tarefa em aberto. Crie uma, ou cadastre um processo recorrente");
  });

  it("tem busca, filtro de responsável, de empresa e a troca entre em aberto, concluídas e canceladas", () => {
    const html = renderizar(<AbaTarefas user={{ id: "U1", role: "admin" }} empresas={EMPRESAS} colaboradores={COLABORADORES} />);
    expect(html).toContain("Buscar (título ou empresa)");
    expect(html).toContain('aria-label="Situação das tarefas"');
    for (const t of ["Em aberto", "Concluídas", "Canceladas", "Todos", "Eu", "Sem responsável"]) expect(html).toContain(t);
  });
});

describe("Processos e tarefas: aba Processos recorrentes", () => {
  it("lista os processos com a frase da recorrência, o escopo e a situação", () => {
    const html = renderizar(<AbaProcessos ehAdmin colaboradores={COLABORADORES} />);
    expect(html).toContain("Todo mês, dia 20");
    expect(html).toContain("Uma vez por ano, em março, dia 31");
    expect(html).toContain("Uma tarefa por empresa do BPO fiscal");
    expect(html).toContain("Uma tarefa só, do escritório");
    expect(html).toContain("Ativo");
    expect(html).toContain("Desativado");
    expect(html).toContain("Quem atende a empresa"); // sem responsável fixo
    expect(html).toContain("Novo processo");
    expect(html).toContain("Gerar tarefas agora");
  });

  it("quem não é administrador só consulta", () => {
    const html = renderizar(<AbaProcessos ehAdmin={false} colaboradores={COLABORADORES} />);
    expect(html).toContain("Só administradores criam e mudam processos.");
    expect(html).not.toContain("Novo processo");
    expect(html).not.toContain('aria-label="Editar Conferir apuração"');
  });

  it("sem processos, mostra o exemplo e desliga o 'Gerar tarefas agora'", () => {
    const html = renderizar(<AbaProcessos ehAdmin colaboradores={COLABORADORES} />, { processos: [] });
    expect(html).toContain("Nenhum processo recorrente ainda.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Gerar tarefas agora/);
  });
});

describe("Seletor de empresa", () => {
  it("acha por nome, código e CNPJ, sem acento, e mostra as primeiras quando não há texto", () => {
    expect(buscarEmpresasPorTexto(EMPRESAS, "comercio").map((e) => e.id)).toEqual(["E2"]);
    expect(buscarEmpresasPorTexto(EMPRESAS, "extra-agro").map((e) => e.id)).toEqual(["E1"]);
    expect(buscarEmpresasPorTexto(EMPRESAS, "58509112").map((e) => e.id)).toEqual(["E1"]);
    expect(buscarEmpresasPorTexto(EMPRESAS, "")).toHaveLength(2);
    expect(buscarEmpresasPorTexto(EMPRESAS, "zzz")).toEqual([]);
    expect(buscarEmpresasPorTexto(Array.from({ length: 20 }, (_, i) => ({ id: `E${i}`, razao_social: `Empresa ${i}` })), "", 8)).toHaveLength(8);
  });
});
