import React from "react";

/** Trecho da busca: [[termo]] vira destaque. */
export function Trecho({ texto }) {
  const partes = String(texto || "").split(/(\[\[.*?\]\])/g);
  return (
    <span>
      {partes.map((p, i) => (p.startsWith("[[") ? <mark key={i} className="bg-amber-200/70 dark:bg-amber-500/30 text-foreground rounded px-0.5">{p.slice(2, -2)}</mark> : <React.Fragment key={i}>{p}</React.Fragment>))}
    </span>
  );
}
