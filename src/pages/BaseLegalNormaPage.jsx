import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ClipboardCopy, ExternalLink, History, Loader2, Search } from "lucide-react";
import { api } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import { fmtData } from "@/pages/BaseLegalPage";

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
      <tr key={i} className={i % 2 ? "bg-muted/40" : ""}>{l.split(" | ").map((c, k) => <td key={k} className="border border-border px-2 py-1 align-top">{c}</td>)}</tr>
    ))}</tbody></table></div>;
  }
  return <div className="space-y-2 text-[15px] leading-relaxed">{linhas.map((l, i) => <p key={i} className={recuo(l)}>{l}</p>)}</div>;
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
            <p className="text-[11px] text-muted-foreground mt-1.5">{est.itens.length} dispositivos</p>
          </div>
          <nav className="max-h-[70vh] overflow-y-auto p-2">
            {grupos.map(([secao, itens]) => (
              <div key={secao} className="mb-3">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-snug">{secao}</p>
                <div className="flex flex-wrap gap-1 px-1">
                  {itens.map((it) => (
                    <Link key={it.caminho} to={`/base-legal/${chave}/${it.caminho}`} className={`px-2 py-1 rounded-md text-xs border ${it.caminho === caminho ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"} ${it.revogado ? "line-through opacity-60" : ""}`}>{it.rotulo.replace(/^Art\. /, "")}</Link>
                  ))}
                </div>
              </div>
            ))}
            {grupos.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nada encontrado no índice.</p>}
          </nav>
        </aside>

        <main className="min-w-0 max-w-4xl">
          {!caminho ? (
            <div className="rounded-xl border border-border bg-card p-6 space-y-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{n.tipo}</p>
              <h1 className="text-xl font-heading font-semibold">{n.numero}</h1>
              <p className="text-sm">{n.titulo}</p>
              {n.ementa && <p className="text-sm text-muted-foreground">{n.ementa}</p>}
              <p className="text-xs text-muted-foreground">Publicação {fmtData(n.data_publicacao)} · conferida na fonte em {n.capturada_em ? new Date(n.capturada_em).toLocaleString("pt-BR") : "—"}</p>
              <div className="flex gap-2 pt-1">
                {est.itens[0] && <button onClick={() => navigate(`/base-legal/${chave}/${est.itens[0].caminho}`)} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm">Começar a ler</button>}
                <a href={n.url_oficial} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"><ExternalLink className="w-3.5 h-3.5" /> Fonte oficial</a>
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
                  {d.revogado && <span className="inline-block mt-1 text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300">Revogado</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={copiar} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"><ClipboardCopy className="w-3.5 h-3.5" /> Copiar com citação</button>
                  <a href={n.url_oficial} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"><ExternalLink className="w-3.5 h-3.5" /> Fonte oficial</a>
                </div>
              </header>
              <div className="p-5"><TextoLegal texto={d.texto} /></div>
              {d.versoes?.length > 0 && (
                <details className="px-5 pb-4 text-sm">
                  <summary className="cursor-pointer text-muted-foreground inline-flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> {d.versoes.length} versão(ões) anterior(es)</summary>
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
