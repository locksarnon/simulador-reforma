import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MENSAGEM_CONSTRUINDO, mensagemDeEspera } from "@/lib/assistente";
import { Orbe } from "@/components/assistente/Orbe";

/** "há 8 s", "há 1 min 05 s". */
export function tempoDeEspera(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  return s < 60 ? `há ${s} s` : `há ${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

/**
 * Trava o resto da página enquanto a resposta é construída: todo filho de `raiz` (o app, o painel do assistente, outros portais)
 * fica inerte (sem clique, sem foco, sem teclado) e fora da leitura de tela, menos o próprio aviso. Devolve a função que desfaz.
 */
export function travarResto(raiz, manter) {
  if (!raiz?.children) return () => {};
  const antes = [];
  for (const el of Array.from(raiz.children)) {
    if (el === manter) continue;
    antes.push([el, el.inert, el.getAttribute?.("aria-hidden") ?? null]);
    el.inert = true;
    el.setAttribute?.("aria-hidden", "true");
  }
  const rolagem = raiz.style?.overflow;
  if (raiz.style) raiz.style.overflow = "hidden";
  return () => {
    for (const [el, inerte, aria] of antes) {
      el.inert = Boolean(inerte);
      if (aria === null) el.removeAttribute?.("aria-hidden");
      else el.setAttribute?.("aria-hidden", aria);
    }
    if (raiz.style) raiz.style.overflow = rolagem ?? "";
  };
}

/** O aviso em si (sem portal): a mensagem, a etapa e o tempo de espera. */
export function CartaoAguardando({ segundos = 0, aprofundada = false }) {
  return (
    <div role="alertdialog" aria-modal="true" aria-busy="true" aria-labelledby="aguardando-resposta-titulo" aria-describedby="aguardando-resposta-etapa"
      className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 text-center shadow-2xl assistente-entra-msg">
      <div className="flex justify-center"><Orbe pensando tamanho={56} /></div>
      <p id="aguardando-resposta-titulo" className="font-heading text-lg font-semibold leading-snug">{MENSAGEM_CONSTRUINDO}</p>
      <p id="aguardando-resposta-etapa" className="text-sm text-muted-foreground" aria-live="polite">{mensagemDeEspera(segundos, aprofundada)}</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="assistente-barra h-full w-1/3 rounded-full bg-primary" /></div>
      <p className="text-xs text-muted-foreground">
        <span className="tabular-nums">{tempoDeEspera(segundos)}</span> · A tela fica bloqueada até a resposta chegar.{" "}
        {aprofundada ? "Com a pesquisa em fontes externas, pode levar alguns minutos." : "Pode levar até alguns minutos."}
      </p>
    </div>
  );
}

/**
 * Tela travada da pergunta ao assistente: cobre a tela inteira, desliga o resto (clique, foco e teclado) e diz que a resposta
 * consultiva está sendo construída. Some quando a resposta (ou o erro) chega. No servidor (testes) não desenha nada.
 */
export default function AguardandoResposta({ desde, aprofundada = false }) {
  const [agora, setAgora] = useState(() => Date.now());
  const ref = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const desfazer = travarResto(document.body, ref.current);
    const antes = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    // Atalhos do app (Ctrl+/, Esc, Enter...) não chegam a ninguém; recarregar a página (F5, Ctrl+R) continua com o navegador.
    const bloquear = (e) => {
      const recarregar = e.key === "F5" || ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R"));
      if (!recarregar) e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", bloquear, true);
    return () => {
      window.removeEventListener("keydown", bloquear, true);
      desfazer();
      antes?.focus?.({ preventScroll: true });
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} tabIndex={-1} data-aguardando-resposta className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 p-4 outline-none backdrop-blur-sm">
      <CartaoAguardando segundos={(agora - (desde || agora)) / 1000} aprofundada={aprofundada} />
    </div>,
    document.body,
  );
}
