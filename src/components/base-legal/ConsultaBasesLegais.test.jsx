import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import ConsultaBasesLegais, { ResultadosDaBusca } from "./ConsultaBasesLegais";

const NORMAS = [
  { chave: "lcp-214-2025", numero: "LC 214/2025", total_dispositivos: 609, formato: "html" },
  { chave: "res-cgibs-6", numero: "Res. CGIBS 6/2026", total_dispositivos: 617, formato: "pdf" },
  { chave: "in-rfb-2121", numero: "IN RFB 2.121/2022", total_dispositivos: 0, formato: "externo" },
];
const SUGESTOES = ["Como funciona o split payment?", "Quando o crédito de IBS e CBS pode ser apropriado?"];

const achado = (extra) => ({ chave: "lcp-214-2025", numero: "LC 214/2025", norma_situacao: "vigente", rotulo: "Art. 5º", caminho: "art-5", secao: "Título I › Capítulo I", revogado: false, parcialmente_revogado: false, trecho: "ouro como [[ativo financeiro]]", rank: 0.5, ...extra });
const BUSCA = {
  exatos: [],
  resultados: [achado(), achado({ chave: "lei-9430-1996", numero: "Lei 9.430/1996", rotulo: "Art. 3º", caminho: "art-3", revogado: true, trecho: "(Revogado pela Lei Complementar nº 227)" }), achado({ chave: "lei-7678-1988", numero: "Lei 7.678/1988", rotulo: "Art. 1º", caminho: "art-1", norma_situacao: "revogada", trecho: "norma antiga" })],
  parcial: false,
};
const RESPOSTA = {
  id: "p1", motivo: "ok", resposta: "O ouro como ativo financeiro não sofre incidência; como mercadoria, sim.", suficiente: true, ressalvas: "LC 214/2025, Art. 5º: teve o texto alterado em 22/11/2026; confira se o caso concreto é anterior à mudança.",
  fundamentos: [{ norma: "lcp-214-2025", numero: "LC 214/2025", rotulo: "Art. 5º", caminho: "art-5", trecho: "ativo financeiro" }], fontes_externas: [], relacionados: [], aviso: "Orientação com base no texto das normas carregadas.",
};

function desenhar({ inicial = "", dados = {}, props = {} } = {}) {
  const qc = new QueryClient();
  const t = inicial;
  if (dados.busca) qc.setQueryData(["bases-legais-busca", t, dados.norma ?? ""], dados.busca);
  if (dados.cartoes) qc.setQueryData(["bases-legais-cartoes", t], dados.cartoes);
  if (dados.ia) qc.setQueryData(["bases-legais-ia", t, Boolean(dados.aprofundada)], dados.ia);
  return renderToStaticMarkup(<QueryClientProvider client={qc}><StaticRouter location="/"><ConsultaBasesLegais inicial={inicial} normas={NORMAS} emailPadrao="a@fal.test" sugestoes={SUGESTOES} {...props} /></StaticRouter></QueryClientProvider>);
}

describe("consulta das bases legais: antes de consultar", () => {
  it("uma caixa só, com a escolha da norma, as duas chaves e sugestões; conta só as normas com texto", () => {
    const h = desenhar();
    expect(h).toContain("Consultar as bases legais");
    expect(h).toContain('role="search"');
    expect(h).toContain("procura o texto em todas as normas carregadas (2)");
    expect(h).toContain("todas as normas");
    expect(h).toContain("LC 214/2025</option>");
    expect(h).not.toContain("IN RFB 2.121/2022</option>"); // só referência: sem texto por artigo
    expect(h).toContain("Resposta com IA: ligada");
    expect(h).toContain("Pesquisa aprofundada com fontes externas: desligada");
    expect(h).toContain("Como funciona o split payment?");
    expect(h).not.toContain("Resultados para");
  });
});

