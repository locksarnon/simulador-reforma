import { larguraPorTecla, limitarLargura } from "@/lib/useLargurasColunas";

let redimensionando = false;
/** Verdadeiro enquanto a pessoa arrasta uma alça (o cabeçalho arrastável usa para não começar a mover a coluna). */
export const redimensionandoColuna = () => redimensionando;

const larguraDoPai = (el) => el?.parentElement?.getBoundingClientRect().width || 0;

/**
 * Alça de ajuste da largura, na borda direita do título da coluna (o título precisa ter posição: relative, sticky ou absolute).
 * Arrastar (ponteiro capturado, sem selecionar texto), setas esquerda/direita (10 px) e clique duplo (`aoAutoAjustar`:
 * volta ao tamanho do conteúdo). `largura`: a atual em px; sem ela, mede o título no momento.
 * `aoMudar(px, { final })`: `final` só no fim do arraste ou na tecla (hora de guardar). `aoIniciar`: antes da primeira mudança.
 * Sem hooks: dá para testar chamando a função direto. Some na impressão.
 */
export default function AlcaLargura({ rotulo, largura, aoMudar, aoAutoAjustar, aoIniciar }) {
  const nome = typeof rotulo === "string" ? rotulo : "";
  const aoTeclar = (e) => {
    const n = larguraPorTecla(largura ?? larguraDoPai(e.currentTarget), e.key);
    if (n === null) return;
    e.preventDefault();
    e.stopPropagation();
    aoIniciar?.();
    aoMudar(n, { final: true });
  };
  const aoApertar = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const inicio = e.clientX;
    const base = largura ?? larguraDoPai(el);
    let ultimo = base;
    let moveu = false;
    let quadro = 0;
    let acabou = false;
    redimensionando = true;
    try { el.setPointerCapture?.(e.pointerId); } catch { /* sem captura: segue pelo próprio elemento */ }
    const corpo = typeof document !== "undefined" ? document.body : null;
    const antes = corpo ? [corpo.style.userSelect, corpo.style.cursor] : null;
    if (corpo) { corpo.style.userSelect = "none"; corpo.style.cursor = "col-resize"; }
    const mover = (ev) => {
      if (!moveu) { moveu = true; aoIniciar?.(); }
      ultimo = limitarLargura(base + ev.clientX - inicio);
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => aoMudar(ultimo, { final: false }));
    };
    const fim = () => {
      if (acabou) return;
      acabou = true;
      cancelAnimationFrame(quadro);
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerup", fim);
      el.removeEventListener("pointercancel", fim);
      el.removeEventListener("lostpointercapture", fim);
      if (corpo) [corpo.style.userSelect, corpo.style.cursor] = antes;
      redimensionando = false;
      if (moveu) aoMudar(ultimo, { final: true });
    };
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", fim);
    el.addEventListener("pointercancel", fim);
    el.addEventListener("lostpointercapture", fim);
  };
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Ajustar a largura da coluna ${nome}`.trim()}
      aria-valuenow={largura ? Math.round(largura) : undefined}
      aria-valuemin={48}
      aria-valuemax={800}
      tabIndex={0}
      title="Arraste para ajustar a largura (ou use as setas). Clique duas vezes para voltar ao tamanho do conteúdo."
      data-alca-largura=""
      draggable={false}
      onPointerDown={aoApertar}
      onKeyDown={aoTeclar}
      onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); aoAutoAjustar?.(); }}
      onClick={(e) => e.stopPropagation()}
      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className="group/alca absolute right-0 top-0 z-[1] flex h-full w-2 cursor-col-resize touch-none select-none justify-end focus-visible:outline-none print:hidden"
    >
      <span aria-hidden="true" className="my-1 w-0.5 bg-current opacity-25 transition-opacity group-hover/alca:opacity-90 group-focus-visible/alca:bg-ring group-focus-visible/alca:opacity-100" />
    </span>
  );
}
