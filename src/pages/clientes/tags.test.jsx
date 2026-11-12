import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const papel = vi.hoisted(() => ({ atual: "admin" }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "A1", role: papel.atual, email: "admin@fal" } }) }));

const TagsPagina = (await import("./TagsPagina")).default;
const { PainelDaEtiqueta } = await import("./TagsPagina");
const ServicosContratadosPagina = (await import("./ServicosContratadosPagina")).default;
const { CarteiraBpo } = await import("./Carteiras");
const { quantasTem } = await import("@/components/clientes/DialogoEtiquetas");

const EMPRESAS = [
  { id: "E1", id_empresa: "EXTRA-AGRO", razao_social: "EXTRA AGRO LTDA", cnpj_cpf: "58.509.112/0001-52", grupo: "090" },
  { id: "E2", id_empresa: "EMP-2", razao_social: "Beta Comércio SA", cnpj_cpf: null, grupo: "001" },
];
const GRUPOS = [{ id: "G1", numero: "090", nome: "Extra Agro (teste)" }, { id: "G2", numero: "001", nome: "Cangaia" }];
const SERVICOS = [{ id: "S1", empresa_id: "E1", tipo: "BPO_FISCAL", situacao: "ATIVO", createdAt: "2026-03-01T00:00:00Z" }];
const TAGS = [{ id: "T1", nome: "Agro", cor: "#1E764D", empresas: 1 }, { id: "T2", nome: "Prioridade", cor: "#BE123C", empresas: 0 }];
const POR_EMPRESA = { E1: ["T1"] };
const COLABORADORES = [{ id: "U1", email: "maria@fal", name: "Maria", empresa_ids: ["E1"] }];
const LISTAS = [
  { id: "F1", nome: "Agro do BPO", escopo: "empresas", criterios: { carteira: "bpo", tags: ["T1"] }, compartilhado: false, meu: true, criado_por: "Admin" },
  { id: "F2", nome: "Sem responsável", escopo: "empresas", criterios: {}, compartilhado: true, meu: false, criado_por: "Maria" },
];

function renderizar(elemento, { tags = TAGS, porEmpresa = POR_EMPRESA, listas = LISTAS } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["empresas", "carteiras"], EMPRESAS);
  qc.setQueryData(["grupos"], GRUPOS);
  qc.setQueryData(["servicos-contratados"], SERVICOS);
  qc.setQueryData(["servicos-contratados", "resumo"], { empresas: 2, por_tipo: {}, em_carteira: { BPO_FISCAL: 1, DIAGNOSTICO_PONTUAL: 0, ambas: 0 }, sem_carteira: 1 });
  qc.setQueryData(["tags"], tags);
  qc.setQueryData(["tags", "por-empresa"], porEmpresa);
  qc.setQueryData(["carteira", "colaboradores"], COLABORADORES);
  qc.setQueryData(["filtros-salvos", "empresas"], listas);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/">{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Etiquetas (página)", () => {
  it("lista as etiquetas com quantas empresas usam cada uma e pede para escolher uma", () => {
    papel.atual = "admin";
    const html = renderizar(<TagsPagina />);
    expect(html).toContain('aria-label="Etiquetas"');
    expect(html).toContain("Agro");
    expect(html).toContain("Prioridade");
    expect(html).toContain("1 empresa<");
    expect(html).toContain("0 empresas");
    expect(html).toContain("Escolha uma etiqueta.");
    expect(html).toContain("Criar etiqueta");
  });

  it("sem nenhuma etiqueta, explica e mantém o formulário de criação", () => {
    const html = renderizar(<TagsPagina />, { tags: [], porEmpresa: {} });
    expect(html).toContain("Nenhuma etiqueta.");
    expect(html).toContain('aria-label="Nome da nova etiqueta"');
  });

  it("o painel de uma etiqueta mostra nome, cores e as empresas marcadas; só administrador vê Apagar", () => {
    const painel = (ehAdmin) => renderToString(
      <QueryClientProvider client={new QueryClient()}><PainelDaEtiqueta tag={TAGS[0]} empresas={EMPRESAS} porEmpresa={POR_EMPRESA} ehAdmin={ehAdmin} aoApagada={() => {}} /></QueryClientProvider>,
    ).replace(/<!-- -->/g, "");
    const admin = painel(true);
    expect(admin).toContain('value="Agro"');
    expect(admin).toContain("Empresas com esta etiqueta");
    expect(admin).toMatch(/checked=""[^>]*aria-label="EXTRA AGRO LTDA com a etiqueta Agro"|aria-label="EXTRA AGRO LTDA com a etiqueta Agro"[^>]*checked=""/);
    expect(admin).not.toMatch(/checked=""[^>]*aria-label="Beta Comércio SA com a etiqueta Agro"|aria-label="Beta Comércio SA com a etiqueta Agro"[^>]*checked=""/);
    expect(admin).toContain("Apagar");
    expect(painel(false)).not.toContain("Apagar");
  });

  it("quantas das empresas escolhidas já têm a etiqueta", () => {
    expect(quantasTem(POR_EMPRESA, "T1", EMPRESAS)).toBe(1);
    expect(quantasTem(POR_EMPRESA, "T2", EMPRESAS)).toBe(0);
    expect(quantasTem({}, "T1", EMPRESAS)).toBe(0);
  });
});

describe("Etiquetas e listas nas listas de Clientes", () => {
  it("Serviços contratados mostra as etiquetas da empresa, o filtro por etiquetas, o colaborador e as listas salvas", () => {
    const html = renderizar(<ServicosContratadosPagina />);
    expect(html).toContain('title="Agro"'); // chip da empresa E1
    expect(html).toContain("editar"); // atalho de editar etiquetas da E1
    expect(html).toContain("+ etiqueta"); // E2 não tem nenhuma
    expect(html).toContain('aria-label="Filtrar por etiquetas"');
    expect(html).toContain("Sem colaborador");
    expect(html).toContain("Maria");
    expect(html).toContain('aria-label="Listas salvas"');
    expect(html).toContain("Agro do BPO");
    expect(html).toContain("Sem responsável · Maria"); // compartilhada por outra pessoa
    expect(html).toContain("Salvar lista");
  });

  it("a carteira do BPO também mostra etiquetas, filtro e listas salvas", () => {
    const html = renderizar(<CarteiraBpo />);
    expect(html).toContain('title="Agro"');
    expect(html).toContain('aria-label="Filtrar por etiquetas"');
    expect(html).toContain('aria-label="Listas salvas"');
    expect(html).toContain("Colaborador");
  });

  it("sem nenhuma etiqueta criada, o filtro por etiquetas não aparece, mas a empresa oferece '+ etiqueta'", () => {
    const html = renderizar(<ServicosContratadosPagina />, { tags: [], porEmpresa: {} });
    expect(html).not.toContain('aria-label="Filtrar por etiquetas"');
    expect(html).toContain("+ etiqueta");
  });

  it("Salvar lista fica desligado enquanto nenhum filtro está ligado", () => {
    const html = renderizar(<ServicosContratadosPagina />);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(<svg[^>]*>.*?<\/svg>)? ?Salvar lista/);
  });
});
