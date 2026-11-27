import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ArrowRight, ClipboardCopy, ExternalLink, History, Loader2, Search } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import { fmtData } from "@/pages/BaseLegalPage";
import { plural } from "@/lib/plural";
import { CLASSE_TIPO_NOVIDADE, dataBr, dataHoraBr, notasDeAlteracao, ROTULO_TEMA, ROTULO_TIPO_NOVIDADE, rotuloDoCaminho, revogadoPor, situacaoDaNorma } from "@/lib/novidadesLegais";

/** Recuo por tipo de linha do texto legal: parágrafo, inciso, alínea. */
function recuo(l) {
  if (/^(§|Parágrafo único)/.test(l)) return "pl-4";
  if (/^[IVXLC]+\s*[-–—]/.test(l)) return "pl-8";
  if (/^[a-z]\)/.test(l)) return "pl-12";
  if (/^\d+\.?\s*[-–—)]/.test(l)) return "pl-16";
  return "";
}

function TextoLegal({ texto }) {
  const linhas = useMemo(() => String(texto || "").split("\n"), [texto]);
  const tabela = linhas.filter((l) => l.includes(" | ")).length > linhas.length / 2;
  if (tabela) {
    return <div className="overflow-x-auto"><table className="text-xs border-collapse w-full"><tbody>{linhas.map((l, i) => (
      <tr key={i} className={`align-middle ${i % 2 ? "bg-muted/40" : ""}`}>{l.split(" | ").map((c, k) => <td key={k} className={`border border-border px-2 py-1 ${c.length > 60 ? "min-w-[16rem]" : "whitespace-nowrap"}`}>{c}</td>)}</tr>
    ))}</tbody></table></div>;
  }
  return <div className="space-y-2 text-[15px] leading-relaxed">{linhas.map((l, i) => <p key={i} className={recuo(l)}>{l}</p>)}</div>;
}

const Etiqueta = ({ classe, children }) => <span className={`inline-block text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${classe}`}>{children}</span>;
const VERMELHO = "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300";
const AMBAR = "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
const AZUL = "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200";

/** Avisos, histórico oficial, redação anterior e remissões de um dispositivo: o que importa antes de citá-lo. */
export function SituacaoDoDispositivo({ disp, chave }) {
  const d = disp.dispositivo;
  const notas = notasDeAlteracao(d);
  const anteriores = Array.isArray(d.redacoes_anteriores) ? d.redacoes_anteriores : [];
  const temas = Array.isArray(d.temas) ? d.temas : [];
  return (
    <>
      {disp.norma?.situacao === "revogada" && (
        <div role="alert" className={`mx-5 mt-4 rounded-lg border border-red-300/60 p-3 text-sm ${VERMELHO}`}>Esta norma consta como revogada{disp.norma.revogada_por ? ` pelo ${disp.norma.revogada_por}` : ""}. O texto abaixo é histórico.</div>
      )}
      {disp.avisos?.length > 0 && (
        <div role="alert" className="mx-5 mt-4 rounded-lg border border-amber-500/60 bg-amber-50/60 dark:bg-amber-950/10 p-3 text-sm space-y-1">
          <p className="font-medium flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Alteração ainda não consolidada no texto compilado</p>
          {disp.avisos.map((a) => <p key={a.id} className="text-xs">{a.titulo}. {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="underline">Ver o ato</a>}</p>)}
        </div>
      )}
      {(notas.length > 0 || temas.length > 0) && (
        <div className="px-5 pt-3 text-xs text-muted-foreground space-y-1">
          {notas.length > 0 && <p><span className="font-medium text-foreground">Histórico oficial:</span> {notas.map((x) => x.texto).join(" · ")}</p>}
          {temas.length > 0 && <p className="flex flex-wrap gap-1.5">{temas.map((t) => <span key={t} className="rounded border border-border px-1.5 py-0.5">{ROTULO_TEMA[t] || t}</span>)}</p>}
        </div>
      )}
      {anteriores.length > 0 && (
        <details className="px-5 pt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground inline-flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Redação anterior (estava riscada no texto oficial; não vale mais)</summary>
          <div className="mt-2 space-y-2">{anteriores.map((r, i) => <blockquote key={i} className="border-l-2 border-border pl-3 text-muted-foreground line-through decoration-1">{r}</blockquote>)}</div>
        </details>
      )}
      {(disp.cita?.length > 0 || disp.citado_por?.length > 0) && (
        <div className="px-5 pt-3 text-xs space-y-1">
          {disp.cita?.length > 0 && (
            <p><span className="font-medium">Regulamenta ou reproduz:</span>{" "}
              {disp.cita.map((c) => (c.norma ? <Link key={c.referencia + c.caminho} to={`/base-legal/${c.norma.chave}/${c.caminho}`} className="underline mr-2">{c.norma.numero}, {rotuloDoCaminho(c.caminho)}</Link> : <span key={c.referencia + c.caminho} className="mr-2 text-muted-foreground">{c.referencia.toUpperCase()}, {rotuloDoCaminho(c.caminho)} (fora da base)</span>))}
            </p>
          )}
          {disp.citado_por?.length > 0 && (
            <p><span className="font-medium">Citado em:</span>{" "}
              {disp.citado_por.map((c) => <Link key={c.norma.chave + c.caminho} to={`/base-legal/${c.norma.chave}/${c.caminho}`} className="underline mr-2">{c.norma.numero}, {c.rotulo}</Link>)}
            </p>
          )}
        </div>
      )}
      <span hidden data-norma={chave} />
    </>
  );
}

