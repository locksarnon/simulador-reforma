import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";

const SIM_NAO = ["Sim", "Não"];
const REGIMES = ["Lucro Real", "Lucro Presumido", "Simples Nacional", "Produtor rural PF"];

const empty = {
  id_empresa: "", grupo: "", razao_social: "", cnpj_cpf: "", regime_atual: "Lucro Real",
  setor: "", uf: "", municipio: "", contribuinte_ibs_cbs: "Sim", produtor_rural: "Não",
  cooperativa: "Não", erp: "", responsavel_fiscal: "", status: "Ativa", observacao: "",
};

export default function EmpresasPage() {
  const { id: grupoId } = useParams();
  const qc = useQueryClient();
  const { data: grupo } = useQuery({
    queryKey: ["grupo", grupoId],
    queryFn: () => base44.entities.Grupo.get(grupoId),
    enabled: !!grupoId,
  });
  const grupoNumero = grupo?.numero;
  const { data, isLoading } = useQuery({
    queryKey: ["empresas", grupoNumero],
    queryFn: () => grupoNumero
      ? base44.entities.Empresa.filter({ grupo: grupoNumero })
      : base44.entities.Empresa.list(),
    enabled: grupoNumero !== undefined,
  });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    const payload = { ...form, grupo: grupoNumero || form.grupo };
    if (editing === "new") await base44.entities.Empresa.create(payload);
    else await base44.entities.Empresa.update(editing.id, payload);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["empresas"] });
  };

  const del = async (em) => {
    if (!confirm(`Excluir ${em.id_empresa}?`)) return;
    await base44.entities.Empresa.delete(em.id);
    qc.invalidateQueries({ queryKey: ["empresas"] });
  };

  const start = (em) => { setForm(em === "new" ? { ...empty, grupo: grupoNumero || "" } : em); setEditing(em); setOpen(true); };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-heading font-semibold">Empresas do Grupo</h1>
            <InfoTooltip pagina="empresas" chave="header" />
          </div>
          <p className="text-sm text-muted-foreground">Vinculadas a {grupoNumero || "—"}</p>
        </div>
        <button onClick={() => start("new")} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Nova empresa
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2.5 px-4 font-medium">ID</th>
              <th className="py-2.5 px-4 font-medium">Razão social</th>
              <th className="py-2.5 px-4 font-medium">Grupo</th>
              <th className="py-2.5 px-4 font-medium">Regime</th>
              <th className="py-2.5 px-4 font-medium">Setor</th>
              <th className="py-2.5 px-4 font-medium">UF</th>
              <th className="py-2.5 px-4 font-medium">IBS/CBS</th>
              <th className="py-2.5 px-4 font-medium">Status</th>
              <th className="py-2.5 px-4 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((em) => (
              <tr key={em.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="py-2.5 px-4 font-medium">{em.id_empresa}</td>
                <td className="py-2.5 px-4">{em.razao_social}</td>
                <td className="py-2.5 px-4 text-muted-foreground">{em.grupo}</td>
                <td className="py-2.5 px-4 text-muted-foreground">{em.regime_atual}</td>
                <td className="py-2.5 px-4 text-muted-foreground">{em.setor}</td>
                <td className="py-2.5 px-4">{em.uf}</td>
                <td className="py-2.5 px-4">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${em.contribuinte_ibs_cbs === "Sim" ? "bg-chart-2/15 text-chart-2" : "bg-muted text-muted-foreground"}`}>
                    {em.contribuinte_ibs_cbs}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-muted-foreground">{em.status}</td>
                <td className="py-2.5 px-4">
                  <div className="flex gap-1">
                    <button onClick={() => start(em)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => del(em)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {(!data || data.length === 0) && (
              <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">Nenhuma empresa cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing === "new" ? "Nova empresa" : `Editar ${editing?.id_empresa}`}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">ID empresa <InfoTooltip pagina="empresas" chave="id_empresa" /></Label><Input value={form.id_empresa} onChange={(e) => set("id_empresa", e.target.value)} required /></div>
            <div><Label className="text-xs">Grupo <InfoTooltip pagina="empresas" chave="grupo" /></Label><Input value={form.grupo} disabled readOnly className="bg-muted/50 cursor-not-allowed" /></div>
            <div className="col-span-2"><Label className="text-xs">Razão social <InfoTooltip pagina="empresas" chave="razao_social" /></Label><Input value={form.razao_social} onChange={(e) => set("razao_social", e.target.value)} required /></div>
            <div><Label className="text-xs">CNPJ/CPF <InfoTooltip pagina="empresas" chave="cnpj_cpf" /></Label><Input value={form.cnpj_cpf} onChange={(e) => set("cnpj_cpf", e.target.value)} /></div>
            <div>
              <Label className="text-xs">Regime atual <InfoTooltip pagina="empresas" chave="regime_atual" /></Label>
              <Select value={form.regime_atual} onValueChange={(v) => set("regime_atual", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{REGIMES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Setor <InfoTooltip pagina="empresas" chave="setor" /></Label><Input value={form.setor} onChange={(e) => set("setor", e.target.value)} /></div>
            <div><Label className="text-xs">UF <InfoTooltip pagina="empresas" chave="uf" /></Label><Input value={form.uf} onChange={(e) => set("uf", e.target.value)} /></div>
            <div><Label className="text-xs">Município <InfoTooltip pagina="empresas" chave="municipio" /></Label><Input value={form.municipio} onChange={(e) => set("municipio", e.target.value)} /></div>
            <div>
              <Label className="text-xs">Contribuinte IBS/CBS <InfoTooltip pagina="empresas" chave="contribuinte_ibs_cbs" /></Label>
              <Select value={form.contribuinte_ibs_cbs} onValueChange={(v) => set("contribuinte_ibs_cbs", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SIM_NAO.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Produtor rural <InfoTooltip pagina="empresas" chave="produtor_rural" /></Label>
              <Select value={form.produtor_rural} onValueChange={(v) => set("produtor_rural", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SIM_NAO.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">ERP <InfoTooltip pagina="empresas" chave="erp" /></Label><Input value={form.erp} onChange={(e) => set("erp", e.target.value)} /></div>
            <div><Label className="text-xs">Responsável fiscal <InfoTooltip pagina="empresas" chave="responsavel_fiscal" /></Label><Input value={form.responsavel_fiscal} onChange={(e) => set("responsavel_fiscal", e.target.value)} /></div>
            <div className="col-span-2"><Label className="text-xs">Observação <InfoTooltip pagina="empresas" chave="observacao" /></Label><Input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} /></div>
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