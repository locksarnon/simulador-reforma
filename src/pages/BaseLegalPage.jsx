import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, RefreshCw, Scale, Search } from "lucide-react";
import { api } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import AssistenteLegal from "@/components/base-legal/AssistenteLegal";
import CartoesLegais from "@/components/base-legal/CartoesLegais";
import AlertasBaseLegal from "@/components/base-legal/AlertasBaseLegal";

export const fmtData = (v) => {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }); } catch { return v; }
};

/** Trecho da busca: [[termo]] vira destaque. */
export function Trecho({ texto }) {
  const partes = String(texto || "").split(/(\[\[.*?\]\])/g);
  return (
    <span>
      {partes.map((p, i) => (p.startsWith("[[") ? <mark key={i} className="bg-amber-200/70 dark:bg-amber-500/30 text-foreground rounded px-0.5">{p.slice(2, -2)}</mark> : <React.Fragment key={i}>{p}</React.Fragment>))}
    </span>
  );
}

function useDebounced(v, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function CartaoNorma({ n, admin, onAtualizar, atualizando }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{n.tipo}</p>
          <h2 className="font-heading font-semibold text-lg leading-tight">{n.numero}</h2>
        </div>
        <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${n.total_dispositivos ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
          {n.total_dispositivos ? "Texto carregado" : "Não carregada"}
        </span>
      </div>
      <p className="text-sm mt-2 font-medium">{n.titulo}</p>
      {n.ementa && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3">{n.ementa}</p>}
      {n.observacao && <p className="text-xs text-muted-foreground mt-1.5">{n.observacao}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Publicação</dt><dd className="text-right tabular-nums">{fmtData(n.data_publicacao)}</dd>
        <dt className="text-muted-foreground">Dispositivos</dt><dd className="text-right tabular-nums">{n.total_dispositivos || "—"}</dd>
        <dt className="text-muted-foreground">Conferida na fonte</dt><dd className="text-right tabular-nums">{n.capturada_em ? new Date(n.capturada_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}</dd>
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-border">
        <Link to={`/base-legal/${n.chave}`} className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium">Ler texto integral</Link>
        <a href={n.url_oficial} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"><ExternalLink className="w-3.5 h-3.5" /> Fonte oficial</a>
        {admin && (
          <button type="button" onClick={() => onAtualizar(n.chave)} disabled={atualizando} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-60 ml-auto" title="Baixa de novo o texto oficial e registra o que mudou">
            {atualizando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Atualizar
          </button>
        )}
      </div>
    </div>
  );
}

/** Base legal: texto integral das normas da Reforma Tributária, com busca por dispositivo e por texto. */
export default function BaseLegalPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const admin = user?.role === "admin";
  const [q, setQ] = useState("");
  const termo = useDebounced(q.trim());
  const [atualizando, setAtualizando] = useState(null);

  const { data: normas = [], isLoading } = useQuery({ queryKey: ["base-legal-normas"], queryFn: () => api.get("/base-legal/normas") });
  const { data: busca, isFetching } = useQuery({
    queryKey: ["base-legal-busca", termo],
    queryFn: () => api.get("/base-legal/busca", { q: termo }),
    enabled: termo.length >= 2,
  });

  const atualizar = async (chave) => {
    setAtualizando(chave);
    try {
      const r = await api.post("/base-legal/importar", { chave });
      toast({ title: r.alterada ? "Texto atualizado" : "Sem mudanças", description: r.alterada ? `${r.novos} novos, ${r.alterados} alterados, ${r.removidos} removidos.` : "O texto oficial é idêntico ao que já estava carregado." });
      qc.invalidateQueries({ queryKey: ["base-legal-normas"] });
    } catch (e) {
      toast({ title: "Não foi possível atualizar", description: e.message, variant: "destructive" });
    } finally { setAtualizando(null); }
  };

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Base legal" }]} />
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-xl font-heading font-semibold flex items-center gap-2"><Scale className="w-5 h-5" /> Base legal</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">Texto integral das normas da Reforma Tributária do Consumo, capturado das fontes oficiais e organizado por artigo. Use a busca para achar o dispositivo e a base legal de uma resposta.</p>
        </div>

        {admin && <AlertasBaseLegal />}

        <AssistenteLegal admin={admin} />

        <CartoesLegais admin={admin} />

        <div className="relative max-w-2xl">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder='Busque por assunto ou artigo — ex.: "produtor rural limite" ou "art 164"' className="w-full h-11 rounded-md border border-input bg-background pl-10 pr-10 text-sm" aria-label="Buscar na base legal" />
          {isFetching && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>

        {termo.length >= 2 && busca && (
          <section className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-medium">Busca no texto das normas: resultados para "{termo}"</h2>
            {busca.exatos?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {busca.exatos.map((e) => <Link key={e.norma.chave + e.caminho} to={`/base-legal/${e.norma.chave}/${e.caminho}`} className="px-3 py-1.5 rounded-md border border-primary text-primary text-sm hover:bg-primary/5">{e.norma.numero} — {e.rotulo}</Link>)}
              </div>
            )}
            {busca.resultados?.length === 0 && !busca.exatos?.length && <p className="text-sm text-muted-foreground">Nada encontrado nas normas carregadas. Tente outras palavras ou o número do artigo.</p>}
            <ul className="divide-y divide-border">
              {busca.resultados?.map((r) => (
                <li key={r.chave + r.caminho} className="py-2.5">
                  <Link to={`/base-legal/${r.chave}/${r.caminho}`} className="text-sm font-medium text-primary hover:underline">{r.numero} — {r.rotulo}</Link>
                  {r.secao && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{r.secao}</p>}
                  <p className="text-sm text-muted-foreground mt-1"><Trecho texto={r.trecho} /></p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="text-sm font-medium mb-3">Normas carregadas</h2>
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : normas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma norma cadastrada ainda. {admin ? "Use o botão Atualizar de cada norma depois que ela aparecer aqui." : "Peça a um administrador para carregar a base."}</p>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {normas.map((n) => <CartaoNorma key={n.chave} n={n} admin={admin} onAtualizar={atualizar} atualizando={atualizando === n.chave} />)}
            </div>
          )}
        </section>

        <p className="text-xs text-muted-foreground max-w-3xl">Os textos vêm dos sites oficiais (Planalto) e são reproduzidos sem alteração; conferimos a fonte periodicamente. Em caso de dúvida, vale o texto publicado no órgão oficial — use o link "Fonte oficial".</p>
      </div>
    </div>
  );
}
