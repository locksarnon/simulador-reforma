import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Send, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { api } from "@/api/base44Client";
import { CartaoResposta } from "@/components/base-legal/CartoesLegais";

const EXEMPLOS = [
  "Qual o limite de receita para o produtor rural não ser contribuinte do IBS e da CBS?",
  "Se o produtor rural passar do limite no meio do ano, quando ele vira contribuinte?",
  "Quando o crédito de IBS e CBS pode ser apropriado?",
  "Como funciona o split payment?",
];

function Fundamentos({ itens }) {
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

function Resultado({ r }) {
  const [voto, setVoto] = useState(null);
  const votar = async (util) => {
    setVoto(util);
    try { await api.put(`/base-legal/perguntas/${r.id}/feedback`, { util }); } catch { /* o voto é opcional */ }
  };
  const semIa = r.motivo === "sem_ia" || r.motivo === "erro_ia";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {r.suficiente ? (
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{r.resposta}</p>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">{semIa ? "O assistente não está disponível agora." : "Não encontrei base suficiente nas normas carregadas."}</p>
            {r.resposta && !semIa && <p className="text-muted-foreground whitespace-pre-wrap">{r.resposta}</p>}
            {r.motivo === "sem_base" && <p className="text-muted-foreground">Tente outras palavras ou o número do artigo na busca abaixo.</p>}
          </div>
        </div>
      )}
      {r.ressalvas && <p className="text-sm rounded-lg bg-muted/60 p-3"><b>Atenção:</b> {r.ressalvas}</p>}
      <Fundamentos itens={r.fundamentos} />
      {!r.suficiente && r.relacionados?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dispositivos que podem ajudar</p>
          <div className="flex flex-wrap gap-2">
            {r.relacionados.map((x) => <Link key={x.norma + x.caminho} to={`/base-legal/${x.norma}/${x.caminho}`} className="px-2.5 py-1 rounded-md border border-border text-xs hover:bg-muted">{x.numero} — {x.rotulo}</Link>)}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground max-w-xl">{r.aviso}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {voto === null ? <>Ajudou? <button type="button" onClick={() => votar(true)} className="p-1.5 rounded-md border border-border hover:bg-muted" aria-label="Ajudou"><ThumbsUp className="w-3.5 h-3.5" /></button><button type="button" onClick={() => votar(false)} className="p-1.5 rounded-md border border-border hover:bg-muted" aria-label="Não ajudou"><ThumbsDown className="w-3.5 h-3.5" /></button></> : "Obrigado pelo retorno."}
        </div>
      </div>
    </div>
  );
}

function PerguntasRecentes() {
  const { data = [] } = useQuery({ queryKey: ["base-legal-perguntas"], queryFn: () => api.get("/base-legal/perguntas") });
  return (
    <details className="text-sm rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-medium">Perguntas recentes dos consultores ({data.length})</summary>
      <p className="text-xs text-muted-foreground mt-1">Visível só para administradores. Perguntas sem resposta suficiente ou com voto negativo mostram onde falta norma ou cartão revisado.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead><tr className="bg-muted/60 text-left"><th className="p-2 border border-border">Quando</th><th className="p-2 border border-border">Quem</th><th className="p-2 border border-border">Pergunta</th><th className="p-2 border border-border">Respondeu?</th><th className="p-2 border border-border">Útil?</th></tr></thead>
          <tbody>{data.map((p) => (
            <tr key={p.id} className="align-top">
              <td className="p-2 border border-border whitespace-nowrap">{new Date(p.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
              <td className="p-2 border border-border">{p.user_email}</td>
              <td className="p-2 border border-border">{p.pergunta}</td>
              <td className="p-2 border border-border">{p.suficiente ? "Sim" : "Não"}</td>
              <td className="p-2 border border-border">{p.util === true ? "👍" : p.util === false ? "👎" : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </details>
  );
}

/** "Perguntas ao assistente": responde só com o texto das normas carregadas, sempre citando o dispositivo. */
export default function AssistenteLegal({ admin }) {
  const [pergunta, setPergunta] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState(null);
  const [revisados, setRevisados] = useState([]);

  const perguntar = async (texto = pergunta) => {
    const t = texto.trim();
    if (t.length < 8 || carregando) return;
    setCarregando(true); setErro(""); setResultado(null); setRevisados([]);
    // Respostas já revisadas pela equipe aparecem primeiro (não dependem da IA).
    api.get("/base-legal/cartoes/busca", { q: t }).then(setRevisados).catch(() => {});
    try { setResultado(await api.post("/base-legal/perguntar", { pergunta: t })); }
    catch (e) { setErro(e.message || "Não foi possível consultar agora."); }
    finally { setCarregando(false); }
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium flex items-center gap-2"><Sparkles className="w-4 h-4" /> Perguntas ao assistente</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Pergunte com as suas palavras. A resposta vem só do texto das normas abaixo e cita o artigo.</p>
      </div>
      <div className="flex gap-2 items-start max-w-3xl">
        <textarea
          value={pergunta} onChange={(e) => setPergunta(e.target.value)} rows={2} maxLength={600}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) perguntar(); }}
          placeholder="Ex.: Até quanto de receita o produtor rural fica fora do IBS e da CBS?"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-y min-h-[3.25rem]" aria-label="Pergunta ao assistente"
        />
        <button type="button" onClick={() => perguntar()} disabled={carregando || pergunta.trim().length < 8} className="h-[3.25rem] px-4 inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
          {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Perguntar
        </button>
      </div>
      {!resultado && !carregando && (
        <div className="flex flex-wrap gap-2 max-w-3xl">
          {EXEMPLOS.map((e) => <button key={e} type="button" onClick={() => { setPergunta(e); perguntar(e); }} className="px-2.5 py-1 rounded-full border border-border text-xs text-muted-foreground hover:bg-muted text-left">{e}</button>)}
        </div>
      )}
      {carregando && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Consultando as normas… pode levar até 30 segundos.</p>}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {revisados.length > 0 && (
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Respostas revisadas para perguntas parecidas</p>
          {revisados.map((c, i) => <CartaoResposta key={c.id} c={c} admin={admin} aberto={i === 0} />)}
        </div>
      )}
      {resultado && (
        <div className="max-w-3xl space-y-2">
          {revisados.length > 0 && <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resposta do assistente (não revisada)</p>}
          <Resultado key={resultado.id} r={resultado} />
        </div>
      )}
      {admin && <div className="max-w-3xl pt-2"><PerguntasRecentes /></div>}
    </section>
  );
}