/** Cabeçalho da norma: situação, atos que a alteraram e as novidades abertas sobre ela. */
export function CabecalhoDaNorma({ norma, total, chave, novidades = [] }) {
  const sit = situacaoDaNorma({ ...norma, total_dispositivos: total });
  const atos = Array.isArray(norma.atos_modificadores) ? norma.atos_modificadores : [];
  const abertas = novidades.filter((x) => x.status === "nova" || x.status === "vista").slice(0, 8);
  return (
    <>
      <p className="text-xs text-muted-foreground">Publicação {fmtData(norma.data_publicacao)} · conferida na fonte em {norma.capturada_em ? new Date(norma.capturada_em).toLocaleString("pt-BR") : "—"}{norma.atualizada_em ? ` · texto mudou em ${dataBr(norma.atualizada_em)}` : ""}</p>
      <p className="flex flex-wrap items-center gap-2"><span className={`text-xs rounded px-2 py-0.5 ${sit.classe}`}>{sit.rotulo}</span>{norma.formato === "pdf" && <span className="text-xs text-muted-foreground">texto lido de PDF oficial</span>}</p>
      {atos.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Alterada por {plural(atos.length, "ato", "atos")}</summary>
          <ul className="mt-1 text-xs space-y-0.5 list-disc pl-5">{atos.slice(0, 20).map((a) => <li key={a.referencia}>{a.ato}: {plural(a.dispositivos, "dispositivo", "dispositivos")} ({a.tipos.map((t) => ({ redacao: "nova redação", inclusao: "inclusão", revogacao: "revogação", renumeracao: "renumeração" }[t] || t)).join(", ")})</li>)}</ul>
        </details>
      )}
      {abertas.length > 0 && (
        <section aria-label="Novidades sobre esta norma" className="rounded-lg border border-border p-3 space-y-1.5">
          <h2 className="text-sm font-medium">O que a base sabe de novo sobre esta norma</h2>
          <ul className="text-xs space-y-1">
            {abertas.map((x) => (
              <li key={x.id}><span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] ${CLASSE_TIPO_NOVIDADE[x.tipo] || "bg-muted text-muted-foreground"}`}>{ROTULO_TIPO_NOVIDADE[x.tipo] || x.tipo}</span>{x.titulo} <span className="text-muted-foreground">({dataHoraBr(x.detectada_em)}){x.confirmada ? "" : " · a confirmar"}</span></li>
            ))}
          </ul>
          <Link to={`/base-legal?aba=novidades&norma=${chave}`} className="text-xs text-primary underline">Ver todas as novidades desta norma</Link>
        </section>
      )}
    </>
  );
}

/** Leitor de uma norma: índice à esquerda, dispositivo à direita, com link direto por artigo. */
export default function BaseLegalNormaPage() {
  const { chave, caminho } = useParams();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState("");

  const { data: est, isLoading } = useQuery({ queryKey: ["base-legal-norma", chave], queryFn: () => api.get(`/base-legal/normas/${chave}`) });
  const { data: disp, isFetching } = useQuery({
    queryKey: ["base-legal-disp", chave, caminho],
    queryFn: () => api.get(`/base-legal/normas/${chave}/dispositivos/${caminho}`),
    enabled: Boolean(caminho),
  });
  const { data: novidades = [] } = useQuery({ queryKey: ["base-legal-norma-novidades", chave], queryFn: () => api.get(`/base-legal/normas/${chave}/novidades`) });

  useEffect(() => { window.scrollTo({ top: 0 }); }, [caminho]);

  const grupos = useMemo(() => {
    if (!est) return [];
    const f = filtro.trim().toLowerCase();
    const mapa = new Map();
    for (const it of est.itens) {
      if (f && !`${it.rotulo} ${it.secao || ""}`.toLowerCase().includes(f)) continue;
      const k = it.secao ? it.secao.split(" › ").slice(0, 2).join(" › ") : "Sem seção";
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(it);
    }
    return [...mapa.entries()];
  }, [est, filtro]);

  const copiar = async () => {
    if (!disp) return;
    const txt = `${disp.dispositivo.texto}\n\nFonte: ${disp.norma.numero}, ${disp.dispositivo.rotulo} — ${disp.norma.url_oficial}`;
    try { await navigator.clipboard.writeText(txt); toast({ title: "Copiado com a citação" }); } catch { toast({ title: "Não foi possível copiar", variant: "destructive" }); }
  };

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>;
  if (!est) return <div className="p-8 text-sm">Norma não encontrada. <Link className="underline" to="/base-legal">Voltar à Base legal</Link></div>;
  const n = est.norma;
  const d = disp?.dispositivo;

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Base legal", to: "/base-legal" }, { label: n.numero, to: caminho ? `/base-legal/${chave}` : undefined }, ...(d ? [{ label: d.rotulo }] : [])]} />
      <div className="p-4 lg:p-6 grid lg:grid-cols-[320px_1fr] gap-6 items-start">
        <aside className="lg:sticky lg:top-4 rounded-xl border border-border bg-card">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar artigos e capítulos" className="w-full h-9 rounded-md border border-input bg-background pl-8 pr-2 text-sm" aria-label="Filtrar índice" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">{est.itens.length} dispositivos · riscado = revogado · borda âmbar = parte revogada</p>
          </div>
          <nav className="max-h-[70vh] overflow-y-auto p-2">
            {grupos.map(([secao, itens]) => (
              <div key={secao} className="mb-3">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-snug">{secao}</p>
                <div className="flex flex-wrap gap-1 px-1">
                  {itens.map((it) => (
                    <Link key={it.caminho} to={`/base-legal/${chave}/${it.caminho}`} title={it.revogado ? "Revogado" : it.parcialmente_revogado ? "Parte revogada" : undefined}
                      className={`px-2 py-1 rounded-md text-xs border ${it.caminho === caminho ? "bg-primary text-primary-foreground border-primary" : it.parcialmente_revogado ? "border-amber-500 hover:bg-muted" : "border-border hover:bg-muted"} ${it.revogado ? "line-through opacity-60" : ""}`}>{it.rotulo.replace(/^Art\. /, "")}</Link>
                  ))}
                </div>
              </div>
            ))}
            {grupos.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nada encontrado no índice.</p>}
          </nav>
        </aside>

        <main className="min-w-0">
          {!caminho ? (
            <div className="rounded-xl border border-border bg-card p-6 space-y-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{n.tipo}</p>
              <h1 className="text-xl font-heading font-semibold">{n.numero}</h1>
              <p className="text-sm">{n.titulo}</p>
              {n.ementa && <p className="text-sm text-muted-foreground">{n.ementa}</p>}
              <CabecalhoDaNorma norma={n} total={est.itens.length} chave={chave} novidades={novidades} />
              <div className="flex gap-2 pt-1">
                {est.itens[0] && <button onClick={() => navigate(`/base-legal/${chave}/${est.itens[0].caminho}`)} className="botao-acao px-3 py-1 rounded-md bg-primary text-primary-foreground text-sm">Começar a ler</button>}
                <a href={n.url_oficial} target="_blank" rel="noreferrer" className="botao-acao inline-flex items-center gap-1.5 px-3 py-[5px] rounded-md text-sm hover:bg-muted"><ExternalLink className="w-3.5 h-3.5" /> Fonte oficial</a>
              </div>
              <p className="text-sm text-muted-foreground pt-2">Escolha um artigo ou anexo no índice ao lado.</p>
            </div>
          ) : !d ? (
            <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">{isFetching ? <><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</> : "Dispositivo não encontrado."}</div>
          ) : (
            <article className="rounded-xl border border-border bg-card">
              <header className="p-5 border-b border-border flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground leading-snug">{d.secao}</p>
                  <h1 className="text-lg font-heading font-semibold mt-1">{n.numero} — {d.rotulo}</h1>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {d.revogado && <Etiqueta classe={VERMELHO}>Revogado{revogadoPor(d)}</Etiqueta>}
                    {!d.revogado && d.parcialmente_revogado && <Etiqueta classe={AMBAR}>Parcialmente revogado</Etiqueta>}
                    {d.alterado_em && <Etiqueta classe={AZUL}>Texto alterado em {dataBr(d.alterado_em)}</Etiqueta>}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={copiar} className="botao-acao inline-flex items-center gap-1.5 px-3 py-[5px] rounded-md text-sm hover:bg-muted"><ClipboardCopy className="w-3.5 h-3.5" /> Copiar com citação</button>
                  <a href={n.url_oficial} target="_blank" rel="noreferrer" className="botao-acao inline-flex items-center gap-1.5 px-3 py-[5px] rounded-md text-sm hover:bg-muted"><ExternalLink className="w-3.5 h-3.5" /> Fonte oficial</a>
                </div>
              </header>
              <SituacaoDoDispositivo disp={disp} chave={chave} />
              <div className="p-5"><TextoLegal texto={d.texto} /></div>
              {d.versoes?.length > 0 && (
                <details className="px-5 pb-4 text-sm">
                  <summary className="cursor-pointer text-muted-foreground inline-flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> {plural(d.versoes.length, "versão anterior", "versões anteriores")}</summary>
                  <div className="mt-2 space-y-3">{d.versoes.map((v) => (
                    <div key={v.id} className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground mb-1">Capturada em {new Date(v.capturada_em).toLocaleString("pt-BR")}</p><TextoLegal texto={v.texto} /></div>
                  ))}</div>
                </details>
              )}
              <footer className="p-4 border-t border-border flex items-center justify-between text-sm">
                {disp.anterior ? <Link to={`/base-legal/${chave}/${disp.anterior.caminho}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> {disp.anterior.rotulo}</Link> : <span />}
                {disp.proximo ? <Link to={`/base-legal/${chave}/${disp.proximo.caminho}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">{disp.proximo.rotulo} <ArrowRight className="w-4 h-4" /></Link> : <span />}
              </footer>
            </article>
          )}
        </main>
      </div>
    </div>
  );
}
