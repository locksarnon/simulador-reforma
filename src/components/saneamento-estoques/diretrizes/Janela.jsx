import { useEffect, useRef } from "react";

/**
 * Janela de confirmação sobre a página (a prévia de aplicar aparece onde a pessoa está, não no fim da página). Esc ou clique fora fecham,
 * salvo enquanto `aoFechar` não vier (ex.: aplicando). Sem portal: funciona igual na tela e nos testes.
 */
export default function Janela({ titulo, aoFechar, children, largura = "max-w-2xl" }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    if (!aoFechar) return undefined;
    const esc = (e) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar?.(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} className={`w-full ${largura} bg-card shadow-xl focus:outline-none`}>{children}</div>
    </div>
  );
}
