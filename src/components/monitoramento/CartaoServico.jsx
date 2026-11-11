import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, History, Loader2, RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { formatarCelula, NIVEIS, quandoConsultou, SEM_CONSULTA } from "@/lib/monitoramento";

const campo = "rounded-md border border-border bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SeloNivel({ nivel }) {
  const n = NIVEIS[nivel] || SEM_CONSULTA;
  return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 ${n.tom}`}><span className={`h-1.5 w-1.5 rounded-full ${n.ponto}`} aria-hidden="true" />{n.rotulo}</span>;
}

/** A tabela do resultado (até 200 linhas na tela; o resto fica no histórico). */
function TabelaResultado({ tabela }) {
  if (!tabela?.linhas?.length) return null;
  const linhas = tabela.linhas.slice(0, 200);
  return (
    <div className="max-h-72 overflow-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur"><tr>{tabela.colunas.map((c) => <th key={c.chave} className="px-2 py-1 text-left font-medium text-muted-foreground">{c.rotulo}</th>)}</tr></thead>
        <tbody>{linhas.map((l, i) => <tr key={i} className="border-t border-border/60">{tabela.colunas.map((c) => <td key={c.chave} className="px-2 py-1 align-top tabular-nums">{formatarCelula(l[c.chave], c.tipo)}</td>)}</tr>)}</tbody>
      </table>
      {tabela.linhas.length > 200 && <p className="px-2 py-1 text-[11px] text-muted-foreground">Mostrando 200 de {tabela.linhas.length}.</p>}
    </div>
  );
}

function Arquivos({ consulta }) {
  if (!consulta?.arquivos?.length) return null;
  const url = (a) => `/monitoramento/consultas/${consulta.id}/arquivos/${a.indice}`;
  const falhar = (e) => toast({ title: "Não foi possível abrir o arquivo", description: e.message, variant: "destructive" });
  return (
    <ul className="flex flex-wrap gap-2">
      {consulta.arquivos.map((a) => (
        <li key={a.indice} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs">
          <span className="max-w-[16rem] truncate" title={a.nome}>{a.nome}</span>
          <button type="button" onClick={() => api.visualizar("GET", `${url(a)}?ver=1`).catch(falhar)} className="rounded p-0.5 hover:bg-muted" aria-label={`Ver ${a.nome}`} title="Ver"><Eye className="h-3.5 w-3.5" aria-hidden="true" /></button>
          <button type="button" onClick={() => api.baixar("GET", url(a), { nome: a.nome }).catch(falhar)} className="rounded p-0.5 hover:bg-muted" aria-label={`Baixar ${a.nome}`} title="Baixar"><Download className="h-3.5 w-3.5" aria-hidden="true" /></button>
        </li>
      ))}
    </ul>
  );
}

/** O resultado de uma consulta: nível, frase, destaques, PDF e tabela. */
export function Resultado({ consulta }) {
  const r = consulta?.resumo;
  if (!r) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm">{r.titulo}</p>
      {r.destaques?.length > 0 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {r.destaques.map((d, i) => <div key={i}><dt className="inline text-muted-foreground">{d.rotulo}: </dt><dd className="inline font-medium">{d.valor}</dd></div>)}
        </dl>
      )}
      <Arquivos consulta={consulta} />
      <TabelaResultado tabela={r.tabela} />
    </div>
  );
}

/**
 * Um serviço do monitoramento para um cliente: o último resultado, a consulta na hora (com os parâmetros, como a competência) e o
 * histórico. `base` é "/monitoramento/empresas/ID" ou "/monitoramento/pessoas/ID".
 */
export default function CartaoServico({ servico, ultima, base, desligado, aoConsultar }) {
  const qc = useQueryClient();
  const [params, setParams] = useState(() => Object.fromEntries(servico.parametros.map((p) => [p.nome, p.padrao || ""])));
  const [verHistorico, setVerHistorico] = useState(false);
  const [atual, setAtual] = useState(null);
  const historico = useQuery({ queryKey: ["monitoramento", "historico", base, servico.chave], queryFn: () => api.get(`${base}/historico/${servico.chave}`), enabled: verHistorico && base.includes("/empresas/") });
  const consultar = useMutation({
    mutationFn: () => api.post(`${base}/consultar`, { chave: servico.chave, parametros: params }),
    onSuccess: (c) => {
      setAtual(c);
      qc.invalidateQueries({ queryKey: ["monitoramento"] });
      aoConsultar?.(c);
      if (!c.sucesso) toast({ title: `${servico.rotulo}: o Serpro não trouxe o resultado`, description: c.resumo?.titulo, variant: "destructive" });
    },
    onError: (e) => toast({ title: "Não foi possível consultar", description: e.message, variant: "destructive" }),
  });
  const mostrada = atual || ultima;
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label={servico.rotulo}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{servico.rotulo}</h3>
          <p className="text-xs text-muted-foreground">{servico.descricao}</p>
        </div>
        <SeloNivel nivel={mostrada?.nivel} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {servico.parametros.map((p) => (
          <label key={p.nome} className="space-y-0.5">
            <span className="block text-[11px] text-muted-foreground">{p.rotulo}</span>
            <input className={`${campo} w-36`} type={p.tipo === "data" ? "date" : "text"} inputMode={p.tipo === "texto" ? "text" : "numeric"} value={params[p.nome] ?? ""} onChange={(e) => setParams((x) => ({ ...x, [p.nome]: e.target.value }))} placeholder={p.tipo === "periodo" ? "AAAAMM" : p.tipo === "ano" ? "AAAA" : ""} />
          </label>
        ))}
        <button type="button" disabled={desligado || consultar.isPending} onClick={() => consultar.mutate()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60" title={desligado ? "O monitoramento está desligado" : undefined}>
          {consultar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />} {mostrada ? "Consultar de novo" : "Consultar"}
        </button>
        {base.includes("/empresas/") && <button type="button" onClick={() => setVerHistorico((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted" aria-expanded={verHistorico}><History className="h-3.5 w-3.5" aria-hidden="true" /> Histórico</button>}
      </div>
      {mostrada ? (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Consultado em {quandoConsultou(mostrada.createdAt)}{mostrada.solicitado_por ? ` por ${mostrada.solicitado_por}` : ""}{mostrada.simulado ? " · demonstração" : ""}</p>
          <Resultado consulta={mostrada} />
        </div>
      ) : <p className="text-xs text-muted-foreground">Ainda não consultado.</p>}
      {verHistorico && (
        <div className="rounded-md bg-muted/40 p-2 text-xs">
          {historico.isLoading ? <p>Carregando…</p> : (historico.data || []).length === 0 ? <p>Sem histórico.</p> : (
            <ul className="space-y-1">{historico.data.map((h) => <li key={h.id} className="flex flex-wrap items-center gap-2"><SeloNivel nivel={h.nivel} /><span className="text-muted-foreground">{quandoConsultou(h.createdAt)}</span><span>{h.resumo?.titulo}</span>{h.arquivos?.length > 0 && <button type="button" onClick={() => setAtual(h)} className="text-primary hover:underline">ver</button>}</li>)}</ul>
          )}
        </div>
      )}
    </section>
  );
}
