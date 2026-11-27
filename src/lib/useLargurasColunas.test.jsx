import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  chaveDasLarguras, gravarLarguras, idDaTabela, larguraPorTecla, lerLarguras, LARGURA_AUTO_MAX, LARGURA_MAX, LARGURA_MIN, limitarLargura, useLargurasColunas,
} from "./useLargurasColunas";
import AlcaLargura from "@/components/AlcaLargura";
import { filtrarLinhas } from "@/components/BuscaNaTabela";

/** Armazenamento de mentira (o do navegador não existe nos testes). */
export function armazenamentoFalso(inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => { dados.set(k, String(v)); },
    removeItem: (k) => { dados.delete(k); },
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("larguras das colunas: regras", () => {
  it("limita entre 48 e 800 px (e 480 para a medida automática)", () => {
    expect(limitarLargura(10)).toBe(LARGURA_MIN);
    expect(limitarLargura(5000)).toBe(LARGURA_MAX);
    expect(limitarLargura(123.6)).toBe(124);
    expect(limitarLargura("abc")).toBe(LARGURA_MIN);
    expect(limitarLargura(900, LARGURA_AUTO_MAX)).toBe(480);
  });

  it("setas mudam 10 px, com os limites; outras teclas não mexem", () => {
    expect(larguraPorTecla(120, "ArrowRight")).toBe(130);
    expect(larguraPorTecla(120, "ArrowLeft")).toBe(110);
    expect(larguraPorTecla(50, "ArrowLeft")).toBe(48);
    expect(larguraPorTecla(795, "ArrowRight")).toBe(800);
    expect(larguraPorTecla(120, "Enter")).toBeNull();
  });

  it("chave estável: o id da tabela, senão o nome e as colunas", () => {
    expect(idDaTabela("casos", "Casos", ["a"])).toBe("casos");
    expect(idDaTabela(undefined, "Casos", ["a", "b"])).toBe("auto:Casos:a,b");
    expect(idDaTabela(undefined, <b>x</b>, ["a"])).toBe("auto::a");
  });

  it("grava, lê de volta (só números válidos, limitados) e restaurar apaga a chave", () => {
    const s = armazenamentoFalso();
    vi.stubGlobal("localStorage", s);
    gravarLarguras("t1", { nome: 200 });
    expect(JSON.parse(s.getItem(chaveDasLarguras("t1")))).toEqual({ nome: 200 });
    s.setItem(chaveDasLarguras("t2"), JSON.stringify({ a: 5, b: 9999, c: "x", d: 150 }));
    expect(lerLarguras("t2")).toEqual({ a: 48, b: 800, d: 150 });
    gravarLarguras("t1", {});
    expect(s.getItem(chaveDasLarguras("t1"))).toBeNull();
    s.setItem(chaveDasLarguras("t3"), "{quebrado");
    expect(lerLarguras("t3")).toEqual({});
  });

  it("sem armazenamento (bloqueado ou com erro) a tela funciona e nada lança", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("cheio"); }, removeItem: () => { throw new Error("x"); } });
    expect(lerLarguras("t1")).toEqual({});
    expect(() => gravarLarguras("t1", { a: 100 })).not.toThrow();
    expect(() => gravarLarguras("t1", {})).not.toThrow();
    vi.stubGlobal("localStorage", undefined);
    expect(lerLarguras("t1")).toEqual({});
  });

  it("o hook devolve a largura guardada, senão a padrão (antes de medir), e sabe se há escolha da pessoa", () => {
    vi.stubGlobal("localStorage", armazenamentoFalso({ [chaveDasLarguras("tab")]: JSON.stringify({ nome: 222 }) }));
    let api;
    function Sonda() { api = useLargurasColunas("tab"); return <span>{api.larguraDe("nome", 150)}|{api.larguraDe("valor", 90)}</span>; }
    expect(renderToStaticMarkup(<Sonda />)).toContain("222|90");
    expect(api.personalizadas).toBe(true);
    expect(api.escolhida("nome")).toBe(true);
    expect(api.medidas).toBe(false);
    vi.stubGlobal("localStorage", armazenamentoFalso());
    renderToStaticMarkup(<Sonda />);
    expect(api.personalizadas).toBe(false);
  });
});

describe("alça de largura", () => {
  const props = (extra = {}) => ({ rotulo: "Nome", largura: 120, aoMudar: vi.fn(), aoIniciar: vi.fn(), aoAutoAjustar: vi.fn(), ...extra });
  const tecla = (key) => ({ key, preventDefault: vi.fn(), stopPropagation: vi.fn(), currentTarget: null });

  it("é focável, tem nome acessível e some na impressão", () => {
    const html = renderToStaticMarkup(<AlcaLargura {...props()} />);
    expect(html).toContain('aria-label="Ajustar a largura da coluna Nome"');
    expect(html).toContain('role="separator"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("cursor-col-resize");
    expect(html).toContain("print:hidden");
  });

  it("setas esquerda/direita mudam 10 px e guardam; outras teclas não fazem nada", () => {
    const p = props();
    const el = AlcaLargura(p);
    const direita = tecla("ArrowRight");
    el.props.onKeyDown(direita);
    expect(p.aoMudar).toHaveBeenCalledWith(130, { final: true });
    expect(direita.preventDefault).toHaveBeenCalled();
    el.props.onKeyDown(tecla("ArrowLeft"));
    expect(p.aoMudar).toHaveBeenLastCalledWith(110, { final: true });
    el.props.onKeyDown(tecla("Enter"));
    expect(p.aoMudar).toHaveBeenCalledTimes(2);
    const minima = props({ largura: 50 });
    AlcaLargura(minima).props.onKeyDown(tecla("ArrowLeft"));
    expect(minima.aoMudar).toHaveBeenCalledWith(48, { final: true });
  });

  it("clique duplo volta ao tamanho do conteúdo", () => {
    const p = props();
    AlcaLargura(p).props.onDoubleClick({ preventDefault() {}, stopPropagation() {} });
    expect(p.aoAutoAjustar).toHaveBeenCalled();
  });
});

describe("busca nas tabelas montadas à mão", () => {
  const linha = (texto) => ({ textContent: texto, hidden: false });
  it("esconde as linhas sem o texto, sem acento e sem diferença de maiúsculas", () => {
    const rows = [linha("Parafuso São Paulo"), linha("Porca Cuiabá"), linha("Arruela Goiânia")];
    const alvo = { querySelectorAll: () => [{ rows }] };
    expect(filtrarLinhas(alvo, "CUIABA")).toEqual({ total: 3, visiveis: 1 });
    expect(rows.map((r) => r.hidden)).toEqual([true, false, true]);
    expect(filtrarLinhas(alvo, "")).toEqual({ total: 3, visiveis: 3 });
    expect(rows.every((r) => !r.hidden)).toBe(true);
    expect(filtrarLinhas(null, "x")).toEqual({ total: 0, visiveis: 0 });
  });
});
