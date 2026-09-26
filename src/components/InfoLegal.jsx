import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { api } from "@/api/base44Client";
import { FUNDAMENTOS } from "@/lib/fundamentosLegais";
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
        {aberto && f.refs.map((r) => <Dispositivo key={r.norma + r.caminho} {...r} />)}
        {!f.revisado && <p className="text-[10px] text-amber-700 dark:text-amber-400">Ligação entre o cálculo e o artigo ainda em revisão pelo especialista tributário.</p>}
      </PopoverContent>
    </Popover>
  );
}
