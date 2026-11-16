import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "qa@fal" } }) }));

const ClientesPagina = (await import("./ClientesPagina")).default;
const FichaClientePagina = (await import("./FichaClientePagina")).default;
const ServicosConsultoria = (await import("@/components/clientes/ServicosConsultoria")).default;

const GRUPOS = [{ id: "G1", numero: "#001", nome: "Família Extra", tipo: "Grupo familiar" }, { id: "G2", numero: "#002", nome: "Beta Comércio SA", tipo: "Cliente individual" }];
const EMPRESAS = [
  { id: "E1", id_empresa: "EXTRA", razao_social: "EXTRA AGRO LTDA", cnpj_cpf: "58.509.112/0001-52", grupo: "#001", regime_atual: "Lucro Presumido", uf: "MT", municipio: "Sorriso", email_contato: "fiscal@extra.test" },
  { id: "E2", id_empresa: "BETA", razao_social: "Beta Comércio SA", cnpj_cpf: "12.345.678/0001-95", grupo: "#002", regime_atual: "Lucro Real", uf: "GO" },
];
const SERVICOS = [
  { id: "S1", empresa_id: "E1", tipo: "BPO_FISCAL", situacao: "ATIVO", responsavel: "Maria", inicio: "2026-03-01T00:00:00Z", modulos: [], createdAt: "2026-03-01T00:00:00Z" },
  { id: "S2", empresa_id: "E2", tipo: "DIAGNOSTICO_PONTUAL", situacao: "PAUSADO", createdAt: "2026-02-01T00:00:00Z" },
];
const CATALOGO = [
  { id: "credito-estoque", publico: "PJ", area: "Créditos e Oportunidades Tributárias", nome: "Crédito presumido de estoque" },
  { id: "regimes-exercicio", publico: "PJ", area: "Planejamento Tributário", nome: "Escolha do regime tributário para o exercício" },
  { id: "lcdpr", publico: "PF", area: "Créditos e Oportunidades Tributárias", nome: "Revisão do livro-caixa rural (LCDPR)" },
];
const VINCULOS = [{ id: "V1", publico: "PJ", cliente_id: "E1", servico: "credito-estoque" }];
const PROJETOS = [{ id: "PR1", empresa_ids: ["E1"], servico_consultoria: "credito-estoque", situacao: "EM_ANDAMENTO" }];

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
  qc.setQueryData(["consultoria", "catalogo"], CATALOGO);
  qc.setQueryData(["consultoria", "vinculos"], VINCULOS);
  qc.setQueryData(["projetos-diagnostico"], PROJETOS);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location={local}>{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Clientes: a lista", () => {
  it("mostra todos os clientes, os filtros rápidos com números e o botão de novo cliente", () => {
    const html = renderizar(<ClientesPagina />);
    expect(html).toContain("Clientes · 2");
    expect(html).toContain("Novo cliente");
    expect(html).toContain("EXTRA AGRO LTDA");
    expect(html).toContain("Beta Comércio SA");
    for (const chip of ["Todos", "BPO fiscal", "Consultoria", "Sem serviço", "Sem responsável"]) expect(html).toContain(chip);
    expect(html).not.toContain("Diagnóstico pontual");
  });

  it("cada linha tem os serviços: BPO ligado vira selo, desligado vira “+”; a consultoria mostra o serviço vinculado ou “+ Consultoria”", () => {
    const html = renderizar(<ClientesPagina />);
    expect(html).toContain("Ligar BPO fiscal para Beta Comércio SA");
    expect(html).not.toContain("Ligar BPO fiscal para EXTRA AGRO LTDA");
    expect(html).toContain("Crédito presumido de estoque"); // consultoria vinculada à EXTRA
    expect(html).toContain("Vincular consultoria para Beta Comércio SA");
    expect(html).not.toContain("Vincular consultoria para EXTRA AGRO LTDA");
    expect(html).not.toContain("Diagnóstico · pausado"); // o diagnóstico pontual antigo não aparece mais na lista
  });

  it("o filtro rápido Consultoria conta quem tem serviço de consultoria vinculado", () => {
    const html = renderizar(<ClientesPagina />);
    expect(html).toMatch(/Consultoria <span[^>]*>1<\/span>/);
    expect(html).toMatch(/Sem serviço <span[^>]*>1<\/span>/); // Beta só tem o diagnóstico pontual antigo
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
    for (const t of ["XML e certificado A1", "Monitoramento fiscal", "Tarefas", "Arquivos e documentos", "Consultoria tributária"]) expect(html).toContain(t);
    expect(html).not.toContain("Trabalho do diagnóstico");
    expect(html).toContain("fiscal@extra.test");
    expect(html).toContain("Alvará");
    expect(html).toContain("Vencido");
    expect(html).toContain("João Sócio");
    expect(html).toContain("Maria");
  });
  it("Serviços contratados: BPO fiscal e os serviços de Consultoria Tributária, com área, projetos e o caminho para a carteira", () => {
    const html = ficha();
    expect(html).toContain("Consultoria Tributária");
    expect(html).toContain("Crédito presumido de estoque");
    expect(html).toContain("Créditos e Oportunidades Tributárias · 1 projeto em andamento");
    expect(html).toContain('href="/consultoria/carteira/PJ/E1"');
    expect(html).toContain("Abrir na Carteira de Consultoria");
    expect(html).toContain("+ Vincular serviço de consultoria");
    expect(html).toContain("Escolha do regime tributário para o exercício"); // serviço PJ ainda não vinculado, no seletor
    expect(html).not.toContain("Revisão do livro-caixa rural"); // serviço de pessoa física não entra
    expect(html).not.toContain("Diagnóstico pontual");
  });
  it("cliente que não existe mais avisa e volta para a lista", () => {
    const html = renderizar(<Routes><Route path="/clientes/:empresaId" element={<FichaClientePagina />} /></Routes>, "/clientes/NAO");
    expect(html).toContain("Este cliente não existe mais");
  });
});

describe("Novo cliente: serviços de consultoria", () => {
  const quadro = (props) => renderizar(<ServicosConsultoria publico="PJ" selecao={["credito-estoque"]} mudar={() => {}} {...props} />);
  it("mostra o catálogo de pessoa jurídica agrupado por área, com o que já foi marcado", () => {
    const html = quadro();
    expect(html).toContain("Consultoria Tributária");
    expect(html.indexOf("Créditos e Oportunidades Tributárias")).toBeLessThan(html.indexOf("Crédito presumido de estoque"));
    expect(html.indexOf("Planejamento Tributário")).toBeLessThan(html.indexOf("Escolha do regime tributário para o exercício"));
    expect(html).toMatch(/checked=""[^>]*\/>Crédito presumido de estoque/);
    expect(html).not.toContain("Revisão do livro-caixa rural");
    expect(html).not.toMatch(/<fieldset[^>]*disabled=""/);
  });
  it("sem CNPJ completo fica desabilitado, com a dica", () => {
    const html = quadro({ desabilitado: true, dica: "Informe o CNPJ completo para escolher os serviços de consultoria." });
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toContain("Informe o CNPJ completo para escolher os serviços de consultoria.");
  });
});
