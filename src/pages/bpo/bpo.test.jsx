import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appFonte from "@/App.jsx?raw";
import workroomFonte from "@/pages/EmpresaWorkroom.jsx?raw";
import { CAMINHO_REPOSITORIO_XML, caminhoDoRepositorio } from "@/lib/bpoCaminhos";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "fulano@fal" } }) }));
vi.mock("@/components/ConfirmProvider", () => ({ useConfirmar: () => async () => true }));

const Layout = (await import("@/components/Layout")).default;
const RepositorioXmlLista = (await import("./RepositorioXmlLista")).default;
const { filtrarEmpresas } = await import("./RepositorioXmlLista");
const RepositorioXmlEmpresa = (await import("./RepositorioXmlEmpresa")).default;

const GRUPOS = [{ id: "G1", numero: "#001", nome: "xyz" }, { id: "G3", numero: "#003", nome: "Crestani" }];
const EMPRESAS = [
  { id: "E3", id_empresa: "EMP003", razao_social: "Zeta Comércio Ltda", cnpj_cpf: "99999999000191", grupo: "#003", uf: "MS" },
  { id: "E1", id_empresa: "EMP001", razao_social: "Álvares Agropecuária Ltda", cnpj_cpf: "12345678000195", grupo: "#001", uf: "MT", municipio: "Cuiabá" },
  { id: "E2", id_empresa: "EMP002", razao_social: "Beta Serviços SA", cnpj_cpf: null, grupo: "#099", uf: null },
];

