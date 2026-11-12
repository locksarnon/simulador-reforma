import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileCheck2, Loader2, RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TabelaPadrao from "@/components/TabelaPadrao";
import { BotoesDocumento } from "@/components/monitoramento/CartaoServico";
import { quandoConsultou } from "@/lib/monitoramento";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SITUACAO = {
  TRANSMITIDA: { rotulo: "Transmitida", tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  NAO_ENCONTRADA: { rotulo: "Não encontrada", tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  NO_PRAZO: { rotulo: "No prazo", tom: "bg-muted text-muted-foreground" },
  FUTURA: { rotulo: "No prazo", tom: "bg-muted text-muted-foreground" },
};
const comp = (c) => (c.length === 4 ? `Ano ${c}` : `${MESES[Number(c.slice(5, 7)) - 1]}/${c.slice(0, 4)}`);

/** Linhas da tabela de uma escrituração: uma por competência (mês nas EFD, ano na ECD e na ECF). */
export function linhasDaEscrituracao(e) {
  return (e?.meses || []).map((m) => ({
    id: `${e.id}-${m.competencia}`, escrituracao: e.id, competencia: m.competencia, situacao: m.situacao, transmissoes: m.transmissoes,
    transmissao: m.ultima?.transmissao || "", recibo: m.ultima?.recibo || "", tipo: m.ultima ? (m.ultima.retificadora ? "Retificadora" : m.ultima.tipo || "Original") : "",
    ultima: m.ultima,
  }));
}

/** Download da escrituração: pede à Receita e acompanha; quando chega, Ver e Baixar do arquivo guardado no cliente. */
function DownloadSped({ linha, empresaId, downloads, proprio, aoPedir }) {
  const d = linha.ultima ? downloads.find((x) => x.arquivo_receita === linha.ultima.id) : null;
  const pedir = useMutation({
    mutationFn: () => api.post(`/monitoramento/empresas/${empresaId}/sped/baixar`, { escrituracao: linha.escrituracao, competencia: linha.competencia, arquivoId: linha.ultima.id, servico: linha.ultima.servico, recibo: linha.recibo, retificadora: !!linha.ultima.retificadora, proprio }),
    onSuccess: (r) => { aoPedir(); toast({ title: r.situacao === "ERRO" ? "A Receita recusou o pedido" : "Pedido enviado à Receita", description: r.situacao === "ERRO" ? r.mensagem : "O arquivo vai para Arquivos (pasta SPED).", variant: r.situacao === "ERRO" ? "destructive" : undefined }); },
    onError: (e) => toast({ title: "Não foi possível pedir o arquivo", description: e.message, variant: "destructive" }),
  });
  if (!linha.ultima) return <span className="text-[11px] text-muted-foreground">—</span>;
  if (d?.situacao === "GUARDADO" && d.arquivo_id) return <BotoesDocumento url={`/documentos/arquivos/${d.arquivo_id}/download`} nome={`${linha.escrituracao} ${linha.competencia}`} rotulo={`escrituração ${linha.competencia}`} />;
  if (d && d.situacao !== "ERRO") return <span className="inline-flex items-center gap-1 text-[11px] text-sky-700 dark:text-sky-300"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />Na fila da Receita</span>;
  return (
    <button type="button" disabled={pedir.isPending} onClick={() => pedir.mutate()} title={d?.mensagem || "Guarda em Arquivos (pasta SPED)"} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted disabled:opacity-60">
      {pedir.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}{d?.situacao === "ERRO" ? "Tentar de novo" : "Baixar da Receita"}
    </button>
  );
}

/**
 * Monitoramento > Declarações > SPED transmitido: a Receita diz, pelo ReceitanetBX, o que foi transmitido de EFD ICMS/IPI,
 * EFD-Contribuições, ECD e ECF, e o arquivo é baixado para os Arquivos do cliente. Nada é digitado à mão.
 */
export default function SpedTransmitido({ empresaId }) {
  const qc = useQueryClient();
  const [ano, setAno] = useState(new Date().getFullYear());
  const q = useQuery({ queryKey: ["monitoramento", "sped", empresaId, ano], queryFn: () => api.get(`/monitoramento/empresas/${empresaId}/sped`, { ano }), retry: false, staleTime: 10 * 60_000 });
  const dl = useQuery({
    queryKey: ["monitoramento", "sped-downloads", empresaId], queryFn: () => api.get(`/monitoramento/empresas/${empresaId}/sped/downloads`),
    refetchInterval: (x) => ((x.state.data || []).some((d) => ["SOLICITADO", "PROCESSANDO", "DISPONIVEL"].includes(d.situacao)) ? 20_000 : false),
  });
  const downloads = dl.data || [];
  const colunas = [
    { chave: "competencia", rotulo: "Competência", valor: (l) => comp(l.competencia), quebrar: false },
    { chave: "situacao", rotulo: "Situação", valor: (l) => SITUACAO[l.situacao].rotulo, render: (l) => <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${SITUACAO[l.situacao].tom}`}>{SITUACAO[l.situacao].rotulo}</span>, quebrar: false },
    { chave: "transmissao", rotulo: "Transmitida em", tipo: "data", quebrar: false },
    { chave: "tipo", rotulo: "Original ou retificadora" },
    { chave: "transmissoes", rotulo: "Transmissões", valor: (l) => (l.transmissoes ? String(l.transmissoes) : "") },
    { chave: "recibo", rotulo: "Recibo", render: (l) => <span className="font-mono text-xs">{l.recibo}</span> },
  ];
  const escrituracoes = q.data?.escrituracoes || [];
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="SPED transmitido">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex flex-1 items-center gap-1.5 text-sm font-semibold"><FileCheck2 className="h-4 w-4 text-primary" aria-hidden="true" />SPED e EFD: o que a Receita recebeu</h3>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">Ano
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="rounded border border-border bg-background px-1.5 py-1 text-xs">
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <button type="button" disabled={q.isFetching} onClick={() => q.refetch()} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted disabled:opacity-60">{q.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}Consultar na Receita</button>
      </div>
      <p className="text-xs text-muted-foreground">
        {q.data ? `Consultado em ${quandoConsultou(q.data.consultado_em)}${q.data.certificados?.length ? ` com ${q.data.certificados.join(" e ")}` : ""}.` : ""}
      </p>
      {q.isLoading && <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden="true" />Consultando a Receita…</p>}
      {q.error && <p role="alert" className="text-sm">{q.error.message}</p>}
      {escrituracoes.length > 0 && (
        <Tabs defaultValue={escrituracoes[0].id}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            {[...escrituracoes, { id: "REINF", rotulo: "EFD-Reinf", meses: [] }].map((e) => {
              const falta = e.meses.filter((m) => m.situacao === "NAO_ENCONTRADA").length;
              return <TabsTrigger key={e.id} value={e.id} className="gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{e.rotulo.split(" (")[0]}{(falta > 0 || e.erro) && <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-label="com pendência" />}</TabsTrigger>;
            })}
          </TabsList>
          {escrituracoes.map((e) => (
            <TabsContent key={e.id} value={e.id} className="mt-3 space-y-2">
              <p className="text-xs font-medium">{e.rotulo}</p>
              {e.erro && <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{e.erro}</p>}
              <TabelaPadrao id={`monit:sped:${e.id}`} colunas={colunas} linhas={linhasDaEscrituracao(e)} ariaLabel={`${e.rotulo} por competência`} tamanhoInicial={25} vazio="Nada para mostrar."
                documentos={(l) => <DownloadSped linha={l} empresaId={empresaId} downloads={downloads} proprio={!!q.data?.proprio} aoPedir={() => qc.invalidateQueries({ queryKey: ["monitoramento", "sped-downloads", empresaId] })} />} />
            </TabsContent>
          ))}
          <TabsContent value="REINF" className="mt-3 space-y-2">
            <p className="text-xs font-medium">EFD-Reinf (Escrituração Fiscal Digital de Retenções e Outras Informações Fiscais)</p>
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs">Entrega da Reinf: veja a DCTFWeb (aba Declarações).</p>
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
