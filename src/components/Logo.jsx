import React from "react";

/**
 * Marca do Simulador FAL — três barras ascendentes sobre uma base, lendo ao
 * mesmo tempo como um mini-gráfico (simulação/dados) e como degraus (a
 * transição escalonada do IBS/CBS, 2026→2033). Monocromática via
 * currentColor para herdar a cor do container (mesmo padrão dos ícones
 * lucide que substituiu), então funciona em qualquer fundo/tema sem props.
 */
export default function Logo({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M3 19.5h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" opacity="0.5" />
      <rect x="4" y="14" width="4" height="5.5" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="10" y="9.5" width="4" height="10" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="16" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
    </svg>
  );
}
