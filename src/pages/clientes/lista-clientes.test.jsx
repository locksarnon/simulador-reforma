import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "qa@fal" } }) }));

const ClientesPagina = (await import("./ClientesPagina")).default;
const FichaClientePagina = (await import("./FichaClientePagina")).default;

const GRUPOS = [{ id: "G1", numero: "#001", nome: "Família Extra", tipo: "Grupo familiar" }, { id: "G2", numero: "#002", nome: "Beta Comércio SA", tipo: "Cliente individual" }];
const EMPRESAS = [
  { id: "E1", id_empresa: "EXTRA", razao_social: "EXTRA AGRO LTDA", cnpj_cpf: "58.509.112/0001-52", grupo: "#001", regime_atual: "Lucro Presumido", uf: "MT", municipio: "Sorriso", email_contato: "fiscal@extra.test" },
  { id: "E2", id_empresa: "BETA", razao_social: "Beta Comércio SA", cnpj_cpf: "12.345.678/0001-95", grupo: "#002", regime_atual: "Lucro Real", uf: "GO" },
];
const SERVICOS = [
  { id: "S1", empresa_id: "E1", tipo: "BPO_FISCAL", situacao: "ATIVO", responsavel: "Maria", inicio: "2026-03-01T00:00:00Z", modulos: [], createdAt: "2026-03-01T00:00:00Z" },
  { id: "S2", empresa_id: "E2", tipo: "DIAGNOSTICO_PONTUAL", situacao: "PAUSADO", createdAt: "2026-02-01T00:00:00Z" },
];

function renderizar(elemento, local = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, enabled: false } } });
  qc.setQueryData(["empresas", "carteiras"], EMPRESAS);
  qc.setQueryData(["grupos"], GRUPOS);
  qc.setQueryData(["servicos-contratados"], SERVICOS);
  qc.setQueryData(["servicos-contratados", "resumo"], {});
  qc.setQueryData(["tags"], []);
  qc.setQueryData(["tags", "por-empresa"], {});
  qc.setQueryData(["carteira", "colaboradores"], [{ id: "U1", name: "Ana", empresa_ids: ["E1"] }]);
  qc.setQueryData(["documentos", "empresa", "E1"], [{ id: "D1", tipo: { nome: "Alvará" }, situacao: "VENCIDO", validade: "2026-10-01T00:00:00Z" }]);
  qc.setQueryData(["pessoas-fisicas"], [{ id: "P1", nome: "João Sócio", cpf: "123.456.789-01", empresa_id: "E1" }]);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location={local}>{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Clientes: a lista", () => {
  it("mostra todos os clientes, os filtros rápidos com números e o botão de novo cliente", () => {
    const html = renderizar(<ClientesPagina />);
    expect(html).toContain("Clientes · 2");
    expect(html).toContain("Novo cliente");
    expect(html).toContain("EXTRA AGRO LTDA");
    expect(html).toContain("Beta Comércio SA");
    for (const chip of ["Todos", "BPO fiscal", "Diagnóstico pontual", "Sem serviço", "Sem responsável"]) expect(html).toContain(chip);
  });

  it("cada linha tem os serviços: ligado vira selo, desligado vira “+” para ligar", () => {
    const html = renderizar(<ClientesPagina />);
    expect(html).toContain("Ligar Diagnóstico pontual para EXTRA AGRO LTDA");
    expect(html).toContain("Ligar BPO fiscal para Beta Comércio SA");
    expect(html).toContain("Diagnóstico · pausado");
    expect(html).not.toContain("Ligar BPO fiscal para EXTRA AGRO LTDA");
  });

  it("mostra o grupo só quando é grupo de verdade, e a equipe de cada cliente", () => {
    const html = renderizar(<ClientesPagina />);
    expect(html).toContain("Grupo Família Extra");
    expect(html).not.toContain("Grupo Beta Comércio SA");
    expect(html).toContain("Ana");
  });
});

describe("Clientes: a ficha", () => {
  const ficha = () => renderizar(<Routes><Route path="/clientes/:empresaId" element={<FichaClientePagina />} /></Routes>, "/clientes/E1");
  it("traz serviços, atalhos, dados, equipe, contato, documentos e pessoas físicas", () => {
    const html = ficha();
    expect(html).toContain("EXTRA AGRO LTDA");
    for (const t of ["Serviços contratados", "Ir para o trabalho deste cliente", "Dados cadastrais", "Equipe e etiquetas", "Contato", "Documentos com validade", "Pessoas físicas ligadas"]) expect(html).toContain(t);
    for (const t of ["XML e certificado A1", "Monitoramento fiscal", "Tarefas", "Arquivos e documentos", "Trabalho do diagnóstico"]) expect(html).toContain(t);
    expect(html).toContain("fiscal@extra.test");
    expect(html).toContain("Alvará");
    expect(html).toContain("Vencido");
    expect(html).toContain("João Sócio");
    expect(html).toContain("Maria");
  });
  it("cliente que não existe mais avisa e volta para a lista", () => {
    const html = renderizar(<Routes><Route path="/clientes/:empresaId" element={<FichaClientePagina />} /></Routes>, "/clientes/NAO");
    expect(html).toContain("Este cliente não existe mais");
  });
});
