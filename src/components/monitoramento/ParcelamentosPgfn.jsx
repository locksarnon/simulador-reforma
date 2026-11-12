import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { useConfirmar } from "@/components/ConfirmProvider";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SeloNivel } from "@/components/monitoramento/CartaoServico";

export const REGULARIZE = "https://www.regularize.pgfn.gov.br/";
export const SITUACOES_PGFN = { EM_DIA: "Em dia", EM_ATRASO: "Em atraso", LIQUIDADO: "Liquidado", RESCINDIDO: "Rescindido" };
export const ECAC = "https://cav.receita.fazenda.gov.br/";
/** Onde cada parcelamento é consultado. Fora do Simples e do MEI não há API oficial: o registro é feito aqui. */
export const ORGAOS = {
  PGFN: { rotulo: "PGFN (dívida ativa da União)", onde: "Regularize: Negociar dívida > Acessar o Sispar > Consultar", numero: "Número da negociação (conta)" },
  RFB: { rotulo: "Receita Federal", onde: "e-CAC: Pagamentos e Parcelamentos (parcelamentos não previdenciários, previdenciários, PAEX, SIPADE)", numero: "Número do parcelamento ou processo" },
  ESTADO: { rotulo: "Estado (SEFAZ)", onde: "Portal da Secretaria da Fazenda do estado do cliente", numero: "Número do parcelamento" },
  MUNICIPIO: { rotulo: "Município (prefeitura)", onde: "Portal da prefeitura do cliente", numero: "Número do parcelamento" },
};
const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const VAZIO = { orgao: "RFB", numero: "", modalidade: "", situacao: "EM_DIA", valor_consolidado: "", parcelas_total: "", parcelas_pagas: "", valor_parcela: "", proximo_vencimento: "", debito_automatico: false, observacao: "" };
const moeda = (v) => (typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");

function Formulario({ aberto, inicial, aoFechar, aoSalvar, salvando }) {
  const [f, setF] = useState(inicial);
  const mudar = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{inicial.id ? "Editar parcelamento" : "Novo parcelamento"}</DialogTitle>
          <DialogDescription>Copie de: {ORGAOS[f.orgao]?.onde}. Esses parcelamentos não têm consulta automática para escritórios.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); aoSalvar(f); }} className="grid gap-3 text-sm sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2"><span className="block text-xs text-muted-foreground">Órgão</span><select className={campo} value={f.orgao} onChange={(e) => mudar("orgao", e.target.value)}>{Object.entries(ORGAOS).map(([k, o]) => <option key={k} value={k}>{o.rotulo}</option>)}</select></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">{ORGAOS[f.orgao]?.numero}</span><input className={campo} value={f.numero} onChange={(e) => mudar("numero", e.target.value)} required /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Modalidade</span><input className={campo} value={f.modalidade} onChange={(e) => mudar("modalidade", e.target.value)} placeholder="Ex.: ordinário, transação, PERT" /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Situação</span><select className={campo} value={f.situacao} onChange={(e) => mudar("situacao", e.target.value)}>{Object.entries(SITUACOES_PGFN).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Próximo vencimento</span><input type="date" className={campo} value={f.proximo_vencimento} onChange={(e) => mudar("proximo_vencimento", e.target.value)} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Valor da parcela (R$)</span><input inputMode="decimal" className={campo} value={f.valor_parcela} onChange={(e) => mudar("valor_parcela", e.target.value)} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Valor consolidado (R$)</span><input inputMode="decimal" className={campo} value={f.valor_consolidado} onChange={(e) => mudar("valor_consolidado", e.target.value)} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Parcelas pagas</span><input inputMode="numeric" className={campo} value={f.parcelas_pagas} onChange={(e) => mudar("parcelas_pagas", e.target.value)} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Total de parcelas</span><input inputMode="numeric" className={campo} value={f.parcelas_total} onChange={(e) => mudar("parcelas_total", e.target.value)} /></label>
          <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={f.debito_automatico} onChange={(e) => mudar("debito_automatico", e.target.checked)} /> Débito automático ligado</label>
          <label className="space-y-1 sm:col-span-2"><span className="block text-xs text-muted-foreground">Observação</span><textarea className={`${campo} min-h-[60px]`} value={f.observacao} onChange={(e) => mudar("observacao", e.target.value)} /></label>
          <DialogFooter className="sm:col-span-2">
            <button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={salvando} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Monitoramento > Parcelamentos: os da Receita Federal, PGFN, estado e município, registrados à mão (sem API oficial), com alerta de vencimento. */
