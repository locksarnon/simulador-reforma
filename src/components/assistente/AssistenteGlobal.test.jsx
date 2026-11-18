import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth = vi.hoisted(() => ({ user: null, logout: () => {} }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: auth.user, logout: auth.logout }) }));

const Layout = (await import("../Layout")).default;
const { Troca } = await import("./AssistenteGlobal");
const { TELAS } = await import("@/lib/permissoes");

const ADMIN = { id: "u1", name: "Maria Souza", email: "maria@exemplo.test", role: "admin" };
const SEM_BASE_LEGAL = { id: "u2", name: "João", email: "joao@exemplo.test", role: "user", nivel: "CONSULTOR", permissoes: { telas: TELAS.map((t) => t.id).filter((id) => id !== "base-legal"), funcoes: ["alterar"] } };

const html = (el) => renderToString(<QueryClientProvider client={new QueryClient()}><StaticRouter location="/inicio">{el}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");

describe("botão do assistente no rodapé do menu", () => {
  it("aparece para quem tem a Base legal, antes da conta e do Sair, com o atalho", () => {
    auth.user = ADMIN;
    const h = html(<Layout />);
    expect(h).toContain("data-assistente-botao");
    expect(h).toContain('aria-label="Abrir o assistente tributário"');
    expect(h).toContain(">Assistente<");
    expect(h).toContain("Ctrl /");
    expect(h.indexOf("data-assistente-botao")).toBeLessThan(h.indexOf("Sair</span></button>"));
  });
  it("não aparece sem a tela Base legal (o servidor também recusaria os links)", () => {
    auth.user = SEM_BASE_LEGAL;
    expect(html(<Layout />)).not.toContain("data-assistente-botao");
  });
  it("sem conta carregada não há botão, e o painel fechado não desenha nada", () => {
    auth.user = null;
    const h = html(<Layout />);
    expect(h).not.toContain("data-assistente-botao");
    expect(h).not.toContain("data-assistente-painel");
  });
});

describe("troca de mensagens do painel", () => {
  const RESULTADO = { id: "r1", suficiente: true, resposta: "O crédito pode ser apropriado quando…", fundamentos: [{ norma: "lcp-214-2025", caminho: "art-47", numero: "Art. 47", rotulo: "Crédito", trecho: "O contribuinte poderá apropriar" }], aviso: "Apoio, não parecer." };
  it("pergunta à direita e resposta com a base legal", () => {
    const h = html(<Troca item={{ id: "1", pergunta: "Quando posso apropriar o crédito?", estado: "ok", resultado: RESULTADO }} aoRepetir={() => {}} />);
    for (const t of ["Quando posso apropriar o crédito?", "O crédito pode ser apropriado quando…", "Art. 47 — Crédito", "/base-legal/lcp-214-2025/art-47", "Copiar resposta", "Apoio, não parecer."]) expect(h).toContain(t);
  });
  it("enquanto consulta mostra a espera animada, sem resultado", () => {
    const h = html(<Troca item={{ id: "2", pergunta: "Como funciona o split payment?", estado: "carregando", inicio: Date.now() }} aoRepetir={() => {}} />);
    expect(h).toContain("assistente-ponto");
    expect(h).toContain("Procurando nos dispositivos da lei");
    expect(h).not.toContain("Copiar resposta");
  });
  it("no erro explica e oferece tentar de novo", () => {
    const h = html(<Troca item={{ id: "3", pergunta: "Ouro paga IBS e CBS?", estado: "erro", erro: "Muitas perguntas seguidas. Aguarde um instante." }} aoRepetir={() => {}} />);
    expect(h).toContain("Muitas perguntas seguidas. Aguarde um instante.");
    expect(h).toContain("Tentar de novo");
  });
});
