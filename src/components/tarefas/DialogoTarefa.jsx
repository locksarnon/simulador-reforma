import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SeletorDeEmpresa from "@/components/SeletorDeEmpresa";
import { PRIORIDADES, STATUS } from "@/lib/tarefas";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Nova tarefa ou edição de uma existente. Tarefa gerada por processo mantém o vínculo; o título e a empresa dela continuam editáveis. */
export default function DialogoTarefa({ tarefa, empresas, colaboradores, usuarioId, empresaInicial, aoFechar }) {
  const qc = useQueryClient();
  const editando = !!tarefa;
  const [f, setF] = useState({
    titulo: tarefa?.titulo || "",
    descricao: tarefa?.descricao || "",
    empresa_id: tarefa?.empresa_id || empresaInicial || "",
    responsavel: tarefa ? tarefa.responsavel || "" : usuarioId || "",
    prazo: tarefa?.prazo ? String(tarefa.prazo).slice(0, 10) : "",
    prioridade: tarefa?.prioridade || "NORMAL",
    status: tarefa?.status || "ABERTA",
  });
  const mudar = (k, v) => setF((e) => ({ ...e, [k]: v }));
  const salvar = useMutation({
    mutationFn: () => {
      const corpo = { titulo: f.titulo, descricao: f.descricao || null, empresa_id: f.empresa_id || null, responsavel: f.responsavel || null, prazo: f.prazo || null, prioridade: f.prioridade };
      return editando ? api.put(`/tarefas/${tarefa.id}`, { ...corpo, status: f.status }) : api.post("/tarefas", corpo);
    },
    onSuccess: () => { toast({ title: editando ? "Tarefa salva" : "Tarefa criada" }); qc.invalidateQueries({ queryKey: ["tarefas"] }); aoFechar(); },
    onError: (e) => toast({ title: "Não foi possível salvar a tarefa", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          <DialogDescription>{tarefa?.modelo_id ? `Processo recorrente (${tarefa.competencia}).` : "Tarefa avulsa."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (f.titulo.trim()) salvar.mutate(); }} className="space-y-3 text-sm">
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Título</span>
            <input className={campo} value={f.titulo} maxLength={200} onChange={(e) => mudar("titulo", e.target.value)} autoFocus required /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Descrição (opcional)</span>
            <textarea className={`${campo} min-h-[72px]`} value={f.descricao} maxLength={2000} onChange={(e) => mudar("descricao", e.target.value)} /></label>
          <SeletorDeEmpresa empresas={empresas} valor={f.empresa_id} aoMudar={(v) => mudar("empresa_id", v)} />
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Responsável</span>
              <select className={campo} value={f.responsavel} onChange={(e) => mudar("responsavel", e.target.value)}>
                <option value="">Sem responsável</option>{colaboradores.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}
              </select></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Prazo (opcional)</span>
              <input type="date" className={campo} value={f.prazo} onChange={(e) => mudar("prazo", e.target.value)} /></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Prioridade</span>
              <select className={campo} value={f.prioridade} onChange={(e) => mudar("prioridade", e.target.value)}>{Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            {editando && (
              <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Situação</span>
                <select className={campo} value={f.status} onChange={(e) => mudar("status", e.target.value)}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            )}
          </div>
          <DialogFooter>
            <button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={!f.titulo.trim() || salvar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">
              {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
