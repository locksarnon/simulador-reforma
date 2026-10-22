import React, { useMemo } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const ROT_NIVEL = { EXATA: "Idêntico", MUITO_PROVAVEL: "Indicação alta", POSSIVEL: "Indicação possível" };
const COR_NIVEL = {
  EXATA: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  MUITO_PROVAVEL: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
  POSSIVEL: "bg-muted text-muted-foreground",
};

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9,.%/]/g, "");

/** Palavras da descrição, destacando as que não aparecem na descrição de referência — mostra exatamente onde os cadastros divergem. */
function Descricao({ texto, referencia }) {
  const ref = new Set(String(referencia || "").split(/\s+/).map(norm).filter(Boolean));
  return (
    <span>
      {String(texto || "—").split(/(\s+)/).map((p, k) => {
        if (!p.trim()) return p;
        const n = norm(p);
        return n && !ref.has(n) ? <mark key={k} className="rounded-sm bg-amber-200/70 px-0.5 text-foreground dark:bg-amber-500/30">{p}</mark> : <span key={k}>{p}</span>;
      })}
    </span>
  );
}

/**
 * Painel de comparativo: o item e as correspondências encontradas lado a lado, com nota, motivos e diferenças destacadas.
 * Marcar "Excluir" só afeta a cópia saneada baixada; nenhum cadastro é alterado no ERP.
 */
export default function ComparativoDuplicidade({ item, itens, excluir, setExcluir, podeExcluir, onFechar }) {
  const porLinha = useMemo(() => new Map((itens || []).map((i) => [i.linha, i])), [itens]);
  const dup = item?.duplicidade;
  const linhas = useMemo(() => (dup ? [item.linha, ...dup.candidatos.map((c) => c.linha)] : []), [item, dup]);
  const meta = useMemo(() => new Map((dup?.candidatos || []).map((c) => [c.linha, c])), [dup]);

  return (
    <Sheet open={!!item} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Comparativo de duplicidade — linha {item?.linha}</SheetTitle>
          <SheetDescription>
            Os cadastros abaixo foram comparados por descrição, unidade, medidas, NCM e código de barras. Palavras destacadas existem só neste cadastro.
            {dup?.mestre != null && <> Sugestão de cadastro a manter: <b>linha {dup.mestre}</b> (o mais completo).</>}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          {linhas.map((ln) => {
            const it = porLinha.get(ln); const m = meta.get(ln); const base = ln === item.linha;
            if (!it) return null;
            const outros = linhas.filter((x) => x !== ln).map((x) => porLinha.get(x)?.descricao).join(" ");
            return (
              <div key={ln} className={`rounded-lg border p-3 ${base ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="font-semibold">Linha {ln}</span>
                  {base && <span className="text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-primary text-primary-foreground">item analisado</span>}
                  {dup?.mestre === ln && <span className="text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">mestre sugerido</span>}
                  {m && <span className={`text-[10px] uppercase font-medium px-1.5 py-0.5 rounded ${COR_NIVEL[m.nivel]}`}>{ROT_NIVEL[m.nivel]} · similaridade {m.score.toFixed(2).replace(".", ",")}</span>}
                  {podeExcluir && !base && (
                    <label className="ml-auto inline-flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="checkbox" checked={excluir.includes(ln)} disabled={!it.candidatos_duplicidade?.length}
                        onChange={(e) => setExcluir((xs) => (e.target.checked ? [...xs, ln] : xs.filter((n) => n !== ln)))} />
                      Excluir da cópia saneada
                    </label>
                  )}
                </div>
                <p className="leading-snug"><Descricao texto={it.descricao} referencia={outros} /></p>
                <dl className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <div><dt className="inline">Código: </dt><dd className="inline text-foreground">{it.codigo || "—"}</dd></div>
                  <div><dt className="inline">Unidade: </dt><dd className="inline text-foreground">{it.unidade || "—"}</dd></div>
                  <div><dt className="inline">NCM: </dt><dd className="inline text-foreground font-mono">{it.ncm || it.ncm_original || "—"}</dd></div>
                  <div><dt className="inline">Princípio ativo: </dt><dd className="inline text-foreground">{it.principio_ativo || "—"}</dd></div>
                </dl>
                {m && <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground space-y-0.5">{m.motivos.map((x, k) => <li key={k}>{x}</li>)}</ul>}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">A pontuação de similaridade não é probabilidade de duplicidade, e similaridade não equivale a identidade técnica: confirme cada caso. Nenhum cadastro é excluído ou alterado no seu ERP; a marcação vale apenas para a cópia saneada que você baixa.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
