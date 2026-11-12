import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileCheck2, Loader2, RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import TabelaPadrao from "@/components/TabelaPadrao";
import { quandoConsultou } from "@/lib/monitoramento";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SITUACAO = {
  TRANSMITIDA: { rotulo: "Transmitida", tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  NAO_ENCONTRADA: { rotulo: "Não encontrada", tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  FUTURA: { rotulo: "Ainda não venceu", tom: "bg-muted text-muted-foreground" },
};
const comp = (c) => `${MESES[Number(c.slice(5, 7)) - 1]}/${c.slice(0, 4)}`;

/** Linhas da tabela: uma por escrituração e competência. */
export function linhasDoSped(dados) {
  return (dados?.escrituracoes || []).flatMap((e) => e.meses.map((m) => ({
    id: `${e.id}-${m.competencia}`, escrituracao: e.rotulo, competencia: m.competencia, situacao: m.situacao, transmissoes: m.transmissoes,
    transmissao: m.ultima?.transmissao || "", recibo: m.ultima?.recibo || "", tipo: m.ultima ? (m.ultima.retificadora ? "Retificadora" : m.ultima.tipo || "Original") : "",
  })));
}

/**
 * Monitoramento > Declarações > SPED transmitido: a Receita diz, pelo ReceitanetBX, o que foi transmitido de EFD ICMS/IPI e
 * EFD-Contribuições no ano, mês a mês. Nada é digitado à mão.
 */
export default function SpedTransmitido({ empresaId }) {
  const [ano, setAno] = useState(new Date().getFullYear());
  const q = useQuery({ queryKey: ["monitoramento", "sped", empresaId, ano], queryFn: () => api.get(`/monitoramento/empresas/${empresaId}/sped`, { ano }), retry: false, staleTime: 10 * 60_000 });
  const erros = (q.data?.escrituracoes || []).filter((e) => e.erro);
  const colunas = [
    { chave: "escrituracao", rotulo: "Escrituração", quebrar: false },
    { chave: "competencia", rotulo: "Competência", valor: (l) => comp(l.competencia), quebrar: false },
    { chave: "situacao", rotulo: "Situação", valor: (l) => SITUACAO[l.situacao].rotulo, render: (l) => <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${SITUACAO[l.situacao].tom}`}>{SITUACAO[l.situacao].rotulo}</span>, quebrar: false },
    { chave: "transmissao", rotulo: "Transmitida em", tipo: "data", quebrar: false },
    { chave: "tipo", rotulo: "Original ou retificadora" },
    { chave: "transmissoes", rotulo: "Transmissões", valor: (l) => (l.transmissoes ? String(l.transmissoes) : "") },
    { chave: "recibo", rotulo: "Recibo", render: (l) => <span className="font-mono text-xs">{l.recibo}</span> },
  ];
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="SPED transmitido">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex flex-1 items-center gap-1.5 text-sm font-semibold"><FileCheck2 className="h-4 w-4 text-primary" aria-hidden="true" />EFD ICMS/IPI e EFD-Contribuições transmitidas</h3>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">Ano
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="rounded border border-border bg-background px-1.5 py-1 text-xs">
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <button type="button" disabled={q.isFetching} onClick={() => q.refetch()} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted disabled:opacity-60">{q.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}Consultar na Receita</button>
      </div>
      <p className="text-xs text-muted-foreground">
        Fonte: Receita Federal, pelo ReceitanetBX (programa oficial), com o certificado do escritório e o do sócio (o que tiver procuração eletrônica do cliente no e-CAC){q.data?.certificados?.length ? `; encontrado com: ${q.data.certificados.join(" e ")}` : ""}.
        {q.data ? ` Consultado em ${quandoConsultou(q.data.consultado_em)}.` : ""}
      </p>
      {q.isLoading && <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden="true" />Consultando a Receita…</p>}
      {q.error && <p role="alert" className="text-sm">{q.error.message}</p>}
      {erros.map((e) => <p key={e.id} role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{e.rotulo}: {e.erro}</p>)}
      {q.data && <TabelaPadrao id="monit:sped" colunas={colunas} linhas={linhasDoSped(q.data)} ariaLabel="SPED transmitido por competência" tamanhoInicial={25} vazio="Nada para mostrar." />}
    </section>
  );
}
