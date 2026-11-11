import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SeletorDeEmpresa from "@/components/SeletorDeEmpresa";
import { brl, COMPLEXIDADES, MODULOS_HONORARIO, REGIMES_HONORARIO, SERVICOS, totaisDosItens, validadePadrao } from "@/lib/propostas";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Calculadora de honorários do BPO: sugere o honorário mensal pela tabela do escritório e mostra de onde vem cada parcela. */
export function CalculadoraHonorarios({ aoUsar, regimeInicial }) {
  const [e, setE] = useState({ regime: regimeInicial || "Lucro Presumido", notas_mes: 300, estabelecimentos: 1, modulos: ["XML", "OBRIGACOES", "TAREFAS"], complexidade: "MEDIA" });
  const { data: tabela } = useQuery({ queryKey: ["propostas", "tabela"], queryFn: () => api.get("/propostas/tabela") });
  const calc = useMutation({ mutationFn: () => api.post("/propostas/calcular", e) });
  const mudar = (k, v) => setE((x) => ({ ...x, [k]: v }));
  const alternar = (m) => mudar("modulos", e.modulos.includes(m) ? e.modulos.filter((x) => x !== m) : [...e.modulos, m]);
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
      <p className="flex items-center gap-1.5 text-xs font-medium"><Calculator className="h-3.5 w-3.5" aria-hidden="true" /> Calculadora de honorários do BPO</p>
      {tabela?.exemplo && <p className="text-[11px] text-amber-700 dark:text-amber-400">A tabela de honorários ainda tem os valores de exemplo. Um administrador ajusta na aba Tabela de honorários.</p>}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="space-y-1"><span className="block text-[11px] text-muted-foreground">Regime</span><select className={campo} value={e.regime} onChange={(x) => mudar("regime", x.target.value)}>{REGIMES_HONORARIO.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label className="space-y-1"><span className="block text-[11px] text-muted-foreground">Notas por mês</span><input type="number" min={0} className={campo} value={e.notas_mes} onChange={(x) => mudar("notas_mes", x.target.value)} /></label>
        <label className="space-y-1"><span className="block text-[11px] text-muted-foreground">Estabelecimentos (CNPJ)</span><input type="number" min={1} className={campo} value={e.estabelecimentos} onChange={(x) => mudar("estabelecimentos", x.target.value)} /></label>
        <label className="space-y-1"><span className="block text-[11px] text-muted-foreground">Complexidade</span><select className={campo} value={e.complexidade} onChange={(x) => mudar("complexidade", x.target.value)}>{Object.entries(COMPLEXIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Módulos do BPO">
        {Object.entries(MODULOS_HONORARIO).map(([k, v]) => <button key={k} type="button" aria-pressed={e.modulos.includes(k)} onClick={() => alternar(k)} className={`rounded-full border px-2.5 py-0.5 text-xs ${e.modulos.includes(k) ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>{v}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => calc.mutate()} disabled={calc.isPending} className="rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-muted">Calcular</button>
        {calc.data && (
          <>
            <span className="text-sm">Sugestão: <strong>{brl(calc.data.total)}</strong>/mês <span className="text-[11px] text-muted-foreground">({calc.data.parcelas.map((p) => `${p.descricao}: ${brl(p.valor)}`).join(" + ")}{calc.data.fator !== 1 ? ` × ${String(calc.data.fator).replace(".", ",")}` : ""})</span></span>
            <button type="button" onClick={() => aoUsar(calc.data.total, e)} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Usar como honorário mensal</button>
          </>
        )}
      </div>
    </div>
  );
}

/** Nova proposta ou edição. Escolher um modelo preenche escopo, itens e condições. */
export default function EditorProposta({ proposta, empresas, aoFechar }) {
  const qc = useQueryClient();
  const editando = !!proposta;
  const { data: modelos = [] } = useQuery({ queryKey: ["propostas", "modelos"], queryFn: () => api.get("/propostas/modelos") });
  const [f, setF] = useState({
    empresa_id: proposta?.empresa_id || "", cliente_nome: proposta?.cliente_nome || "", cliente_documento: proposta?.cliente_documento || "", cliente_email: proposta?.cliente_email || "",
    servico: proposta?.servico || "BPO_FISCAL", modelo_id: proposta?.modelo_id || "", escopo: proposta?.escopo || "", condicoes: proposta?.condicoes || "", observacoes: proposta?.observacoes || "",
    validade: proposta?.validade ? String(proposta.validade).slice(0, 10) : validadePadrao(), itens: proposta?.itens?.length ? proposta.itens : [{ descricao: "Honorário mensal do BPO fiscal", quantidade: 1, valor_unitario: 0, recorrente: true }],
    calculo: proposta?.calculo || null,
  });
  const mudar = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const escolherEmpresa = (id) => {
    const e = empresas.find((x) => x.id === id);
    setF((x) => ({ ...x, empresa_id: id, ...(e ? { cliente_nome: e.razao_social, cliente_documento: e.cnpj_cpf || "", cliente_email: e.email_contato || x.cliente_email } : {}) }));
  };
  const escolherModelo = (id) => {
    const m = modelos.find((x) => x.id === id);
    setF((x) => ({ ...x, modelo_id: id, ...(m ? { servico: m.servico, escopo: m.escopo || "", condicoes: m.condicoes || "", itens: m.itens?.length ? m.itens : x.itens } : {}) }));
  };
  const mudarItem = (i, k, v) => mudar("itens", f.itens.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const usarCalculo = (total, entrada) => {
    const i = f.itens.findIndex((it) => it.recorrente);
    const itens = i >= 0 ? f.itens.map((it, j) => (j === i ? { ...it, valor_unitario: total } : it)) : [{ descricao: "Honorário mensal do BPO fiscal", quantidade: 1, valor_unitario: total, recorrente: true }, ...f.itens];
    setF((x) => ({ ...x, itens, calculo: entrada }));
  };
  const t = totaisDosItens(f.itens);
  const empresaAtual = empresas.find((e) => e.id === f.empresa_id);
  const salvar = useMutation({
    mutationFn: () => {
      const corpo = { ...f, empresa_id: f.empresa_id || null, modelo_id: f.modelo_id || null, validade: f.validade || null, itens: f.itens.map((i) => ({ ...i, quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario) })) };
      return editando ? api.put(`/propostas/${proposta.id}`, corpo) : api.post("/propostas", corpo);
    },
    onSuccess: () => { toast({ title: editando ? "Proposta salva" : "Proposta criada" }); qc.invalidateQueries({ queryKey: ["propostas"] }); aoFechar(); },
    onError: (e) => toast({ title: "Não foi possível salvar a proposta", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? `Proposta nº ${proposta.numero}` : "Nova proposta"}</DialogTitle>
          <DialogDescription>Escolha o cliente (do cadastro ou digitado), o serviço e os itens. Os valores marcados como mensais formam o honorário.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="space-y-3 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <SeletorDeEmpresa empresas={empresas} valor={f.empresa_id} aoMudar={escolherEmpresa} rotulo="Empresa do cadastro" />
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Modelo (opcional)</span>
              <select className={campo} value={f.modelo_id} onChange={(e) => escolherModelo(e.target.value)}><option value="">Sem modelo</option>{modelos.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Cliente</span><input className={campo} value={f.cliente_nome} maxLength={200} onChange={(e) => mudar("cliente_nome", e.target.value)} required /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1"><span className="block text-xs text-muted-foreground">CNPJ/CPF</span><input className={campo} value={f.cliente_documento} maxLength={20} onChange={(e) => mudar("cliente_documento", e.target.value)} /></label>
              <label className="block space-y-1"><span className="block text-xs text-muted-foreground">E-mail</span><input type="email" className={campo} value={f.cliente_email} onChange={(e) => mudar("cliente_email", e.target.value)} /></label>
            </div>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Serviço</span>
              <select className={campo} value={f.servico} onChange={(e) => mudar("servico", e.target.value)}>{Object.entries(SERVICOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Válida até</span><input type="date" className={campo} value={f.validade} onChange={(e) => mudar("validade", e.target.value)} /></label>
          </div>
          {f.servico === "BPO_FISCAL" && <CalculadoraHonorarios aoUsar={usarCalculo} regimeInicial={empresaAtual?.regime_atual} />}
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Itens</p>
            {f.itens.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_120px_auto_auto] items-center gap-2">
                <input className={campo} value={it.descricao} maxLength={300} onChange={(e) => mudarItem(i, "descricao", e.target.value)} aria-label={`Descrição do item ${i + 1}`} required />
                <input type="number" min={0.01} step="any" className={campo} value={it.quantidade} onChange={(e) => mudarItem(i, "quantidade", e.target.value)} aria-label={`Quantidade do item ${i + 1}`} />
                <input type="number" min={0} step="0.01" className={campo} value={it.valor_unitario} onChange={(e) => mudarItem(i, "valor_unitario", e.target.value)} aria-label={`Valor do item ${i + 1}`} />
                <label className="flex items-center gap-1 text-xs whitespace-nowrap"><input type="checkbox" checked={!!it.recorrente} onChange={(e) => mudarItem(i, "recorrente", e.target.checked)} /> mensal</label>
                <button type="button" onClick={() => mudar("itens", f.itens.filter((_, j) => j !== i))} disabled={f.itens.length === 1} className="rounded p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-30" aria-label={`Tirar o item ${i + 1}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => mudar("itens", [...f.itens, { descricao: "", quantidade: 1, valor_unitario: 0, recorrente: false }])} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Item</button>
              <span className="ml-auto text-sm">Honorário mensal: <strong>{brl(t.mensal)}</strong> · Valor único: <strong>{brl(t.unico)}</strong></span>
            </div>
          </div>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Escopo</span><textarea className={`${campo} min-h-[80px]`} value={f.escopo} maxLength={5000} onChange={(e) => mudar("escopo", e.target.value)} /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Condições (pagamento, reajuste, prazo)</span><textarea className={`${campo} min-h-[64px]`} value={f.condicoes} maxLength={3000} onChange={(e) => mudar("condicoes", e.target.value)} /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Observações</span><textarea className={`${campo} min-h-[48px]`} value={f.observacoes} maxLength={3000} onChange={(e) => mudar("observacoes", e.target.value)} /></label>
          <DialogFooter>
            <button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={!f.cliente_nome.trim() || salvar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
