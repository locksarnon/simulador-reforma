// Peças visuais e formatos compartilhados pelos passos do projeto de saneamento.
import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { dataBr as dataBrBase } from "./logica";
import { ordenarPor, proximaOrdem } from "./ordenacao";
import TabelaPadrao from "@/components/TabelaPadrao";

export { ordenarPor };
export const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
export const dataBr = (d) => dataBrBase(d) || "—";
export const plural = (n, um, varios) => `${fmt(n)} ${n === 1 ? um : varios}`;

export const Chip = ({ children, tom = "n" }) => {
  const c = { r: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300", g: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300", a: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300", b: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300", n: "bg-muted text-muted-foreground" }[tom];
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

/** Ordenação de uma tabela: [ordem, ordenar(chave)]. Cada clique na mesma coluna alterna crescente, decrescente e a ordem original. `inicial` = ordem de partida ({ chave, dir }). */
export function useOrdenacao(inicial = null) {
  const [ord, setOrd] = useState(inicial);
  return [ord, (chave) => setOrd((o) => proximaOrdem(o, chave))];
}

/** Cabeçalho de coluna ordenável (toda tabela do saneamento usa este): mostra a seta da ordem atual e avisa leitores de tela via aria-sort. */
export function Th({ chave, ord, onOrdenar, className = "p-1.5", title, children }) {
  const ativo = ord?.chave === chave;
  return (
    <th className={className} title={title} aria-sort={ativo ? (ord.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onOrdenar(chave)} aria-label={`Ordenar por ${typeof children === "string" ? children : chave}`} className="inline-flex items-center gap-1 text-left hover:text-foreground">
        <span>{children}</span><span aria-hidden="true" className={`text-[10px] w-2.5 ${ativo ? "text-primary" : "opacity-40"}`}>{ativo ? (ord.dir === 1 ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

const COL_ITENS = {
  linha: { chave: "linha", rotulo: "Linha", tipo: "numero", alinhar: "direita" },
  codigo: { chave: "codigo", rotulo: "Código" },
  descricao: { chave: "descricao", rotulo: "Descrição" },
  unidade: { chave: "unidade", rotulo: "Unidade" },
  ultima_mov: { chave: "ultima_mov", rotulo: "Última mov.", tipo: "data" },
  situacao: { chave: "situacao", rotulo: "Situação" },
};
/** Tabela de itens (linha, código, descrição, unidade, última movimentação) na tabela padrão: busca, filtros, ordenação e paginação. */
export function TabelaItens({ itens, colunas, id = "saneamento-itens" }) {
  const cols = useMemo(() => colunas.map((c) => COL_ITENS[c] || { chave: c, rotulo: c }), [colunas]);
  return <TabelaPadrao id={id} ariaLabel="Itens" colunas={cols} linhas={itens} chaveLinha={(i) => i.linha} tamanhoInicial={50} vazio="Nenhum item." />;
}

export const Botao = ({ className = "", ...p }) => <button type="button" {...p} className={`px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed disabled:border-dashed ${className}`} />;
