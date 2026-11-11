import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";

const auth = vi.hoisted(() => ({ user: null, logout: () => {} }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: auth.user, logout: auth.logout }) }));

const Layout = (await import("./Layout")).default;

function renderizar(user) {
  auth.user = user;
  // O React separa textos vizinhos com comentários (<!-- -->); tirá-los deixa as comparações no texto que a pessoa lê.
  return renderToString(<StaticRouter location="/"><Layout /></StaticRouter>).replace(/<!-- -->/g, "");
}

describe("Layout: botão Sair e conta logada", () => {
  it("administrador com nome: botão Sair, nome, papel e e-mail", () => {
    const html = renderizar({ id: "u1", name: "Maria Souza", email: "maria@exemplo.test", role: "admin" });
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>(?:(?!<\/button>)[\s\S])*Sair<\/button>/);
    expect(html).toContain("Maria Souza");
    expect(html).toContain("Administrador · maria@exemplo.test");
  });

  it("conta comum sem nome: mostra o e-mail e o papel Consultor, sem repetir o e-mail", () => {
    const html = renderizar({ id: "u2", name: null, email: "joao@exemplo.test", role: "user" });
    expect(html).toContain(">joao@exemplo.test<");
    expect(html).toContain(">Consultor<");
    expect(html).not.toContain("Consultor · ");
    expect(html).not.toContain("Administrador");
  });

  it("o rodapé do menu continua com a versão e a troca de tema, e o Sair vem antes deles", () => {
    const html = renderizar({ id: "u1", name: "Maria Souza", email: "maria@exemplo.test", role: "admin" });
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
