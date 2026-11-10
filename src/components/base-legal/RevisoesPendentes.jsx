import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { agruparRevisoes, oQueMudou, ROTULO_TIPO_REVISAO } from "@/lib/revisaoLegal";
import { toast } from "@/components/ui/use-toast";

function Item({ grupo, onFeito }) {
  const [ocupado, setOcupado] = useState(false);
  const conferivel = grupo.tipo !== "cartao";

  const conferir = async () => {
    setOcupado(true);
    try {
      await api.post(`/base-legal/revisoes/${grupo.tipo}/${grupo.alvo_id}/conferir`, {});
      toast({ title: grupo.tipo === "marco" ? "Marco conferido" : "Nota conferida" });
      onFeito();
    } catch (e) {
      toast({ title: "Não foi possível concluir", description: e.message, variant: "destructive" });
    } finally { setOcupado(false); }
  };

  return (
    <li className="py-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mr-1.5">{ROTULO_TIPO_REVISAO[grupo.tipo]}</span>{grupo.titulo}</p>
        <ul className="text-xs text-muted-foreground space-y-0.5">
          {grupo.linhas.map((l) => (
            <li key={l.id}><Link to={`/base-legal/${l.norma_chave}/${l.caminho}`} className="underline">{l.rotulo}</Link> {oQueMudou(l)}</li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-2">
        {grupo.tipo === "cartao" && <a href="#cartoes-legais" className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted">Abrir o cartão</a>}
        {grupo.tipo === "marco" && <Link to="/agenda-reforma" className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted">Ver na agenda</Link>}
        {conferivel && (
          <button type="button" onClick={conferir} disabled={ocupado} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">
            {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Marcar como conferido
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Painel do administrador: itens que citam um dispositivo da Base legal cujo texto mudou (cartões de pergunta frequente,
 * notas do cálculo e marcos da agenda). O cartão volta para rascunho e só reaparece depois de revisado; a nota e o marco
 * seguem visíveis com o aviso até a conferência. Nada é publicado de novo sem a sua aprovação.
 */
export default function RevisoesPendentes() {
  const qc = useQueryClient();
  const { data: linhas = [] } = useQuery({ queryKey: ["base-legal-revisoes", "todas"], queryFn: () => api.get("/base-legal/revisoes") });
  const grupos = agruparRevisoes(linhas);
  if (!grupos.length) return null;
  const recarregar = () => qc.invalidateQueries({ queryKey: ["base-legal-revisoes"] });

  return (
    <section aria-label="Itens para revisar" className="rounded-xl border border-amber-500/50 bg-amber-50/60 dark:bg-amber-950/10 p-4 space-y-2">
      <h2 className="text-sm font-medium flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> Itens para revisar porque o texto da lei mudou
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">{grupos.length}</span>
      </h2>
      <p className="text-xs text-muted-foreground">Estes itens citam dispositivos da Base legal que foram atualizados. Os cartões voltaram para rascunho e só reaparecem para os consultores depois de revisados; as notas do cálculo e os marcos da agenda seguem visíveis, com o aviso, até você conferir.</p>
      <ul className="divide-y divide-border">{grupos.map((g) => <Item key={`${g.tipo}:${g.alvo_id}`} grupo={g} onFeito={recarregar} />)}</ul>
    </section>
  );
}
