import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import AnalisarComIa, { Resultado, mensagemDoCarregamento } from "./AnalisarComIa";

const html = (el) => renderToString(el).replace(/<!-- -->/g, "");

describe("Analisar com IA", () => {
  it("mostra o botão e o aviso de que é apoio, sem rascunho antes de pedir", () => {
    const h = html(<AnalisarComIa projetoId="P1" servico="Créditos de PIS e Cofins" />);
    expect(h).toContain("Analisar com IA");
    expect(h).toContain("Créditos de PIS e Cofins");
    expect(h).toContain("o consultor revisa e assume o texto");
    expect(h).not.toContain("rascunho-ia");
  });
  it("aceita o serviço como objeto do catálogo ou como texto e usa o nome", () => {
    const h = html(<AnalisarComIa projetoId="P1" servico={{ id: "pis-cofins", nome: "Créditos de PIS e Cofins" }} />);
    expect(h).toContain("Créditos de PIS e Cofins");
    expect(h).not.toContain("object Object");
    expect(html(<AnalisarComIa projetoId="P1" />)).not.toContain("undefined");
  });
  it("mostra o rascunho com Copiar e o aviso de que não é parecer", () => {
    const h = html(<Resultado resultado={{ rascunho: "RASCUNHO DE PARECER\n\nResumo\nTexto.", modelo: "claude-code", aviso: "Rascunho de apoio gerado por IA: não é parecer." }} />);
    for (const t of ["Rascunho para revisão · claude-code", "Copiar", "RASCUNHO DE PARECER", "não é parecer"]) expect(h).toContain(t);
  });
  it("com a IA fora do ar mostra a mensagem clara no lugar do rascunho", () => {
    const h = html(<Resultado resultado={{ rascunho: null, mensagem: "A IA não está disponível neste servidor agora." }} />);
    expect(h).toContain("A IA não está disponível neste servidor agora.");
    expect(h).not.toContain("Copiar");
  });
  it("as mensagens do carregamento avançam com o tempo e param na última", () => {
    expect(mensagemDoCarregamento(0)).toContain("Reunindo o contexto");
    expect(mensagemDoCarregamento(30)).not.toBe(mensagemDoCarregamento(0));
    expect(mensagemDoCarregamento(9999)).toContain("Ainda trabalhando");
  });
});
