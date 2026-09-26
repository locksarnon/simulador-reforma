import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { fracaoParaTexto, textoParaFracao } from "@/lib/pctFormat";

/**
 * Campo de percentual: o usuário digita em pontos percentuais (7,60) e quem usa recebe a fração (0,076).
 * Mantém o texto que a pessoa digitou enquanto o campo está em foco — o campo numérico antigo
 * reescrevia o valor a cada tecla (0,07 × 100 = 7,000000000000001) e não deixava chegar em 7,60.
 */
export default function PctInput({ value, onChange, className, ...props }) {
  const [texto, setTexto] = useState(() => fracaoParaTexto(value));
  const emFoco = useRef(false);

  useEffect(() => {
    if (!emFoco.current) setTexto(fracaoParaTexto(value));
  }, [value]);

  return (
    <Input
      {...props}
      className={className}
      inputMode="decimal"
      value={texto}
      onFocus={(e) => { emFoco.current = true; e.target.select(); }}
      onBlur={() => { emFoco.current = false; setTexto(fracaoParaTexto(value)); }}
      onChange={(e) => {
        const t = e.target.value;
        if (!/^[0-9]*[.,]?[0-9]*$/.test(t)) return; // só dígitos e um separador decimal
        setTexto(t);
        onChange(textoParaFracao(t));
      }}
    />
  );
}
