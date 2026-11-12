import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TabelaPadrao from "@/components/TabelaPadrao";
import { quandoConsultou } from "@/lib/monitoramento";

const brl = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const pct = (v) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
const comp = (c) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
const TOM = { OK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", ATENCAO: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300", EXCEDEU: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" };
const ROTULO = { OK: "Dentro do sublimite", ATENCAO: "Perto do sublimite", EXCEDEU: "Acima do sublimite" };

function Numero({ rotulo, valor, destaque }) {
  return <div className="rounded-lg border border-border px-3 py-2"><p className="text-[11px] text-muted-foreground">{rotulo}</p><p className={`text-sm tabular-nums ${destaque ? "font-semibold" : ""}`}>{valor}</p></div>;
}

/** Monitoramento > Declarações > Simples: sublimite, faturamento e Fator R, lidos da última declaração do PGDAS-D. */
export default function SimplesNacional({ empresaId }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["monitoramento", "simples", empresaId], queryFn: () => api.get(`/monitoramento/empresas/${empresaId}/simples`) });
  const atualizar = useMutation({
    mutationFn: () => api.post(`/monitoramento/empresas/${empresaId}/simples/atualizar`, {}),
    onSuccess: (r) => { qc.setQueryData(["monitoramento", "simples", empresaId], r); qc.invalidateQueries({ queryKey: ["monitoramento"] }); },
    onError: (e) => toast({ title: "Não foi possível consultar", description: e.message, variant: "destructive" }),
  });
  const d = q.data;
  const a = d?.analise;
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Simples Nacional">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-sm font-semibold">Simples Nacional{a?.periodo ? ` · declaração de ${comp(a.periodo)}` : ""}</h3>
        {d?.consultado_em && <span className="text-[11px] text-muted-foreground">{quandoConsultou(d.consultado_em)}{d.simulado ? " · demonstração" : ""}</span>}
        <button type="button" disabled={atualizar.isPending} onClick={() => atualizar.mutate()} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted disabled:opacity-60">{atualizar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}Consultar na Receita</button>
      </div>
      {q.isLoading && <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden="true" />Carregando…</p>}
      {d && !a && <p className="text-sm text-muted-foreground">Sem declaração lida.</p>}
      {a && (
        <Tabs defaultValue="sublimite">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            {[["sublimite", "Sublimite"], ["faturamento", "Faturamento"], ["fator-r", "Fator R"]].map(([v, r]) => <TabsTrigger key={v} value={v} className="rounded-md border border-border px-2.5 py-1 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{r}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="sublimite" className="mt-3 space-y-3">
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${TOM[a.sublimite.situacao]}`}>{ROTULO[a.sublimite.situacao]}</span>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Numero rotulo="Receita no ano (RBA)" valor={brl(a.sublimite.rba)} destaque />
              <Numero rotulo="Receita 12 meses (RBT12)" valor={brl(a.sublimite.rbt12)} />
              <Numero rotulo="Ano anterior (RBAA)" valor={brl(a.sublimite.rbaa)} />
              <Numero rotulo="Sublimite" valor={brl(a.sublimite.sublimite)} />
              <Numero rotulo="% do sublimite" valor={pct(a.sublimite.percentual_sublimite)} destaque />
              <Numero rotulo="% do limite (R$ 4,8 mi)" valor={pct(a.sublimite.percentual_limite)} />
            </div>
          </TabsContent>
          <TabsContent value="faturamento" className="mt-3">
            <TabelaPadrao id="monit:simples:faturamento" ariaLabel="Faturamento mês a mês" tamanhoInicial={25}
              colunas={[
                { chave: "competencia", rotulo: "Competência", valor: (l) => comp(l.competencia), quebrar: false },
                { chave: "interno", rotulo: "Mercado interno", valor: (l) => brl(l.interno) },
                { chave: "externo", rotulo: "Mercado externo", valor: (l) => brl(l.externo) },
                { chave: "total", rotulo: "Total", valor: (l) => brl(l.total), render: (l) => <span className="font-medium tabular-nums">{brl(l.total)}</span> },
              ]}
              linhas={a.faturamento.map((f) => ({ ...f, id: f.competencia }))} />
          </TabsContent>
          <TabsContent value="fator-r" className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <Numero rotulo="Fator r" valor={a.fator_r.percentual === null ? (a.fator_r.texto || "—") : pct(a.fator_r.percentual)} destaque />
              <Numero rotulo="Anexo" valor={a.fator_r.anexo ? `Anexo ${a.fator_r.anexo}` : "—"} />
              <Numero rotulo="Folha 12 meses" valor={brl(a.fator_r.folha12)} />
              <Numero rotulo="Receita 12 meses" valor={brl(a.fator_r.rbt12)} />
            </div>
            {a.fator_r.folha.length > 0 && (
              <TabelaPadrao id="monit:simples:folha" ariaLabel="Folha de salários" tamanhoInicial={25}
                colunas={[{ chave: "competencia", rotulo: "Competência", valor: (l) => comp(l.competencia) }, { chave: "valor", rotulo: "Folha de salários", valor: (l) => brl(l.valor) }]}
                linhas={a.fator_r.folha.map((f) => ({ ...f, id: f.competencia }))} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
