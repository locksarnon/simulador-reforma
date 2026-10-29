import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const CHAVE_NORMA = "lcp-214-2025";

/** "Anexo IX, item 2" -> { caminho: "anexo-ix", item: "2" } (ou null se o texto não tiver essa forma). */
export function interpretarBaseLei(texto) {
  const m = /Anexo\s+([IVXL]+)(?:\s*,\s*item\s+([\d.]+))?/i.exec(String(texto || ""));
  return m ? { caminho: `anexo-${m[1].toLowerCase()}`, rotulo: `Anexo ${m[1].toUpperCase()}`, item: m[2] || null } : null;
}

/**
 * Painel lateral com o texto do anexo da LC 214/2025, com o item citado destacado — consulta sem sair da tela do validador.
 * O texto vem da Base legal do próprio InTAX (a mesma do menu Base legal).
 */
export default function AnexoLeiPainel({ baseLei, onFechar }) {
  const alvo = useMemo(() => interpretarBaseLei(baseLei), [baseLei]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["anexo-lei", alvo?.caminho],
    queryFn: () => api.get(`/base-legal/normas/${CHAVE_NORMA}/dispositivos/${alvo.caminho}`),
    enabled: !!alvo,
    staleTime: 30 * 60 * 1000,
  });
  // Texto do anexo: título/cabeçalho (parágrafos) + itens "N | descrição | NCM", com linhas de continuação (listas de NCM) coladas ao item.
  const { titulo, cabecalho, itens } = useMemo(() => {
    const linhas = String(data?.dispositivo?.texto || "").split("\n").filter((l) => l.trim());
    const titulo = []; let cabecalho = null; const itens = [];
    for (const l of linhas) {
      if (/^\s*ITEM\s*\|/i.test(l)) { cabecalho = l.split(" | "); continue; }
      if (/^\s*\d+(\.\d+)?\s*\|/.test(l)) { itens.push(l); continue; }
      if (itens.length) itens[itens.length - 1] += "\n" + l; else titulo.push(l);
    }
    return { titulo, cabecalho, itens: itens.map((l) => l.split(" | ")) };
  }, [data]);

  return (
    <Sheet open={!!baseLei} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{alvo ? `LC 214/2025 — ${alvo.rotulo}${alvo.item ? `, item ${alvo.item}` : ""}` : "Base na lei"}</SheetTitle>
          <SheetDescription>Texto do anexo conforme a Base legal do InTAX. O item citado fica destacado.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          {alvo && (
            <a href={`/base-legal/${CHAVE_NORMA}/${alvo.caminho}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline text-xs">
              <ExternalLink className="w-3.5 h-3.5" /> Abrir na Base legal (nova aba)
            </a>
          )}
          {!alvo && <p className="text-muted-foreground">Não há anexo identificado para este item.</p>}
          {isLoading && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando o anexo…</p>}
          {error && <p className="text-destructive">Não foi possível carregar o anexo: {error.message}</p>}
          {titulo.map((t, i) => <p key={i} className={i === 0 ? "font-semibold" : "text-muted-foreground"}>{t}</p>)}
          {itens.length > 0 && (
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse w-full">
                {cabecalho && <thead><tr className="bg-muted">{cabecalho.map((c, k) => <th key={k} className="border border-border px-2 py-1 text-left">{c}</th>)}</tr></thead>}
                <tbody>
                  {itens.map((celulas, i) => {
                    const destaque = alvo?.item && celulas[0].trim() === alvo.item;
                    return (
                      <tr key={i} ref={destaque ? (el) => el?.scrollIntoView({ block: "center" }) : undefined} className={destaque ? "bg-amber-100 dark:bg-amber-950/40 font-medium" : i % 2 ? "bg-muted/40" : ""}>
                        {celulas.map((c, k) => <td key={k} className="border border-border px-2 py-1 align-top whitespace-pre-line">{c}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {data && itens.length === 0 && titulo.length === 0 && <p className="text-muted-foreground">O anexo não tem texto carregado na Base legal.</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
