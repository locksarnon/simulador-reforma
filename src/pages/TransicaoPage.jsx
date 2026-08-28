import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { pct } from "@/lib/format";
import InfoTooltip from "@/components/InfoTooltip";

const empty = {
  ano: new Date().getFullYear(), pis_cofins_fator: 1, ipi_fator_geral: 1, icms_fator: 1,
  iss_fator: 1, ibs_efetivo: 0, ibs_uf_aliquota: 0, ibs_mun_aliquota: 0,
  cbs_efetiva: 0, efeito_financeiro: 0, carater: "", fonte: "", status: "Oficial", observacao: "",
};

export default function TransicaoPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["transicao"], queryFn: () => base44.entities.TransicaoAno.list() });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const rows = [...(data || [])].sort((a, b) => a.ano - b.ano);

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await base44.entities.TransicaoAno.create(form);
    else await base44.entities.TransicaoAno.update(editing.id, form);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["transicao"] });
  };

  const del = async (r) => {
    if (!confirm(`Excluir ano ${r.ano}?`)) return;
    await base44.entities.TransicaoAno.delete(r.id);
    qc.invalidateQueries({ queryKey: ["transicao"] });
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-heading font-semibold">Transição 2026–2033</h1>
            <InfoTooltip pagina="transicao" chave="header" />
          </div>
          <p className="text-sm text-muted-foreground">Cronograma paramétrico — fatores de extinção e alíquotas de referência</p>
        </div>
        <button onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Novo ano
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-muted/40">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2.5 px-4 font-medium">Ano</th>
              <th className="py-2.5 px-4 font-medium">PIS/Cofins</th>
              <th className="py-2.5 px-4 font-medium">IPI</th>
              <th className="py-2.5 px-4 font-medium">ICMS</th>
              <th className="py-2.5 px-4 font-medium">ISS</th>
              <th className="py-2.5 px-4 font-medium">IBS efetivo</th>
              <th className="py-2.5 px-4 font-medium">CBS efetiva</th>
              <th className="py-2.5 px-4 font-medium">Efeito financeiro</th>
              <th className="py-2.5 px-4 font-medium">Caráter</th>
              <th className="py-2.5 px-4 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="py-2.5 px-4 font-medium">{r.ano}</td>
                <td className="py-2.5 px-4">{pct(r.pis_cofins_fator, 0)}</td>
                <td className="py-2.5 px-4">{pct(r.ipi_fator_geral, 0)}</td>
                <td className="py-2.5 px-4">{pct(r.icms_fator, 0)}</td>
                <td className="py-2.5 px-4">{pct(r.iss_fator, 0)}</td>
                <td className="py-2.5 px-4">{pct(r.ibs_efetivo, 2)}</td>
                <td className="py-2.5 px-4">{pct(r.cbs_efetiva, 2)}</td>
                <td className="py-2.5 px-4">{r.efeito_financeiro ? "Sim" : "Não"}</td>
                <td className="py-2.5 px-4 text-muted-foreground">{r.carater}</td>
                <td className="py-2.5 px-4">
                  <div className="flex gap-1">
                    <button onClick={() => { setForm(r); setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => del(r)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">Nenhum ano cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing === "new" ? "Novo ano" : `Editar ${editing?.ano}`}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Ano <InfoTooltip pagina="transicao" chave="ano" /></Label><Input type="number" value={form.ano} onChange={(e) => set("ano", Number(e.target.value))} required /></div>
            <div><Label className="text-xs">Caráter <InfoTooltip pagina="transicao" chave="carater" /></Label><Input value={form.carater} onChange={(e) => set("carater", e.target.value)} placeholder="Informativo / Financeiro" /></div>
            <div><Label className="text-xs">PIS/Cofins fator <InfoTooltip pagina="transicao" chave="pis_cofins_fator" /></Label><Input type="number" step="any" value={form.pis_cofins_fator} onChange={(e) => set("pis_cofins_fator", Number(e.target.value))} /></div>
            <div><Label className="text-xs">IPI fator geral <InfoTooltip pagina="transicao" chave="ipi_fator_geral" /></Label><Input type="number" step="any" value={form.ipi_fator_geral} onChange={(e) => set("ipi_fator_geral", Number(e.target.value))} /></div>
            <div><Label className="text-xs">ICMS fator <InfoTooltip pagina="transicao" chave="icms_fator" /></Label><Input type="number" step="any" value={form.icms_fator} onChange={(e) => set("icms_fator", Number(e.target.value))} /></div>
            <div><Label className="text-xs">ISS fator <InfoTooltip pagina="transicao" chave="iss_fator" /></Label><Input type="number" step="any" value={form.iss_fator} onChange={(e) => set("iss_fator", Number(e.target.value))} /></div>
            <div><Label className="text-xs">IBS efetivo <InfoTooltip pagina="transicao" chave="ibs_efetivo" /></Label><Input type="number" step="any" value={form.ibs_efetivo} onChange={(e) => set("ibs_efetivo", Number(e.target.value))} /></div>
            <div><Label className="text-xs">CBS efetiva <InfoTooltip pagina="transicao" chave="cbs_efetiva" /></Label><Input type="number" step="any" value={form.cbs_efetiva} onChange={(e) => set("cbs_efetiva", Number(e.target.value))} /></div>
            <div><Label className="text-xs">IBS UF alíquota <InfoTooltip pagina="transicao" chave="ibs_uf_aliquota" /></Label><Input type="number" step="any" value={form.ibs_uf_aliquota} onChange={(e) => set("ibs_uf_aliquota", Number(e.target.value))} /></div>
            <div><Label className="text-xs">IBS Município alíquota <InfoTooltip pagina="transicao" chave="ibs_mun_aliquota" /></Label><Input type="number" step="any" value={form.ibs_mun_aliquota} onChange={(e) => set("ibs_mun_aliquota", Number(e.target.value))} /></div>
            <div><Label className="text-xs">Efeito financeiro (0/1) <InfoTooltip pagina="transicao" chave="efeito_financeiro" /></Label><Input type="number" step="any" value={form.efeito_financeiro} onChange={(e) => set("efeito_financeiro", Number(e.target.value))} /></div>
            <div><Label className="text-xs">Fonte <InfoTooltip pagina="transicao" chave="fonte" /></Label><Input value={form.fonte} onChange={(e) => set("fonte", e.target.value)} /></div>
            <div className="col-span-2"><Label className="text-xs">Observação <InfoTooltip pagina="transicao" chave="observacao" /></Label><Input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} /></div>
            <div className="col-span-2 flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border">Cancelar</button>
              <button type="submit" className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground">Salvar</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}