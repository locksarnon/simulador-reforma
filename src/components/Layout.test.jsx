import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth = vi.hoisted(() => ({ user: null, logout: () => {} }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: auth.user, logout: auth.logout }) }));

const Layout = (await import("./Layout")).default;
const MenuLateral = (await import("./MenuLateral")).default;

const ADMIN = { id: "u1", name: "Maria Souza", email: "maria@exemplo.test", role: "admin" };
const CONSULTOR = { id: "u2", name: null, email: "joao@exemplo.test", role: "user" };

function renderizar(user, local = "/") {
  auth.user = user;
  // O React separa textos vizinhos com comentários (<!-- -->); tirá-los deixa as comparações no texto que a pessoa lê.
  return renderToString(
    <QueryClientProvider client={new QueryClient()}><StaticRouter location={local}><Layout /></StaticRouter></QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

describe("Layout: botão Sair e conta logada", () => {
  it("administrador com nome: botão Sair, nome, papel e e-mail", () => {
    const html = renderizar(ADMIN);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>(?:(?!<\/button>)[\s\S])*Sair<\/span><\/button>/);
    expect(html).toContain("Maria Souza");
    expect(html).toContain("Administrador · maria@exemplo.test");
  });

  it("conta comum sem nome: mostra o e-mail e o papel Consultor, sem repetir o e-mail", () => {
    const html = renderizar(CONSULTOR);
    expect(html).toContain(">joao@exemplo.test<");
    expect(html).toContain(">Consultor<");
    expect(html).not.toContain("Consultor · ");
    expect(html).not.toContain("Administrador");
  });

  it("o rodapé do menu continua com a versão e a troca de tema, e o Sair vem antes deles", () => {
    const html = renderizar(ADMIN);
    expect(html).toContain("InTAX v1.0");
    expect(html).toContain("Modo escuro");
    expect(html.indexOf("Sair</span></button>")).toBeLessThan(html.indexOf("InTAX v1.0"));
  });

  it("sem conta carregada não inventa identidade, mas o Sair continua disponível", () => {
    const html = renderizar(null);
    expect(html).not.toContain("Administrador");
    expect(html).not.toContain(">Consultor<");
    expect(html).toContain("Sair</span></button>");
  });
});

describe("Layout: menu em áreas, busca e acessibilidade", () => {
  it("mostra as áreas na ordem do plano, cada uma ligada à sua página", () => {
    const html = renderizar(ADMIN);
    const ordem = ["Clientes", "BPO Fiscal", "Consultoria Tributária", "Consultas fiscais", "Comercial", "Administração", "Ajuda"];
    const posicoes = ordem.map((a) => html.indexOf(`${a}</span></a>`));
    expect(posicoes.every((p) => p > 0)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
    for (const id of ["clientes", "bpo", "diagnostico", "conhecimento", "comercial", "admin", "suporte"]) expect(html).toContain(`href="/area/${id}"`);
    expect(html).toContain('href="/inicio"');
  });

  it("no computador o menu nasce recolhido em ícones; os módulos abrem num painel ao lado, e a área aberta mostra o módulo atual", () => {
    const html = renderizar(ADMIN, "/bpo/repositorio-xml/E1");
    expect(html).toMatch(/<aside data-menu-lateral=""[^>]*class="sticky[^"]*w-\[72px\]/);
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*>Captura de XML<\/a>/);
    expect(html).not.toContain(">Cenários<");
    expect(html).toContain('aria-label="Abrir Consultoria Tributária"');
    expect(html).toContain('aria-label="Abrir BPO Fiscal"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("sem-barra");
  });

  it("na gaveta (celular) só a área da tela aberta vem aberta; consultor não vê os módulos de administrador", () => {
    const gaveta = (user, local) => {
      auth.user = user;
      return renderToString(<QueryClientProvider client={new QueryClient()}><StaticRouter location={local}><MenuLateral modo="gaveta" /></StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
    };
    const bpo = gaveta(CONSULTOR, "/bpo/repositorio-xml");
    expect(bpo).toContain("Monitoramento fiscal");
    expect(bpo).toContain('aria-label="Recolher BPO Fiscal"');
    expect(bpo).toContain('aria-label="Abrir Consultoria Tributária"');
    expect(bpo).not.toContain(">Cenários<");
    expect(gaveta(CONSULTOR, "/configuracao")).not.toContain("Usuários e acessos");
    expect(gaveta(ADMIN, "/configuracao")).toContain("Usuários e acessos");
  });

  it("o item do módulo aberto leva aria-current, inclusive nas telas internas dele", () => {
    const html = renderizar(ADMIN, "/workroom/G1/empresas/E1/servicos");
    const link = html.match(/<a[^>]*href="\/consultoria\/projetos"[^>]*>/)?.[0] || "";
    expect(link).toContain('aria-current="page"');
  });

  it("a barra superior tem a busca rápida (Ctrl K) e o link para pular ao conteúdo", () => {
    const html = renderizar(ADMIN);
    expect(html).toContain('aria-label="Buscar módulo ou empresa (Ctrl K)"');
    expect(html).toContain("Ctrl K");
    expect(html).toContain('href="#conteudo"');
    expect(html).toContain('id="conteudo"');
    expect(html).toContain('aria-label="Menu principal"');
  });

  it("no celular o menu abre numa gaveta (botão do menu na barra)", () => {
    const html = renderizar(ADMIN);
    expect(html).toContain('aria-label="Abrir o menu"');
    expect(html).toContain('aria-controls="menu-movel" aria-expanded="false"');
    expect(html).toMatch(/<aside id="menu-movel"[^>]*class="sticky[^"]*w-0/);
  });
});
