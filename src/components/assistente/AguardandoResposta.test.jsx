import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AguardandoResposta, { CartaoAguardando, tempoDeEspera, travarResto } from "./AguardandoResposta";

/** Elemento falso com o mínimo que a trava usa (inert, aria-hidden, style). */
const elemento = (aria = null) => {
  const attrs = new Map(aria === null ? [] : [["aria-hidden", aria]]);
  return { inert: false, getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null), setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k), attrs };
};

describe("tela travada enquanto a resposta consultiva é construída", () => {
  it("diz o que está acontecendo, a etapa e há quanto tempo, e avisa que a tela fica bloqueada", () => {
    const h = renderToStaticMarkup(<CartaoAguardando segundos={35} />);
    expect(h).toContain("Construindo a resposta consultiva ao seu problema, aguarde…");
    expect(h).toContain("Montando o passo a passo e o cálculo");
    expect(h).toContain("há 35 s");
    expect(h).toContain("A tela fica bloqueada até a resposta chegar.");
    expect(h).toContain('role="alertdialog"');
    expect(h).toContain('aria-busy="true"');
  });

  it("na pesquisa aprofundada a espera fala das fontes externas", () => {
    const h = renderToStaticMarkup(<CartaoAguardando segundos={5} aprofundada />);
    expect(h).toContain("Pesquisando em fontes oficiais na internet");
    expect(h).toContain("Com a pesquisa em fontes externas, pode levar alguns minutos.");
  });

  it("conta o tempo em segundos e depois em minutos", () => {
    expect(tempoDeEspera(8)).toBe("há 8 s");
    expect(tempoDeEspera(65)).toBe("há 1 min 05 s");
    expect(tempoDeEspera(-3)).toBe("há 0 s");
  });

  it("trava todo o resto da página (o app e o painel do assistente) e devolve tudo como estava ao terminar", () => {
    const app = elemento();
    const painel = elemento("false");
    const aviso = elemento();
    const body = { children: [app, painel, aviso], style: { overflow: "auto" } };
    const desfazer = travarResto(body, aviso);
    expect([app.inert, painel.inert, aviso.inert]).toEqual([true, true, false]);
    expect(app.getAttribute("aria-hidden")).toBe("true");
    expect(body.style.overflow).toBe("hidden");
    desfazer();
    expect([app.inert, painel.inert]).toEqual([false, false]);
    expect(app.attrs.has("aria-hidden")).toBe(false);
    expect(painel.getAttribute("aria-hidden")).toBe("false");
    expect(body.style.overflow).toBe("auto");
  });

  it("sem navegador (servidor, testes) não desenha nem trava nada", () => {
    expect(renderToStaticMarkup(<AguardandoResposta desde={Date.now()} />)).toBe("");
    expect(() => travarResto(null)()).not.toThrow();
  });
});
