import React, { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Newspaper, ExternalLink, RefreshCw, Check } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import InfoTooltip from "@/components/InfoTooltip";
import PageHeader from "@/components/PageHeader";

const empty = { titulo: "", resumo: "", url: "", fonte: "", publicado_em: "", tags: "", status: "Publicada" };

/**
 * Acervo de notícias — cadastro manual + busca automática de atualizações.
 * "Automática" aqui significa: disparada pelo usuário (sem cron/scheduler),
 * consultando feeds RSS oficiais e filtrando por palavra-chave da reforma.
 * Itens encontrados entram como rascunho — nada é publicado sem revisão.
 */
export default function FerramentasNoticias() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["noticiasReforma"],
    queryFn: () => base44.entities.NoticiaReforma.filter({}, "-publicado_em", 200),
  });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const buscarAtualizacoes = async () => {
    setBuscando(true);
    try {
      const resp = await base44.functions.invoke("buscarAtualizacoesNoticias");
      const r = resp.data;
      toast({
        title: "Busca concluída",
        description: `${r.novos_rascunhos} novo(s) rascunho(s) de ${r.itens_relevantes_encontrados} item(ns) relevante(s) encontrado(s) em ${r.fontes_consultadas} fonte(s).`,
      });
      qc.invalidateQueries({ queryKey: ["noticiasReforma"] });
    } catch (err) {
      toast({ title: "Falha ao buscar atualizações", description: err.message, variant: "destructive" });
    } finally {
      setBuscando(false);
    }
  };

  const publicar = async (n) => {
    await base44.entities.NoticiaReforma.update(n.id, { status: "Publicada" });
    qc.invalidateQueries({ queryKey: ["noticiasReforma"] });
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = { ...form, publicado_em: form.publicado_em ? `${form.publicado_em}T00:00:00.000Z` : null };
    if (editing === "new") await base44.entities.NoticiaReforma.create(payload);
    else await base44.entities.NoticiaReforma.update(editing.id, payload);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["noticiasReforma"] });
  };

  const del = async (n) => {
    if (!confirm(`Excluir "${n.titulo}"?`)) return;
    await base44.entities.NoticiaReforma.delete(n.id);
    qc.invalidateQueries({ queryKey: ["noticiasReforma"] });
  };

  const start = (n) => { setForm(n === "new" ? empty : { ...n, publicado_em: n.publicado_em ? n.publicado_em.slice(0, 10) : "" }); setEditing(n); setOpen(true); };

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Acervo de Notícias" }]} />
      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Newspaper className="w-5 h-5 text-muted-foreground" />
              <h1 className="text-xl font-heading font-semibold">Acervo de Notícias</h1>
              <InfoTooltip pagina="ferramentas" chave="noticias_header" />
            </div>
            <p className="text-sm text-muted-foreground">
              Busca automática em feeds oficiais + cadastro manual — itens encontrados entram como rascunho até você revisar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={buscarAtualizacoes}
              disabled={buscando}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${buscando ? "animate-spin" : ""}`} />
              {buscando ? "Buscando…" : "Buscar atualizações"}
            </button>
            <button onClick={() => start("new")} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
              <Plus className="w-4 h-4" /> Nova notícia
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {(data || []).map((n) => (
            <div key={n.id} className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {n.status === "Rascunho" && (
                    <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                      Rascunho
                    </span>
                  )}
                  <h3 className="font-medium text-sm">{n.titulo}</h3>
                  {n.url && (
                    <a href={n.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                {n.resumo && <p className="text-sm text-muted-foreground mt-1">{n.resumo}</p>}
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  {n.fonte && <span>{n.fonte}</span>}
                  {n.publicado_em && <span>· {new Date(n.publicado_em).toLocaleDateString("pt-BR")}</span>}
                  {n.tags && <span>· {n.tags}</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {n.status === "Rascunho" && (
                  <button onClick={() => publicar(n)} title="Publicar" className="p-1.5 rounded hover:bg-chart-2/15 text-muted-foreground hover:text-chart-2"><Check className="w-3.5 h-3.5" /></button>
                )}
                <button onClick={() => start(n)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => del(n)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          {!isLoading && (!data || data.length === 0) && (
            <div className="py-12 text-center text-muted-foreground text-sm rounded-lg border border-dashed border-border">
              Nenhuma notícia cadastrada ainda.
            </div>
          )}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing === "new" ? "Nova notícia" : "Editar notícia"}</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div><Label className="text-xs">Título</Label><Input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} required /></div>
              <div><Label className="text-xs">Resumo</Label><Input value={form.resumo} onChange={(e) => set("resumo", e.target.value)} /></div>
              <div><Label className="text-xs">URL</Label><Input value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Fonte</Label><Input value={form.fonte} onChange={(e) => set("fonte", e.target.value)} /></div>
                <div><Label className="text-xs">Publicado em</Label><Input type="date" value={form.publicado_em} onChange={(e) => set("publicado_em", e.target.value)} /></div>
              </div>
              <div><Label className="text-xs">Tags</Label><Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="separadas por vírgula" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border">Cancelar</button>
                <button type="submit" className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground">Salvar</button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
