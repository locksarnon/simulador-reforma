import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NotificacoesPagina from "./NotificacoesPagina";
import SinoNotificacoes from "@/components/SinoNotificacoes";
import { quandoFoi, seloDoSino } from "@/lib/notificacoes";

const AVISOS = [
  { id: "N1", tipo: "TAREFA", titulo: "Suas tarefas: 2 atrasadas", mensagem: "Veja em BPO Fiscal > Processos e tarefas.", link: "/bpo/tarefas", lida_em: null, createdAt: new Date().toISOString() },
  { id: "N2", tipo: "CERTIFICADO", titulo: "Certificado A1 de EXTRA AGRO LTDA vence em 10 dia(s)", mensagem: null, link: "/bpo/repositorio-xml/E1", lida_em: "2026-11-10T10:00:00Z", createdAt: "2026-11-01T10:00:00Z" },
];

function renderizar(elemento, { avisos = AVISOS, naoLidas = 1 } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  qc.setQueryData(["notificacoes", "central", "", false], avisos);
  qc.setQueryData(["notificacoes", "contagem"], { nao_lidas: naoLidas });
  return renderToString(<QueryClientProvider client={qc}><StaticRouter location="/notificacoes">{elemento}</StaticRouter></QueryClientProvider>).replace(/<!-- -->/g, "");
}

describe("Central de notificações", () => {
  it("mostra os avisos com categoria e quando chegaram; não lida tem a marca", () => {
    const html = renderizar(<NotificacoesPagina />);
    expect(html).toContain("Suas tarefas: 2 atrasadas");
    expect(html).toContain("Tarefas · agora");
    expect(html).toContain("Certificados · ");
    expect(html).toContain('aria-label="Não lida"');
    for (const c of ["Todas", "Tarefas", "Agenda e obrigações", "Certificados", "Documentos", "Captura de XML", "Acessos", "Sistema"]) expect(html).toContain(c);
    expect(html).toContain("Só as não lidas");
  });

  it("sem avisos, explica quando eles aparecem", () => {
    const html = renderizar(<NotificacoesPagina />, { avisos: [] });
    expect(html).toContain("Nenhuma notificação por enquanto.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Marcar todas como lidas/);
  });
});

describe("Sino", () => {
  it("mostra o número de não lidas no selo e no nome acessível", () => {
    const html = renderizar(<SinoNotificacoes />, { naoLidas: 3 });
    expect(html).toContain('aria-label="Notificações: 3 não lida(s)"');
    expect(html).toContain(">3<");
    const zero = renderizar(<SinoNotificacoes />, { naoLidas: 0 });
    expect(zero).toContain('aria-label="Notificações"');
  });

  it("selo e tempo relativo", () => {
    expect(seloDoSino(0)).toBe("");
    expect(seloDoSino(7)).toBe("7");
    expect(seloDoSino(150)).toBe("99+");
    const agora = new Date("2026-11-11T12:00:00Z");
    expect(quandoFoi("2026-11-11T11:59:40Z", agora)).toBe("agora");
    expect(quandoFoi("2026-11-11T11:30:00Z", agora)).toBe("há 30 min");
    expect(quandoFoi("2026-11-11T07:00:00Z", agora)).toBe("há 5 h");
    expect(quandoFoi("2026-11-10T10:00:00Z", agora)).toBe("ontem");
    expect(quandoFoi("2026-11-08T10:00:00Z", agora)).toBe("há 3 dias");
    expect(quandoFoi("2026-10-01T15:00:00Z", agora)).toBe("01/10/2026");
  });
});
