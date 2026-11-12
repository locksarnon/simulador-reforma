import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const papel = vi.hoisted(() => ({ atual: "admin" }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "A1", role: papel.atual, email: "admin@fal" } }) }));

const UsuariosPagina = (await import("./UsuariosPagina")).default;
const AcessosPagina = (await import("./AcessosPagina")).default;
const { RegistroDeAcesso, IpsPermitidos, navegadorDe } = await import("./AcessosPagina");

const USUARIOS = [
  { id: "A1", email: "admin@fal", name: "Admin", role: "admin", ativo: true, lastLoginAt: "2026-11-11T15:00:00Z", empresas: 0 },
  { id: "U1", email: "maria@fal", name: "Maria", role: "user", ativo: true, lastLoginAt: null, empresas: 4, situacao: "CONVITE_PENDENTE", convite: { expira_em: "2026-11-19T15:00:00Z" } },
  { id: "U3", email: "ana@fal", name: "Ana", role: "user", ativo: true, lastLoginAt: null, empresas: 0, situacao: "CONVITE_VENCIDO", convite: { expira_em: "2026-11-01T15:00:00Z" } },
  { id: "U2", email: "joao@fal", name: null, role: "user", ativo: false, lastLoginAt: "2026-10-01T12:00:00Z", empresas: 0 },
];
const LOG = [
  { id: "L1", email: "admin@fal", resultado: "OK", ip: "200.10.20.30", user_agent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537", createdAt: "2026-11-11T15:00:00Z" },
  { id: "L2", email: "maria@fal", resultado: "FALHA", ip: "200.10.20.31", user_agent: null, createdAt: "2026-11-11T14:00:00Z" },
  { id: "L3", email: "joao@fal", resultado: "BLOQUEADO_IP", ip: "10.9.8.7", user_agent: "curl/8.4", createdAt: "2026-11-11T13:00:00Z" },
];
const CONFIG = { ativo: false, desligada_pelo_servidor: false, ip_atual: "200.10.20.30", ips: [{ id: "I1", faixa: "200.10.20.0/24", descricao: "Escritório", criado_por: "admin@fal" }] };

function renderizar(elemento, dados = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  if (dados.usuarios) qc.setQueryData(["usuarios"], dados.usuarios);
  if (dados.log) qc.setQueryData(["acessos-log", { resultado: "", email: "" }], dados.log);
  if (dados.ips) qc.setQueryData(["acessos-ips"], dados.ips);
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/">{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Usuários e acessos", () => {
  it("lista cada pessoa com papel, situação, último acesso e quantas empresas atende", () => {
    papel.atual = "admin";
    const html = renderizar(<UsuariosPagina />, { usuarios: USUARIOS });
    expect(html).toContain('aria-label="Usuários do sistema"');
    for (const t of ["Admin", "Maria", "joao@fal", "Administrador", "Consultor", "Ativa", "Desativada", "Nunca entrou"]) expect(html).toContain(t);
    expect(html).toContain(">4<"); // empresas da Maria
  });

  it("marca a própria conta com 'você' e não oferece desativá-la", () => {
    const html = renderizar(<UsuariosPagina />, { usuarios: USUARIOS });
    expect(html).toContain(">você<");
    expect(html).not.toContain('aria-label="Desativar admin@fal"');
    expect(html).toContain('aria-label="Desativar maria@fal"');
    expect(html).toContain('aria-label="Reativar joao@fal"'); // conta desativada pode voltar
  });

  it("convida por e-mail e mostra convite enviado, vencido, reenviar e link de senha nova", () => {
    const html = renderizar(<UsuariosPagina />, { usuarios: USUARIOS });
    expect(html).toContain("Convidar pessoa");
    expect(html).toContain("Convite enviado, vale até 19/11/2026");
    expect(html).toContain("Convite vencido");
    expect(html).toContain('aria-label="Reenviar convite para maria@fal"');
    expect(html).toContain('aria-label="Reenviar convite para ana@fal"');
    expect(html).not.toContain('aria-label="Reenviar convite para admin@fal"'); // já entrou
    expect(html).not.toContain('aria-label="Redefinir a senha de joao@fal"'); // desativada
    expect(html).toContain('aria-label="Gerar senha provisória para maria@fal"');
    expect(html).toContain('aria-label="Editar maria@fal"');
    expect(html).toContain('aria-label="Redefinir a senha de maria@fal"');
    expect(html).toContain("pelo menos um administrador ativo");
  });

  it("quem não é administrador vê o aviso e nenhuma lista", () => {
    papel.atual = "user";
    const html = renderizar(<UsuariosPagina />, { usuarios: USUARIOS });
    expect(html).toContain("Somente administradores gerenciam usuários.");
    expect(html).not.toContain("maria@fal");
    papel.atual = "admin";
  });
});

describe("Registro de acesso", () => {
  it("mostra cada tentativa com o resultado em palavras, o IP e o navegador resumido", () => {
    const html = renderizar(<RegistroDeAcesso />, { log: LOG });
    for (const t of ["Entrou", "Senha errada", "IP não permitido", "200.10.20.30", "Chrome · Windows", "curl"]) expect(html).toContain(t);
    expect(html).toContain("Mostra as 200 tentativas mais recentes");
  });

  it("lista vazia explica que não há tentativas com aqueles filtros", () => {
    const html = renderizar(<RegistroDeAcesso />, { log: [] });
    expect(html).toContain("Nenhuma tentativa de entrada com esses filtros.");
  });

  it("filtra por resultado e por e-mail", () => {
    const html = renderizar(<RegistroDeAcesso />, { log: LOG });
    expect(html).toContain("<option value=\"BLOQUEADO_IP\">IP não permitido</option>");
    expect(html).toContain('type="search"');
  });

  it("resume o navegador pelo user-agent", () => {
    expect(navegadorDe("Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/120.0 Safari/537.36")).toBe("Chrome · Windows");
    expect(navegadorDe("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Edg/120")).toBe("Edge · Windows");
    expect(navegadorDe("Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/604")).toBe("Safari · iOS");
    expect(navegadorDe("Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0")).toBe("Firefox · Linux");
    expect(navegadorDe("curl/8.4.0")).toBe("curl");
    expect(navegadorDe(null)).toBe("—");
  });
});

describe("IPs permitidos", () => {
  it("restrição desligada: avisa, mostra o IP atual e só liga se houver endereço cadastrado", () => {
    const html = renderizar(<IpsPermitidos />, { ips: CONFIG });
    expect(html).toContain("Restrição por IP desligada");
    expect(html).toContain("200.10.20.30");
    expect(html).toContain("200.10.20.0/24");
    expect(html).toContain("Ligar a restrição");
    expect(html).toContain("Usar o meu IP");
    const vazio = renderizar(<IpsPermitidos />, { ips: { ...CONFIG, ips: [] } });
    expect(vazio).toContain("Nenhum endereço cadastrado.");
    expect(vazio).toMatch(/<button[^>]*disabled[^>]*>Ligar a restrição/);
  });

  it("restrição ligada oferece Desligar e avisa quando o servidor a desliga por variável de ambiente", () => {
    const ligada = renderizar(<IpsPermitidos />, { ips: { ...CONFIG, ativo: true } });
    expect(ligada).toContain("Restrição por IP ligada");
    expect(ligada).toContain(">Desligar<");
    const forcada = renderizar(<IpsPermitidos />, { ips: { ...CONFIG, ativo: true, desligada_pelo_servidor: true } });
    expect(forcada).toContain("IP_ALLOWLIST_OFF=1");
  });

  it("a página tem as duas abas e só administradores entram", () => {
    papel.atual = "admin";
    const html = renderizar(<AcessosPagina />, { log: LOG });
    expect(html).toContain("Registro de acesso");
    expect(html).toContain("IPs permitidos");
    papel.atual = "user";
    const negado = renderizar(<AcessosPagina />, { log: LOG });
    expect(negado).toContain("Somente administradores veem o registro de acesso.");
    papel.atual = "admin";
  });
});
