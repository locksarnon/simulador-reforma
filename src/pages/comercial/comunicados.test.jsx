import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const papel = vi.hoisted(() => ({ atual: "admin" }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "U1", role: papel.atual, email: "maria@fal" } }) }));

const ComunicadosPagina = (await import("./ComunicadosPagina")).default;
const ComunicacoesPagina = (await import("@/pages/admin/ComunicacoesPagina")).default;
const { AbaBloqueios, AbaAvisos } = await import("@/pages/admin/ComunicacoesPagina");

const COMUNICADOS = [
  { id: "C1", assunto: "Agenda de novembro", status: "RASCUNHO", total: 0, enviados: 0, falhas: 0, anexos: [{ nome: "agenda.pdf", storage_key: "k", tamanho: 1000 }], createdAt: "2026-11-11T12:00:00Z", filtro: {} },
  { id: "C2", assunto: "Reforma: o que muda em 2027", status: "ENVIADO", total: 10, enviados: 9, falhas: 1, anexos: [], enviado_em: "2026-11-10T12:00:00Z", createdAt: "2026-11-10T12:00:00Z", filtro: {} },
];

function renderizar(elemento) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["comunicados", "lista"], COMUNICADOS);
  qc.setQueryData(["empresas", "carteiras"], []);
  qc.setQueryData(["comunicacoes", "envios", { status: "", origem: "", de: "", ate: "" }], [{ id: "V1", createdAt: "2026-11-10T12:00:00Z", destinatario: "fiscal@extra.agro", assunto: "Reforma", origem: "COMUNICADO", status: "FALHA", erro: "caixa cheia" }]);
  qc.setQueryData(["comunicacoes", "bloqueios"], [{ id: "B1", email: "sair@gama.com", motivo: "Pediu para sair pelo link do e-mail", createdAt: "2026-11-10T12:00:00Z" }]);
  qc.setQueryData(["comunicacoes", "avisos"], { ativo: true, destinatarios: ["socio@fal.com"], categorias: ["CERTIFICADO"] });
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/">{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Comunicados", () => {
  it("lista rascunho e enviado com contadores; só o rascunho edita e envia (administrador)", () => {
    const html = renderizar(<ComunicadosPagina />);
    for (const t of ["Agenda de novembro", "1 anexo", "Rascunho", "Enviado", "9 de 10 · 1 falha", "Novo comunicado"]) expect(html).toContain(t);
    expect(html).toContain('aria-label="Enviar Agenda de novembro"');
    expect(html).not.toContain('aria-label="Enviar Reforma: o que muda em 2027"');
    expect(html).not.toContain('aria-label="Editar Reforma: o que muda em 2027"');
    papel.atual = "user";
    const consultor = renderizar(<ComunicadosPagina />);
    expect(consultor).not.toContain('aria-label="Enviar Agenda de novembro"');
    expect(consultor).toContain("O envio é feito por um administrador");
    papel.atual = "admin";
  });
});

describe("Comunicações e envios", () => {
  it("e-mails enviados com a falha explicada; bloqueio e avisos por e-mail", () => {
    const html = renderizar(<ComunicacoesPagina />);
    for (const t of ["E-mails enviados", "Lista de bloqueio", "Avisos por e-mail", "fiscal@extra.agro", "Falha", "caixa cheia", "Comunicado"]) expect(html).toContain(t);
    expect(renderizar(<AbaBloqueios />)).toContain("sair@gama.com");
    const avisos = renderizar(<AbaAvisos />);
    expect(avisos).toContain("socio@fal.com");
    expect(avisos).toContain("Mandar cópia dos avisos por e-mail");
  });
  it("consultor não vê os envios", () => {
    papel.atual = "user";
    expect(renderizar(<ComunicacoesPagina />)).toContain("Somente administradores veem os envios.");
    papel.atual = "admin";
  });
});
