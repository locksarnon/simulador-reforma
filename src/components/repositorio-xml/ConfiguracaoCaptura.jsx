import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileDown, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ROTULO = { NFE: "NF-e recebidas", CTE: "CT-e", NFSE: "NFS-e Nacional" };

/** Administração > Integrações > Captura de XML: a regra única de todos os clientes (período, documentos e Ciência da Operação). */
export default function ConfiguracaoCaptura() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["captura-xml", "configuracao"], queryFn: () => api.get("/captura-xml/configuracao") });
  const empresas = useQuery({ queryKey: ["captura-xml", "empresas"], queryFn: () => api.get("/captura-xml/empresas") });
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState(null);
  useEffect(() => { if (q.data && aberto) setF({ periodo: q.data.periodo, tipos: q.data.tipos, ciencia: q.data.ciencia, confirmo_ciencia: false, confirmo_sem_concorrente: !!q.data.sem_concorrente_em }); }, [q.data, aberto]);
  const salvar = useMutation({
    mutationFn: () => api.put("/captura-xml/configuracao", f),
    onSuccess: (r) => { qc.setQueryData(["captura-xml", "configuracao"], r); qc.invalidateQueries({ queryKey: ["captura-xml"] }); setAberto(false); toast({ title: "Configuração da captura salva" }); },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  const c = q.data;
  const ligadas = Object.values(empresas.data || {}).filter((x) => x.ligada).length;
  return (
    <section className="rounded-xl border border-border bg-card md:col-span-2 xl:col-span-3" aria-label="Captura de XML">
      <button type="button" onClick={() => setAberto(true)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/40">
        <FileDown className="h-5 w-5 text-primary" aria-hidden="true" />
        <span className="flex-1">
          <span className="block font-heading text-sm font-semibold">Captura de XML</span>
          <span className="block text-xs text-muted-foreground">{c ? `${c.periodo_texto} · ${c.tipos.map((t) => ROTULO[t] || t).join(", ") || "nenhum documento"} · Ciência ${c.ciencia ? "ligada" : "desligada"} · ${ligadas} cliente(s) com a captura ligada` : "Carregando…"}</span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </button>
      <Dialog open={aberto} onOpenChange={(v) => !salvar.isPending && setAberto(v)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Captura de XML</DialogTitle>
            <DialogDescription>Vale para todos os clientes. Cada cliente é ligado ou desligado na lista de clientes.</DialogDescription>
          </DialogHeader>
          {f && c && (
            <div className="space-y-4 text-sm">
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">Período da busca automática</span>
                <select value={f.periodo} onChange={(e) => setF({ ...f, periodo: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2">
                  {c.periodos.map((p) => <option key={p.valor} value={p.valor}>{p.texto}</option>)}
                </select></label>
              <fieldset className="space-y-1"><legend className="text-xs text-muted-foreground">Documentos capturados</legend>
                {c.tipos_disponiveis.map((t) => (
                  <label key={t} className="flex items-center gap-2"><input type="checkbox" checked={f.tipos.includes(t)} onChange={(e) => setF({ ...f, tipos: e.target.checked ? [...f.tipos, t] : f.tipos.filter((x) => x !== t) })} />{ROTULO[t] || t}</label>
                ))}
              </fieldset>
              <fieldset className="space-y-1"><legend className="text-xs text-muted-foreground">Ciência da Operação automática (libera o XML completo das NF-e recebidas)</legend>
                <label className="flex items-center gap-2"><input type="checkbox" checked={f.ciencia} onChange={(e) => setF({ ...f, ciencia: e.target.checked })} />Registrar a Ciência em nome dos clientes</label>
                {f.ciencia && !c.ciencia && (
                  <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={f.confirmo_ciencia} onChange={(e) => setF({ ...f, confirmo_ciencia: e.target.checked })} />Confirmo que os clientes autorizaram o registro da Ciência em nome do CNPJ deles; a manifestação conclusiva (em até 90 dias) continua sendo deles (Ajuste SINIEF 07/05, cl. 15-C).</label>
                )}
                {c.ciencia && c.ciencia_consentida_por && <p className="text-[11px] text-muted-foreground">Autorizada por {c.ciencia_consentida_por}.</p>}
              </fieldset>
              <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={f.confirmo_sem_concorrente} onChange={(e) => setF({ ...f, confirmo_sem_concorrente: e.target.checked })} />Confirmo que nenhum outro sistema (ERP, outro captador) consulta a Distribuição de DF-e dos clientes ligados: consultas ao mesmo CNPJ bloqueiam os dois por 1 hora.</label>
              {!c.agendador_ativo && <p className="text-xs text-amber-700 dark:text-amber-400">Agendador desligado neste servidor: só o "Capturar agora" funciona.</p>}
            </div>
          )}
          <DialogFooter>
            <button type="button" onClick={() => setAberto(false)} disabled={salvar.isPending} className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted">Cancelar</button>
            <button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending || !f || (f.ciencia && !c?.ciencia && !f.confirmo_ciencia)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Salvar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