function renderizar(elemento, { local = "/", cache = [] } = {}) {
  // staleTime infinito: com o cache preenchido, a renderização no servidor não dispara busca nem marca "Atualizando…".
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  for (const [chave, dados] of cache) qc.setQueryData(chave, dados);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location={local}>{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("caminhos do BPO fiscal", () => {
  it("o caminho da empresa parte do caminho da lista", () => {
    expect(CAMINHO_REPOSITORIO_XML).toBe("/bpo/repositorio-xml");
    expect(caminhoDoRepositorio("E1")).toBe("/bpo/repositorio-xml/E1");
  });
});

describe("menu lateral: área BPO Fiscal", () => {
  it("fica separada de Clientes e do Diagnóstico e Serviços, e leva à Captura de XML", () => {
    const html = renderizar(<Layout />, { local: "/bpo/repositorio-xml/E1" });
    expect(html).toContain("BPO Fiscal");
    expect(html).toContain("Captura de XML");
    expect(html.indexOf("Clientes")).toBeLessThan(html.indexOf("BPO Fiscal"));
    expect(html.indexOf("BPO Fiscal")).toBeLessThan(html.indexOf("Diagnóstico e Serviços"));
    // A Captura de XML está sob BPO Fiscal: nada dela aparece na área Clientes.
    const clientes = html.slice(html.indexOf("Clientes"), html.indexOf("BPO Fiscal"));
    expect(clientes).not.toContain("Captura de XML");
    // Na tela de Grupos e empresas é a área Clientes que vem aberta, com o item dela.
    expect(renderizar(<Layout />, { local: "/" })).toContain("Grupos e empresas");
    // Dentro da tela de uma empresa o item continua marcado como o lugar atual.
    const link = html.match(/<a[^>]*href="\/bpo\/repositorio-xml"[^>]*>/)?.[0] || "";
    expect(link).toContain('aria-current="page"');
  });

  it("a aba Repositório de XML saiu do workroom da empresa (o endereço antigo só redireciona)", () => {
    expect(workroomFonte).not.toContain("repositorio-xml");
    expect(appFonte).not.toContain("EmpresaRepositorioXml");
    expect(appFonte).toContain("RepositorioXmlLista");
    expect(appFonte).toContain("RepositorioXmlEmpresa");
  });
});

describe("filtrarEmpresas", () => {
  it("ordena pelo nome, sem ligar para acento ou maiúscula, e liga cada empresa ao seu grupo", () => {
    const linhas = filtrarEmpresas(EMPRESAS, GRUPOS, "");
    expect(linhas.map((l) => l.empresa.id)).toEqual(["E1", "E2", "E3"]);
    expect(linhas.find((l) => l.empresa.id === "E1").grupo.nome).toBe("xyz");
    expect(linhas.find((l) => l.empresa.id === "E2").grupo).toBeNull();
  });

  it("busca por nome (sem acento), CNPJ com ou sem pontuação, grupo, UF e município", () => {
    const ids = (busca) => filtrarEmpresas(EMPRESAS, GRUPOS, busca).map((l) => l.empresa.id);
    expect(ids("alvares")).toEqual(["E1"]);
    expect(ids("12.345.678/0001-95")).toEqual(["E1"]);
    expect(ids("345678")).toEqual(["E1"]);
    expect(ids("crestani")).toEqual(["E3"]);
    expect(ids("#001")).toEqual(["E1"]);
    expect(ids("cuiaba")).toEqual(["E1"]);
    expect(ids("ms")).toContain("E3");
    expect(ids("nada disso")).toEqual([]);
  });

  it("aguenta lista vazia ou ainda não carregada", () => {
    expect(filtrarEmpresas(undefined, undefined, "x")).toEqual([]);
    expect(filtrarEmpresas([], [], "")).toEqual([]);
  });
});

describe("RepositorioXmlLista", () => {
  const cache = [[["empresas", "bpo-lista"], EMPRESAS], [["grupos"], GRUPOS]];

  it("lista as empresas de todos os grupos, com CNPJ, grupo e o caminho do repositório de cada uma", () => {
    const html = renderizar(<RepositorioXmlLista />, { local: CAMINHO_REPOSITORIO_XML, cache });
    expect(html).toContain("Repositório de XML");
    expect(html).toContain("BPO fiscal");
    expect(html).toContain("Álvares Agropecuária Ltda");
    expect(html).toContain("12.345.678/0001-95");
    expect(html).toContain("#001 xyz");
    expect(html).toContain("#003 Crestani");
    expect(html).toContain("#099"); // grupo que não está na lista de grupos: mostra o que o cadastro da empresa guarda
    for (const id of ["E1", "E2", "E3"]) expect(html).toContain(`href="/bpo/repositorio-xml/${id}"`);
    expect(html.indexOf("Álvares")).toBeLessThan(html.indexOf("Beta Serviços"));
    expect(html.indexOf("Beta Serviços")).toBeLessThan(html.indexOf("Zeta Comércio"));
    expect(html).toContain("Buscar por empresa, CNPJ ou grupo");
  });

  it("sem empresas, manda cadastrar em Grupos e empresas", () => {
    const html = renderizar(<RepositorioXmlLista />, { local: CAMINHO_REPOSITORIO_XML, cache: [[["empresas", "bpo-lista"], []], [["grupos"], GRUPOS]] });
    expect(html).toContain("Nenhuma empresa cadastrada.");
    expect(html).toContain('href="/"');
    expect(html).toContain("Grupos e empresas");
  });
});

describe("RepositorioXmlEmpresa", () => {
  // A aba que abre primeiro é a NF-e | NFC-e: a lista pede o grupo NFE.
  const PARAMETROS = { tipo: "", origem: "", conteudo: "COMPLETO", grupo: "NFE", de: "", ate: "", pendentes: undefined, q: undefined };
  const empresa = EMPRESAS[1];
  const cacheDocs = [[["repo-xml-resumo", "E1"], { total: 0 }], [["repo-xml-docs", "E1", PARAMETROS, 0, 50], { itens: [], total: 0 }]];
  const tela = (cache) => renderizar(
    <Routes><Route path={`${CAMINHO_REPOSITORIO_XML}/:empresaId`} element={<RepositorioXmlEmpresa />} /></Routes>,
    { local: caminhoDoRepositorio("E1"), cache },
  );

  it("mostra a empresa, o menu por tipo de documento e a Importação XML do grupo dela, fora do workroom do diagnóstico", () => {
    const html = tela([[["empresa", "E1"], empresa], [["grupos"], GRUPOS], ...cacheDocs]);
    expect(html).toContain("Álvares Agropecuária Ltda");
    expect(html).toContain("CNPJ 12.345.678/0001-95");
    expect(html).toContain("Grupo #001 xyz");
    // O caminho de volta é a lista do BPO, não o grupo.
    expect(html).toContain(`href="${CAMINHO_REPOSITORIO_XML}"`);
    for (const aba of ["Certificado", "Captura", "NF-e | NFC-e", "CT-e", "NFS-e", "MDF-e", "Resumos e eventos SEFAZ", "Relatórios"]) expect(html).toContain(aba);
    expect(html).not.toContain("Certificado e autorização");
    // A Importação XML é do diagnóstico: o link leva ao grupo e à empresa certos.
    expect(html).toContain('href="/workroom/G1/empresas/E1/importacao-xml"');
    expect(html).toContain("Abrir Importação XML");
    // Sem o botão de excluir empresa: isso fica no diagnóstico.
    expect(html).not.toContain("Excluir empresa");
  });

  it("o menu é uma barra com um item por tipo de documento, na ordem do Notalize, e o item aberto vem em destaque verde", () => {
    const html = tela([[["empresa", "E1"], empresa], [["grupos"], GRUPOS], ...cacheDocs]);
    const itens = [...html.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    expect(itens).toEqual(["Certificado", "Captura", "NF-e | NFC-e", "CT-e", "NFS-e", "MDF-e", "Resumos e eventos SEFAZ", "Relatórios"]);
    const aberto = [...html.matchAll(/<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    expect(aberto).toEqual(["NF-e | NFC-e"]);
    expect(html).toContain("data-[state=active]:bg-primary");
    expect(html).toContain("data-[state=active]:text-primary-foreground");
    expect(html).toContain('aria-label="Menu do repositório"');
    // a aba aberta mostra os cartões e a lista do grupo; as outras abas ainda não foram desenhadas
    expect(html).toContain("Aguardando o importador");
    expect(html).toContain("Arraste aqui os XML ou ZIP do cliente");
    expect(html).not.toContain("Gerar relatório");
  });

  it("a aba dos resumos e eventos mostra quantas linhas a tabela tem (o mesmo número do cartão acima das abas)", () => {
    const grupos = [[["empresa", "E1"], empresa], [["grupos"], GRUPOS]];
    const com = tela([...grupos, [["repo-xml-resumo", "E1"], { total: 9, so_resumo: 3, resumos_e_eventos: 5 }], cacheDocs[1]]);
    expect(com).toContain("Resumos e eventos SEFAZ (5)");
    const sem = tela([...grupos, ...cacheDocs]);
    expect(sem).not.toMatch(/Resumos e eventos SEFAZ \(\d+\)/); // sem linhas, o nome da aba vem sem o número entre parênteses
  });

  it("sem grupo conhecido, não mostra um link de importação que levaria a lugar nenhum", () => {
    const html = tela([[["empresa", "E1"], { ...empresa, grupo: "#777" }], [["grupos"], GRUPOS], ...cacheDocs]);
    expect(html).not.toContain("Abrir Importação XML");
    expect(html).toContain("Documentos");
  });

  it("empresa que não existe: avisa e volta para a lista", () => {
    const html = tela([[["empresa", "E1"], null], [["grupos"], GRUPOS]]);
    expect(html).toContain("Empresa não encontrada.");
    expect(html).toContain(`href="${CAMINHO_REPOSITORIO_XML}"`);
  });
});
