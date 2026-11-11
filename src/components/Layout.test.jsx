import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth = vi.hoisted(() => ({ user: null, logout: () => {} }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: auth.user, logout: auth.logout }) }));

const Layout = (await import("./Layout")).default;

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
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>(?:(?!<\/button>)[\s\S])*Sair<\/button>/);
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
    expect(html.indexOf("Sair</button>")).toBeLessThan(html.indexOf("InTAX v1.0"));
  });

  it("sem conta carregada não inventa identidade, mas o Sair continua disponível", () => {
    const html = renderizar(null);
    expect(html).not.toContain("Administrador");
    expect(html).not.toContain("Consultor");
    expect(html).toContain("Sair</button>");
  });
});

describe("Layout: menu em áreas, busca e acessibilidade", () => {
  it("mostra as áreas na ordem do plano, cada uma ligada à sua página", () => {
    const html = renderizar(ADMIN);
    const ordem = ["Clientes", "BPO Fiscal", "Diagnósticos", "Planejamento tributário", "Consultas fiscais", "Comercial", "Administração", "Ajuda"];
    const posicoes = ordem.map((a) => html.indexOf(`${a}</a>`));
    expect(posicoes.every((p) => p > 0)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
    for (const id of ["clientes", "bpo", "diagnostico", "reforma", "conhecimento", "comercial", "admin", "suporte"]) expect(html).toContain(`href="/area/${id}"`);
    expect(html).toContain('href="/inicio"');
  });

  it("só a área da tela aberta vem aberta; as outras recolhidas, com o botão de abrir", () => {
    const html = renderizar(ADMIN, "/bpo/repositorio-xml/E1");
    expect(html).toContain("Captura de XML");
    expect(html).not.toContain(">Cenários<");
    expect(html).toContain('aria-label="Abrir Planejamento tributário"');
    expect(html).toContain('aria-label="Recolher BPO Fiscal"');
  });

  it("o item do módulo aberto leva aria-current, inclusive nas telas internas dele", () => {
    const html = renderizar(ADMIN, "/workroom/G1/empresas/E1/servicos");
    const link = html.match(/<a[^>]*href="\/diagnostico"[^>]*>/)?.[0] || "";
    expect(link).toContain('aria-current="page"');
  });

  it("consultor não vê módulo em breve nem os de administrador; administrador vê com o selo", () => {
    expect(renderizar(CONSULTOR, "/bpo/repositorio-xml")).toContain("Monitoramento fiscal");
    expect(renderizar(CONSULTOR, "/configuracao")).not.toContain("Usuários e acessos");
    expect(renderizar(ADMIN, "/configuracao")).toContain("Usuários e acessos");
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
    expect(renderizar(ADMIN)).toContain('aria-label="Abrir o menu"');
  });
});
