/** Correções das telas do saneamento (revisão de 27/11/2026): navegação, painel dos casos, Fase 2 travada, Cobertura, Considerado, textos e Tabela nas fases. */
import React from "react";
import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { role: "admin", email: "a@b.c" } }) }));

import { chaves } from "./api";
import Casos, { escFechaOPainel, focoForaDoPainel } from "./Casos";
import CasoDetalhe from "./CasoDetalhe";
import Cobertura, { faseDaExecucao, marcoDaAnalise, renovarNoMarco } from "./Cobertura";
import Considerado, { DESTINO_CONFIGURACAO, destinoDasDiretrizes, textoDoResultadoLivre } from "./Considerado";
import Impacto from "./Impacto";
import { PainelPlanilha } from "./PlanilhaDecisao";
import { classeAreaComum } from "./Abas";
import { ABAS_COMUNS, abasDaArea, caminhoDaAba, MENSAGEM_BLOQUEIO_FASE2 } from "./logica";
import { POPS_SANEAMENTO_ESTOQUES } from "@/components/manual/pops/popsSaneamentoEstoques";
import SaneamentoEstoquesPagina from "@/pages/saneamento-estoques/SaneamentoEstoquesPagina";

const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/&gt;/g, ">").replace(/\s+/g, " ");
const novoCliente = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
const montar = (ui, preparar) => {
  const qc = novoCliente();
  preparar?.(qc);
  return renderToStaticMarkup(<QueryClientProvider client={qc}><StaticRouter location="/">{ui}</StaticRouter></QueryClientProvider>);
};
const ERRO = Object.assign(new Error("Servidor fora do ar."), { status: 500 });
const falhar = (qc, chave) => qc.getQueryCache().build(qc, { queryKey: chave }).setState({ status: "error", error: ERRO, fetchStatus: "idle", data: undefined, errorUpdateCount: 1, dataUpdateCount: 0 });
const projeto = (o = {}) => ({ id: "p1", empresa_id: "e1", versao: 3, estabelecimentos: [], data_base: "2026-12-31T00:00:00.000Z", parametros: {}, modulos: {}, atividades: [], atividadesConfirmadas: true, ...o });
const BLOQ = { codigo: "REGIME_NAO_INFORMADO", mensagem: "Informe o regime do cliente." };

const fases = ({ f1 = false, f2 = false, bloqueio = null } = {}) => ({ fases: [{ fase: "FASE1", camadas: [], liberada: f1 ? { versaoId: "v1", numero: 1 } : null, bloqueio: null }, { fase: "FASE2", camadas: [], liberada: f2 ? { versaoId: "v2", numero: 2 } : null, bloqueio }] });
const pagina = (local, { dadosFases = fases(), erroFases = false } = {}) => {
  const qc = novoCliente();
  qc.setQueryData(chaves.projeto("d1"), projeto({ totalItens: 3 }));
  if (dadosFases && !erroFases) qc.setQueryData(chaves.fases("p1"), dadosFases);
  if (erroFases) falhar(qc, chaves.fases("p1"));
  qc.setQueryData(chaves.estadoCamadas("p1"), { camadas: [] });
  qc.setQueryData(chaves.versoes("p1"), []);
  qc.setQueryData(chaves.visao("p1"), { camadas: [], grupos: [] });
  qc.setQueryData(chaves.camadas(), []);
  return renderToStaticMarkup(<QueryClientProvider client={qc}><StaticRouter location={local}><Routes><Route path="/s/:id" element={<SaneamentoEstoquesPagina />} /></Routes></StaticRouter></QueryClientProvider>);
};
const selecionada = (html, id) => new RegExp(`id="${id}" aria-selected="true"`).test(html);

