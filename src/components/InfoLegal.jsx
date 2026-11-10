import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Scale } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { FUNDAMENTOS } from "@/lib/fundamentosLegais";
import { fraseDaRevisao } from "@/lib/revisaoLegal";
import { toast } from "@/components/ui/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function Dispositivo({ norma, caminho }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["base-legal-disp", norma, caminho],
    queryFn: () => api.get(`/base-legal/normas/${norma}/dispositivos/${caminho}`),
    staleTime: 10 * 60_000,
  });
  if (isLoading) return <p className="text-xs text-muted-foreground">Carregando o texto da lei…</p>;
  if (isError || !data) return <p className="text-xs text-muted-foreground">Texto indisponível agora. <Link className="underline" to={`/base-legal/${norma}/${caminho}`}>Abrir na Base legal</Link></p>;
  const texto = data.dispositivo.texto;
  return (
    <div className="rounded-md border border-border p-2">
      <Link to={`/base-legal/${norma}/${caminho}`} className="text-xs font-medium text-primary hover:underline">{data.norma.numero} — {data.dispositivo.rotulo}</Link>
      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{texto.length > 420 ? `${texto.slice(0, 420).trim()}…` : texto}</p>
    </div>
  );
}

/** Aviso quando o texto de um artigo citado pela nota mudou na Base legal depois da última conferência. */
function RevisaoDaNota({ chave }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [conferindo, setConferindo] = useState(false);
  const { data: linhas = [] } = useQuery({
    queryKey: ["base-legal-revisoes", "fundamento"],
    queryFn: () => api.get("/base-legal/revisoes", { tipo: "fundamento" }),
    staleTime: 5 * 60_000,
  });
  const daNota = linhas.filter((l) => l.alvo_id === chave);
  if (!daNota.length) return null;

  const conferir = async () => {
    setConferindo(true);
    try {
      await api.post(`/base-legal/revisoes/fundamento/${chave}/conferir`, {});
      qc.invalidateQueries({ queryKey: ["base-legal-revisoes"] });
      toast({ title: "Nota conferida" });
    } catch (e) {
      toast({ title: "Não foi possível concluir", description: e.message, variant: "destructive" });
    } finally { setConferindo(false); }
  };

  return (
    <div role="status" className="rounded-md border border-amber-500/50 bg-amber-50/60 dark:bg-amber-950/10 p-2 space-y-1">
      <p className="text-xs font-medium flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> O texto da lei mudou depois desta nota</p>
      <ul className="list-disc pl-4 text-[11px] text-muted-foreground space-y-0.5">{daNota.map((l) => <li key={l.id}>{fraseDaRevisao(l)}</li>)}</ul>
      <p className="text-[11px]">A nota ainda não foi conferida contra a redação nova.</p>
      {user?.role === "admin" && (
        <button type="button" disabled={conferindo} onClick={conferir} className="mt-1 px-2 py-1 rounded-md border border-border text-[11px] hover:bg-muted disabled:opacity-50">Marcar como conferida</button>
      )}
    </div>
  );
}

/**
 * Ícone "base legal": abre o(s) artigo(s) em que o cálculo se apoia, com o trecho da Base legal e o link.
 * Uso: <InfoLegal chave="credito_ibs_cbs" />  (chaves em src/lib/fundamentosLegais.js)
 */
export default function InfoLegal({ chave }) {
  const [aberto, setAberto] = useState(false);
  const f = FUNDAMENTOS[chave];
  if (!f) return null;
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Base legal: ${f.titulo}`} className="inline-flex align-middle ml-1 text-muted-foreground hover:text-primary" onClick={(e) => e.stopPropagation()}>
          <Scale className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" collisionPadding={16} className="w-[26rem] max-w-[90vw] p-3 space-y-2" onOpenAutoFocus={(e) => e.preventDefault()}>
        <p className="text-sm font-medium">{f.titulo}</p>
        <p className="text-xs leading-relaxed">{f.nota}</p>
        {aberto && <RevisaoDaNota chave={chave} />}
        {aberto && f.refs.map((r) => <Dispositivo key={r.norma + r.caminho} {...r} />)}
        {!f.revisado && <p className="text-[10px] text-amber-700 dark:text-amber-400">Ligação entre o cálculo e o artigo ainda em revisão pelo especialista tributário.</p>}
      </PopoverContent>
    </Popover>
  );
}
