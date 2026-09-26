import React from "react";
import { FileClock } from "lucide-react";

const hora = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Faixa do rascunho automático: oferece restaurar o que estava sendo preenchido e mostra quando foi guardado. */
export default function RascunhoAviso({ rascunho, aplicar }) {
  const { pendente, salvoEm, restaurar, descartar } = rascunho;
  if (pendente) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs">
        <FileClock className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="flex-1 min-w-[12rem]">Você tinha um rascunho não salvo deste formulário ({new Date(pendente.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}).</span>
        <button type="button" onClick={() => restaurar(aplicar)} className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground">Restaurar</button>
        <button type="button" onClick={descartar} className="px-2.5 py-1 rounded-md border border-border hover:bg-muted">Descartar</button>
      </div>
    );
  }
  if (salvoEm) return <p className="text-[11px] text-muted-foreground">Rascunho guardado neste computador às {hora(salvoEm)}. Clique em Salvar para gravar de verdade.</p>;
  return null;
}
