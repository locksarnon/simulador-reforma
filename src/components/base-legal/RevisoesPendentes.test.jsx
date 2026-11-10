import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import RevisoesPendentes from "./RevisoesPendentes";
import { CartaoResposta } from "./CartoesLegais";

const linha = (extra) => ({
  id: "r1", tipo: "cartao", alvo_id: "c1", alvo_titulo: "Qual o limite do produtor rural?", norma_chave: "lcp-214-2025", norma_numero: "LC 214/2025",
  caminho: "art-164", rotulo: "Art. 164", mudanca: "alterado", detalhe: "O trecho citado no cartão não consta mais no texto do dispositivo.", mudou_em: "2026-11-12T15:00:00.000Z", status: "pendente", ...extra,
});

function desenhar(linhas) {
  const qc = new QueryClient();
  qc.setQueryData(["base-legal-revisoes", "todas"], linhas);
  return renderToStaticMarkup(<QueryClientProvider client={qc}><MemoryRouter><RevisoesPendentes /></MemoryRouter></QueryClientProvider>);
}

describe("Itens para revisar porque a lei mudou", () => {
  it("não aparece quando nada mudou", () => {
    expect(desenhar([])).toBe("");
  });

  it("lista cada item uma vez, com o dispositivo, a data e o motivo, e só a nota e o marco têm o botão de conferir", () => {
    const html = desenhar([
      linha(),
      linha({ id: "r2", caminho: "art-167", rotulo: "Art. 167", detalhe: null }),
      linha({ id: "r3", tipo: "fundamento", alvo_id: "split_payment", alvo_titulo: "Split payment", rotulo: "Art. 31", caminho: "art-31", detalhe: "O texto do dispositivo mudou." }),
      linha({ id: "r4", tipo: "marco", alvo_id: "m1", alvo_titulo: "Inventário do estoque", rotulo: "Art. 608", caminho: "art-608", norma_chave: "dec-12955-2026", norma_numero: "Decreto 12.955/2026" }),
    ]);
    expect(html).toContain("Itens para revisar porque o texto da lei mudou");
    expect(html.split("Qual o limite do produtor rural?").length - 1).toBe(1);
    expect(html).toContain("Pergunta frequente");
    expect(html).toContain("Nota do cálculo");
    expect(html).toContain("Marco da agenda");
    expect(html).toContain('href="/base-legal/lcp-214-2025/art-164"');
    expect(html).toContain("(LC 214/2025) alterado em 12/11/2026. O trecho citado no cartão não consta mais");
    expect(html).toContain('href="#cartoes-legais"');
    expect(html).toContain('href="/agenda-reforma"');
    expect(html.split("Marcar como conferido").length - 1).toBe(2);
  });
});

describe("cartão que voltou para revisão", () => {
  const cartao = {
    id: "c1", tema: "Produtor rural", pergunta: "Qual o limite do produtor rural?", resposta: "R$ 3,6 milhões.", ressalvas: null, status: "rascunho",
    fundamentos: [{ norma: "lcp-214-2025", caminho: "art-164", trecho: "receita inferior", numero: "LC 214/2025", rotulo: "Art. 164" }],
    revisoes_pendentes: [{ id: "r1", norma: "lcp-214-2025", numero: "LC 214/2025", caminho: "art-164", rotulo: "Art. 164", mudanca: "alterado", detalhe: "O texto do dispositivo mudou.", mudou_em: "2026-11-12T15:00:00.000Z" }],
  };
  const desenharCartao = (c, admin) => renderToStaticMarkup(<MemoryRouter><CartaoResposta c={c} admin={admin} aberto /></MemoryRouter>);

  it("o administrador vê o motivo e o rótulo Revisar", () => {
    const html = desenharCartao(cartao, true);
    expect(html).toContain("Voltou para revisão porque o texto da lei mudou");
    expect(html).toContain(">Revisar<");
    expect(html).toContain("(LC 214/2025) alterado em 12/11/2026. O texto do dispositivo mudou.");
    expect(html).toContain("Voltou para revisão — só o administrador vê este cartão.");
    expect(html).toContain("Revisar e publicar");
  });

  it("cartão que nunca foi revisado segue como rascunho, sem aviso", () => {
    const html = desenharCartao({ ...cartao, revisoes_pendentes: [] }, true);
    expect(html).toContain(">Rascunho<");
    expect(html).not.toContain("Voltou para revisão");
    expect(html).toContain("Ainda não revisado");
  });

  it("o consultor nunca vê o aviso", () => {
    expect(desenharCartao({ ...cartao, status: "revisado", revisoes_pendentes: undefined }, false)).not.toContain("Voltou para revisão");
  });
});
