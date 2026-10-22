// Peças visuais e formatos compartilhados pelos passos do projeto de saneamento.
import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { dataBr as dataBrBase } from "./logica";

export const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
export const dataBr = (d) => dataBrBase(d) || "—";
export const plural = (n, um, varios) => `${fmt(n)} ${n === 1 ? um : varios}`;

export const Chip = ({ children, tom = "n" }) => {
  const c = { g: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300", a: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300", b: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300", n: "bg-muted text-muted-foreground" }[tom];
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${c}`}>{children}</span>;
};

export function Acc({ aberto, onToggle, titulo, children }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <button type="button" onClick={onToggle} aria-expanded={aberto} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50">
        {aberto ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
        <span className="flex flex-wrap items-center gap-2 min-w-0">{titulo}</span>
      </button>
      {aberto && <div className="border-t border-border p-3">{children}</div>}
    </div>
  );
}

/** Tabela de itens (linha, código, descrição, unidade, última movimentação) com "Mostrar mais". */
export function TabelaItens({ itens, colunas }) {
  const [n, setN] = useState(50);
  const rot = { linha: "Linha", codigo: "Código", descricao: "Descrição", unidade: "Unidade", ultima_mov: "Última mov." };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse"><thead><tr className="text-left text-muted-foreground">{colunas.map((c) => <th key={c} className="p-1.5">{rot[c]}</th>)}</tr></thead>
        <tbody>{itens.slice(0, n).map((i) => <tr key={i.linha} className="border-t border-border">{colunas.map((c) => <td key={c} className={`p-1.5 ${c === "descricao" ? "max-w-[320px]" : ""}`}>{c === "ultima_mov" ? dataBr(i[c]) : (i[c] ?? "") || "—"}</td>)}</tr>)}</tbody></table>
      {itens.length > n && <button type="button" onClick={() => setN(n + 200)} className="text-xs text-primary underline p-2">Mostrar mais ({fmt(itens.length - n)} restantes)</button>}
    </div>
  );
}

export const Botao = ({ className = "", ...p }) => <button type="button" {...p} className={`px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed disabled:border-dashed ${className}`} />;
