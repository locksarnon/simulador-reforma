import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { alvoSemArraste, ligarArrastarParaRolar, LIMIAR_ARRASTE } from "./useArrastarParaRolar";

/** Elemento falso: só o que o arraste usa (closest por uma lista simples de "é controle"). */
function alvo({ controle = false } = {}) {
  return { nodeType: 1, closest: (sel) => (controle && sel.includes("button") ? {} : null) };
}
/** Nó falso com seletores que ele "casa" (ex.: ["button"], ["td"]) e o pai: closest/matches como no DOM, para a lista de seletores. */
function no(casa, pai = null) {
  const n = { nodeType: 1, parentElement: pai, matches: (sel) => sel.split(", ").some((x) => casa.includes(x)) };
  n.closest = (sel) => { for (let x = n; x; x = x.parentElement) if (x.matches(sel)) return x; return null; };
  return n;
}
function cenario({ vertical = false, larguraConteudo = 2000, alturaConteudo = 600 } = {}) {
  const janela = new EventTarget();
  janela.document = { body: { style: { userSelect: "" } } };
  janela.getSelection = () => ({ removeAllRanges: vi.fn() });
  const el = new EventTarget();
  Object.assign(el, { scrollLeft: 100, scrollTop: 50, clientWidth: 500, clientHeight: 300, scrollWidth: larguraConteudo, scrollHeight: alturaConteudo, style: { cursor: "", userSelect: "" } });
  const desligar = ligarArrastarParaRolar(el, { vertical, janela });
  const evento = (tipo, dados = {}, onde = janela) => {
    const e = new Event(tipo, { cancelable: true, bubbles: true });
    Object.assign(e, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 0, clientY: 0, ...dados });
    if (dados.alvo) Object.defineProperty(e, "target", { value: dados.alvo });
    onde.dispatchEvent(e);
    return e;
  };
  const apertar = (dados = {}) => evento("pointerdown", { alvo: alvo(), ...dados }, el);
  const mover = (clientX, clientY = 0) => evento("pointermove", { clientX, clientY });
  const soltar = (clientX, clientY = 0) => evento("pointerup", { clientX, clientY });
  const clicar = () => evento("click");
  return { el, janela, desligar, apertar, mover, soltar, clicar };
}

afterEach(() => { vi.useRealTimers(); });