export default function ParcelamentosPgfn({ empresaId }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const { user } = useAuth();
  const lista = useQuery({ queryKey: ["monitoramento", "pgfn", empresaId], queryFn: () => api.get(`/monitoramento/empresas/${empresaId}/pgfn`) });
  const [editando, setEditando] = useState(null);
  const salvar = useMutation({
    mutationFn: (f) => (f.id ? api.put(`/monitoramento/empresas/${empresaId}/pgfn/${f.id}`, f) : api.post(`/monitoramento/empresas/${empresaId}/pgfn`, f)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["monitoramento"] }); setEditando(null); toast({ title: "Parcelamento salvo" }); },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  const apagar = async (p) => {
    if (!(await confirmar({ titulo: `Apagar o registro ${p.numero}?`, descricao: "Só o registro no InTAX sai; nada muda no órgão.", rotulo: "Apagar" }))) return;
    try { await api.delete(`/monitoramento/pgfn/${p.id}`); qc.invalidateQueries({ queryKey: ["monitoramento"] }); } catch (e) { toast({ title: "Não foi possível apagar", description: e.message, variant: "destructive" }); }
  };
  const abrir = (p) => setEditando(p ? { ...p, proximo_vencimento: p.proximo_vencimento ? String(p.proximo_vencimento).slice(0, 10) : "", valor_parcela: p.valor_parcela ?? "", valor_consolidado: p.valor_consolidado ?? "", parcelas_total: p.parcelas_total ?? "", parcelas_pagas: p.parcelas_pagas ?? "", modalidade: p.modalidade ?? "", observacao: p.observacao ?? "", orgao: p.orgao ?? "PGFN" } : VAZIO);
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Parcelamentos na Receita Federal, PGFN, estado e município">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Parcelamentos na Receita Federal, PGFN, estado e município</h3>
          <p className="text-xs text-muted-foreground">O Integra Contador só traz os parcelamentos do Simples e do MEI (abaixo, quando o cliente é do Simples ou MEI). Os demais (Receita Federal, PGFN, estado e município) não têm consulta automática para escritórios: o registro é feito aqui, e o sino avisa quando a parcela vence em até 5 dias ou atrasa. O relatório de situação fiscal mostra os parcelamentos federais ativos.</p>
        </div>
        <a href={ECAC} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted">Abrir o e-CAC <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
        <a href={REGULARIZE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted">Abrir o Regularize <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
        <button type="button" onClick={() => abrir(null)} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Registrar</button>
      </div>
      {lista.isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p> : (lista.data || []).length === 0 ? <p className="text-xs text-muted-foreground">Nenhum parcelamento registrado.</p> : (
        <ul className="divide-y divide-border/60 text-sm">
          {lista.data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start gap-2 py-2">
              <SeloNivel nivel={p.nivel} />
              <div className="min-w-0 flex-1">
                <p>{p.resumo}</p>
                <p className="text-[11px] text-muted-foreground">{[p.parcelas_total ? `${p.parcelas_pagas ?? 0} de ${p.parcelas_total} parcelas` : null, typeof p.valor_consolidado === "number" ? `consolidado ${moeda(p.valor_consolidado)}` : null, p.debito_automatico ? "débito automático" : null, p.atualizado_por ? `atualizado por ${p.atualizado_por}` : null].filter(Boolean).join(" · ")}</p>
              </div>
              <button type="button" onClick={() => abrir(p)} className="rounded p-1 hover:bg-muted" aria-label={`Editar ${p.numero}`}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
              {user?.role === "admin" && <button type="button" onClick={() => apagar(p)} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label={`Apagar ${p.numero}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
            </li>
          ))}
        </ul>
      )}
      {editando && <Formulario key={editando.id || "novo"} aberto inicial={editando} aoFechar={() => setEditando(null)} aoSalvar={(f) => salvar.mutate(f)} salvando={salvar.isPending} />}
    </section>
  );
}
