import { useEffect } from "react";

/**
 * Arrastar para rolar ("pegar a tabela e puxar para o lado"): com o botão principal do mouse apertado numa área sem controle da tabela,
 * a rolagem acompanha o ponteiro. Regras:
 * - só mouse: no toque e na caneta, a rolagem nativa do aparelho continua (o navegador já arrasta com o dedo);
 * - não começa em link, campo, rótulo, alça de largura da coluna, título arrastável (reordenar colunas), botão fora de célula nem em
 *   nada marcado com data-sem-arraste; nem com Ctrl/Shift/Alt/Cmd (seleção e atalhos seguem como antes). Botão dentro de célula da
 *   tabela (role=cell, td) ou marcado data-arrastavel começa o arraste;
 * - só vira arraste depois de LIMIAR px: abaixo disso é um clique simples e segue normal;
 * - depois de arrastar, o clique que o navegador dispara ao soltar é engolido (não abre a célula, a linha nem a visão focada);
 * - durante o arraste, cursor "grabbing" e nada de selecionar texto; fora dele, cursor "grab" quando há o que rolar;
 * - sem inércia (respeita quem pede menos movimento: prefers-reduced-motion não muda nada porque não há animação); teclado intocado.
 */
export const LIMIAR_ARRASTE = 5;

const IGNORAR = [
  "button", "a", "input", "select", "textarea", "label", "summary", "option", "[role=\"button\"]", "[role=\"separator\"]", "[role=\"checkbox\"]",
  "[role=\"link\"]", "[data-alca-largura]", "[draggable=\"true\"]", "[contenteditable=\"\"]", "[contenteditable=\"true\"]", "[data-sem-arraste]",
].join(", ");

/** Botão de célula: pode começar o arraste (o clique curto segue abrindo; o do fim do arraste é engolido). */
const BOTAO = "button, [role=\"button\"]";
const CELULA = "[role=\"cell\"], [role=\"gridcell\"], td, [data-arrastavel]";

/**
 * O arraste não começa neste alvo? Não começa em campo, link, rótulo, alça de largura, título arrastável nem em nada marcado
 * data-sem-arraste. Botão só bloqueia fora de célula: o botão DENTRO de uma célula da tabela (role=cell, td) ou marcado data-arrastavel
 * deixa arrastar, porque a maior parte da área visível pode ser feita deles (ex.: as situações da Tabela do Saneamento). Alvo sem elemento = ignora.
 */
export function alvoSemArraste(alvo) {
  const el = alvo && alvo.nodeType === 1 ? alvo : alvo?.parentElement;
  if (!el || typeof el.closest !== "function") return true;
  if (el.closest("[data-sem-arraste]")) return true;
  let controle = el.closest(IGNORAR);
  while (controle) {
    const botaoDeCelula = controle.matches?.(BOTAO) && !!controle.closest?.(CELULA);
    if (!botaoDeCelula) return true;
    // Botão de célula liberado: confere se não há outro controle por fora dele (ex.: link ou rótulo envolvendo o botão).
    controle = controle.parentElement?.closest?.(IGNORAR) || null;
  }
  return false;
}

/** Há o que rolar no elemento (na horizontal ou, com `vertical`, também na vertical)? */
const podeRolar = (el, vertical) => el.scrollWidth > el.clientWidth + 1 || (vertical && el.scrollHeight > el.clientHeight + 1);

/**
 * Liga o arrastar-para-rolar no elemento rolável. `vertical`: também puxa para cima e para baixo (tabelas com rolagem própria).
 * `janela`: onde escutar o movimento e o clique (padrão: window; os testes passam um falso). Devolve a função que desliga.
 */