describe("consulta das bases legais: depois de consultar", () => {
  const pergunta = "ouro paga IBS?";

  it("mostra a resposta da IA com o artigo citado e o aviso nas ressalvas, e os dispositivos achados em todas as normas", () => {
    const h = desenhar({ inicial: pergunta, dados: { busca: BUSCA, ia: RESPOSTA, cartoes: [] } });
    expect(h).toContain("Resultados para");
    expect(h).toContain("“ouro paga IBS?”");
    expect(h).toContain("em todas as normas");
    expect(h).toContain("O ouro como ativo financeiro não sofre incidência; como mercadoria, sim.");
    expect(h).toContain("teve o texto alterado em 22/11/2026");
    expect(h).toContain('href="/base-legal/lcp-214-2025/art-5"');
    expect(h).toContain("Dispositivos encontrados nas normas (3)");
    expect(h).toContain("Enviar por e-mail");
  });

  it("o que está revogado aparece marcado nos achados, com a norma revogada à parte", () => {
    const h = desenhar({ inicial: pergunta, dados: { busca: BUSCA, ia: RESPOSTA, cartoes: [] } });
    const achados = h.slice(h.indexOf("Dispositivos encontrados nas normas"));
    expect(achados).toContain(">Revogado<");
    expect(achados).toContain(">Norma revogada<");
    expect(achados).toContain("line-through"); // o título do revogado vem riscado
    expect(achados).toContain("<mark");
    expect(achados).toContain("ativo financeiro");
  });

  it("pergunta parecida já revisada pela equipe chega antes da resposta da IA", () => {
    const cartao = { id: "c1", tema: "Ouro", pergunta: "Ouro paga IBS e CBS?", resposta: "Depende: ativo financeiro ou mercadoria.", ressalvas: null, status: "revisado", fundamentos: [] };
    const h = desenhar({ inicial: pergunta, dados: { busca: BUSCA, ia: RESPOSTA, cartoes: [cartao] } });
    expect(h).toContain("Pergunta parecida já revisada pela equipe");
    expect(h.indexOf("Pergunta parecida já revisada")).toBeLessThan(h.indexOf("O ouro como ativo financeiro"));
  });

  it("enquanto a IA pensa, mostra a espera e já mostra os achados da busca", () => {
    const h = desenhar({ inicial: pergunta, dados: { busca: BUSCA } });
    expect(h).toContain("Procurando nos dispositivos da lei…");
    expect(h).toContain("Dispositivos encontrados nas normas (3)");
  });

  it("busca de artigo pelo número não chama a IA e mostra o atalho do artigo", () => {
    const busca = { exatos: [{ rotulo: "Art. 164", caminho: "art-164", secao: null, revogado: false, norma: { chave: "lcp-214-2025", numero: "LC 214/2025", situacao: "vigente" } }], resultados: [], parcial: false };
    const h = desenhar({ inicial: "art 164", dados: { busca } });
    expect(h).toContain("Busca por artigo: o texto da norma já responde, sem precisar da IA.");
    expect(h).toContain('href="/base-legal/lcp-214-2025/art-164"');
    expect(h).not.toContain("Procurando nos dispositivos da lei");
    expect(h).not.toContain("Enviar por e-mail");
  });

  it("pergunta curta explica por que a IA não rodou; nada achado diz isso com o termo", () => {
    const h = desenhar({ inicial: "IBS?", dados: { busca: { exatos: [], resultados: [], parcial: false } } });
    expect(h).toContain("Para a IA responder, escreva a pergunta com pelo menos 8 caracteres.");
    expect(h).toContain("Nada encontrado nas normas carregadas para “IBS?”");
  });
});

describe("resultados da busca", () => {
  it("avisa quando só entram dispositivos com alguma das palavras", () => {
    const h = renderToStaticMarkup(<StaticRouter location="/"><ResultadosDaBusca busca={{ ...BUSCA, parcial: true }} termo="x" /></StaticRouter>);
    expect(h).toContain("Poucos dispositivos trazem todas as palavras");
  });
});
