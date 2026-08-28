import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Search, Plus, Pencil } from "lucide-react";
import { pct } from "@/lib/format";
import InfoTooltip from "@/components/InfoTooltip";

export default function CatalogosPage() {
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-heading font-semibold">Catálogos IBS/CBS</h1>
          <InfoTooltip pagina="catalogos" chave="header" />
        </div>
        <p className="text-sm text-muted-foreground">CST, cClassTrib e cCredPres — bases oficiais versionadas</p>
      </div>
      <Tabs defaultValue="cst">
        <TabsList>
          <TabsTrigger value="cst">CST IBS/CBS</TabsTrigger>
          <TabsTrigger value="classtrib">cClassTrib</TabsTrigger>
          <TabsTrigger value="credpres">cCredPres</TabsTrigger>
        </TabsList>
        <TabsContent value="cst"><CstTable /></TabsContent>
        <TabsContent value="classtrib"><ClassTribTable /></TabsContent>
        <TabsContent value="credpres"><CredPresTable /></TabsContent>
      </Tabs>
    </div>
  );
}

function SearchBar({ value, onChange }) {
  return (
    <div className="relative max-w-xs">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Buscar..." className="pl-8" />
    </div>
  );
}

function CstTable() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["cstIbs"], queryFn: () => base44.entities.CstIbsCbs.list() });
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [open, setOpen] = useState(false);
  const rows = (data || []).filter((r) => !q || (r.cst + " " + (r.descricao_oficial || "")).toLowerCase().includes(q.toLowerCase()));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const empty = { cst: "", descricao_oficial: "", exige_tributacao: "Sim", observacao: "", status: "Ativo" };

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await base44.entities.CstIbsCbs.create(form);
    else await base44.entities.CstIbsCbs.update(editing.id, form);
    setOpen(false); qc.invalidateQueries({ queryKey: ["cstIbs"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SearchBar value={q} onChange={setQ} />
        <button onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Novo
        </button>
      </div>
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40"><tr className="text-left text-xs text-muted-foreground">
            <th className="py-2.5 px-4 font-medium">CST</th><th className="py-2.5 px-4 font-medium">Descrição oficial</th>
            <th className="py-2.5 px-4 font-medium">Tributação</th><th className="py-2.5 px-4 font-medium">Diferimento</th>
            <th className="py-2.5 px-4 font-medium">Status</th><th className="py-2.5 px-4 font-medium w-20"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="py-2.5 px-4 font-medium">{r.cst}</td>
                <td className="py-2.5 px-4 text-muted-foreground">{r.descricao_oficial}</td>
                <td className="py-2.5 px-4">{r.exige_tributacao}</td>
                <td className="py-2.5 px-4">{r.diferimento}</td>
                <td className="py-2.5 px-4">{r.status}</td>
                <td className="py-2.5 px-4">
                  <div className="flex gap-1">
                    <button onClick={() => { setForm(r); setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum CST cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing === "new" ? "Novo CST" : `Editar ${editing?.cst}`}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div><label className="text-xs text-muted-foreground">CST</label><Input value={form.cst || ""} onChange={(e) => set("cst", e.target.value)} required /></div>
            <div><label className="text-xs text-muted-foreground">Descrição oficial</label><Input value={form.descricao_oficial || ""} onChange={(e) => set("descricao_oficial", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">Exige tributação</label><Input value={form.exige_tributacao || ""} onChange={(e) => set("exige_tributacao", e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground">Diferimento</label><Input value={form.diferimento || ""} onChange={(e) => set("diferimento", e.target.value)} /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">Observação</label><Input value={form.observacao || ""} onChange={(e) => set("observacao", e.target.value)} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border">Cancelar</button>
              <button type="submit" className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground">Salvar</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClassTribTable() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["classTrib"], queryFn: () => base44.entities.ClassTrib.list() });
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [open, setOpen] = useState(false);
  const rows = (data || []).filter((r) => !q || (r.c_class_trib + " " + (r.descricao_oficial || "")).toLowerCase().includes(q.toLowerCase()));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const empty = { c_class_trib: "", cst: "000", descricao_oficial: "", pct_reducao_ibs: 0, pct_reducao_cbs: 0, status: "Ativo" };

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await base44.entities.ClassTrib.create(form);
    else await base44.entities.ClassTrib.update(editing.id, form);
    setOpen(false); qc.invalidateQueries({ queryKey: ["classTrib"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SearchBar value={q} onChange={setQ} />
        <button onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Novo
        </button>
      </div>
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40"><tr className="text-left text-xs text-muted-foreground">
            <th className="py-2.5 px-4 font-medium">cClassTrib</th><th className="py-2.5 px-4 font-medium">CST</th>
            <th className="py-2.5 px-4 font-medium">Descrição</th><th className="py-2.5 px-4 font-medium">Red. IBS</th>
            <th className="py-2.5 px-4 font-medium">Red. CBS</th><th className="py-2.5 px-4 font-medium w-20"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="py-2.5 px-4 font-medium">{r.c_class_trib}</td>
                <td className="py-2.5 px-4">{r.cst}</td>
                <td className="py-2.5 px-4 text-muted-foreground max-w-[420px] truncate">{r.descricao_oficial}</td>
                <td className="py-2.5 px-4">{pct(r.pct_reducao_ibs)}</td>
                <td className="py-2.5 px-4">{pct(r.pct_reducao_cbs)}</td>
                <td className="py-2.5 px-4">
                  <button onClick={() => { setForm(r); setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum código cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing === "new" ? "Novo cClassTrib" : `Editar ${editing?.c_class_trib}`}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div><label className="text-xs text-muted-foreground">cClassTrib</label><Input value={form.c_class_trib || ""} onChange={(e) => set("c_class_trib", e.target.value)} required /></div>
            <div><label className="text-xs text-muted-foreground">CST</label><Input value={form.cst || ""} onChange={(e) => set("cst", e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Descrição oficial</label><Input value={form.descricao_oficial || ""} onChange={(e) => set("descricao_oficial", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">% redução IBS</label><Input type="number" step="any" value={form.pct_reducao_ibs || 0} onChange={(e) => set("pct_reducao_ibs", Number(e.target.value))} /></div>
              <div><label className="text-xs text-muted-foreground">% redução CBS</label><Input type="number" step="any" value={form.pct_reducao_cbs || 0} onChange={(e) => set("pct_reducao_cbs", Number(e.target.value))} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border">Cancelar</button>
              <button type="submit" className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground">Salvar</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CredPresTable() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["credPres"], queryFn: () => base44.entities.CredPres.list() });
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [open, setOpen] = useState(false);
  const rows = (data || []).filter((r) => !q || (r.c_cred_pres + " " + (r.descricao_oficial || "")).toLowerCase().includes(q.toLowerCase()));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const empty = { c_cred_pres: "", descricao_oficial: "", percentual_oficial: "", status: "Ativo" };

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await base44.entities.CredPres.create(form);
    else await base44.entities.CredPres.update(editing.id, form);
    setOpen(false); qc.invalidateQueries({ queryKey: ["credPres"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SearchBar value={q} onChange={setQ} />
        <button onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Novo
        </button>
      </div>
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40"><tr className="text-left text-xs text-muted-foreground">
            <th className="py-2.5 px-4 font-medium">cCredPres</th><th className="py-2.5 px-4 font-medium">Descrição oficial</th>
            <th className="py-2.5 px-4 font-medium">IBS</th><th className="py-2.5 px-4 font-medium">CBS</th>
            <th className="py-2.5 px-4 font-medium">% oficial</th><th className="py-2.5 px-4 font-medium w-20"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="py-2.5 px-4 font-medium">{r.c_cred_pres}</td>
                <td className="py-2.5 px-4 text-muted-foreground max-w-[480px] truncate">{r.descricao_oficial}</td>
                <td className="py-2.5 px-4">{r.ibs_aplicavel}</td>
                <td className="py-2.5 px-4">{r.cbs_aplicavel}</td>
                <td className="py-2.5 px-4 text-muted-foreground">{r.percentual_oficial}</td>
                <td className="py-2.5 px-4">
                  <button onClick={() => { setForm(r); setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum código cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing === "new" ? "Novo cCredPres" : `Editar ${editing?.c_cred_pres}`}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div><label className="text-xs text-muted-foreground">cCredPres</label><Input value={form.c_cred_pres || ""} onChange={(e) => set("c_cred_pres", e.target.value)} required /></div>
            <div><label className="text-xs text-muted-foreground">Descrição oficial</label><Input value={form.descricao_oficial || ""} onChange={(e) => set("descricao_oficial", e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Percentual oficial</label><Input value={form.percentual_oficial || ""} onChange={(e) => set("percentual_oficial", e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Método de cálculo</label><Input value={form.metodo_calculo || ""} onChange={(e) => set("metodo_calculo", e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">Observação</label><Input value={form.observacao || ""} onChange={(e) => set("observacao", e.target.value)} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border">Cancelar</button>
              <button type="submit" className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground">Salvar</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}