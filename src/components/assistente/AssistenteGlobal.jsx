import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { ArrowUp, Check, Copy, RotateCcw, Scale, Sparkles, X } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { moduloDoCaminho } from "@/lib/navegacao";
import { temTela } from "@/lib/permissoes";
import {
  anexarAoHistorico, EVENTO_ASSISTENTE, gravarHistorico, lerHistorico, MAXIMO_PERGUNTA, mensagemDeEspera, perguntaValida, sugestoesDoContexto, temContextoProprio, textoParaCopiar,
} from "@/lib/assistente";
import { Resultado } from "@/components/base-legal/AssistenteLegal";
import { CartaoResposta } from "@/components/base-legal/CartoesLegais";

/** A esfera do assistente: gira devagar quando está pensando e respira quando parada. */
export function Orbe({ pensando = false, tamanho = 28 }) {
  return (
    <span className={`assistente-orbe ${pensando ? "assistente-orbe-pensando" : ""}`} style={{ width: tamanho, height: tamanho }} aria-hidden="true">
      <Sparkles style={{ width: tamanho * 0.5, height: tamanho * 0.5 }} className="relative text-white drop-shadow" />
    </span>
  );
}

function Pensando({ desde }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, []);
  const segundos = Math.max(0, Math.floor((agora - desde) / 1000));
  return (
    <div className="flex items-center gap-2.5 text-sm text-muted-foreground" role="status">
      <span className="flex items-center gap-1" aria-hidden="true">
        <i className="assistente-ponto" /><i className="assistente-ponto" style={{ animationDelay: "160ms" }} /><i className="assistente-ponto" style={{ animationDelay: "320ms" }} />
      </span>
      <span>{mensagemDeEspera(segundos)}</span>
    </div>
  );
}

function Copiar({ resultado }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(textoParaCopiar(resultado)); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* sem permissão da área de transferência */ }
  };
  return (
    <button type="button" onClick={copiar} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
      {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copiado ? "Copiado" : "Copiar resposta"}
    </button>
  );
}