describe("Áreas comuns: botões no padrão dos filtros, à direita da faixa, sem número", () => {
  it("numeração das fases como antes; Tabela, Visão geral, Impacto no SPED e Versões seguem comuns", () => {
    expect(abasDaArea("fase1").filter((a) => a.numero).map((a) => `${a.numero} ${a.rotulo}`)).toEqual(["1.1 Preparar e diretrizes", "1.2 Análise", "1.3 Casos", "1.4 Unificações", "1.5 Entrega da Fase 1"]);
    expect(abasDaArea("fase2").filter((a) => a.numero).map((a) => `${a.numero} ${a.rotulo}`)).toEqual(["2.1 Premissas e diretrizes", "2.2 Análise", "2.3 Casos", "2.4 Entrega da Fase 2"]);
    expect(ABAS_COMUNS.map((a) => a.id)).toEqual(["tabela", "visao", "impacto", "versoes"]);
  });
  it("a aberta em verde cheio com texto branco, as outras com contorno; relevo e cantos retos; seguem como abas (teclado)", () => {
    expect(classeAreaComum(true)).toContain("botao-acao");
    expect(classeAreaComum(true)).toContain("bg-primary");
    expect(classeAreaComum(true)).toContain("text-primary-foreground");
    expect(classeAreaComum(false)).not.toContain("bg-primary");
    expect(classeAreaComum(false)).toContain("bg-background");
    expect(classeAreaComum(false)).toContain("!rounded-none");
    const html = pagina("/s/d1?fase=1&aba=tabela");
    const aberta = html.match(/<button[^>]*id="san-aba-tabela"[^>]*>/)?.[0] || "";
    expect(aberta).toContain('role="tab"');
    expect(aberta).toContain('aria-selected="true"');
    expect(aberta).toContain("bg-primary");
    const outra = html.match(/<button[^>]*id="san-aba-visao"[^>]*>/)?.[0] || "";
    expect(outra).toContain('aria-selected="false"');
    expect(outra).toContain("botao-acao");
    expect(outra).not.toContain("bg-primary ");
    expect(texto(html)).not.toContain("Projeto inteiro:");
  });
  it("as mensagens da trava da Fase 2 citam o caminho certo (1.5 Entrega da Fase 1, 2.1 Premissas e diretrizes)", () => {
    expect(MENSAGEM_BLOQUEIO_FASE2.FASE1_NAO_LIBERADA).toContain(caminhoDaAba("fase1", "entrega"));
    expect(MENSAGEM_BLOQUEIO_FASE2.REGIME_NAO_INFORMADO).toContain(caminhoDaAba("fase2", "premissas"));
  });
});

describe("Página: endereço antigo, erro nas fases", () => {
  it("?aba= sem ?fase= espera a fase em andamento (não abre a 1.x para trocar depois)", () => {
    expect(texto(pagina("/s/d1?aba=casos", { dadosFases: null }))).toContain("Abrindo a fase em andamento");
    expect(texto(pagina("/s/d1?aba=tabela", { dadosFases: null }))).toContain("Abrindo a fase em andamento");
    // Com a resposta: a fase em andamento (Fase 2 com a Fase 1 liberada).
    expect(selecionada(pagina("/s/d1?aba=casos", { dadosFases: fases({ f1: true }) }), "san-fase-fase2")).toBe(true);
  });
  it("GET fases falhou: nenhuma fase Bloqueada nem Liberada, aviso com Tentar de novo e abre na Fase 1", () => {
    const html = pagina("/s/d1", { erroFases: true });
    const t = texto(html);
    expect(t).toContain("Não foi possível conferir a situação das fases");
    expect(t).toContain("Tentar de novo");
    expect(t).toContain("Fase 1 · Saneamento Não foi possível conferir");
    expect(t).toContain("Fase 2 · Tributário Não foi possível conferir");
    expect(t).not.toContain("Bloqueada");
    expect(selecionada(html, "san-fase-fase1")).toBe(true);
    expect(selecionada(html, "san-aba-preparar")).toBe(true);
    // Na Fase 2, o aviso de trava não aparece (não se sabe se está travada).
    expect(texto(pagina("/s/d1?fase=2&aba=casos", { erroFases: true }))).not.toContain("Fase 2 ainda não liberada");
  });
});

