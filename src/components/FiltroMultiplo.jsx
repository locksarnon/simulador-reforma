import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Filtro de várias seleções (botão com lista de caixas de marcar), para ficar ao lado da busca das tabelas.
 * `opcoes`: [{ valor, rotulo }]; `marcados`: array de valores; vazio = todos.
 */
export default function FiltroMultiplo({ rotulo, opcoes, marcados, mudar }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  const todos = !marcados.length || marcados.length === opcoes.length;
  const resumo = todos ? "Todos" : marcados.length === 1 ? opcoes.find((o) => o.valor === marcados[0])?.rotulo : `${marcados.length} marcados`;
  const alternar = (v) => mudar(marcados.includes(v) ? marcados.filter((x) => x !== v) : [...marcados, v]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:bg-muted">
        <span className="text-muted-foreground">{rotulo}:</span> <span className="font-medium">{resumo}</span><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {aberto && (
        <div role="group" aria-label={rotulo} className="absolute left-0 z-20 mt-1 max-h-72 min-w-[12rem] overflow-auto rounded-md border border-border bg-popover p-1.5 text-sm shadow-md">
          <div className="flex gap-2 border-b border-border px-1.5 pb-1.5 text-xs">
            <button type="button" className="text-primary hover:underline" onClick={() => mudar(opcoes.map((o) => o.valor))}>Marcar todos</button>
            <button type="button" className="text-primary hover:underline" onClick={() => mudar([])}>Limpar</button>
          </div>
          {opcoes.map((o) => (
            <label key={o.valor} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-muted">
              <input type="checkbox" checked={marcados.includes(o.valor)} onChange={() => alternar(o.valor)} />{o.rotulo}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
