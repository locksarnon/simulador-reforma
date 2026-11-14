import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const brl = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function PrepararAtualizacao({ ids, servicos, executar, fechar, executando }) {
  const [chaves, setChaves] = useState([]);
  const [competencia, setCompetencia] = useState("");
  const pedido = { empresa_ids: ids, chaves, competencia: competencia || undefined };
  const previa = useMutation({ mutationFn: () => api.post("/monitoramento/lote/previa", pedido) });
  const p = previa.data;
  const maximo = p?.maximo ?? 0;
  return <Dialog open onOpenChange={(aberto) => { if (!aberto && !executando) fechar(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Preparar atualização</DialogTitle><DialogDescription>{ids.length} clientes selecionados. Escolha os serviços para calcular o custo.</DialogDescription></DialogHeader>
      <fieldset disabled={previa.isPending || executando} className="max-h-52 space-y-1 overflow-auto text-sm">
        <legend className="font-medium">Serviços</legend>
        {servicos.filter((s) => s.rotina && !s.acao).map((s) => <label key={s.chave} className="flex items-center gap-2">
          <input type="checkbox" checked={chaves.includes(s.chave)} onChange={(e) => { previa.reset(); setChaves(e.target.checked ? [...chaves, s.chave] : chaves.filter((x) => x !== s.chave)); }} />{s.rotulo}
        </label>)}
      </fieldset>
      <label className="text-sm">Competência fiscal <input className="ml-2 rounded border bg-background p-1" type="month" value={competencia} disabled={previa.isPending || executando} onChange={(e) => { previa.reset(); setCompetencia(e.target.value); }} /></label>
      {previa.isError && <p role="alert">{previa.error.message}</p>}
      {p && <div role="status" className="space-y-1 rounded border p-3 text-sm">
        <p>{p.clientes} clientes · {p.tarefas} tarefas · {p.chamadasMin}–{p.chamadasMax} chamadas estimadas</p>
        <p className="font-semibold">{brl(p.minimo)} a {brl(maximo)} estimados</p>
        {p.clientes > 0 && <p>{brl(maximo / p.clientes)} por cliente no limite da estimativa</p>}
        {Object.entries(p.porFornecedor).map(([nome, v]) => <p key={nome}>{nome} · {brl(v.minimo)} a {brl(v.maximo)}</p>)}
        {Object.entries(p.excluidas).map(([motivo, total]) => <p key={motivo}>{total} · {motivo}</p>)}
        {(maximo > 100 || p.tarefas > 200) && <p>Reduza o lote para até 200 tarefas e R$ 100.</p>}
      </div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border px-3 py-2 text-sm disabled:opacity-50" disabled={!chaves.length || previa.isPending || executando} onClick={() => previa.mutate()}>{previa.isPending ? "Calculando…" : "Calcular estimativa"}</button>
        {p && <button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={!p.tarefas || maximo > 100 || p.tarefas > 200 || executando} onClick={() => executar({ ...pedido, teto: maximo })}>Autorizar até {brl(maximo)}</button>}
      </div>
    </DialogContent>
  </Dialog>;
}
