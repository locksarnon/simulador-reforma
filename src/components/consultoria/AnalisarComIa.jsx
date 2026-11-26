import React, { useEffect, useState } from "react";
import { Check, Copy, Loader2, Sparkles } from "lucide-react";
import { api } from "@/api/client";

export const AVISO = "Rascunho de apoio gerado por IA: não é parecer. Revise o texto, confira as fontes e assuma o conteúdo antes de usar.";
const MENSAGENS = [
  "Reunindo o contexto do projeto…",
  "Aplicando o roteiro do serviço…",
  "Pesquisando as fontes oficiais…",
  "Redigindo o rascunho…",
  "Ainda trabalhando: a pesquisa pode levar um ou dois minutos…",
];

/** Mensagem do carregamento conforme o tempo decorrido (uma a cada 12 s, parando na última). */
export const mensagemDoCarregamento = (segundos) => MENSAGENS[Math.min(Math.floor(segundos / 12), MENSAGENS.length - 1)];

function Carregando() {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => { const t = setInterval(() => setSegundos((s) => s + 1), 1000); return () => clearInterval(t); }, []);
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {mensagemDoCarregamento(segundos)}
    </p>
  );
}

function Copiar({ texto }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* sem permissão da área de transferência */ }
  };
  return (
    <button type="button" onClick={copiar} className="inline-flex items-center gap-1.5 border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
      {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

/** O resultado: o rascunho (ou a mensagem de que a IA não respondeu) e o aviso de apoio. */
export function Resultado({ resultado }) {
  if (!resultado) return null;
  if (!resultado.rascunho) {
    return <p role="status" className="border bg-muted/40 p-3 text-sm">{resultado.mensagem || "A IA não respondeu desta vez. Tente de novo em instantes."}</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rascunho para revisão{resultado.modelo ? ` · ${resultado.modelo}` : ""}</p>
        <Copiar texto={resultado.rascunho} />
      </div>
      <div className="max-h-[32rem] overflow-auto whitespace-pre-wrap border bg-background p-3 text-sm leading-relaxed" data-testid="rascunho-ia">{resultado.rascunho}</div>
      <p className="text-xs text-muted-foreground">{resultado.aviso || AVISO}</p>
    </div>
  );
}

/**
 * Botão "Analisar com IA" dos serviços de consultoria: pede ao servidor o rascunho de parecer do projeto (contexto padrão + roteiro do serviço).
 * Não grava nada; o consultor copia o texto, revisa e assume.
 */
/** `servico` pode ser o objeto do catálogo ({ nome }) ou só o nome. */
export const nomeDoServico = (servico) => (typeof servico === "string" ? servico : servico?.nome || "");

export default function AnalisarComIa({ projetoId, servico }) {
  const nome = nomeDoServico(servico);
  const [estado, setEstado] = useState("parado");
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const analisar = async () => {
    setEstado("carregando"); setErro(""); setResultado(null);
    try { setResultado(await api.post(`/consultoria/projetos/${projetoId}/analisar-ia`, {})); setEstado("pronto"); }
    catch (e) { setErro(e?.message || "Não foi possível pedir o rascunho agora."); setEstado("erro"); }
  };
  return (
    <section className="space-y-3 border bg-card p-4" aria-label="Analisar com IA">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Analisar com IA</h2>
          <p className="text-xs text-muted-foreground">Monta um rascunho de parecer{nome ? ` de "${nome}"` : ""} com o contexto do projeto. É apoio: o consultor revisa e assume o texto.</p>
        </div>
        <button type="button" onClick={analisar} disabled={estado === "carregando"} className="inline-flex items-center gap-2 border bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <Sparkles className="h-4 w-4" aria-hidden="true" /> {estado === "pronto" || estado === "erro" ? "Analisar de novo" : "Analisar com IA"}
        </button>
      </div>
      {estado === "carregando" && <Carregando />}
      {estado === "erro" && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {estado === "pronto" && <Resultado resultado={resultado} />}
    </section>
  );
}
