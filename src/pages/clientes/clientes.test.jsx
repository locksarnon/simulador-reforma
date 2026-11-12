import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "qa@fal" } }) }));

const ServicosContratadosPagina = (await import("./ServicosContratadosPagina")).default;
const { CarteiraBpo, CarteiraDiagnostico } = await import("./Carteiras");

const GRUPOS = [{ id: "G1", numero: "090", nome: "Extra Agro (teste)" }, { id: "G2", numero: "001", nome: "Cangaia" }];
const EMPRESAS = [
  { id: "E1", id_empresa: "EXTRA-AGRO", razao_social: "EXTRA AGRO LTDA", cnpj_cpf: "58.509.112/0001-52", grupo: "090" },
  { id: "E2", id_empresa: "EMP-2", razao_social: "Beta Comércio SA", cnpj_cpf: "12.345.678/0001-95", grupo: "001" },
  { id: "E3", id_empresa: "EMP-3", razao_social: "Gama Serviços Ltda", cnpj_cpf: null, grupo: "001" },
];
const SERVICOS = [
  { id: "S1", empresa_id: "E1", tipo: "BPO_FISCAL", situacao: "ATIVO", responsavel: "Maria", inicio: "2026-03-01T00:00:00Z", modulos: ["XML", "TAREFAS"], createdAt: "2026-03-01T00:00:00Z" },
  { id: "S2", empresa_id: "E1", tipo: "DIAGNOSTICO_PONTUAL", situacao: "ATIVO", createdAt: "2026-02-01T00:00:00Z" },
  { id: "S3", empresa_id: "E2", tipo: "BPO_FISCAL", situacao: "PAUSADO", responsavel: "João", createdAt: "2026-01-01T00:00:00Z" },
  { id: "S4", empresa_id: "E2", tipo: "DIAGNOSTICO_PONTUAL", situacao: "ENCERRADO", createdAt: "2025-01-01T00:00:00Z" },
];
const RESUMO = { empresas: 3, por_tipo: {}, em_carteira: { BPO_FISCAL: 2, DIAGNOSTICO_PONTUAL: 1, ambas: 1 }, sem_carteira: 1 };

function renderizar(elemento, { servicos = SERVICOS, resumo = RESUMO } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["empresas", "carteiras"], EMPRESAS);
  qc.setQueryData(["grupos"], GRUPOS);
  qc.setQueryData(["servicos-contratados"], servicos);
  qc.setQueryData(["servicos-contratados", "resumo"], resumo);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/">{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Serviços contratados", () => {
  it("mostra os números das carteiras e uma linha por empresa, com a situação de cada serviço", () => {
    const html = renderizar(<ServicosContratadosPagina />);
    for (const rotulo of ["Empresas no cadastro", "No BPO fiscal", "Com diagnóstico pontual", "Sem carteira"]) expect(html).toContain(rotulo);
    expect(html).toContain("EXTRA AGRO LTDA");
    expect(html).toContain("58.509.112/0001-52");
    expect(html).toContain("Ativo");
    expect(html).toContain("Pausado");
    expect(html).toContain("Encerrado");
    expect(html).toContain("Maria"); // responsável do BPO
    expect(html).toContain("090 Extra Agro (teste)");
    expect(html).toContain("3 de 3 empresas");
  });

  it("empresa sem serviço mostra o atalho Definir", () => {
    const html = renderizar(<ServicosContratadosPagina />);
    expect(html).toContain(">Definir<");
  });

  it("tem busca, filtro de carteira e de grupo, e a marcação para definir vários de uma vez", () => {
    const html = renderizar(<ServicosContratadosPagina />);
    expect(html).toContain("Buscar (nome, código ou CNPJ)");
    expect(html).toContain("Só BPO fiscal");
    expect(html).toContain("Sem carteira");
    expect(html).toContain('aria-label="Marcar todas as empresas da lista"');
    expect(html).toContain('aria-label="Marcar EXTRA AGRO LTDA"');
  });

  it("o cartão Sem carteira fica em destaque quando há empresa sem carteira", () => {
    const html = renderizar(<ServicosContratadosPagina />);
    expect(html).toMatch(/border-amber-400\/60[^>]*>\s*<p[^>]*>Sem carteira<\/p><p[^>]*>1<\/p>/);
  });
});

describe("Carteira do BPO", () => {
  it("lista só as empresas com BPO ativo ou pausado, com responsável, módulos e o caminho da Captura de XML", () => {
    const html = renderizar(<CarteiraBpo />);
    expect(html).toContain("Carteira do BPO");
    expect(html).toContain("EXTRA AGRO LTDA");
    expect(html).toContain("Beta Comércio SA");
    expect(html).not.toContain("Gama Serviços Ltda"); // sem serviço: fora da carteira
    expect(html).toContain("Captura de XML, Processos e tarefas"); // módulos ligados
    expect(html).toContain('href="/bpo/repositorio-xml/E1"');
    expect(html).toContain("2 empresas na carteira");
  });

  it("se ninguém foi marcado ainda, explica como marcar e oferece ver todas as empresas", () => {
    const html = renderizar(<CarteiraBpo />, { servicos: SERVICOS.filter((s) => s.tipo !== "BPO_FISCAL") });
    expect(html).toContain("Nenhuma empresa está na carteira de bpo fiscal ainda");
    expect(html).toContain('href="/clientes/servicos-contratados"');
    expect(html).toContain("Ver todas as empresas");
  });
});

describe("Carteira de diagnósticos", () => {
  it("lista quem tem diagnóstico ativo e leva ao trabalho da empresa no diagnóstico", () => {
    const html = renderizar(<CarteiraDiagnostico />);
    expect(html).toContain("Carteira de diagnósticos");
    expect(html).toContain("EXTRA AGRO LTDA");
    expect(html).not.toContain("Beta Comércio SA"); // diagnóstico encerrado
    expect(html).toContain('href="/workroom/G1/empresas/E1"');
    expect(html).not.toContain("Módulos ligados"); // coluna só do BPO
  });
});
