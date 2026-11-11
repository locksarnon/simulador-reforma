import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ESCOPOS, MESES, PRIORIDADES, RECORRENCIAS } from "@/lib/tarefas";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Novo processo recorrente ou edição: o modelo da rotina que gera as tarefas de cada período. */
export default function DialogoProcesso({ processo, colaboradores, aoFechar }) {
  const qc = useQueryClient();
  const editando = !!processo;
  const [f, setF] = useState({
    nome: processo?.nome || "",
    descricao: processo?.descricao || "",
    recorrencia: processo?.recorrencia || "MENSAL",
    dia: processo?.dia ?? 10,
    mes: processo?.mes ?? 1,
    escopo: processo?.escopo || "POR_EMPRESA_BPO",
    responsavel: processo?.responsavel || "",
    prioridade: processo?.prioridade || "NORMAL",
  });
  const mudar = (k, v) => setF((e) => ({ ...e, [k]: v }));
  const salvar = useMutation({
    mutationFn: () => {
      const corpo = { nome: f.nome, descricao: f.descricao || null, recorrencia: f.recorrencia, dia: Number(f.dia), mes: f.recorrencia === "ANUAL" ? Number(f.mes) : null, escopo: f.escopo, responsavel: f.responsavel || null, prioridade: f.prioridade };
      return editando ? api.put(`/processos/${processo.id}`, corpo) : api.post("/processos", corpo);
    },
    onSuccess: () => { toast({ title: editando ? "Processo salvo" : "Processo criado" }); qc.invalidateQueries({ queryKey: ["processos"] }); aoFechar(); },
    onError: (e) => toast({ title: "Não foi possível salvar o processo", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar processo" : "Novo processo recorrente"}</DialogTitle>
          <DialogDescription>A rotina que se repete. O sistema cria a tarefa de cada período 10 dias antes do prazo, sem repetir as que já existem.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (f.nome.trim()) salvar.mutate(); }} className="space-y-3 text-sm">
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Nome (vira o título das tarefas)</span>
            <input className={campo} value={f.nome} maxLength={120} onChange={(e) => mudar("nome", e.target.value)} placeholder="Ex.: Conferir a apuração de ICMS" autoFocus required /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">O que fazer (opcional)</span>
            <textarea className={`${campo} min-h-[72px]`} value={f.descricao} maxLength={2000} onChange={(e) => mudar("descricao", e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Quando se repete</span>
              <select className={campo} value={f.recorrencia} onChange={(e) => mudar("recorrencia", e.target.value)}>{Object.entries(RECORRENCIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Dia do prazo (1 a 31)</span>
              <input type="number" min={1} max={31} className={campo} value={f.dia} onChange={(e) => mudar("dia", e.target.value)} /></label>
            {f.recorrencia === "ANUAL" && (
              <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Mês</span>
                <select className={campo} value={f.mes} onChange={(e) => mudar("mes", e.target.value)}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
            )}
            <label className="block space-y-1 col-span-2"><span className="block text-xs text-muted-foreground">Para quem</span>
              <select className={campo} value={f.escopo} onChange={(e) => mudar("escopo", e.target.value)}>{Object.entries(ESCOPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Responsável</span>
              <select className={campo} value={f.responsavel} onChange={(e) => mudar("responsavel", e.target.value)}>
                <option value="">Quem atende a empresa</option>{colaboradores.map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}
              </select></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Prioridade</span>
              <select className={campo} value={f.prioridade} onChange={(e) => mudar("prioridade", e.target.value)}>{Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <p className="text-[11px] text-muted-foreground">Sem responsável fixo, a tarefa de cada empresa vai para o colaborador dela, quando há um só; senão, fica sem responsável para a equipe distribuir.</p>
          <DialogFooter>
            <button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={!f.nome.trim() || salvar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">
              {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
