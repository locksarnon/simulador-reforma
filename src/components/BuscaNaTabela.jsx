import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useEfeitoDeLayout } from "@/lib/useLargurasColunas";

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Esconde as linhas do corpo que não têm o texto buscado (sem acento, sem diferença de maiúsculas). Devolve { total, visiveis }. */
export function filtrarLinhas(alvo, busca) {
  const b = semAcento(busca).trim();
  let total = 0;
  let visiveis = 0;
  for (const corpo of alvo?.querySelectorAll?.("tbody") || []) {
    for (const tr of corpo.rows) {
      total += 1;
      const ok = !b || semAcento(tr.textContent).includes(b);
      if (tr.hidden === ok) tr.hidden = !ok;
      if (ok) visiveis += 1;
    }
  }
  return { total, visiveis };
}

/**
 * "Buscar nesta lista" para tabelas HTML montadas à mão (as que não usam a TabelaPadrao). Fica logo ANTES da tabela (ou da
 * caixa que a contém) e esconde, na tela, as linhas do corpo sem o texto digitado (sem acento, sem diferença de maiúsculas).
 * Só aparece com `minimo` linhas ou mais (padrão 5). Acompanha as linhas que a tabela redesenha, sem mexer nos dados.
 */
export default function BuscaNaTabela({ minimo = 5, rotulo = "Buscar nesta lista", className = "" }) {
  const [busca, setBusca] = useState("");
  const [info, setInfo] = useState({ total: 0, visiveis: 0 });
  const barra = useRef(null);
  const aplicar = () => {
    const r = filtrarLinhas(barra.current?.nextElementSibling, busca);
    setInfo((i) => (i.total === r.total && i.visiveis === r.visiveis ? i : r));
  };
  useEfeitoDeLayout(aplicar);
  useEffect(() => {
    const alvo = barra.current?.nextElementSibling;
    if (!alvo || typeof MutationObserver === "undefined") return undefined;
    const o = new MutationObserver(aplicar);
    o.observe(alvo, { childList: true, subtree: true, characterData: true });
    return () => o.disconnect();
  }, [busca]);
  const mostrar = info.total >= minimo || !!busca;
  return (
    <div ref={barra} hidden={!mostrar} className={`${mostrar ? "flex" : "hidden"} flex-wrap items-center gap-2 print:hidden ${className}`}>
      <label className="relative min-w-[180px] flex-1 sm:max-w-xs">
        <span className="sr-only">{rotulo}</span>
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={rotulo} className="h-7 w-full rounded-md border border-input bg-background pl-7 pr-7 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        {busca && <button type="button" onClick={() => setBusca("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Limpar a busca"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>}
      </label>
      {busca && <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{info.visiveis === 0 ? "Nenhuma linha com esta busca." : `${info.visiveis} de ${info.total} linhas`}</span>}
    </div>
  );
}
