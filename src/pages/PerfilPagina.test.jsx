import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "U1", role: "user" }, atualizarUsuario: () => {} }) }));

const { default: PerfilPagina, problemasDaSenha } = await import("./PerfilPagina");

function renderizar(perfil) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  if (perfil) qc.setQueryData(["perfil"], perfil);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/perfil"><PerfilPagina /></StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Meu perfil", () => {
  it("mostra e-mail, papel, o campo do nome e a troca de senha", () => {
    const html = renderizar({ id: "U1", email: "maria@fal", name: "Maria", role: "user" });
    expect(html).toContain("maria@fal · Consultor");
    expect(html).toContain('value="Maria"');
    expect(html).toContain("Trocar a senha");
    expect(html).toContain("Senha atual");
    expect(html).toContain("Senha nova (mínimo 10 caracteres)");
    expect(html).toContain("Repita a senha nova");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*Trocar senha/); // nada digitado: botão desligado
  });

  it("administrador aparece como Administrador", () => {
    expect(renderizar({ id: "A1", email: "admin@fal", name: null, role: "admin" })).toContain("admin@fal · Administrador");
  });

  it("enquanto carrega, mostra o estado de carregamento e nenhum formulário", () => {
    const html = renderizar(null);
    expect(html).toContain("Carregando…");
    expect(html).not.toContain("Trocar a senha");
  });
});

describe("regras da senha nova na tela", () => {
  it("avisa senha curta, igual à atual e confirmação diferente; sem erro quando está tudo certo", () => {
    expect(problemasDaSenha("antiga-antiga", "curta", "")).toEqual(["A senha nova precisa ter pelo menos 10 caracteres."]);
    expect(problemasDaSenha("mesma-senha-123", "mesma-senha-123", "")).toEqual(["A senha nova precisa ser diferente da atual."]);
    expect(problemasDaSenha("antiga-antiga", "nova-senha-longa", "outra-coisa-longa")).toEqual(["A confirmação não é igual à senha nova."]);
    expect(problemasDaSenha("antiga-antiga", "nova-senha-longa", "nova-senha-longa")).toEqual([]);
    expect(problemasDaSenha("", "", "")).toEqual([]); // nada digitado ainda: sem aviso
  });
});
