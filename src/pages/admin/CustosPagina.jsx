import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";

export const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mesAtual = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 7);
const campo = "h-8 rounded-md border border-input bg-background px-2 text-sm tabular-nums";

/** Administração > Custos das ferramentas: preços do contrato, custos fixos e o mês por usuário. */
export default function CustosPagina() {
  const qc = useQueryClient();
  const [mes, setMes] = useState(mesAtual());
  const q = useQuery({ queryKey: ["custos", "geral", mes], queryFn: () => api.get("/custos", { mes }) });
  const [precos, setPrecos] = useState({});
  const [fixos, setFixos] = useState([]);
  useEffect(() => { if (q.data) { setPrecos(q.data.precos || {}); setFixos(q.data.fixos || []); } }, [q.data]);
  const salvar = useMutation({
    mutationFn: () => api.put("/custos/precos", { precos, fixos }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["custos"] }); toast({ title: "Preços salvos" }); },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  const d = q.data;
  const itens = d?.itens || [];
  const colunas = [
    { chave: "usuario", rotulo: "Usuário" },
    { chave: "chamadas", rotulo: "Chamadas", tipo: "numero", alinhar: "direita" },
    ...itens.map((i) => ({ chave: i.id, rotulo: i.rotulo, alinhar: "direita", valor: (l) => l.itens.find((y) => y.id === i.id)?.subtotal ?? null, render: (l) => { const x = l.itens.find((y) => y.id === i.id); return x?.quantidade ? `${x.quantidade} · ${brl(x.subtotal)}` : ""; } })),
    { chave: "total", rotulo: "Total", alinhar: "direita", render: (l) => <span className="font-medium tabular-nums">{brl(l.total)}</span> },
  ];
  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Custos das ferramentas" }]} title="Custos das ferramentas externas" />
      <div className="px-6 lg:px-8 py-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm"><span className="block text-xs text-muted-foreground">Mês</span><input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={campo} /></label>
          {d && (
            <div className="flex flex-wrap gap-4 text-sm">
              <span>Variável: <strong className="tabular-nums">{brl(d.variavel)}</strong></span>
              <span title={(d.fixos_do_mes || []).map((f) => `${f.rotulo}: ${brl(f.valor)}`).join(" · ")}>Fixos: <strong className="tabular-nums">{brl(d.fixo)}</strong></span>
              <span>Total do escritório: <strong className="tabular-nums">{brl(d.total)}</strong></span>
            </div>
          )}
        </div>
        {q.isLoading && <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden="true" />Calculando…</p>}
        {q.error && <p role="alert" className="text-sm">{q.error.message}</p>}
        {d && <TabelaPadrao id="admin:custos" colunas={colunas} linhas={d.usuarios.map((u) => ({ ...u, id: u.usuario }))} ariaLabel="Custos do mês por usuário" vazio="Nenhuma chamada paga neste mês." />}

        <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Preços">
          <h2 className="font-heading text-sm font-semibold">Preços do contrato (por chamada)</h2>
          <p className="text-xs text-muted-foreground">Em branco vale a tabela oficial ({d?.fontes ? <><a className="text-primary hover:underline" href={d.fontes.serpro_integra} target="_blank" rel="noreferrer">Integra Contador</a>, <a className="text-primary hover:underline" href={d.fontes.serpro_cnd} target="_blank" rel="noreferrer">Consulta CND</a>, <a className="text-primary hover:underline" href={d.fontes.serpro_divida} target="_blank" rel="noreferrer">Dívida Ativa</a>, <a className="text-primary hover:underline" href={d.fontes.infosimples} target="_blank" rel="noreferrer">Infosimples</a></> : "Serpro e Infosimples"}).</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {itens.map((i) => (
              <label key={i.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span className="min-w-0"><span className="block truncate">{i.rotulo}</span><span className="text-[11px] text-muted-foreground">{i.fornecedor}{Number(precos[i.id]) > 0 ? " · preço do contrato" : i.id === "SERPRO_CONSULTA_NFE" ? " · preço do contrato obrigatório" : " · tabela oficial"}</span></span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">R$<input type="number" min="0" step="0.0001" value={precos[i.id] || ""} placeholder={d?.oficiais?.[i.id] != null ? String(d.oficiais[i.id]).replace(".", ",") : ""} onChange={(e) => setPrecos((p) => ({ ...p, [i.id]: e.target.value }))} className={`${campo} w-24 text-right`} aria-label={`Preço: ${i.rotulo}`} /></span>
              </label>
            ))}
          </div>
          <h3 className="pt-2 text-sm font-medium">Custos fixos do mês</h3>
          <div className="space-y-2">
            {fixos.map((f, k) => (
              <div key={k} className="flex flex-wrap items-center gap-2">
                <input value={f.rotulo} onChange={(e) => setFixos((x) => x.map((y, j) => (j === k ? { ...y, rotulo: e.target.value } : y)))} placeholder="Descrição" className={`${campo} min-w-[220px] flex-1`} aria-label="Descrição do custo fixo" />
                <span className="flex items-center gap-1 text-xs text-muted-foreground">R$<input type="number" min="0" step="0.01" value={f.valor} onChange={(e) => setFixos((x) => x.map((y, j) => (j === k ? { ...y, valor: e.target.value } : y)))} className={`${campo} w-28 text-right`} aria-label="Valor mensal" /></span>
                <button type="button" onClick={() => setFixos((x) => x.filter((_, j) => j !== k))} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Remover custo fixo"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setFixos((x) => [...x, { rotulo: "", valor: 0 }])} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"><Plus className="h-3.5 w-3.5" aria-hidden="true" />Custo fixo</button>
          </div>
          <button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Salvar preços</button>
        </section>
      </div>
    </div>
  );
}
