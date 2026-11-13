import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const papel = vi.hoisted(() => ({ atual: "admin" }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "U1", role: papel.atual, email: "maria@fal" } }) }));

const AgendaPagina = (await import("./AgendaPagina")).default;
const { AbaObrigacoes, AbaTipos } = await import("./AgendaPagina");
const { competenciaAtual } = await import("@/lib/tarefas");

const EMPRESAS = [{ id: "EMP1", id_empresa: "EXTRA", razao_social: "EXTRA AGRO LTDA", cnpj_cpf: "58.509.112/0001-52" }];
const TIPOS = [{ id: "T1", nome: "Reunião", cor: "#2563EB" }, { id: "T2", nome: "Prazo", cor: "#DC2626" }];
const OBRIG = {
  mes: competenciaAtual(),
  vencimentos: [
    { obrigacao: "dctfweb", nome: "DCTFWeb", tipo: "DECLARACAO", competencia: "2026-10", data: "2026-11-13", data_legal: "2026-11-15", movida: true, regimes: "TODOS", condicao: "Quem tem empregados.", fonte: { norma: "IN RFB nº 2.005/2021", dispositivo: "art. 19", url: "https://normas.receita.fazenda.gov.br/x", trecho: "até o dia 15" }, confirmado: true, observacao: null },
    { obrigacao: "pgdas-d", nome: "PGDAS-D", tipo: "DECLARACAO", competencia: "2026-10", data: "2026-11-20", data_legal: "2026-11-20", movida: false, regimes: ["Simples Nacional"], condicao: null, fonte: null, confirmado: false, observacao: null },
  ],
  feriados: [],
  empresas: [{ id: "EMP1", razao_social: "EXTRA AGRO LTDA", regime_atual: "Lucro Presumido", obrigacoes: ["dctfweb"] }],
};

function renderizar(elemento) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["empresas", "carteiras"], EMPRESAS);
  qc.setQueryData(["carteira", "colaboradores"], [{ id: "U1", email: "maria@fal", name: "Maria", empresa_ids: [] }]);
  qc.setQueryData(["agenda", "tipos"], TIPOS);
  qc.setQueryData(["agenda", "obrigacoes", competenciaAtual(), ""], OBRIG);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/bpo/agenda">{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Obrigações e agenda", () => {
  it("abre no calendário do mês, com as camadas, a navegação e o botão de novo evento", () => {
    const html = renderizar(<AgendaPagina />);
    for (const t of ["Calendário", "Obrigações do mês", "Tipos de evento", "Eventos", "Tarefas", "Obrigações federais", "Agenda da Reforma", "Certificados A1", "Hoje", "Novo evento"]) expect(html).toContain(t);
    expect(html).toContain('aria-label="Visão do calendário"');
    expect(html).toMatch(/aria-label="Calendário de [a-zç]+ de \d{4}"/);
    for (const d of ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]) expect(html).toContain(`>${d}<`);
  });

  it("obrigações do mês: data, data legal quando movida, competência, regimes e fonte; sem fonte aparece 'não confirmado'", () => {
    const html = renderizar(<AbaObrigacoes empresas={EMPRESAS} />);
    expect(html).toContain("13/11/2026");
    expect(html).toContain("Data legal");
    expect(html).toMatch(/>15\/11\/2026</);
    expect(html).toContain("IN RFB nº 2.005/2021, art. 19");
    expect(html).toContain("“até o dia 15”");
    expect(html).toContain("Todos os regimes");
    expect(html).toContain("Simples Nacional");
    expect(html).toContain("não confirmado");
    expect(html).toContain("Empresas do BPO fiscal neste mês");
    expect(html).toContain("Lucro Presumido");
    expect(html).toContain("Feriados estaduais e municipais");
  });

  it("tipos de evento: administrador cria e apaga; consultor só vê", () => {
    papel.atual = "admin";
    const admin = renderizar(<AbaTipos ehAdmin />);
    expect(admin).toContain("Novo tipo de evento");
    expect(admin).toContain('aria-label="Apagar Reunião"');
    const consultor = renderizar(<AbaTipos ehAdmin={false} />);
    expect(consultor).toContain("Só administradores criam e mudam os tipos de evento.");
    expect(consultor).not.toContain('aria-label="Apagar Reunião"');
    expect(consultor).toContain("Prazo");
  });
});
