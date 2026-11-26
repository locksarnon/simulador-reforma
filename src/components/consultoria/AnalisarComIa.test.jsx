import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import AnalisarComIa, { PainelAnalise, Resultado, mensagemDoCarregamento } from "./AnalisarComIa";

const html = (el) => renderToString(el).replace(/<!-- -->/g, "");
const painel = (props) => html(<PainelAnalise nome="Créditos de PIS e Cofins" info={null} erro="" enviando={false} aoPedir={() => {}} {...props} />);
const ULTIMO = { rascunho: "RASCUNHO DE PARECER\n\nResumo\nTexto.", modelo: "claude-fable-5-2", modo: "rapido", gerado_em: "2026-11-26T17:05:00Z", servico: "Créditos de PIS e Cofins" };

describe("Analisar com IA", () => {
  it("mostra os dois botões (rápido e pesquisa externa) e o aviso de que é apoio, sem rascunho antes de pedir", () => {
    const h = html(<AnalisarComIa projetoId="P1" servico="Créditos de PIS e Cofins" />);
    for (const t of ["Analisar com IA", "Aprofundar com pesquisa externa", "Créditos de PIS e Cofins", "o consultor revisa e assume o texto", "em até um minuto"]) expect(h).toContain(t);
    expect(h).not.toContain("rascunho-ia");
  });
  it("aceita o serviço como objeto do catálogo ou como texto e usa o nome", () => {
    const h = html(<AnalisarComIa projetoId="P1" servico={{ id: "pis-cofins", nome: "Créditos de PIS e Cofins" }} />);
    expect(h).toContain("Créditos de PIS e Cofins");
    expect(h).not.toContain("object Object");
    expect(html(<AnalisarComIa projetoId="P1" />)).not.toContain("undefined");
  });
  it("em andamento: botões apagados, andamento e o aviso de que pode sair da página", () => {
    const h = painel({ info: { estado: "EM_ANDAMENTO", modo: "rapido", iniciado_em: new Date().toISOString(), ultimo: null } });
    expect(h).toContain("Pode sair desta página; o rascunho fica salvo aqui.");
    expect(h).toContain("Preparando o rascunho");
    expect((h.match(/disabled=""/g) || []).length).toBe(2);
  });
  it("mostra o último rascunho guardado com data, modo e motor, Copiar e o aviso de que não é parecer", () => {
    const h = painel({ info: { estado: "PRONTO", modo: "rapido", ultimo: ULTIMO, aviso: "Rascunho de apoio gerado por IA: não é parecer." } });
    for (const t of ["Último rascunho · 26/11/2026", "14:05", "rascunho rápido (base legal do InTAX)", "claude-fable-5-2", "Copiar", "RASCUNHO DE PARECER", "não é parecer", "Analisar de novo"]) expect(h).toContain(t);
    expect(html(<Resultado ultimo={{ ...ULTIMO, modo: "pesquisa" }} />)).toContain("com pesquisa externa");
  });
  it("erro ou prazo estourado: mensagem clara, Tentar de novo e o último rascunho continua à vista", () => {
    const h = painel({ info: { estado: "ERRO", modo: "pesquisa", mensagem: "A IA passou do prazo de 170 segundos e o pedido foi encerrado.", ultimo: ULTIMO } });
    for (const t of ["passou do prazo", "Tentar de novo", "O último rascunho continua abaixo.", "RASCUNHO DE PARECER"]) expect(h).toContain(t);
    const sem = painel({ info: { estado: "ERRO", mensagem: "A IA não está disponível neste servidor agora.", ultimo: null } });
    expect(sem).toContain("A IA não está disponível neste servidor agora.");
    expect(sem).not.toContain("Copiar");
  });
  it("as mensagens do andamento mudam com o tempo e com o modo", () => {
    expect(mensagemDoCarregamento("rapido", 0)).toContain("Preparando o rascunho");
    expect(mensagemDoCarregamento("rapido", 45)).toContain("até 1 minuto");
    expect(mensagemDoCarregamento("pesquisa", 10)).toContain("Pesquisando fontes externas");
    expect(mensagemDoCarregamento("pesquisa", 120)).toContain("até 3 minutos");
  });
});
