import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, Loader2, Plus } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const dia = (v) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");

function Registro({ alvo, declaracoes, empresaId, aoFechar }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [f, setF] = useState({ obrigacao: alvo.obrigacao, competencia: alvo.competencia, recibo: alvo.atual?.recibo ?? "", transmitida_em: alvo.atual?.transmitida_em ? String(alvo.atual.transmitida_em).slice(0, 10) : "", observacao: alvo.atual?.observacao ?? "" });
  const [arquivo, setArquivo] = useState(null);
  const mudar = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const recarregar = () => qc.invalidateQueries({ queryKey: ["entregas", empresaId] });
  const salvar = useMutation({
    mutationFn: () => (arquivo ? api.upload(`/monitoramento/empresas/${empresaId}/entregas`, arquivo, f) : api.post(`/monitoramento/empresas/${empresaId}/entregas`, f)),
    onSuccess: () => { recarregar(); aoFechar(); toast({ title: "Entrega registrada" }); },
    onError: (e) => toast({ title: "Não foi possível registrar", description: e.message, variant: "destructive" }),
  });
  const apagar = useMutation({
    mutationFn: () => api.delete(`/monitoramento/entregas/${alvo.atual.id}`),
    onSuccess: () => { recarregar(); aoFechar(); toast({ title: "Registro apagado" }); },
    onError: (e) => toast({ title: "Não foi possível apagar", description: e.message, variant: "destructive" }),
  });
  const d = declaracoes.find((x) => x.id === f.obrigacao);
  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{alvo.atual ? "Entrega registrada" : "Registrar entrega"}</DialogTitle>
          <DialogDescription>{d?.onde}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="grid gap-3 text-sm sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2"><span className="block text-xs text-muted-foreground">Declaração</span><select className={campo} value={f.obrigacao} onChange={(e) => mudar("obrigacao", e.target.value)}>{declaracoes.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}</select></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Competência (AAAAMM)</span><input className={campo} value={f.competencia} onChange={(e) => mudar("competencia", e.target.value)} inputMode="numeric" required /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Transmitida em</span><input type="date" className={campo} value={f.transmitida_em} onChange={(e) => mudar("transmitida_em", e.target.value)} /></label>
          <label className="space-y-1 sm:col-span-2"><span className="block text-xs text-muted-foreground">Número do recibo</span><input className={campo} value={f.recibo} onChange={(e) => mudar("recibo", e.target.value)} /></label>
          <label className="space-y-1 sm:col-span-2"><span className="block text-xs text-muted-foreground">Recibo em PDF {alvo.atual?.arquivo ? `(já guardado: ${alvo.atual.arquivo.nome}; envie outro para trocar)` : "(opcional)"}</span><input type="file" accept="application/pdf,.pdf" className={campo} onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} /></label>
          <label className="space-y-1 sm:col-span-2"><span className="block text-xs text-muted-foreground">Observação</span><input className={campo} value={f.observacao} onChange={(e) => mudar("observacao", e.target.value)} /></label>
          <DialogFooter className="sm:col-span-2">
            {alvo.atual && user?.role === "admin" && <button type="button" disabled={apagar.isPending} onClick={() => apagar.mutate()} className="mr-auto rounded-md px-3 py-1.5 text-destructive hover:bg-destructive/10">Apagar registro</button>}
            <button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={salvar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Aba Declarações: SPED Fiscal, SPED Contribuições, DIRBI e EFD-Reinf, que não têm consulta automática; quadro do ano com o recibo de cada entrega. */
export default function EntregasDeclaracoes({ empresaId }) {
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [alvo, setAlvo] = useState(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["entregas", empresaId, ano], queryFn: () => api.get(`/monitoramento/empresas/${empresaId}/entregas`, { ano }), enabled: /^\d{4}$/.test(ano) });
  const hoje = new Date();
  const compAtual = `${hoje.getFullYear()}${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const falhar = (e) => toast({ title: "Não foi possível baixar", description: e.message, variant: "destructive" });
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Outras declarações: registro de entrega">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">SPED Fiscal, SPED Contribuições, DIRBI e EFD-Reinf</h3>
          <p className="text-xs text-muted-foreground">O Integra Contador não tem consulta dessas declarações. Registre cada entrega com o recibo: o quadro mostra o ano, e o recibo fica em Arquivos e documentos (pasta Recibos de declarações). Quem não tem a obrigação: marque acima em "Obrigações que este cliente não tem".</p>
        </div>
        <label className="text-xs"><span className="sr-only">Ano</span><input type="number" min="2015" max="2100" value={ano} onChange={(e) => setAno(e.target.value)} className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm" aria-label="Ano" /></label>
        <button type="button" disabled={!data} onClick={() => setAlvo({ obrigacao: "EFD_REINF", competencia: compAtual })} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Registrar entrega</button>
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {error && <p role="alert" className="text-xs">Não foi possível carregar: {error.message}</p>}
      {data && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs" aria-label={`Entregas de ${ano}`}>
            <thead><tr className="text-left text-muted-foreground"><th className="py-1.5 pr-2 font-medium">Declaração</th>{MESES.map((m) => <th key={m} className="px-1 py-1.5 text-center font-medium">{m}</th>)}</tr></thead>
            <tbody>
              {data.declaracoes.map((d) => (
                <tr key={d.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-2 font-medium">{d.rotulo}{d.dispensada && <span className="ml-1 font-normal text-muted-foreground">(não tem)</span>}</td>
                  {MESES.map((_, i) => {
                    const comp = `${ano}${String(i + 1).padStart(2, "0")}`;
                    const e = data.entregas.find((x) => x.obrigacao === d.id && x.competencia === comp);
                    const passou = comp < compAtual;
                    return (
                      <td key={comp} className="px-1 py-1 text-center">
                        {d.dispensada ? <span className="text-muted-foreground" aria-label="não se aplica">·</span> : e ? (
                          <span className="inline-flex items-center gap-0.5">
                            <button type="button" onClick={() => setAlvo({ obrigacao: d.id, competencia: comp, atual: e })} className="inline-flex h-6 w-6 items-center justify-center rounded bg-emerald-100 text-emerald-800 hover:ring-1 hover:ring-emerald-400 dark:bg-emerald-950 dark:text-emerald-300" aria-label={`${d.rotulo} ${MESES[i]}/${ano}: entregue${e.transmitida_em ? ` em ${dia(e.transmitida_em)}` : ""}`} title={`Entregue${e.transmitida_em ? ` em ${dia(e.transmitida_em)}` : ""}${e.recibo ? ` · recibo ${e.recibo}` : ""}`}><Check className="h-3.5 w-3.5" aria-hidden="true" /></button>
                            {e.arquivo && <button type="button" onClick={() => api.baixar("GET", `/documentos/arquivos/${e.arquivo.id}/download`, { nome: e.arquivo.nome }).catch(falhar)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label={`Baixar o recibo de ${d.rotulo} ${MESES[i]}/${ano}`}><Download className="h-3 w-3" aria-hidden="true" /></button>}
                          </span>
                        ) : (
                          <button type="button" onClick={() => setAlvo({ obrigacao: d.id, competencia: comp })} className={`inline-flex h-6 w-6 items-center justify-center rounded border border-dashed hover:bg-muted ${passou ? "border-amber-400 text-amber-700 dark:text-amber-400" : "border-border text-muted-foreground"}`} aria-label={`Registrar ${d.rotulo} ${MESES[i]}/${ano}`} title={passou ? "Sem registro de entrega" : "Registrar"}>+</button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted-foreground">Verde: entregue (clique para ver ou corrigir) · tracejado âmbar: competência passada sem registro · cinza: ainda não chegou.</p>
        </div>
      )}
      {alvo && data && <Registro alvo={alvo} declaracoes={data.declaracoes} empresaId={empresaId} aoFechar={() => setAlvo(null)} />}
    </section>
  );
}