describe("Painel sobreposto dos casos", () => {
  const caso = { id: "c1", camada: "NCM", tipo: "NCM_FORMATO", itens: ["i1"], qtdItens: 1, problema: "NCM com 7 dígitos", situacao: "PROPOSTO", origem: "REGRA", versao: 1, item: { codigo: "2186", descricao: "RETENTOR 45X62", grupo: "Peças" } };
  const outro = { ...caso, id: "c2", item: { codigo: "3001", descricao: "ROLAMENTO 6204", grupo: "Peças" } };
  it("caso pedido pela Tabela abre na lista de um caso por linha: título, posição e Anterior/Próximo (sem o falso 'não há mais casos')", () => {
    const filtro = { camada: "NCM", situacao: "ABERTOS", tipo: "", origem: "", grupo: "" };
    const usados = [];
    const html = montar(<Casos projeto={projeto()} recorte={{ camada: "NCM" }} casoInicial="c2" aoUsarCasoInicial={() => usados.push(1)} />,
      (qc) => qc.setQueryData(chaves.casos("p1", filtro), { pages: [{ casos: [caso, outro], proximo: null }], pageParams: [undefined] }));
    const t = texto(html);
    expect(html).not.toMatch(/<input type="checkbox" checked=""\/>Agrupar casos iguais/); // desagrupado
    expect(t).toContain("Caso — 3001 — ROLAMENTO 6204");
    expect(t).toContain("Caso 2 de 2 carregados");
    expect(t).not.toContain("deste grupo");
    expect(t).not.toContain("Não há mais casos em aberto");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Anterior da lista"/);
  });
  it("Esc: não fecha o painel quando o popover já tratou (defaultPrevented) ou há outra janela aberta por cima", () => {
    const painel = { contains: (x) => x === "dentro" };
    const doc = (janelas = []) => ({ querySelectorAll: () => janelas, body: "body", documentElement: "html" });
    const janela = (estado) => ({ getAttribute: () => estado, contains: () => false });
    expect(escFechaOPainel({ key: "Escape", defaultPrevented: false }, painel, doc([painel]))).toBe(true);
    expect(escFechaOPainel({ key: "Escape", defaultPrevented: true }, painel, doc([painel]))).toBe(false);
    expect(escFechaOPainel({ key: "Escape", defaultPrevented: false }, painel, doc([painel, janela("open")]))).toBe(false); // menu Colunas aberto
    expect(escFechaOPainel({ key: "Escape", defaultPrevented: false }, painel, doc([painel, janela("closed")]))).toBe(true); // fechando (animação)
    expect(escFechaOPainel({ key: "Enter", defaultPrevented: false }, painel, doc([painel]))).toBe(false);
  });
  it("foco: volta ao painel quando some, fica num botão desligado ou sai dele; dentro de outra janela por cima, fica", () => {
    const dentro = { disabled: false };
    const desligado = { disabled: true };
    const fora = { disabled: false, closest: () => null };
    const noPopover = { disabled: false, closest: () => ({}) };
    const painel = { contains: (x) => x === dentro || x === desligado };
    const doc = { body: "body", documentElement: "html" };
    expect(focoForaDoPainel(painel, dentro, doc)).toBe(false);
    expect(focoForaDoPainel(painel, null, doc)).toBe(true);
    expect(focoForaDoPainel(painel, "body", doc)).toBe(true);
    expect(focoForaDoPainel(painel, desligado, doc)).toBe(true);
    expect(focoForaDoPainel(painel, fora, doc)).toBe(true);
    expect(focoForaDoPainel(painel, noPopover, doc)).toBe(false);
  });
  it("o painel escuta o Esc na bolha (não na captura) e prende o foco com focusin", () => {
    const fonte = fs.readFileSync(new URL("./Casos.jsx", import.meta.url), "utf8");
    expect(fonte).toContain('window.addEventListener("keydown", tecla);');
    expect(fonte).toContain('document.addEventListener("focusin", foco);');
    expect(fonte).not.toContain('addEventListener("keydown", tecla, true)');
  });
});

