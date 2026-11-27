import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Globe, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { api } from "@/api/client";

export const AVISO = "Rascunho de apoio gerado por IA: não é parecer. Revise o texto, confira as fontes e assuma o conteúdo antes de usar.";
export const ROTULO_MODO = { rapido: "rascunho rápido (base legal do InTAX)", pesquisa: "com pesquisa externa" };
/** De quanto em quanto tempo a tela pergunta ao servidor se o rascunho ficou pronto. */
export const INTERVALO_CONSULTA_MS = 4000;

/** Mensagem do andamento conforme o modo e o tempo decorrido. */
export function mensagemDoCarregamento(modo, segundos) {
  const s = Math.max(0, Math.floor(segundos || 0));
  if (modo === "pesquisa") return s < 90 ? `Pesquisando fontes externas e redigindo o rascunho… (${s} s)` : `Ainda pesquisando: a pesquisa externa pode levar até 3 minutos… (${s} s)`;
  return s < 30 ? `Preparando o rascunho com o contexto do projeto e a base legal do InTAX… (${s} s)` : `Quase lá: o rascunho rápido leva até 1 minuto… (${s} s)`;
}

export const dataHora = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const segundosDesde = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 1000 : 0);

function Andamento({ modo, iniciadoEm }) {
  const [segundos, setSegundos] = useState(() => segundosDesde(iniciadoEm));
  useEffect(() => { const t = setInterval(() => setSegundos(segundosDesde(iniciadoEm)), 1000); return () => clearInterval(t); }, [iniciadoEm]);
  return (
    <div role="status" aria-live="polite" className="space-y-1 border bg-muted/40 p-3 text-sm">
      <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {mensagemDoCarregamento(modo, segundos)}</p>
      <p className="text-xs text-muted-foreground">Pode sair desta página; o rascunho fica salvo aqui.</p>
    </div>
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

/** O último rascunho guardado: data, modo e motor usados, o texto e o aviso de apoio. */
export function Resultado({ ultimo, aviso }) {
  if (!ultimo?.rascunho) return null;
  const detalhes = [dataHora(ultimo.gerado_em), ROTULO_MODO[ultimo.modo], ultimo.modelo].filter(Boolean).join(" · ");
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Último rascunho{detalhes ? ` · ${detalhes}` : ""}</p>
        <Copiar texto={ultimo.rascunho} />
      </div>
      <div className="max-h-[32rem] overflow-auto whitespace-pre-wrap border bg-background p-3 text-sm leading-relaxed" data-testid="rascunho-ia">{ultimo.rascunho}</div>
      <p className="text-xs text-muted-foreground">{aviso || AVISO}</p>
    </div>
  );
}

/** `servico` pode ser o objeto do catálogo ({ nome }) ou só o nome. */
export const nomeDoServico = (servico) => (typeof servico === "string" ? servico : servico?.nome || "");

const botao = "botao-acao inline-flex items-center gap-2 px-3 py-[7px] text-sm font-medium disabled:opacity-50";

/** O quadro em si, sem chamadas ao servidor (testável). `info` é o estado devolvido pelo servidor. */
export function PainelAnalise({ nome, info, erro, enviando, aoPedir }) {
  const emAndamento = info?.estado === "EM_ANDAMENTO";
  const ocupado = emAndamento || enviando;
  return (
    <section className="space-y-3 border bg-card p-4" aria-label="Analisar com IA">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Analisar com IA</h2>
          <p className="text-xs text-muted-foreground">Monta em até um minuto um rascunho de parecer{nome ? ` de "${nome}"` : ""} com o contexto do projeto e a base legal do InTAX. Para conferir vigência e regulamentação na web, use a pesquisa externa (até 3 minutos). É apoio: o consultor revisa e assume o texto.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => aoPedir("rapido")} disabled={ocupado} className={`${botao} bg-primary text-primary-foreground hover:bg-primary/90`}>
            <Sparkles className="h-4 w-4" aria-hidden="true" /> {info?.ultimo ? "Analisar de novo" : "Analisar com IA"}
          </button>
          <button type="button" onClick={() => aoPedir("pesquisa")} disabled={ocupado} className={`${botao} bg-background hover:bg-muted`}>
            <Globe className="h-4 w-4" aria-hidden="true" /> Aprofundar com pesquisa externa
          </button>
        </div>
      </div>
      {emAndamento && <Andamento modo={info.modo} iniciadoEm={info.iniciado_em} />}
      {info?.estado === "ERRO" && info.mensagem && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border border-destructive/40 p-3 text-sm">
          <p>{info.mensagem}{info.ultimo ? " O último rascunho continua abaixo." : ""}</p>
          <button type="button" onClick={() => aoPedir(info.modo || "rapido")} disabled={ocupado} className={`${botao} bg-background hover:bg-muted`}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Tentar de novo
          </button>
        </div>
      )}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      <Resultado ultimo={info?.ultimo} aviso={info?.aviso} />
    </section>
  );
}

/**
 * Botão "Analisar com IA" dos serviços de consultoria. O pedido roda em segundo plano no servidor: a tela consulta o estado a cada poucos
 * segundos, pode ser fechada e, ao voltar, mostra o último rascunho guardado do projeto.
 */
export default function AnalisarComIa({ projetoId, servico }) {
  const nome = nomeDoServico(servico);
  const [info, setInfo] = useState(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const montado = useRef(true);
  const url = `/consultoria/projetos/${projetoId}/analisar-ia`;

  const consultar = useCallback(async () => {
    try { const r = await api.get(url); if (montado.current) setInfo(r); } catch { /* sem estado guardado à vista; o botão continua disponível */ }
  }, [url]);

  useEffect(() => { montado.current = true; consultar(); return () => { montado.current = false; }; }, [consultar]);
  useEffect(() => {
    if (info?.estado !== "EM_ANDAMENTO") return undefined;
    const t = setTimeout(consultar, INTERVALO_CONSULTA_MS);
    return () => clearTimeout(t);
  }, [info, consultar]);

  const pedir = async (modo) => {
    setEnviando(true); setErro("");
    try { const r = await api.post(url, { modo }); if (montado.current) setInfo(r); }
    catch (e) { if (montado.current) setErro(e?.message || "Não foi possível pedir o rascunho agora."); }
    finally { if (montado.current) setEnviando(false); }
  };

  return <PainelAnalise nome={nome} info={info} erro={erro} enviando={enviando} aoPedir={pedir} />;
}
