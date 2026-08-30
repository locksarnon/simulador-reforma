import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Search, Plus, Pencil } from "lucide-react";
import { pct } from "@/lib/format";
import InfoTooltip from "@/components/InfoTooltip";

/** <input type="date"> exige "YYYY-MM-DD" — corta o resto do ISO. */
const toDateInput = (v) => (v ? String(v).slice(0, 10) : "");

function VigenciaFields({ form, set, inicioKey = "vigencia_inicio", fimKey = "vigencia_fim", label = "Vigência" }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs text-muted-foreground">{label} — início</label>
        <Input type="date" value={toDateInput(form[inicioKey])} onChange={(e) => set(inicioKey, e.target.value || null)} />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">{label} — fim <span className="opacity-70">(vazio = sem previsão)</span></label>
        <Input type="date" value={toDateInput(form[fimKey])} onChange={(e) => set(fimKey, e.target.value || null)} />
      </div>
    </div>
  );
}

/** Select fixo (em vez de texto livre) — o motor só reconhece exatamente
 * "sim"/"fora" (case-insensitive); um valor digitado errado hoje silencia
 * o crédito presumido sem nenhum aviso em tela. */
function FixedSelect({ label, value, fallback, options, onChange }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Select value={value || fallback} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function VigenciaBadge({ inicio, fim }) {
  if (!inicio && !fim) return <span className="text-muted-foreground">—</span>;
  const fmt = (d) => new Date(d).toLocaleDateString("pt-BR");
  return <span>{inicio ? fmt(inicio) : "sempre"} → {fim ? fmt(fim) : "sem fim"}</span>;
}

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
          <TabsTrigger value="ncm">NCM</TabsTrigger>
          <TabsTrigger value="cfop">CFOP</TabsTrigger>
          <TabsTrigger value="beneficio">Benefício Fiscal</TabsTrigger>
        </TabsList>
        <TabsContent value="cst"><CstTable /></TabsContent>
        <TabsContent value="classtrib"><ClassTribTable /></TabsContent>
        <TabsContent value="ncm"><NcmTable /></TabsContent>
        <TabsContent value="cfop"><CfopTable /></TabsContent>
        <TabsContent value="beneficio"><BeneficioFiscalTable /></TabsContent>
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
  const empty = { cst: "", descricao_oficial: "", exige_tributacao: "Sim", observacao: "", status: "Ativo", vigencia_inicio: "", vigencia_fim: "" };

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
            <th className="py-2.5 px-4 font-medium">Vigência</th>
            <th className="py-2.5 px-4 font-medium">Status</th><th className="py-2.5 px-4 font-medium w-20"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="py-2.5 px-4 font-medium">{r.cst}</td>
                <td className="py-2.5 px-4 text-muted-foreground">{r.descricao_oficial}</td>
                <td className="py-2.5 px-4">{r.exige_tributacao}</td>
                <td className="py-2.5 px-4">{r.diferimento}</td>
                <td className="py-2.5 px-4 text-xs"><VigenciaBadge inicio={r.vigencia_inicio} fim={r.vigencia_fim} /></td>
                <td className="py-2.5 px-4">{r.status}</td>
                <td className="py-2.5 px-4">
                  <div className="flex gap-1">
                    <button onClick={() => { setForm(r); setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum CST cadastrado.</td></tr>}
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
            <VigenciaFields form={form} set={set} />
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
  const empty = { c_class_trib: "", cst: "000", descricao_oficial: "", pct_reducao_ibs: 0, pct_reducao_cbs: 0, status: "Ativo", vigencia_inicio: "", vigencia_fim: "" };

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
            <th className="py-2.5 px-4 font-medium">Red. CBS</th>
            <th className="py-2.5 px-4 font-medium">Vigência</th>
            <th className="py-2.5 px-4 font-medium w-20"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="py-2.5 px-4 font-medium">{r.c_class_trib}</td>
                <td className="py-2.5 px-4">{r.cst}</td>
                <td className="py-2.5 px-4 text-muted-foreground max-w-[420px] truncate">{r.descricao_oficial}</td>
                <td className="py-2.5 px-4">{pct(r.pct_reducao_ibs)}</td>
                <td className="py-2.5 px-4">{pct(r.pct_reducao_cbs)}</td>
                <td className="py-2.5 px-4 text-xs"><VigenciaBadge inicio={r.vigencia_inicio} fim={r.vigencia_fim} /></td>
                <td className="py-2.5 px-4">
                  <button onClick={() => { setForm(r); setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum código cadastrado.</td></tr>}
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
            <VigenciaFields form={form} set={set} />
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
  const empty = {
    c_cred_pres: "", descricao_oficial: "",
    ibs_aplicavel: "Não", cbs_aplicavel: "Não", metodo_calculo: "Direto",
    percentual_oficial: "", status: "Ativo",
    inicio_ibs: "", fim_ibs: "", inicio_cbs: "", fim_cbs: "",
  };
  const pendente = String(form.percentual_oficial || "").toLowerCase().includes("pendente");

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
            <th className="py-2.5 px-4 font-medium">% oficial</th>
            <th className="py-2.5 px-4 font-medium">Vigência IBS</th>
            <th className="py-2.5 px-4 font-medium">Vigência CBS</th>
            <th className="py-2.5 px-4 font-medium w-20"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="py-2.5 px-4 font-medium">{r.c_cred_pres}</td>
                <td className="py-2.5 px-4 text-muted-foreground max-w-[480px] truncate">{r.descricao_oficial}</td>
                <td className="py-2.5 px-4">{r.ibs_aplicavel}</td>
                <td className="py-2.5 px-4">{r.cbs_aplicavel}</td>
                <td className="py-2.5 px-4 text-muted-foreground">{r.percentual_oficial}</td>
                <td className="py-2.5 px-4 text-xs"><VigenciaBadge inicio={r.inicio_ibs} fim={r.fim_ibs} /></td>
                <td className="py-2.5 px-4 text-xs"><VigenciaBadge inicio={r.inicio_cbs} fim={r.fim_cbs} /></td>
                <td className="py-2.5 px-4">
                  <button onClick={() => { setForm(r); setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum código cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing === "new" ? "Novo cCredPres" : `Editar ${editing?.c_cred_pres}`}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div><label className="text-xs text-muted-foreground">cCredPres</label><Input value={form.c_cred_pres || ""} onChange={(e) => set("c_cred_pres", e.target.value)} required /></div>
            <div><label className="text-xs text-muted-foreground">Descrição oficial</label><Input value={form.descricao_oficial || ""} onChange={(e) => set("descricao_oficial", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <FixedSelect
                label="Aplicável ao IBS"
                value={form.ibs_aplicavel}
                fallback="Não"
                onChange={(v) => set("ibs_aplicavel", v)}
                options={[{ value: "Sim", label: "Sim" }, { value: "Não", label: "Não" }]}
              />
              <FixedSelect
                label="Aplicável ao CBS"
                value={form.cbs_aplicavel}
                fallback="Não"
                onChange={(v) => set("cbs_aplicavel", v)}
                options={[{ value: "Sim", label: "Sim" }, { value: "Não", label: "Não" }]}
              />
            </div>
            <FixedSelect
              label="Método de cálculo"
              value={form.metodo_calculo}
              fallback="Direto"
              onChange={(v) => set("metodo_calculo", v)}
              options={[
                { value: "Direto", label: "Direto — CP = valor × percentual" },
                { value: "Por Fora", label: "Por Fora — CP = valor × percentual / (1 + percentual)" },
              ]}
            />
            <div>
              <label className="text-xs text-muted-foreground">Situação oficial</label>
              <div className="flex items-center gap-4 h-9">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="situacao_oficial" checked={!pendente} onChange={() => set("percentual_oficial", "")} />
                  Regulamentado
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="situacao_oficial" checked={pendente} onChange={() => set("percentual_oficial", "Pendente de regulamentação")} />
                  Pendente de regulamentação
                </label>
              </div>
            </div>
            {!pendente && (
              <div>
                <label className="text-xs text-muted-foreground">Percentual oficial</label>
                <Input value={form.percentual_oficial || ""} onChange={(e) => set("percentual_oficial", e.target.value)} placeholder="ex.: 1,5%" />
              </div>
            )}
            <div><label className="text-xs text-muted-foreground">Observação</label><Input value={form.observacao || ""} onChange={(e) => set("observacao", e.target.value)} /></div>
            <VigenciaFields form={form} set={set} inicioKey="inicio_ibs" fimKey="fim_ibs" label="Vigência IBS" />
            <VigenciaFields form={form} set={set} inicioKey="inicio_cbs" fimKey="fim_cbs" label="Vigência CBS" />
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

function NcmTable() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["ncm"], queryFn: () => base44.entities.Ncm.list() });
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [open, setOpen] = useState(false);
  const rows = (data || []).filter((r) => !q || (r.codigo + " " + (r.descricao || "")).toLowerCase().includes(q.toLowerCase()));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const empty = { codigo: "", descricao: "", observacao: "", status: "Ativo" };

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await base44.entities.Ncm.create(form);
    else await base44.entities.Ncm.update(editing.id, form);
    setOpen(false); qc.invalidateQueries({ queryKey: ["ncm"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SearchBar value={q} onChange={setQ} />
        <button onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Novo
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Catálogo opcional: enquanto estiver vazio, a importação de XML não bloqueia nenhum NCM. Assim que houver ao menos um código aqui, códigos fora da lista viram alerta.
      </p>
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40"><tr className="text-left text-xs text-muted-foreground">
            <th className="py-2.5 px-4 font-medium">NCM</th><th className="py-2.5 px-4 font-medium">Descrição</th>
            <th className="py-2.5 px-4 font-medium">Status</th><th className="py-2.5 px-4 font-medium w-20"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="py-2.5 px-4 font-medium">{r.codigo}</td>
                <td className="py-2.5 px-4 text-muted-foreground">{r.descricao}</td>
                <td className="py-2.5 px-4">{r.status}</td>
                <td className="py-2.5 px-4">
                  <button onClick={() => { setForm(r); setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum NCM cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing === "new" ? "Novo NCM" : `Editar ${editing?.codigo}`}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div><label className="text-xs text-muted-foreground">Código NCM</label><Input value={form.codigo || ""} onChange={(e) => set("codigo", e.target.value)} required /></div>
            <div><label className="text-xs text-muted-foreground">Descrição</label><Input value={form.descricao || ""} onChange={(e) => set("descricao", e.target.value)} /></div>
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

function CfopTable() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["cfop"], queryFn: () => base44.entities.Cfop.list() });
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [open, setOpen] = useState(false);
  const rows = (data || []).filter((r) => !q || (r.codigo + " " + (r.descricao || "")).toLowerCase().includes(q.toLowerCase()));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const empty = { codigo: "", descricao: "", tipo_operacao: "Saida", aplicavel_a: "", observacao: "", status: "Ativo" };

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await base44.entities.Cfop.create(form);
    else await base44.entities.Cfop.update(editing.id, form);
    setOpen(false); qc.invalidateQueries({ queryKey: ["cfop"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SearchBar value={q} onChange={setQ} />
        <button onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Novo
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Catálogo opcional: mesma regra do NCM — vazio não bloqueia nada, populado passa a alertar CFOP fora da lista.
      </p>
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40"><tr className="text-left text-xs text-muted-foreground">
            <th className="py-2.5 px-4 font-medium">CFOP</th><th className="py-2.5 px-4 font-medium">Descrição</th>
            <th className="py-2.5 px-4 font-medium">Direção</th>
            <th className="py-2.5 px-4 font-medium">Status</th><th className="py-2.5 px-4 font-medium w-20"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="py-2.5 px-4 font-medium">{r.codigo}</td>
                <td className="py-2.5 px-4 text-muted-foreground max-w-[420px] truncate">{r.descricao}</td>
                <td className="py-2.5 px-4">{r.tipo_operacao}</td>
                <td className="py-2.5 px-4">{r.status}</td>
                <td className="py-2.5 px-4">
                  <button onClick={() => { setForm(r); setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Nenhum CFOP cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing === "new" ? "Novo CFOP" : `Editar ${editing?.codigo}`}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div><label className="text-xs text-muted-foreground">Código CFOP</label><Input value={form.codigo || ""} onChange={(e) => set("codigo", e.target.value)} required /></div>
            <div><label className="text-xs text-muted-foreground">Descrição</label><Input value={form.descricao || ""} onChange={(e) => set("descricao", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">Direção</label><Input value={form.tipo_operacao || ""} onChange={(e) => set("tipo_operacao", e.target.value)} placeholder="Entrada / Saída" /></div>
              <div><label className="text-xs text-muted-foreground">Aplicável a</label><Input value={form.aplicavel_a || ""} onChange={(e) => set("aplicavel_a", e.target.value)} placeholder="Mercadoria / Serviço" /></div>
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

function BeneficioFiscalTable() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["beneficioFiscal"], queryFn: () => base44.entities.BeneficioFiscal.list() });
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [open, setOpen] = useState(false);
  const rows = (data || []).filter((r) => !q || (r.codigo + " " + (r.descricao || "")).toLowerCase().includes(q.toLowerCase()));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const empty = { codigo: "", descricao: "", uf: "", fundamento_legal: "", observacao: "", status: "Ativo" };

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await base44.entities.BeneficioFiscal.create(form);
    else await base44.entities.BeneficioFiscal.update(editing.id, form);
    setOpen(false); qc.invalidateQueries({ queryKey: ["beneficioFiscal"] });
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
            <th className="py-2.5 px-4 font-medium">Código</th><th className="py-2.5 px-4 font-medium">Descrição</th>
            <th className="py-2.5 px-4 font-medium">UF</th><th className="py-2.5 px-4 font-medium">Vigência</th>
            <th className="py-2.5 px-4 font-medium">Status</th><th className="py-2.5 px-4 font-medium w-20"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="py-2.5 px-4 font-medium">{r.codigo}</td>
                <td className="py-2.5 px-4 text-muted-foreground max-w-[420px] truncate">{r.descricao}</td>
                <td className="py-2.5 px-4">{r.uf}</td>
                <td className="py-2.5 px-4 text-xs"><VigenciaBadge inicio={r.vigencia_inicio} fim={r.vigencia_fim} /></td>
                <td className="py-2.5 px-4">{r.status}</td>
                <td className="py-2.5 px-4">
                  <button onClick={() => { setForm(r); setEditing(r); setOpen(true); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum benefício cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing === "new" ? "Novo Benefício Fiscal" : `Editar ${editing?.codigo}`}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div><label className="text-xs text-muted-foreground">Código</label><Input value={form.codigo || ""} onChange={(e) => set("codigo", e.target.value)} required /></div>
            <div><label className="text-xs text-muted-foreground">Descrição</label><Input value={form.descricao || ""} onChange={(e) => set("descricao", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">UF</label><Input value={form.uf || ""} onChange={(e) => set("uf", e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground">Fundamento legal</label><Input value={form.fundamento_legal || ""} onChange={(e) => set("fundamento_legal", e.target.value)} /></div>
            </div>
            <VigenciaFields form={form} set={set} />
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