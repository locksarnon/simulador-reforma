import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCircle2, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { api } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const HOSTS = ["planalto.gov.br", "cgibs.gov.br", "gov.br"];
const urlOficial = (u) => { try { const x = new URL(u); return x.protocol === "https:" && HOSTS.some((h) => x.hostname === h || x.hostname === `www.${h}`); } catch { return false; } };

function Alerta({ a, onFeito }) {
  const [url, setUrl] = useState(a.url || "");
  const [ocupado, setOcupado] = useState("");
  const nova = a.tipo === "nova_norma";

  const agir = async (acao) => {
    setOcupado(acao);
    try {
      const r = await api.post(`/base-legal/alertas/${a.id}/${acao}`, acao === "aprovar" && nova ? { url } : {});
      toast({
        title: acao === "aprovar" ? (nova ? "Norma incluída na Base legal" : "Texto atualizado") : "Alerta descartado",
        description: acao === "aprovar" && r?.resultado ? `${r.resultado.dispositivos} dispositivos · ${r.resultado.novos} novos · ${r.resultado.alterados} alterados.` : undefined,
      });
      onFeito();
    } catch (e) {
      toast({ title: "Não foi possível concluir", description: e.message, variant: "destructive" });
    } finally { setOcupado(""); }
  };

  return (
    <li className="py-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{a.titulo}</p>
          {a.detalhe && <p className="text-xs text-muted-foreground mt-0.5">{a.detalhe}</p>}
          <p className="text-[11px] text-muted-foreground mt-0.5">{a.origem === "radar" ? "Citada no Radar" : a.origem === "agendada" ? "Verificação semanal" : "Verificação"} · {new Date(a.createdAt).toLocaleDateString("pt-BR")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => agir("aprovar")} disabled={Boolean(ocupado) || (nova && !urlOficial(url))} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">
            {ocupado === "aprovar" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} {nova ? "Incluir na base" : "Atualizar texto"}
          </button>
          <button type="button" onClick={() => agir("descartar")} disabled={Boolean(ocupado)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50"><X className="w-3.5 h-3.5" /> Descartar</button>
        </div>
      </div>
      {nova && (
        <div className="flex items-center gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Endereço oficial da norma (https://www.planalto.gov.br/…)" className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="URL oficial da norma" />
          {url && urlOficial(url) && <a href={url} target="_blank" rel="noreferrer" className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><ExternalLink className="w-3 h-3" /> Abrir</a>}
        </div>
      )}
      {nova && url && !urlOficial(url) && <p className="text-[11px] text-amber-700 dark:text-amber-400">Use o endereço https da página com o texto da norma em planalto.gov.br ou cgibs.gov.br (PDF ainda não é suportado).</p>}
    </li>
  );
}

/** Painel do administrador: o que mudou nas fontes oficiais e normas novas citadas pelo Radar. Nada entra sem aprovação. */
export default function AlertasBaseLegal() {
  const qc = useQueryClient();
  const [verificando, setVerificando] = useState(false);
  const { data: alertas = [] } = useQuery({ queryKey: ["base-legal-alertas"], queryFn: () => api.get("/base-legal/alertas") });
  const recarregar = () => { qc.invalidateQueries({ queryKey: ["base-legal-alertas"] }); qc.invalidateQueries({ queryKey: ["base-legal-normas"] }); };

  const verificar = async () => {
    setVerificando(true);
    try {
      const r = await api.post("/base-legal/alertas/verificar", {});
      toast({ title: r.alertas ? `${r.alertas} atualização(ões) encontrada(s)` : "Tudo em dia", description: `${r.verificadas} normas conferidas nas fontes oficiais${r.erros?.length ? ` · ${r.erros.length} com erro` : ""}.` });
      recarregar();
    } catch (e) { toast({ title: "Não foi possível verificar", description: e.message, variant: "destructive" }); }
    finally { setVerificando(false); }
  };

  return (
    <section className={`rounded-xl border p-4 space-y-2 ${alertas.length ? "border-amber-500/50 bg-amber-50/60 dark:bg-amber-950/10" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium flex items-center gap-2"><BellRing className="w-4 h-4" /> Atualizações da Base legal {alertas.length > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">{alertas.length}</span>}</h2>
        <button type="button" onClick={verificar} disabled={verificando} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-60">
          {verificando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Verificar agora
        </button>
      </div>
      <p className="text-xs text-muted-foreground">A cada geração do Radar (segunda, 6h) e toda segunda às 6h30 conferimos as fontes oficiais. Mudanças de texto e normas novas citadas aparecem aqui e só entram na base depois da sua aprovação.</p>
      {alertas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma pendência.</p> : <ul className="divide-y divide-border">{alertas.map((a) => <Alerta key={a.id} a={a} onFeito={recarregar} />)}</ul>}
    </section>
  );
}
