import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TagChip from "@/components/clientes/TagChip";
import { CORES_DAS_TAGS } from "@/lib/tags";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Quantas das empresas escolhidas já têm a etiqueta. */
export function quantasTem(porEmpresa, tagId, empresas) {
  return empresas.filter((e) => (porEmpresa?.[e.id] || []).includes(tagId)).length;
}

const ACOES = [["", "Manter"], ["adicionar", "Adicionar"], ["remover", "Remover"]];

/**
 * Etiquetar uma empresa (marca as etiquetas que ela deve ter) ou várias de uma vez (para cada etiqueta: manter, adicionar ou remover).
 * Dá para criar uma etiqueta nova aqui mesmo.
 */
export default function DialogoEtiquetas({ empresas, tags, porEmpresa, aoFechar, aoSalvar }) {
  const qc = useQueryClient();
  const varias = empresas.length > 1;
  const [marcadas, setMarcadas] = useState(() => new Set(varias ? [] : porEmpresa?.[empresas[0].id] || []));
  const [acoes, setAcoes] = useState({}); // várias empresas: { [tagId]: "adicionar" | "remover" }
  const [nova, setNova] = useState({ nome: "", cor: CORES_DAS_TAGS[0] });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["tags"] });
  const falha = (titulo) => (e) => toast({ title: titulo, description: e.message, variant: "destructive" });

  const criar = useMutation({
    mutationFn: () => api.post("/tags", nova),
    onSuccess: (t) => {
      setNova((n) => ({ ...n, nome: "" }));
      recarregar();
      if (varias) setAcoes((a) => ({ ...a, [t.id]: "adicionar" }));
      else setMarcadas((m) => new Set(m).add(t.id));
    },
    onError: falha("Não foi possível criar a etiqueta"),
  });
  const salvar = useMutation({
    mutationFn: async () => {
      if (!varias) return api.put(`/tags/empresa/${empresas[0].id}`, { tag_ids: [...marcadas] });
      const ids = empresas.map((e) => e.id);
      for (const [tag_id, modo] of Object.entries(acoes)) await api.post("/tags/aplicar", { tag_id, empresa_ids: ids, modo });
      return null;
    },
    onSuccess: () => { recarregar(); toast({ title: "Etiquetas salvas" }); aoSalvar?.(); aoFechar(); },
    onError: falha("Não foi possível salvar as etiquetas"),
  });

  const alternar = (id) => setMarcadas((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const definir = (id, acao) => setAcoes((a) => { const n = { ...a }; if (acao) n[id] = acao; else delete n[id]; return n; });
  const semMudanca = varias ? Object.keys(acoes).length === 0 : (() => {
    const antes = porEmpresa?.[empresas[0].id] || [];
    return antes.length === marcadas.size && antes.every((i) => marcadas.has(i));
  })();

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{varias ? `Etiquetar ${empresas.length} empresas` : `Etiquetas de ${empresas[0].razao_social}`}</DialogTitle>
          <DialogDescription>{varias ? "Manter, adicionar ou remover nas empresas marcadas." : "Etiquetas desta empresa."}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[320px] overflow-y-auto divide-y divide-border/60">
          {tags.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma etiqueta.</p>}
          {tags.map((t) => {
            const n = quantasTem(porEmpresa, t.id, empresas);
            return varias ? (
              <div key={t.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <TagChip tag={t} />
                <span className="text-[11px] text-muted-foreground">em {n} de {empresas.length}</span>
                <div className="ml-auto flex gap-1" role="group" aria-label={`O que fazer com a etiqueta ${t.nome}`}>
                  {ACOES.map(([v, rotulo]) => (
                    <button key={rotulo} type="button" aria-pressed={(acoes[t.id] || "") === v} disabled={(v === "adicionar" && n === empresas.length) || (v === "remover" && n === 0)} onClick={() => definir(t.id, v)}
                      className={`rounded border px-2 py-0.5 text-xs disabled:opacity-40 ${(acoes[t.id] || "") === v ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>{rotulo}</button>
                  ))}
                </div>
              </div>
            ) : (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 py-1.5">
                <input type="checkbox" checked={marcadas.has(t.id)} onChange={() => alternar(t.id)} />
                <TagChip tag={t} />
              </label>
            );
          })}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (nova.nome.trim()) criar.mutate(); }} className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <p className="text-xs font-medium">Nova etiqueta</p>
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${campo} flex-1 min-w-[140px]`} value={nova.nome} maxLength={40} onChange={(e) => setNova((n) => ({ ...n, nome: e.target.value }))} placeholder="Ex.: Agro, Prioridade…" aria-label="Nome da nova etiqueta" />
            <div className="flex gap-1" role="group" aria-label="Cor da nova etiqueta">
              {CORES_DAS_TAGS.map((c) => <button key={c} type="button" aria-pressed={nova.cor === c} aria-label={`Cor ${c}`} onClick={() => setNova((n) => ({ ...n, cor: c }))} className={`h-5 w-5 rounded-full border-2 ${nova.cor === c ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: c }} />)}
            </div>
            <button type="submit" disabled={!nova.nome.trim() || criar.isPending} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 hover:bg-muted disabled:opacity-60">
              {criar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />} Criar
            </button>
          </div>
        </form>

        <DialogFooter>
          <button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
          <button type="button" disabled={semMudanca || salvar.isPending} onClick={() => salvar.mutate()} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
