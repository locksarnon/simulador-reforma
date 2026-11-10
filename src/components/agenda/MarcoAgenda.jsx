import React, { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { oQueMudou } from "@/lib/revisaoLegal";
import { fmtIso, periodoDoMarco, regimesDoMarco, situacaoEmPalavras, textoDaFonte, ufsDoMarco } from "@/lib/agendaReforma";

function Selo({ className = "", children }) {
  return <span className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${className}`}>{children}</span>;
}

function Fonte({ f }) {
  return (
    <li className="text-xs space-y-1">
      <p>
        {textoDaFonte(f)}
        <span className="inline-flex flex-wrap gap-x-3 gap-y-1 ml-2 align-middle">
          {f.norma_chave && f.caminho && <Link to={`/base-legal/${f.norma_chave}/${f.caminho}`} className="text-primary hover:underline">Abrir na Base legal</Link>}
          <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="w-3 h-3" /> Fonte oficial</a>
        </span>
      </p>
      {f.trecho && <p className="border-l-2 border-border pl-2 italic text-muted-foreground">“{f.trecho}”</p>}
    </li>
  );
}

/** Aviso quando a fonte do marco mudou na Base legal e ninguém conferiu a data de novo. O administrador confere por aqui. */
function FonteEmRevisao({ m, admin, onConferido }) {
  const [ocupado, setOcupado] = useState(false);
  const conferir = async () => {
    setOcupado(true);
    try {
      await api.post(`/base-legal/revisoes/marco/${m.id}/conferir`, {});
      toast({ title: "Marco conferido" });
      onConferido?.();
    } catch (e) {
      toast({ title: "Não foi possível concluir", description: e.message, variant: "destructive" });
    } finally { setOcupado(false); }
  };
  const critica = m.em_revisao.some((r) => r.critica);
  return (
    <div role="status" className={`mt-2 rounded-lg border p-2.5 space-y-1 ${critica ? "border-red-500/50 bg-red-50/60 dark:bg-red-950/10" : "border-amber-500/50 bg-amber-50/60 dark:bg-amber-950/10"}`}>
      <p className="text-xs font-medium flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {critica ? "A data pode ter deixado de valer: o dispositivo citado como fonte foi revogado ou o trecho de onde a data foi lida saiu do texto da lei" : "O texto da lei citado como fonte mudou depois da última conferência desta data"}</p>
      <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
        {m.em_revisao.map((r) => <li key={r.id}><Link to={`/base-legal/${r.norma}/${r.caminho}`} className="underline">{r.rotulo}</Link> {oQueMudou(r)}</li>)}
      </ul>
      <p className="text-xs">{critica ? "Enquanto não for conferida, esta data não gera lembrete por e-mail. " : ""}Confirme a data no texto oficial antes de agir.</p>
      {admin && (
        <button type="button" onClick={conferir} disabled={ocupado} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50">
          {ocupado ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Marcar como conferido
        </button>
      )}
    </div>
  );
}

/** Um marco ou prazo da agenda, sempre com a fonte oficial (instrumento, dispositivo, data do ato e o trecho de onde a data foi lida). */
export default function MarcoAgenda({ m, admin = false, onConferido }) {
  const ufs = ufsDoMarco(m);
  const encerrado = m.situacao === "passado";
  return (
    <li className={`rounded-xl border bg-card p-4 ${m.em_revisao?.length ? "border-amber-500/50" : "border-border"} ${encerrado ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <Selo className="bg-primary/10 text-primary">{m.categoria}</Selo>
            <Selo className="bg-muted text-muted-foreground">{m.tipo === "prazo" ? "Prazo" : "Marco"}</Selo>
            {!m.confirmado && <Selo className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Não confirmado em fonte oficial</Selo>}
            {m.em_revisao?.length > 0 && <Selo className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Fonte em revisão</Selo>}
          </div>
          <h3 className="text-sm font-semibold leading-snug">{m.titulo}</h3>
          <p className="text-xs text-muted-foreground mt-0.5"><span className="font-medium text-foreground">{periodoDoMarco(m)}</span> · {situacaoEmPalavras(m)}</p>
        </div>
        <p className="text-xs text-muted-foreground sm:text-right">{regimesDoMarco(m)}{ufs && <><br />UF: {ufs}</>}</p>
      </div>
      <p className="text-sm leading-relaxed mt-2">{m.descricao}</p>
      {m.observacao && <p className="text-xs rounded-md bg-muted/60 p-2 mt-2">{m.observacao}</p>}
      {m.em_revisao?.length > 0 && <FonteEmRevisao m={m} admin={admin} onConferido={onConferido} />}
      <div className="mt-3 pt-2 border-t border-border">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{m.fontes.length === 1 ? "Fonte oficial" : "Fontes oficiais"}</p>
        <ul className="space-y-2">{m.fontes.map((f, i) => <Fonte key={`${f.dispositivo}-${i}`} f={f} />)}</ul>
        {m.confirmado && m.lida_em && <p className="text-[11px] text-muted-foreground mt-1.5">Data conferida no texto oficial em {fmtIso(m.lida_em)}.</p>}
      </div>
    </li>
  );
}