export function ligarArrastarParaRolar(el, { vertical = false, limiar = LIMIAR_ARRASTE, janela = typeof window !== "undefined" ? window : null } = {}) {
  if (!el || !janela) return () => {};
  let estado = null; // { id, x, y, esquerda, topo, arrastando, antes }
  let engolirClique = false;
  let relogio = null;

  const restaurarAparencia = () => {
    if (!estado?.antes) return;
    [el.style.cursor, el.style.userSelect] = estado.antes;
    const corpo = janela.document?.body;
    if (corpo) corpo.style.userSelect = estado.antes[2];
  };
  const soltarEscuta = () => {
    janela.removeEventListener("pointermove", aoMover);
    janela.removeEventListener("pointerup", aoSoltar);
    janela.removeEventListener("pointercancel", aoCancelar);
  };
  const aoEngolir = (e) => {
    if (!engolirClique) return;
    engolirClique = false;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    janela.removeEventListener("click", aoEngolir, true);
  };
  function aoMover(e) {
    if (!estado || e.pointerId !== estado.id) return;
    const dx = e.clientX - estado.x; const dy = e.clientY - estado.y;
    if (!estado.arrastando) {
      if (Math.max(Math.abs(dx), vertical ? Math.abs(dy) : 0) < limiar) return;
      estado.arrastando = true;
      const corpo = janela.document?.body;
      estado.antes = [el.style.cursor, el.style.userSelect, corpo ? corpo.style.userSelect : ""];
      el.style.cursor = "grabbing";
      el.style.userSelect = "none";
      if (corpo) corpo.style.userSelect = "none";
    }
    // A seleção que o apertar do mouse começou não cresce enquanto arrasta.
    try { janela.getSelection?.()?.removeAllRanges(); } catch { /* sem seleção: segue */ }
    e.preventDefault?.();
    el.scrollLeft = estado.esquerda - dx;
    if (vertical) el.scrollTop = estado.topo - dy;
  }
  function aoSoltar(e) {
    if (!estado || e.pointerId !== estado.id) return;
    const arrastou = estado.arrastando;
    restaurarAparencia();
    estado = null;
    soltarEscuta();
    if (!arrastou) return;
    // O clique que o navegador dispara logo depois do soltar (na mesma tarefa) é engolido; se ele não vier, a trava sai sozinha.
    engolirClique = true;
    janela.addEventListener("click", aoEngolir, true);
    clearTimeout(relogio);
    relogio = setTimeout(() => { engolirClique = false; janela.removeEventListener("click", aoEngolir, true); }, 0);
  }
  function aoCancelar(e) {
    if (!estado || e.pointerId !== estado.id) return;
    restaurarAparencia();
    estado = null;
    soltarEscuta();
  }
  const aoApertar = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    if (e.button !== 0 || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
    if (alvoSemArraste(e.target) || !podeRolar(el, vertical)) return;
    soltarEscuta();
    estado = { id: e.pointerId, x: e.clientX, y: e.clientY, esquerda: el.scrollLeft, topo: el.scrollTop, arrastando: false, antes: null };
    janela.addEventListener("pointermove", aoMover);
    janela.addEventListener("pointerup", aoSoltar);
    janela.addEventListener("pointercancel", aoCancelar);
  };
  // Durante o arraste, nem o arrastar nativo (imagem, texto) nem a seleção começam.
  const aoArrastarNativo = (e) => { if (estado?.arrastando) e.preventDefault(); };
  const aoEntrar = (e) => {
    if (estado?.arrastando || (e.pointerType && e.pointerType !== "mouse")) return;
    el.style.cursor = podeRolar(el, vertical) ? "grab" : "";
  };

  el.addEventListener("pointerdown", aoApertar);
  el.addEventListener("pointerenter", aoEntrar);
  el.addEventListener("dragstart", aoArrastarNativo);
  el.addEventListener("selectstart", aoArrastarNativo);
  return () => {
    restaurarAparencia();
    estado = null;
    soltarEscuta();
    clearTimeout(relogio);
    janela.removeEventListener("click", aoEngolir, true);
    el.removeEventListener("pointerdown", aoApertar);
    el.removeEventListener("pointerenter", aoEntrar);
    el.removeEventListener("dragstart", aoArrastarNativo);
    el.removeEventListener("selectstart", aoArrastarNativo);
    if (el.style.cursor === "grab") el.style.cursor = "";
  };
}

/** Hook: liga o arrastar-para-rolar no elemento (o da ref em estado, que muda quando a tabela monta de novo). */
export function useArrastarParaRolar(el, { vertical = false } = {}) {
  useEffect(() => ligarArrastarParaRolar(el, { vertical }), [el, vertical]);
}

export default useArrastarParaRolar;
