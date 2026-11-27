import React from "react";
import { Sparkles } from "lucide-react";

/** A esfera do assistente: gira devagar quando está pensando e respira quando parada. */
export function Orbe({ pensando = false, tamanho = 28 }) {
  return (
    <span className={`assistente-orbe ${pensando ? "assistente-orbe-pensando" : ""}`} style={{ width: tamanho, height: tamanho }} aria-hidden="true">
      <Sparkles style={{ width: tamanho * 0.5, height: tamanho * 0.5 }} className="relative text-white drop-shadow" />
    </span>
  );
}