export function Troca({ item, aoRepetir }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <p className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground assistente-entra-msg">{item.pergunta}</p>
      </div>
      <div className="flex items-start gap-2.5 assistente-entra-msg">
        <Orbe tamanho={26} pensando={item.estado === "carregando"} />
        <div className="min-w-0 flex-1 space-y-2.5">
          {item.estado === "carregando" && <Pensando desde={item.inicio} />}
          {item.revisados?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Resposta revisada pela equipe</p>
              {item.revisados.map((c, i) => <CartaoResposta key={c.id} c={c} admin={false} aberto={i === 0} />)}
            </div>
          )}
          {item.estado === "ok" && (
            <>
              {item.revisados?.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Resposta do assistente (não revisada)</p>}
              <Resultado key={item.resultado.id} r={item.resultado} />
              <Copiar resultado={item.resultado} />
            </>
          )}
          {item.estado === "erro" && (
            <div className="space-y-2 rounded-xl border border-red-300/60 bg-red-50 p-3 text-sm dark:border-red-900/60 dark:bg-red-950/20" role="alert">
              <p>{item.erro || "Não foi possível consultar agora."}</p>
              <button type="button" onClick={() => aoRepetir(item)} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Tentar de novo</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Assistente tributário: painel de conversa aberto pelo botão do rodapé do menu (ou Ctrl+/). Responde só com o texto das normas
 * carregadas na Base legal, citando o artigo; antes da resposta do assistente mostra as respostas já revisadas pela equipe.
 */
export default function AssistenteGlobal() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const modulo = moduloDoCaminho(pathname);
  const [estado, setEstado] = useState("fechado"); // fechado | aberto | fechando
  const [pergunta, setPergunta] = useState("");
  const [itens, setItens] = useState(lerHistorico);
  const [extras, setExtras] = useState(null);
  const fimRef = useRef(null);
  const campoRef = useRef(null);
  const botaoAbertoPor = useRef(null);
  const liberado = !!user && temTela(user, "base-legal");
  const aberto = estado === "aberto";
  const carregando = itens.some((i) => i.estado === "carregando");

  const abrir = useCallback(() => {
    botaoAbertoPor.current = document.activeElement;
    setEstado("aberto");
    setTimeout(() => campoRef.current?.focus({ preventScroll: true }), 60);
  }, []);
  const fechar = useCallback(() => {
    setEstado("fechando");
    setTimeout(() => { setEstado("fechado"); botaoAbertoPor.current?.focus?.({ preventScroll: true }); }, 160);
  }, []);

  const atualizar = (id, parte) => setItens((lista) => lista.map((i) => (i.id === id ? { ...i, ...parte } : i)));

  const enviar = useCallback(async (texto) => {
    const t = String(texto ?? "").trim().slice(0, MAXIMO_PERGUNTA);
    if (!perguntaValida(t)) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setItens((lista) => anexarAoHistorico(lista, { id, pergunta: t, estado: "carregando", inicio: Date.now() }));
    setPergunta("");
    // As respostas já revisadas pela equipe não dependem da IA: chegam primeiro.
    api.get("/base-legal/cartoes/busca", { q: t }).then((r) => atualizar(id, { revisados: r })).catch(() => {});
    try {
      const resultado = await api.post("/base-legal/perguntar", { pergunta: t });
      atualizar(id, { estado: "ok", resultado });
    } catch (e) {
      atualizar(id, { estado: "erro", erro: e?.message || "Não foi possível consultar agora." });
    }
  }, []);

  const repetir = (item) => { setItens((lista) => lista.filter((i) => i.id !== item.id)); enviar(item.pergunta); };
  const novaConversa = () => { setItens([]); setExtras(null); setPergunta(""); gravarHistorico([]); campoRef.current?.focus({ preventScroll: true }); };

  // Abre por evento (botão do menu, página Base legal) e por Ctrl+/.
  useEffect(() => {
    if (!liberado) return undefined;
    const aoEvento = (e) => {
      const d = e.detail || {};
      if (Array.isArray(d.sugestoes)) setExtras(d.sugestoes);
      abrir();
      if (d.pergunta) enviar(d.pergunta);
    };
    const aoTeclar = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") { e.preventDefault(); estado === "aberto" ? fechar() : abrir(); }
      else if (e.key === "Escape" && estado === "aberto" && !e.defaultPrevented) fechar();
    };
    window.addEventListener(EVENTO_ASSISTENTE, aoEvento);
    window.addEventListener("keydown", aoTeclar);
    return () => { window.removeEventListener(EVENTO_ASSISTENTE, aoEvento); window.removeEventListener("keydown", aoTeclar); };
  }, [liberado, estado, abrir, fechar, enviar]);

  // A conversa fica neste navegador (só o que já terminou).
  useEffect(() => { gravarHistorico(itens); }, [itens]);
  // Rola até a última mensagem.
  useEffect(() => {
    if (!aberto) return;
    const reduz = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    fimRef.current?.scrollIntoView({ behavior: reduz ? "auto" : "smooth", block: "end" });
  }, [itens, aberto]);
  // No celular o painel cobre a tela: ao navegar por um link da resposta, fecha.
  useEffect(() => { if (window.innerWidth < 1024 && estado === "aberto") fechar(); }, [pathname]);
  // Altura do campo acompanha o texto (até 5 linhas).
  useEffect(() => {
    const el = campoRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [pergunta, aberto]);

  if (!liberado || typeof document === "undefined" || estado === "fechado") return null;

  const sugestoes = sugestoesDoContexto(modulo, extras);
  const primeiroNome = String(user.name || user.email || "").split(/[\s@.]+/)[0];
  const podeEnviar = perguntaValida(pergunta) && !carregando;

  return createPortal(
    <>
      <div className={`fixed inset-0 z-[59] bg-black/30 lg:hidden ${estado === "fechando" ? "opacity-0 transition-opacity duration-150" : ""}`} onClick={fechar} aria-hidden="true" />
      <section
        role="dialog" aria-label="Assistente tributário" aria-modal="false" data-assistente-painel data-fechando={estado === "fechando" || undefined}
        className="assistente-painel fixed inset-x-3 bottom-3 z-[60] flex h-[min(680px,calc(100dvh-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl lg:inset-x-auto lg:bottom-4 lg:left-[88px] lg:w-[440px]"
      >
        <header className="flex items-center gap-3 border-b border-border bg-gradient-to-br from-primary/15 via-card to-card px-4 py-3">
          <Orbe tamanho={34} pensando={carregando} />
          <div className="min-w-0 flex-1 leading-tight">
            <h2 className="font-heading text-[15px] font-semibold">Assistente tributário</h2>
            <p className="truncate text-[11.5px] text-muted-foreground">Responde só com o texto das normas, citando o artigo</p>
          </div>
          {itens.length > 0 && (
            <button type="button" onClick={novaConversa} title="Nova conversa" aria-label="Nova conversa" className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
          )}
          <button type="button" onClick={fechar} title="Fechar (Esc)" aria-label="Fechar o assistente" className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" aria-hidden="true" /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4" aria-live="polite">
          {itens.length === 0 ? (
            <div className="space-y-5 assistente-entra-msg">
              <div className="flex flex-col items-center gap-2 pt-2 text-center">
                <Orbe tamanho={52} />
                <p className="font-heading text-lg font-semibold">{primeiroNome ? `Olá, ${primeiroNome}.` : "Olá."} O que você quer saber?</p>
                <p className="max-w-[320px] text-[13px] text-muted-foreground">Pergunte com as suas palavras sobre a Reforma Tributária. Eu procuro nas leis e decretos carregados e mostro o artigo.</p>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{extras ? "Sugestões" : temContextoProprio(modulo) ? `Para quem está em “${modulo.titulo}”` : "Comece por aqui"}</p>
                {sugestoes.map((s, i) => (
                  <button key={s} type="button" onClick={() => enviar(s)} style={{ animationDelay: `${i * 60}ms` }}
                    className="assistente-entra-msg group flex w-full items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-[13px] transition-[border-color,background-color,transform] hover:-translate-y-px hover:border-primary/50 hover:bg-primary/5">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary opacity-70 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                    <span className="flex-1">{s}</span>
                  </button>
                ))}
              </div>
              <Link to="/base-legal" onClick={() => window.innerWidth < 1024 && fechar()} className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
                <Scale className="h-3.5 w-3.5" aria-hidden="true" /> Prefere ler o texto? Abrir a Base legal
              </Link>
            </div>
          ) : itens.map((item) => <Troca key={item.id} item={item} aoRepetir={repetir} />)}
          <div ref={fimRef} />
        </div>

        <footer className="border-t border-border bg-card px-3 pb-3 pt-2.5">
          <form onSubmit={(e) => { e.preventDefault(); if (podeEnviar) enviar(pergunta); }} className="flex items-end gap-2 rounded-2xl border border-input bg-background px-3 py-2 transition-shadow focus-within:border-primary/60 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]">
            <textarea
              ref={campoRef} value={pergunta} onChange={(e) => setPergunta(e.target.value.slice(0, MAXIMO_PERGUNTA))} rows={1} aria-label="Pergunta ao assistente"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (podeEnviar) enviar(pergunta); } }}
              placeholder={carregando ? "Aguarde a resposta…" : "Pergunte sobre a Reforma Tributária…"}
              className="max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground"
            />
            <button type="submit" disabled={!podeEnviar} aria-label="Enviar pergunta" title="Enviar (Enter)"
              className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[transform,opacity] duration-150 hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-40">
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
          <p className="mt-1.5 flex justify-between px-1 text-[10.5px] text-muted-foreground">
            <span>Enter envia · Shift+Enter quebra a linha · Ctrl+/ abre e fecha</span>
            {pergunta.length > MAXIMO_PERGUNTA - 100 && <span className="tabular-nums">{pergunta.length}/{MAXIMO_PERGUNTA}</span>}
          </p>
        </footer>
      </section>
    </>,
    document.body,
  );
}