describe("Fase 2 travada: decisões desligadas", () => {
  const trib = { id: "c1", camada: "TRIBUTARIO", tipo: "TRIBUTARIO_CONJUNTO", itens: ["i1"], problema: "Tratamento do conjunto", situacao: "PROPOSTO", origem: "REGRA", versao: 1, proposta: { cst: "000" }, atual: { cst: "" }, justificativa: "x" };
  it("caso de camada travada: aviso, Aprovar/Rejeitar/Pedir informação desligados; rascunho segue", () => {
    const html = montar(<CasoDetalhe projeto={projeto()} casoId="c1" bloqueioFase2={BLOQ} />, (qc) => qc.setQueryData(chaves.caso("c1"), trib));
    expect(texto(html)).toContain("Fase 2 ainda não liberada");
    expect(texto(html)).toContain("Informe o regime do cliente.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="Informe o regime do cliente\."[^>]*>Aprovar<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="Informe o regime do cliente\."[^>]*>Rejeitar…<\/button>/);
  });
  it("Impacto no SPED (nas duas fases) e sem bloqueio com código: nada desliga", () => {
    const obr = { ...trib, camada: "OBRIGACOES" };
    expect(texto(montar(<CasoDetalhe projeto={projeto()} casoId="c1" bloqueioFase2={BLOQ} />, (qc) => qc.setQueryData(chaves.caso("c1"), obr)))).not.toContain("Fase 2 ainda não liberada");
    expect(texto(montar(<CasoDetalhe projeto={projeto()} casoId="c1" bloqueioFase2={{ codigo: null, mensagem: "Conferindo…" }} />, (qc) => qc.setQueryData(chaves.caso("c1"), trib)))).not.toContain("Fase 2 ainda não liberada");
  });
  it("lista da Fase 2: Decidir em lote desligado com o motivo; planilha da camada travada não aplica", () => {
    const camadas = ["FINALIDADE", "NCM_CLASSIFICACAO", "TRIBUTARIO", "OBRIGACOES"];
    const filtro = { camada: camadas.join(","), situacao: "ABERTOS", tipo: "", origem: "", grupo: "" };
    const html = montar(<Casos projeto={projeto()} agruparInicial={false} camadasPermitidas={camadas} bloqueioFase2={BLOQ} />,
      (qc) => qc.setQueryData(chaves.casos("p1", { ...filtro, camada: camadas.join(",") }), { pages: [{ casos: [], proximo: null, tipos: [] }], pageParams: [undefined] }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="Informe o regime do cliente\."[^>]*>Decidir em lote…<\/button>/);
    const previa = { contagem: { aprovar: 2 }, recusadas: [] };
    const planilha = montar(<PainelPlanilha projeto={projeto()} camadaInicial="TRIBUTARIO" bloqueioFase2={BLOQ} inicial={{ previa, arquivo: "d.xlsx" }} />);
    expect(texto(planilha)).toContain("Fase 2 ainda não liberada");
    expect(planilha).toMatch(/<button[^>]*disabled=""[^>]*>Aplicar as decisões<\/button>/);
  });
});

describe("Cobertura: andamento da fase certa e renovação só quando muda", () => {
  it("Impacto no SPED rodando: a Fase 2 mostra 'Analisando…' quando a análise foi pedida ou é vista nela", () => {
    expect(faseDaExecucao({ camadas: ["OBRIGACOES"] })).toBe("FASE1");
    expect(faseDaExecucao({ camadas: ["OBRIGACOES"] }, { preferida: "FASE2" })).toBe("FASE2");
    expect(faseDaExecucao({ camadas: ["QUALIDADE"] }, { preferida: "FASE2" })).toBe("FASE1");
    const html = montar(<Cobertura projeto={projeto()} fase="FASE2" />, (qc) => {
      qc.setQueryData(chaves.visao("p1"), { camadas: [], grupos: [{ grupo: "A", itens: 3, camadas: {} }] });
      qc.setQueryData(chaves.camadas(), ["OBRIGACOES", "TRIBUTARIO"]);
      qc.setQueryData(chaves.estadoCamadas("p1"), { camadas: [] });
      qc.setQueryData(chaves.fases("p1"), fases({ f1: true }));
      qc.setQueryData(chaves.analises("p1"), { execucao: { rodando: true, camadas: ["OBRIGACOES"], atual: "OBRIGACOES", feitas: [], erro: null, iniciadaEm: "2026-11-27T09:00:00Z", terminadaEm: null } });
    });
    expect(texto(html)).toContain("Analisando 1 de 1…");
    expect(texto(html)).toContain("Impacto no SPED analisando…");
  });
  it("a primeira resposta das análises não renova tudo; só a mudança de marco depois", () => {
    expect(marcoDaAnalise(undefined)).toBeNull();
    expect(marcoDaAnalise({ execucao: { rodando: false, feitas: [1, 2] } })).toBe("false-2");
    expect(renovarNoMarco(null, "false-2")).toBe(false); // primeira resposta
    expect(renovarNoMarco("false-2", "false-2")).toBe(false);
    expect(renovarNoMarco("true-1", "true-2")).toBe(true);
    expect(renovarNoMarco("true-2", null)).toBe(false);
  });
});

describe("O que foi considerado", () => {
  it("proposta do texto livre para outra camada diz a camada no título", () => {
    const r = { resultado: "PROPOSTA", proposta: { camada: "GRUPOS_FINALIDADE", chave: "x", valor: 90, criterio: "Participação mínima", textoValor: "90%", textoAtual: "80%", igualAoAtual: false } };
    expect(textoDoResultadoLivre(r, "DUPLICIDADE").titulo).toBe("Encaixado no critério \"Participação mínima\" da camada Grupos com valor 90%");
    expect(textoDoResultadoLivre(r, "GRUPOS_FINALIDADE").titulo).toBe("Encaixado no critério \"Participação mínima\" com valor 90%");
  });
  it("Ver nas Diretrizes vai à aba da fase da camada e rola até as Diretrizes; Configuração leva à 1.1", () => {
    expect(destinoDasDiretrizes("DUPLICIDADE")).toEqual({ fase: "fase1", aba: "preparar", rolar: "diretrizes" });
    expect(destinoDasDiretrizes("TRIBUTARIO")).toEqual({ fase: "fase2", aba: "premissas", rolar: "diretrizes" });
    expect(DESTINO_CONFIGURACAO).toEqual({ fase: "fase1", aba: "preparar" });
  });
  it("remover verificação manual mostra o erro e renova o estado das camadas (código)", () => {
    const fonte = fs.readFileSync(new URL("./Considerado.jsx", import.meta.url), "utf8");
    expect(fonte).toMatch(/onError: \(e\) => setErroRemover\(mensagemDeErro\(e\)\)/);
    expect(fonte).toMatch(/removerCriterioManual[\s\S]{0,300}invalidateQueries\(\{ queryKey: chaves\.estadoCamadas\(projetoId\) \}\)/);
    expect(fonte).toContain("if (r.alterado && p.camada === camada) aoAlterar();");
    const t = texto(montar(<Considerado projetoId="p1" camada="DUPLICIDADE" rotulo="Duplicidades" dados={{ criterios: [], manuais: [] }} abertoInicial />));
    expect(t).toContain("Acrescentar critério");
  });
});

describe("Textos atualizados", () => {
  it("Impacto no SPED aponta a aba Análise da fase", () => {
    const qc = (c) => c.setQueryData(chaves.impactos("p1", ""), { pages: [{ linhas: [], proximo: null, total: 0, totalGeral: 0, porTipo: {} }], pageParams: [undefined] });
    const t = texto(montar(<Impacto projeto={projeto()} />, qc));
    expect(t).toContain("na aba Análise da fase");
    expect(t).not.toContain("Cobertura das camadas, no alto");
  });
  it("POP: abre sempre na primeira aba; endereços antigos com o comportamento real; áreas comuns como botões", () => {
    const pop = JSON.stringify(POPS_SANEAMENTO_ESTOQUES);
    expect(pop).toContain("abre sempre na primeira aba dela (1.1, 2.1, 3.1)");
    expect(pop).not.toContain("1.2 Análise depois");
    expect(pop).toContain("Casos abre a aba Casos da fase em andamento");
    expect(pop).toContain("como botões lado a lado");
    expect(pop).not.toContain("Alterar na Configuração");
    expect(pop).toContain("Não foi possível conferir");
  });
  it("o link 'Importe outro arquivo no Saneamento' leva à Fase 1 > 1.1 Preparar", () => {
    const fonte = fs.readFileSync(new URL("../../pages/diagnostico/ProjetoDiagnosticoPagina.jsx", import.meta.url), "utf8");
    expect(fonte).toContain("/saneamento?fase=1&aba=preparar` : null} />}");
  });
});
