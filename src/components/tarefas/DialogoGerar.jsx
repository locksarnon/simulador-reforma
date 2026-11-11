import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { competenciaAtual, nomeDaCompetencia } from "@/lib/tarefas";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Gerar as tarefas de um mês agora (sem esperar a rodada automática), com uma prévia do que será criado. */
export default function DialogoGerar({ processos, processoInicial, aoFechar }) {
  const qc = useQueryClient();
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [modelo, setModelo] = useState(processoInicial || "");
  const [previa, setPrevia] = useState(null);
  const corpo = (simular) => ({ competencia, modelo_id: modelo || undefined, simular });
  const ver = useMutation({
    mutationFn: () => api.post("/processos/gerar", corpo(true)),
    onSuccess: setPrevia,
    onError: (e) => toast({ title: "Não foi possível calcular", description: e.message, variant: "destructive" }),
  });
  const gerar = useMutation({
    mutationFn: () => api.post("/processos/gerar", corpo(false)),
    onSuccess: (r) => {
      toast({ title: r.criadas ? "Tarefas criadas" : "Nada a criar", description: `${r.criadas} nova(s); ${r.existentes} já existia(m) para ${nomeDaCompetencia(competencia)}.` });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      aoFechar();
    },
    onError: (e) => toast({ title: "Não foi possível gerar", description: e.message, variant: "destructive" }),
  });
  const mudarCompetencia = (v) => { setCompetencia(v); setPrevia(null); };
  const mudarModelo = (v) => { setModelo(v); setPrevia(null); };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar tarefas agora</DialogTitle>
          <DialogDescription>Cria as tarefas dos processos ativos para o mês escolhido. O que já existe não é criado de novo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Mês do prazo</span>
            <input type="month" className={campo} value={competencia} onChange={(e) => mudarCompetencia(e.target.value)} /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Processo</span>
            <select className={campo} value={modelo} onChange={(e) => mudarModelo(e.target.value)}>
              <option value="">Todos os processos ativos</option>{processos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select></label>
          {previa && (
            <p role="status" className="rounded-md bg-muted/50 px-3 py-2">
              {previa.criadas === 0 ? "Nada a criar" : `Vai criar ${previa.criadas} tarefa(s)`}{previa.existentes ? `; ${previa.existentes} já existe(m)` : ""} em {nomeDaCompetencia(competencia)}.
            </p>
          )}
        </div>
        <DialogFooter>
          <button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
          <button type="button" onClick={() => ver.mutate()} disabled={!competencia || ver.isPending} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60">Ver o que será criado</button>
          <button type="button" onClick={() => gerar.mutate()} disabled={!competencia || gerar.isPending || previa?.criadas === 0} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {gerar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Gerar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
