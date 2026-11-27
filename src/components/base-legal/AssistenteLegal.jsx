import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Globe, ThumbsDown, ThumbsUp } from "lucide-react";
import { api } from "@/api/client";
import TabelaPadrao from "@/components/TabelaPadrao";

export function Fundamentos({ itens }) {
  if (!itens?.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Base legal</p>
      <ul className="space-y-2">
        {itens.map((f) => (
          <li key={f.norma + f.caminho} className="rounded-lg border border-border p-3">
            <Link to={`/base-legal/${f.norma}/${f.caminho}`} className="text-sm font-medium text-primary hover:underline">{f.numero} — {f.rotulo}</Link>
            {f.trecho && <p className="text-sm text-muted-foreground mt-1 border-l-2 border-border pl-3 italic">“{f.trecho}”</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Fontes da pesquisa na web (só aparecem na pesquisa aprofundada): as oficiais primeiro, com o aviso de que a lei prevalece. */
export function FontesExternas({ itens }) {
  if (!itens?.length) return null;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Globe className="h-3.5 w-3.5" aria-hidden="true" /> Fontes externas consultadas</p>
      <ul className="space-y-1.5">
        {itens.map((f) => (
          <li key={f.dominio || f.url}>
            <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${f.oficial ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{f.oficial ? "Oficial" : "Contexto"}</span>
              <span className="min-w-0 flex-1 truncate">{f.dominio || f.titulo}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">Fontes de apoio: se divergirem do texto da lei carregado, vale o texto da lei. Confirme na fonte oficial antes de repassar ao cliente.</p>
    </div>
  );
}

export function Resultado({ r }) {
  const [voto, setVoto] = useState(null);
  const votar = async (util) => {
    setVoto(util);
    try { await api.put(`/base-legal/perguntas/${r.id}/feedback`, { util }); } catch { /* o voto é opcional */ }
  };
  const semIa = r.motivo === "sem_ia" || r.motivo === "erro_ia";

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      {r.suficiente ? (
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{r.resposta}</p>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">{semIa ? "O assistente não está disponível agora." : "A resposta precisa de uma verificação complementar."}</p>
            {r.resposta && <p className="text-muted-foreground whitespace-pre-wrap">{r.resposta}</p>}
            {r.motivo === "sem_base" && <p className="text-muted-foreground">Tente outras palavras ou o número do artigo na busca abaixo.</p>}
          </div>
        </div>
      )}
      {r.ressalvas && <p className="text-sm rounded-lg bg-muted/60 p-3"><b>Atenção:</b> {r.ressalvas}</p>}
      <Fundamentos itens={r.fundamentos} />
      <FontesExternas itens={r.fontes_externas} />
      {!r.suficiente && r.relacionados?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dispositivos que podem ajudar</p>
          <div className="flex flex-wrap gap-2">
            {r.relacionados.map((x) => <Link key={x.norma + x.caminho} to={`/base-legal/${x.norma}/${x.caminho}`} className="botao-acao px-2.5 py-[3px] rounded-md text-xs hover:bg-muted">{x.numero} — {x.rotulo}</Link>)}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground">{r.aviso}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {voto === null ? <>Ajudou? <button type="button" onClick={() => votar(true)} className="p-1.5 rounded-md border border-border hover:bg-muted" aria-label="Ajudou"><ThumbsUp className="w-3.5 h-3.5" /></button><button type="button" onClick={() => votar(false)} className="p-1.5 rounded-md border border-border hover:bg-muted" aria-label="Não ajudou"><ThumbsDown className="w-3.5 h-3.5" /></button></> : "Obrigado pelo retorno."}
        </div>
      </div>
    </div>
  );
}

export function PerguntasRecentes() {
  const { data = [] } = useQuery({ queryKey: ["base-legal-perguntas"], queryFn: () => api.get("/base-legal/perguntas") });
  return (
    <details className="text-sm rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-medium">Perguntas recentes dos consultores ({data.length})</summary>
      <div className="mt-3">
        <TabelaPadrao id="base-legal:perguntas-recentes" ariaLabel="Perguntas recentes dos consultores" linhas={data} ordemInicial={{ chave: "createdAt", dir: -1 }}
          colunas={[
            { chave: "createdAt", rotulo: "Quando", tipo: "data", render: (p) => new Date(p.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) },
            { chave: "user_email", rotulo: "Quem" },
            { chave: "pergunta", rotulo: "Pergunta", quebrar: true },
            { chave: "suficiente", rotulo: "Respondeu?", valor: (p) => (p.suficiente ? "Sim" : "Não") },
            { chave: "util", rotulo: "Útil?", valor: (p) => (p.util === true ? "Sim" : p.util === false ? "Não" : ""), render: (p) => (p.util === true ? "👍" : p.util === false ? "👎" : "—") },
          ]} />
      </div>
    </details>
  );
}
