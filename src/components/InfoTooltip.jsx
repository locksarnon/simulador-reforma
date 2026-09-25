import React, { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { ORIENTACOES } from "@/lib/orientacoes";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

/**
 * Ícone "i" que exibe orientação ao passar o mouse ou clicar.
 * Usa Popover com Portal — detecta bordas da viewport automaticamente,
 * evitando que o conteúdo seja cortado fora da tela.
 *
 * Uso por dicionário: <InfoTooltip pagina="config" chave="margem_meta" />
 * Uso direto:         <InfoTooltip text="texto literal" />
 */
export default function InfoTooltip({ text, pagina, chave, className = "" }) {
  const resolved = text || ORIENTACOES?.[pagina]?.[chave] || "";
  const [open, setOpen] = useState(false);
  const fechar = useRef(null);
  const tipoPonteiro = useRef("mouse");

  // Fecha com um pequeno atraso: dá tempo de levar o mouse até o texto sem o aviso sumir.
  const abrir = () => { clearTimeout(fechar.current); setOpen(true); };
  const agendarFechar = () => { clearTimeout(fechar.current); fechar.current = setTimeout(() => setOpen(false), 150); };
  useEffect(() => () => clearTimeout(fechar.current), []);

  if (!resolved) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          className={`relative inline-flex items-center ${className}`}
          onPointerDown={(e) => { tipoPonteiro.current = e.pointerType; }}
          onMouseEnter={abrir}
          onMouseLeave={agendarFechar}
          // No toque não existe "passar o mouse": o clique abre/fecha. Com mouse, o clique mantém aberto.
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (tipoPonteiro.current === "mouse") abrir(); else setOpen((o) => !o); }}
        >
          <Info className="w-4 h-4 text-muted-foreground hover:text-foreground cursor-help transition-colors" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={16}
        className="w-72 p-3 text-xs leading-relaxed"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={abrir}
        onMouseLeave={agendarFechar}
      >
        {resolved}
      </PopoverContent>
    </Popover>
  );
}