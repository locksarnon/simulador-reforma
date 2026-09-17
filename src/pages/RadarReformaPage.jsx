import React, { useMemo, useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Radar, RefreshCw, ExternalLink, AlertCircle, ArrowRight } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";

const PRIORIDADE_ORDEM = { Alta: 0, Média: 1, Baixa: 2 };

const PRIORIDADE_COR = {
  Alta: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  Média: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  Baixa: "bg-muted text-muted-foreground",
};

const STATUS_COR = {
  "Em vigor": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  "Aprovado, aguardando vigência": "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  "Proposta em tramitação": "bg-muted text-muted-foreground",
};

function fmtData(v) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("pt-BR"); } catch { return v; }
}

/**
 * Radar de Novidades da Reforma Tributária — gerado semanalmente por IA
 * (Gemini com busca na web), seguindo prompt de analista tributário. Nunca
 * inventa prazo/alíquota: quando o modelo não confirma um dado, o próprio
 * campo já vem como "A confirmar" (regra aplicada no backend, não aqui).
 * Roda sozinho toda segunda 06h; o botão "Gerar agora" serve pra testar ou
 * forçar uma atualização fora do ciclo automático.
 */
export default function RadarReformaPage() {
  const qc = useQueryClient();
  const [gerando, setGerando] = useState(false);

  const { data: itens, isLoading } = useQuery({
    queryKey: ["radarReformaItens"],
    queryFn: () => base44.entities.RadarReformaItem.filter({}, "-createdAt", 300),
  });
  const { data: execucoes } = useQuery({
    queryKey: ["radarReformaExecucoes"],
    queryFn: () => base44.entities.RadarReformaExecucao.filter({}, "-executado_em", 12),
  });

  const ultimaExecucao = execucoes?.[0] || null;
  const semanaAtual = ultimaExecucao?.semana_referencia;

  const itensDaSemana = useMemo(() => {
    if (!itens) return [];
    const base = semanaAtual ? itens.filter((i) => i.semana_referencia === semanaAtual) : itens;
    return [...base].sort((a, b) => {
      const p = (PRIORIDADE_ORDEM[a.prioridade] ?? 9) - (PRIORIDADE_ORDEM[b.prioridade] ?? 9);
      if (p !== 0) return p;
      return (a.prazo_vigencia || "").localeCompare(b.prazo_vigencia || "");
    });
  }, [itens, semanaAtual]);

  const gerarAgora = async () => {
    setGerando(true);
    try {
      const resp = await base44.functions.invoke("gerarRadarReforma");
      const r = resp.data;
      toast({
        title: "Radar atualizado",
        description: `${r.itens_gerados} novidade(s) para a semana ${r.semana_referencia}.`,
      });
      qc.invalidateQueries({ queryKey: ["radarReformaItens"] });
      qc.invalidateQueries({ queryKey: ["radarReformaExecucoes"] });
    } catch (err) {
      toast({ title: "Falha ao gerar radar", description: err.message, variant: "destructive" });
    } finally {
      setGerando(false);
    }
  };

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Radar de Novidades" }]} />
      <div className="p-6 lg:p-8 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Radar className="w-5 h-5 text-muted-foreground" />
              <h1 className="text-xl font-heading font-semibold">Radar de Novidades — Reforma Tributária</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Gerado por IA com busca na web, toda segunda-feira — foco em ação prática pro time fiscal, não em análise acadêmica.
            </p>
          </div>
          <button
            onClick={gerarAgora}
            disabled={gerando}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${gerando ? "animate-spin" : ""}`} />
            {gerando ? "Gerando…" : "Gerar agora"}
          </button>
        </div>

        {ultimaExecucao?.status === "ERRO" && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Falha na última geração ({ultimaExecucao.semana_referencia})</p>
              <p className="text-muted-foreground mt-0.5">{ultimaExecucao.erro}</p>
            </div>
          </div>
        )}

        {ultimaExecucao?.resumo_executivo && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-medium">Resumo executivo — semana {ultimaExecucao.semana_referencia}</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{ultimaExecucao.resumo_executivo}</p>
          </div>
        )}

        <div className="space-y-3">
          {itensDaSemana.map((it) => (
            <div key={it.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${PRIORIDADE_COR[it.prioridade] || PRIORIDADE_COR.Baixa}`}>
                    {it.prioridade}
                  </span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_COR[it.status_normativo] || "bg-muted text-muted-foreground"}`}>
                    {it.status_normativo || "A confirmar"}
                  </span>
                  <span className="text-xs text-muted-foreground">{it.categoria}</span>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  Prazo/vigência: <span className="text-foreground font-medium">{it.prazo_vigencia || "—"}</span>
                </div>
              </div>

              <p className="text-sm mt-2 leading-relaxed">{it.resumo}</p>

              {it.impacto_pratico && (
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  <span className="font-medium text-foreground">Impacto prático: </span>{it.impacto_pratico}
                </p>
              )}

              {it.acao_recomendada && (
                <div className="flex items-start gap-2 mt-3 p-2.5 rounded-md bg-muted/40 text-sm">
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <p><span className="font-medium">Ação recomendada: </span>{it.acao_recomendada}</p>
                </div>
              )}

              {(it.fonte_nome || it.fonte_url) && (
                <div className="mt-3 text-xs">
                  {it.fonte_url ? (
                    <a href={it.fonte_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      {it.fonte_nome || "Fonte"} <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{it.fonte_nome}</span>
                  )}
                </div>
              )}
            </div>
          ))}
          {!isLoading && itensDaSemana.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm rounded-lg border border-dashed border-border">
              Nenhuma novidade gerada ainda — clique em "Gerar agora" para rodar a primeira análise.
            </div>
          )}
        </div>

        {execucoes && execucoes.length > 1 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Histórico de execuções ({execucoes.length})
            </summary>
            <div className="mt-2 rounded-lg border border-border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="px-3 py-2 font-medium">Semana</th>
                    <th className="px-3 py-2 font-medium">Disparo</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Itens</th>
                    <th className="px-3 py-2 font-medium">Executado em</th>
                  </tr>
                </thead>
                <tbody>
                  {execucoes.map((e, idx) => (
                    <tr key={e.id} className={`border-b border-border last:border-0 ${idx % 2 === 1 ? "bg-muted/15" : ""}`}>
                      <td className="px-3 py-2">{e.semana_referencia}</td>
                      <td className="px-3 py-2 text-muted-foreground">{e.disparo}</td>
                      <td className="px-3 py-2">{e.status}</td>
                      <td className="px-3 py-2">{e.itens_gerados}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtData(e.executado_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