describe("arrastar para rolar", () => {
  it("abaixo do limiar é um clique simples: não rola e o clique passa", () => {
    const c = cenario();
    const aoClicar = vi.fn();
    c.janela.addEventListener("click", aoClicar);
    c.apertar({ clientX: 200 });
    c.mover(200 - (LIMIAR_ARRASTE - 1));
    const fim = c.soltar(200 - (LIMIAR_ARRASTE - 1));
    expect(c.el.scrollLeft).toBe(100);
    const clique = c.clicar();
    expect(aoClicar).toHaveBeenCalledTimes(1);
    expect(clique.defaultPrevented).toBe(false);
    expect(fim.defaultPrevented).toBe(false);
  });

  it("passado o limiar, a rolagem acompanha o ponteiro e o clique que termina o arraste é engolido", () => {
    const c = cenario();
    const aoClicar = vi.fn();
    c.apertar({ clientX: 300 });
    c.mover(280);
    expect(c.el.scrollLeft).toBe(120); // puxou 20 px para a esquerda: o conteúdo anda para a direita
    expect(c.el.style.cursor).toBe("grabbing");
    expect(c.el.style.userSelect).toBe("none");
    expect(c.janela.document.body.style.userSelect).toBe("none");
    c.mover(350);
    expect(c.el.scrollLeft).toBe(50);
    expect(c.el.scrollTop).toBe(50); // só horizontal
    c.soltar(350);
    // No navegador a escuta de captura da janela vem antes da tela; aqui (sem árvore) a ordem é a do registro.
    c.janela.addEventListener("click", aoClicar);
    expect(c.el.style.cursor).toBe("");
    expect(c.janela.document.body.style.userSelect).toBe("");
    const clique = c.clicar();
    expect(aoClicar).not.toHaveBeenCalled();
    expect(clique.defaultPrevented).toBe(true);
    // Só o clique daquele arraste: o próximo passa.
    c.clicar();
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it("se o clique não vier depois do arraste, a trava sai sozinha", () => {
    vi.useFakeTimers();
    const c = cenario();
    const aoClicar = vi.fn();
    c.apertar({ clientX: 300 }); c.mover(250); c.soltar(250);
    c.janela.addEventListener("click", aoClicar);
    vi.runAllTimers();
    c.clicar();
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it("vertical: também puxa para cima e para baixo; o limiar vale nos dois eixos", () => {
    const c = cenario({ vertical: true });
    c.apertar({ clientX: 100, clientY: 100 });
    c.mover(100, 98);
    expect(c.el.scrollTop).toBe(50);
    c.mover(100, 60);
    expect(c.el.scrollTop).toBe(90);
    expect(c.el.scrollLeft).toBe(100);
  });

  it("não começa em controle, com outro botão, com tecla modificadora, no toque nem sem o que rolar", () => {
    for (const dados of [{ alvo: alvo({ controle: true }) }, { button: 2 }, { ctrlKey: true }, { shiftKey: true }, { pointerType: "touch" }, { pointerType: "pen" }]) {
      const c = cenario();
      c.apertar({ clientX: 300, ...dados });
      c.mover(200);
      expect(c.el.scrollLeft).toBe(100);
    }
    const semRolagem = cenario({ larguraConteudo: 500 });
    semRolagem.apertar({ clientX: 300 });
    semRolagem.mover(200);
    expect(semRolagem.el.scrollLeft).toBe(100);
  });

  it("outro ponteiro não mexe no arraste em curso; desligar remove tudo", () => {
    const c = cenario();
    c.apertar({ clientX: 300 });
    const e = new Event("pointermove"); Object.assign(e, { pointerId: 9, clientX: 0, clientY: 0 }); c.janela.dispatchEvent(e);
    expect(c.el.scrollLeft).toBe(100);
    c.desligar();
    c.mover(200);
    expect(c.el.scrollLeft).toBe(100);
  });

  it("alvos ignorados: botão, link, campo, rótulo, role=button, alça da coluna, título arrastável e data-sem-arraste", () => {
    const seletores = [];
    alvoSemArraste({ nodeType: 1, closest: (s) => { seletores.push(s); return null; } });
    for (const s of ["button", "a", "input", "select", "textarea", "label", "[role=\"button\"]", "[data-alca-largura]", "[draggable=\"true\"]", "[data-sem-arraste]"]) {
      expect(seletores.join(", ").split(", ")).toContain(s);
    }
    // Texto solto (nó de texto) usa o elemento pai; sem elemento, não arrasta.
    expect(alvoSemArraste({ nodeType: 3, parentElement: { nodeType: 1, closest: () => null } })).toBe(false);
    expect(alvoSemArraste(null)).toBe(true);
  });

  it("botão dentro de célula (role=cell, td) ou data-arrastavel deixa arrastar; fora de célula, campo, link, alça e data-sem-arraste não", () => {
    const celula = no(['[role="cell"]'], no(['[role="row"]']));
    expect(alvoSemArraste(no(["button"], celula))).toBe(false);
    expect(alvoSemArraste(no([], no(["button"], celula)))).toBe(false); // o texto dentro do botão da célula
    expect(alvoSemArraste(no(['[role="button"]'], no(["td"])))).toBe(false);
    expect(alvoSemArraste(no(["button", "[data-arrastavel]"]))).toBe(false);
    expect(alvoSemArraste(no(["button"], no(['[role="columnheader"]'])))).toBe(true); // botão do título (filtrar a camada)
    expect(alvoSemArraste(no(["button"]))).toBe(true);
    expect(alvoSemArraste(no(["input"], celula))).toBe(true); // campo de verdade, mesmo na célula
    expect(alvoSemArraste(no(["a"], celula))).toBe(true);
    expect(alvoSemArraste(no(["button"], no(["a"], celula)))).toBe(true); // botão dentro de link
    expect(alvoSemArraste(no(["[data-alca-largura]", '[role="separator"]'], celula))).toBe(true);
    expect(alvoSemArraste(no(['[draggable="true"]']))).toBe(true);
    expect(alvoSemArraste(no(["button"], no(["[data-sem-arraste]"], celula)))).toBe(true);
  });

  it("arraste que começa no botão da célula rola e engole o clique dele; o clique curto no botão abre", () => {
    const botao = () => no(["button"], no(['[role="cell"]']));
    const c = cenario({ vertical: true });
    const aoAbrir = vi.fn();
    c.apertar({ alvo: botao(), clientX: 300, clientY: 100 });
    c.mover(240, 100);
    expect(c.el.scrollLeft).toBe(160);
    c.soltar(240, 100);
    c.janela.addEventListener("click", aoAbrir);
    expect(c.clicar().defaultPrevented).toBe(true);
    expect(aoAbrir).not.toHaveBeenCalled();
    // Clique curto (abaixo do limiar) no mesmo botão: abre a visão focada como antes.
    c.apertar({ alvo: botao(), clientX: 300, clientY: 100 });
    c.mover(302, 101);
    c.soltar(302, 101);
    expect(c.el.scrollLeft).toBe(160);
    expect(c.clicar().defaultPrevented).toBe(false);
    expect(aoAbrir).toHaveBeenCalledTimes(1);
  });
});

describe("as tabelas largas usam o arrastar para rolar", () => {
  const ler = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
  it("Tabela do Saneamento (com vertical), TabelaDensa (com vertical) e TabelaPadrao", () => {
    expect(ler("../components/saneamento-estoques/TabelaUnica.jsx")).toMatch(/useArrastarParaRolar\(area, \{ vertical: true \}\)/);
    const densa = ler("../components/saneamento-estoques/TabelaDensa.jsx");
    expect(densa).toMatch(/useArrastarParaRolar\(areaRolavel, \{ vertical: true \}\)/);
    expect(densa).toMatch(/ref=\{setAreaRolavel\} onScroll=\{aoRolar\}/);
    const padrao = ler("../components/TabelaPadrao.jsx");
    expect(padrao).toMatch(/useArrastarParaRolar\(area\)/);
    expect(padrao).toMatch(/<div ref=\{setArea\} className="overflow-x-auto/);
  });
});
