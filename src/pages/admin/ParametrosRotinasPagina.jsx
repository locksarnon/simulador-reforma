import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import AvisoDoModo from "@/components/monitoramento/AvisoDoModo";
import { useEstadoMonitoramento } from "@/lib/monitoramento";
import { useCarteiras } from "@/lib/useCarteiras";
import { naCarteira } from "@/lib/servicos";
import { plural } from "@/lib/plural";

const campo = "w-20 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Administração > Parâmetros e rotinas: o dia do mês da consulta automática de cada assunto e o dia do envio das guias. */
export default function ParametrosRotinasPagina() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const estado = useEstadoMonitoramento();
  const rotina = useQuery({ queryKey: ["monitoramento", "rotina"], queryFn: () => api.get("/monitoramento/rotina"), enabled: user?.role === "admin" });
  const { empresas, mapa } = useCarteiras();
  const [edicao, setEdicao] = useState(null);
  const cfg = edicao ?? rotina.data ?? null;
  const setCfg = (f) => setEdicao((e) => (typeof f === "function" ? f(e ?? rotina.data) : f));
  const salvar = useMutation({
    mutationFn: () => api.put("/monitoramento/rotina", cfg),
    onSuccess: (c) => { setCfg(c); qc.setQueryData(["monitoramento", "rotina"], c); toast({ title: "Rotinas salvas" }); },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  const bpo = empresas.filter((e) => naCarteira(mapa.get(e.id)?.BPO_FISCAL));
  const guiasAgora = useMutation({
    mutationFn: () => api.post("/monitoramento/guias", { empresa_ids: bpo.map((e) => e.id), enviar_email: !!cfg?.guias?.enviar_email }),
    onSuccess: (r) => toast({ title: `${plural(r.geradas, "guia gerada", "guias geradas")}${r.enviadas ? `, ${plural(r.enviadas, "enviada", "enviadas")} por e-mail` : ""}`, description: r.falhas.length ? `Sem guia: ${r.falhas.slice(0, 5).join("; ")}${r.falhas.length > 5 ? "…" : ""}` : undefined }),
    onError: (e) => toast({ title: "Não foi possível gerar", description: e.message, variant: "destructive" }),
  });
  const crumbs = [{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Parâmetros e rotinas" }];
  if (user?.role !== "admin") return <div><PageHeader crumbs={crumbs} title="Parâmetros e rotinas" /><p role="alert" className="p-8 text-sm">Somente administradores mudam as rotinas.</p></div>;
  const grupos = (estado.data?.grupos || []).filter((g) => g.id !== "processos");
  const mudarDia = (g, v) => setCfg((c) => ({ ...c, dias: { ...c.dias, [g]: Math.max(0, Math.min(28, Number(v) || 0)) } }));

  return (
    <div>
      <PageHeader crumbs={crumbs} title="Parâmetros e rotinas" />
      <div className="px-6 lg:px-8 py-5 space-y-4 max-w-3xl">
        <AvisoDoModo modo={estado.data?.modo} ehAdmin />
        {!cfg ? <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p> : (
          <>
            <section className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
              <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={cfg.ativa} onChange={(e) => setCfg((c) => ({ ...c, ativa: e.target.checked }))} /> Consulta automática ligada</label>
              <p className="text-xs text-muted-foreground">Às 06:30, no dia do mês (1 a 28; 0 desliga).</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {grupos.map((g) => <label key={g.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"><span>{g.rotulo}</span><span className="flex items-center gap-1 text-xs text-muted-foreground">dia <input type="number" min={0} max={28} className={campo} value={cfg.dias?.[g.id] ?? 0} onChange={(e) => mudarDia(g.id, e.target.value)} aria-label={`Dia da consulta de ${g.rotulo}`} /></span></label>)}
              </div>
            </section>
            <section className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
              <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={cfg.guias.ativa} onChange={(e) => setCfg((c) => ({ ...c, guias: { ...c.guias, ativa: e.target.checked } }))} /> Gerar as guias todo mês</label>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1">Dia <input type="number" min={1} max={28} className={campo} value={cfg.guias.dia} onChange={(e) => setCfg((c) => ({ ...c, guias: { ...c.guias, dia: Math.max(1, Math.min(28, Number(e.target.value) || 1)) } }))} /></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.guias.enviar_email} onChange={(e) => setCfg((c) => ({ ...c, guias: { ...c.guias, enviar_email: e.target.checked } }))} /> Enviar ao e-mail de contato do cliente</label>
              </div>
              <button type="button" onClick={() => guiasAgora.mutate()} disabled={guiasAgora.isPending || !bpo.length || estado.data?.modo === "DESLIGADO"} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-60">{guiasAgora.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Gerar as guias agora ({plural(bpo.length, "cliente", "clientes")})</button>
            </section>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar</button>
              <Link to="/bpo/monitoramento" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Ir para o monitoramento</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
