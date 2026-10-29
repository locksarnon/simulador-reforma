import { SETORES_BASE_LEGAL } from "@/lib/setoresBaseLegal";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, RefreshCw, Scale, Search } from "lucide-react";
import { api } from "@/api/client";
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

/** Base legal: texto integral das normas da Reforma Tributária, com busca por dispositivo e por texto. */
export default function BaseLegalPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const admin = user?.role === "admin";
  const [q, setQ] = useState("");
  const [setorId, setSetorId] = useState("");
  const setor = SETORES_BASE_LEGAL.find(s => s.id === setorId);
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
      <div className="p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-xl font-heading font-semibold flex items-center gap-2"><Scale className="w-5 h-5" /> Base legal</h1>
          <p className="text-sm text-muted-foreground mt-1">Texto integral das normas da Reforma Tributária do Consumo, capturado das fontes oficiais e organizado por artigo. Use a busca para achar o dispositivo e a base legal de uma resposta.</p>
        </div>

        <Link to="/base-legal/guia-art-11" className="block rounded-xl border border-border bg-card p-4 hover:border-primary"><strong>Guia do Artigo 11</strong><p className="text-sm text-muted-foreground mt-1">Consulte o local de incidência do IBS por tipo de operação.</p></Link>

        {admin && <AlertasBaseLegal />}

        <section className="space-y-3"><h2 className="text-sm font-medium">Explorar por setor</h2><div className="flex flex-wrap gap-2"><button type="button" aria-pressed={!setorId} onClick={() => setSetorId('')} className={!setorId ? 'px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm' : 'px-3 py-2 rounded-md border border-border text-sm'}>Todos</button>{SETORES_BASE_LEGAL.map(s => <button key={s.id} type="button" aria-pressed={setorId === s.id} onClick={() => setSetorId(s.id)} className={setorId === s.id ? 'px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm' : 'px-3 py-2 rounded-md border border-border text-sm hover:bg-muted'}>{s.nome}</button>)}</div><p className="text-xs text-muted-foreground">O setor prioriza perguntas e respostas revisadas por palavras-chave, sem usar IA. As normas permanecem acessíveis para todos os setores.</p>{setor && <button type="button" onClick={() => setQ(setor.busca)} className="text-primary text-sm underline">Buscar dispositivos sobre {setor.nome}</button>}</section>
        <AssistenteLegal key={setorId} admin={admin} setor={setor} />

        <CartoesLegais admin={admin} setor={setor} />

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
            <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm"><thead className="bg-muted text-left"><tr><th className="p-3">Norma</th><th className="p-3">Assunto</th><th className="p-3">Publicação</th><th className="p-3">Situação</th><th className="p-3">Dispositivos</th><th className="p-3">Ações</th></tr></thead><tbody>{normas.map(n => <tr key={n.chave} className="border-t border-border hover:bg-muted/20"><td className="p-3 font-medium">{n.numero}<span className="block text-xs text-muted-foreground">{n.tipo}</span></td><td className="p-3 max-w-lg"><p>{n.titulo}</p><p className="text-xs text-muted-foreground">{n.ementa}</p>{n.observacao && <p className="text-xs text-muted-foreground">{n.observacao}</p>}</td><td className="p-3 whitespace-nowrap">{fmtData(n.data_publicacao)}</td><td className="p-3"><span className={n.total_dispositivos ? 'text-xs rounded px-2 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' : 'text-xs rounded px-2 py-1 bg-muted text-muted-foreground'}>{n.total_dispositivos ? 'Texto carregado' : 'Não carregada'}</span></td><td className="p-3">{n.total_dispositivos || '—'}</td><td className="p-3"><div className="flex flex-wrap gap-2"><Link to={'/base-legal/' + n.chave} className="text-primary underline">Ler texto integral</Link><a href={n.url_oficial} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline"><ExternalLink className="w-3 h-3" />Fonte oficial</a>{admin && <button type="button" disabled={atualizando === n.chave} onClick={() => atualizar(n.chave)} className="inline-flex gap-1 items-center border border-border rounded px-2 py-1 disabled:opacity-50">{atualizando === n.chave ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}Atualizar</button>}</div><p className="text-xs text-muted-foreground mt-2">Conferida: {n.capturada_em ? new Date(n.capturada_em).toLocaleDateString('pt-BR') : '—'}</p></td></tr>)}</tbody></table></div>
          )}
        </section>

        <p className="text-xs text-muted-foreground">Os textos vêm dos sites oficiais (Planalto) e são reproduzidos sem alteração; conferimos a fonte periodicamente. Em caso de dúvida, vale o texto publicado no órgão oficial — use o link "Fonte oficial".</p>
      </div>
    </div>
  );
}
