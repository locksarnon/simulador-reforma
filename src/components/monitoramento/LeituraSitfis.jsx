import { useQuery } from "@tanstack/react-query";
import { Download, Eye, FileText } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { quandoConsultou } from "@/lib/monitoramento";

export const useLeituraSitfis = (empresaId) => useQuery({ queryKey: ["monitoramento", "sitfis-leitura", empresaId], queryFn: () => api.get(`/monitoramento/empresas/${empresaId}/situacao-fiscal`), enabled: !!empresaId });

const TOM = {
  PENDENCIA: "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30",
  OMISSAO: "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30",
  SUSPENSO: "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",
  OUTRO: "border-border bg-muted/30",
};
const ROTULO = { PENDENCIA: "Pendência", OMISSAO: "Omissão", SUSPENSO: "Exigibilidade suspensa", OUTRO: "Informação" };

/** O PDF oficial do relatório (Receita e PGFN), para ver ou baixar. */
export function PdfDoRelatorio({ dados }) {
  if (!dados?.arquivo) return null;
  const url = `/monitoramento/consultas/${dados.consulta_id}/arquivos/${dados.arquivo.indice}`;
  const falhar = (e) => toast({ title: "Não foi possível abrir", description: e.message, variant: "destructive" });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => api.visualizar("GET", `${url}?ver=1`).catch(falhar)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"><Eye className="h-3.5 w-3.5" aria-hidden="true" /> Ver o relatório (PDF oficial)</button>
      <button type="button" onClick={() => api.baixar("GET", url, { nome: dados.arquivo.nome }).catch(falhar)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"><Download className="h-3.5 w-3.5" aria-hidden="true" /> Baixar</button>
    </span>
  );
}

/**
 * Seções lidas do Relatório de Situação Fiscal (Receita Federal e PGFN), sem nada digitado à mão.
 * `filtro` escolhe o que mostrar (ex.: só parcelamentos, só omissões); `vazio` é o texto quando o relatório não traz nada daquilo.
 */
export default function LeituraSitfis({ empresaId, titulo, filtro = () => true, vazio, descricao }) {
  const { data, isLoading } = useLeituraSitfis(empresaId);
  if (isLoading) return <p className="text-xs text-muted-foreground">Lendo o relatório de situação fiscal…</p>;
  const secoes = (data?.leitura?.secoes || []).filter(filtro);
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label={titulo}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" aria-hidden="true" />{titulo}</h3>
          <p className="text-xs text-muted-foreground">
            {descricao}{" "}
            {data ? `Fonte: relatório de situação fiscal da Receita e da PGFN (Integra Contador), consultado em ${quandoConsultou(data.consultado_em)}${data.simulado ? " (demonstração)" : ""}.` : "Ainda não há relatório de situação fiscal deste cliente: consulte na aba Situação fiscal (ou use Atualizar tudo)."}
          </p>
        </div>
        <PdfDoRelatorio dados={data} />
      </div>
      {data && !data.leitura && <p className="text-xs text-muted-foreground">O relatório guardado não pôde ser lido automaticamente. Abra o PDF oficial.</p>}
      {data?.leitura && secoes.length === 0 && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{vazio}</p>}
      {secoes.map((s, i) => (
        <details key={`${s.titulo}-${i}`} className={`rounded-lg border p-3 ${TOM[s.tipo] ?? TOM.OUTRO}`} open={secoes.length <= 3}>
          <summary className="cursor-pointer text-sm">
            <span className="font-medium">{s.titulo}</span>
            <span className="ml-2 text-xs text-muted-foreground">{s.orgao === "PGFN" ? "PGFN" : "Receita Federal"} · {ROTULO[s.tipo] ?? s.tipo} · {Math.max(0, s.linhas.length - 1)} linha(s)</span>
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-xs">
              <tbody>
                {s.linhas.map((l, n) => <tr key={n} className={n === 0 ? "font-medium text-muted-foreground" : "border-t border-border/50"}><td className="whitespace-pre-wrap py-1 pr-2 font-mono tabular-nums">{l}</td></tr>)}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </section>
  );
}
