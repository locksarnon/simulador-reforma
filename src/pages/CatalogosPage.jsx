import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Library } from "lucide-react";
import { pct } from "@/lib/format";
import InfoTooltip from "@/components/InfoTooltip";
import PageHeader from "@/components/PageHeader";
import TituloPagina from "@/components/TituloPagina";
import TabelaPadrao, { textoDaColuna } from "@/components/TabelaPadrao";
import { PRODUTOS_COMBUSTIVEL } from "@/motor/combustiveis";

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

/** Data da vigência numa coluna própria; vazio mostra o texto indicado. */
function colunaData(chave, rotulo, vazio) {
  const col = { chave, rotulo, tipo: "data" };
  return { ...col, render: (r) => (r[chave] ? textoDaColuna(col, r) : <span className="text-muted-foreground">{vazio}</span>) };
}

/** Início e fim da vigência em duas colunas. */
function colunasVigencia(inicioKey = "vigencia_inicio", fimKey = "vigencia_fim", rotulo = "Vigência") {
  return [colunaData(inicioKey, `${rotulo}: início`, "sempre"), colunaData(fimKey, `${rotulo}: fim`, "sem fim")];
}

/** Botão de editar da linha. */
function colunaEditar(aoEditar, nome = (r) => r.codigo) {
  return {
    chave: "editar", rotulo: "Ações", valor: () => "", ordenavel: false, filtravel: false,
    render: (r) => <button type="button" onClick={() => aoEditar(r)} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label={`Editar ${nome(r)}`}><Pencil className="w-3.5 h-3.5" /></button>,
  };
}

function BotaoNovo({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-8 items-center gap-1.5 px-3 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90">
      <Plus className="w-3.5 h-3.5" /> Novo
    </button>
  );
}

export default function CatalogosPage() {
  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Catálogos IBS/CBS" }]} />
    <div className="p-6 lg:p-8 space-y-5">
      <div>
        <TituloPagina icon={Library} ajuda={<InfoTooltip pagina="catalogos" chave="header" />}>Catálogos IBS/CBS</TituloPagina>
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
          <TabsTrigger value="combustiveis">Combustíveis</TabsTrigger>
        </TabsList>
        <TabsContent value="cst"><CstTable /></TabsContent>
        <TabsContent value="classtrib"><ClassTribTable /></TabsContent>
        <TabsContent value="ncm"><NcmTable /></TabsContent>
        <TabsContent value="cfop"><CfopTable /></TabsContent>
        <TabsContent value="beneficio"><BeneficioFiscalTable /></TabsContent>
        <TabsContent value="combustiveis"><CombustivelTable /></TabsContent>
        <TabsContent value="credpres"><CredPresTable /></TabsContent>
      </Tabs>
    </div>
    </div>
  );
}

function CstTable() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["cstIbs"], queryFn: () => api.entities.CstIbsCbs.list() });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [open, setOpen] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const empty = { cst: "", descricao_oficial: "", exige_tributacao: "Sim", observacao: "", status: "Ativo", vigencia_inicio: "", vigencia_fim: "" };
  const editar = (r) => { setForm(r); setEditing(r); setOpen(true); };
  const colunas = [
    { chave: "cst", rotulo: "CST", render: (r) => <span className="font-medium">{r.cst}</span> },
    { chave: "descricao_oficial", rotulo: "Descrição oficial", quebrar: true },
    { chave: "exige_tributacao", rotulo: "Tributação" },
    { chave: "diferimento", rotulo: "Diferimento" },
    ...colunasVigencia(),
    { chave: "status", rotulo: "Status" },
    colunaEditar(editar, (r) => r.cst),
  ];

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await api.entities.CstIbsCbs.create(form);
    else await api.entities.CstIbsCbs.update(editing.id, form);
    setOpen(false); qc.invalidateQueries({ queryKey: ["cstIbs"] });
  };

  return (
    <div className="space-y-3">
      <TabelaPadrao id="catalogos:cst" ariaLabel="CST IBS/CBS" colunas={colunas} linhas={data || []} vazio="Nenhum CST cadastrado."
        acoes={<BotaoNovo onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} />} />
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
  const { data } = useQuery({ queryKey: ["classTrib"], queryFn: () => api.entities.ClassTrib.list() });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [open, setOpen] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const empty = { c_class_trib: "", cst: "000", descricao_oficial: "", pct_reducao_ibs: 0, pct_reducao_cbs: 0, status: "Ativo", vigencia_inicio: "", vigencia_fim: "" };
  const editar = (r) => { setForm(r); setEditing(r); setOpen(true); };
  const colunas = [
    { chave: "c_class_trib", rotulo: "cClassTrib", render: (r) => <span className="font-medium">{r.c_class_trib}</span> },
    { chave: "cst", rotulo: "CST" },
    { chave: "descricao_oficial", rotulo: "Descrição", quebrar: true },
    { chave: "pct_reducao_ibs", rotulo: "Red. IBS", alinhar: "direita", valor: (r) => Number(r.pct_reducao_ibs) || 0, render: (r) => pct(r.pct_reducao_ibs) },
    { chave: "pct_reducao_cbs", rotulo: "Red. CBS", alinhar: "direita", valor: (r) => Number(r.pct_reducao_cbs) || 0, render: (r) => pct(r.pct_reducao_cbs) },
    ...colunasVigencia(),
    colunaEditar(editar, (r) => r.c_class_trib),
  ];

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await api.entities.ClassTrib.create(form);
    else await api.entities.ClassTrib.update(editing.id, form);
    setOpen(false); qc.invalidateQueries({ queryKey: ["classTrib"] });
  };

  return (
    <div className="space-y-3">
      <TabelaPadrao id="catalogos:classtrib" ariaLabel="cClassTrib" colunas={colunas} linhas={data || []} vazio="Nenhum código cadastrado."
        acoes={<BotaoNovo onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} />} />
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
  const { data } = useQuery({ queryKey: ["credPres"], queryFn: () => api.entities.CredPres.list() });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [open, setOpen] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const editar = (r) => { setForm(r); setEditing(r); setOpen(true); };
  const colunas = [
    { chave: "c_cred_pres", rotulo: "cCredPres", render: (r) => <span className="font-medium">{r.c_cred_pres}</span> },
    { chave: "descricao_oficial", rotulo: "Descrição oficial", quebrar: true },
    { chave: "ibs_aplicavel", rotulo: "IBS" },
    { chave: "cbs_aplicavel", rotulo: "CBS" },
    { chave: "percentual_oficial", rotulo: "% oficial" },
    ...colunasVigencia("inicio_ibs", "fim_ibs", "Vigência IBS"),
    ...colunasVigencia("inicio_cbs", "fim_cbs", "Vigência CBS"),
    colunaEditar(editar, (r) => r.c_cred_pres),
  ];
  const empty = {
    c_cred_pres: "", descricao_oficial: "",
    ibs_aplicavel: "Não", cbs_aplicavel: "Não", metodo_calculo: "Direto",
    percentual_oficial: "", status: "Ativo",
    inicio_ibs: "", fim_ibs: "", inicio_cbs: "", fim_cbs: "",
  };
  const pendente = String(form.percentual_oficial || "").toLowerCase().includes("pendente");

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await api.entities.CredPres.create(form);
    else await api.entities.CredPres.update(editing.id, form);
    setOpen(false); qc.invalidateQueries({ queryKey: ["credPres"] });
  };

  return (
    <div className="space-y-3">
      <TabelaPadrao id="catalogos:credpres" ariaLabel="cCredPres" colunas={colunas} linhas={data || []} vazio="Nenhum código cadastrado."
        acoes={<BotaoNovo onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} />} />
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
  const { data } = useQuery({ queryKey: ["ncm"], queryFn: () => api.entities.Ncm.list() });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [open, setOpen] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const empty = { codigo: "", descricao: "", observacao: "", status: "Ativo" };
  const editar = (r) => { setForm(r); setEditing(r); setOpen(true); };
  const colunas = [
    { chave: "codigo", rotulo: "NCM", render: (r) => <span className="font-medium">{r.codigo}</span> },
    { chave: "descricao", rotulo: "Descrição", quebrar: true },
    { chave: "status", rotulo: "Status" },
    colunaEditar(editar),
  ];

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await api.entities.Ncm.create(form);
    else await api.entities.Ncm.update(editing.id, form);
    setOpen(false); qc.invalidateQueries({ queryKey: ["ncm"] });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Catálogo opcional: enquanto estiver vazio, a importação de XML não bloqueia nenhum NCM. Assim que houver ao menos um código aqui, códigos fora da lista viram alerta.
      </p>
      <TabelaPadrao id="catalogos:ncm" ariaLabel="NCM" colunas={colunas} linhas={data || []} vazio="Nenhum NCM cadastrado."
        acoes={<BotaoNovo onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} />} />
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
  const { data } = useQuery({ queryKey: ["cfop"], queryFn: () => api.entities.Cfop.list() });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [open, setOpen] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const empty = { codigo: "", descricao: "", tipo_operacao: "Saida", aplicavel_a: "", observacao: "", status: "Ativo" };
  const editar = (r) => { setForm(r); setEditing(r); setOpen(true); };
  const colunas = [
    { chave: "codigo", rotulo: "CFOP", render: (r) => <span className="font-medium">{r.codigo}</span> },
    { chave: "descricao", rotulo: "Descrição", quebrar: true },
    { chave: "tipo_operacao", rotulo: "Direção" },
    { chave: "status", rotulo: "Status" },
    colunaEditar(editar),
  ];

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await api.entities.Cfop.create(form);
    else await api.entities.Cfop.update(editing.id, form);
    setOpen(false); qc.invalidateQueries({ queryKey: ["cfop"] });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Catálogo opcional: mesma regra do NCM — vazio não bloqueia nada, populado passa a alertar CFOP fora da lista.
      </p>
      <TabelaPadrao id="catalogos:cfop" ariaLabel="CFOP" colunas={colunas} linhas={data || []} vazio="Nenhum CFOP cadastrado."
        acoes={<BotaoNovo onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} />} />
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
  const { data } = useQuery({ queryKey: ["beneficioFiscal"], queryFn: () => api.entities.BeneficioFiscal.list() });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [open, setOpen] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const empty = { codigo: "", descricao: "", uf: "", fundamento_legal: "", observacao: "", status: "Ativo" };
  const editar = (r) => { setForm(r); setEditing(r); setOpen(true); };
  const colunas = [
    { chave: "codigo", rotulo: "Código", render: (r) => <span className="font-medium">{r.codigo}</span> },
    { chave: "descricao", rotulo: "Descrição", quebrar: true },
    { chave: "uf", rotulo: "UF" },
    ...colunasVigencia(),
    { chave: "status", rotulo: "Status" },
    colunaEditar(editar),
  ];

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await api.entities.BeneficioFiscal.create(form);
    else await api.entities.BeneficioFiscal.update(editing.id, form);
    setOpen(false); qc.invalidateQueries({ queryKey: ["beneficioFiscal"] });
  };

  return (
    <div className="space-y-3">
      <TabelaPadrao id="catalogos:beneficio" ariaLabel="Benefício fiscal" colunas={colunas} linhas={data || []} vazio="Nenhum benefício cadastrado."
        acoes={<BotaoNovo onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} />} />
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
const moeda4 = (v) => (v === null || v === undefined ? null : `R$ ${Number(v).toFixed(4).replace(".", ",")}`);

/**
 * Alíquotas específicas (R$ por litro ou quilo) do regime de combustíveis — LC 214/2025, arts. 173 a 175.
 * Uma linha por produto e ano. A CBS de 2027 vem da Portaria MF nº 3.074/2026; o IBS por unidade (de 2029 em
 * diante) só existe quando o Comitê Gestor divulgar: vazio = pendente, e o motor avisa em vez de inventar.
 */
function CombustivelTable() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["aliquotaCombustivel"], queryFn: () => api.entities.AliquotaCombustivel.list() });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [open, setOpen] = useState(false);
  // Ano e, dentro do ano, a ordem do art. 172 (gasolina, EAC, diesel, B100, GLP, EHC, QAV, óleo combustível).
  const ordemProduto = (p) => PRODUTOS_COMBUSTIVEL.findIndex((x) => x.id === p);
  const rows = [...(data || [])].sort((a, b) => a.ano - b.ano || ordemProduto(a.produto) - ordemProduto(b.produto));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const empty = { produto: "diesel", ano: 2028, cbs_por_unidade: "", ibs_por_unidade: "", fonte: "", status: "Oficial", observacao: "" };
  const porUnidade = (k) => ({
    chave: k, rotulo: k === "cbs_por_unidade" ? "CBS por unidade" : "IBS por unidade", alinhar: "direita",
    valor: (r) => (r[k] === null || r[k] === undefined ? null : Number(r[k])),
    render: (r) => moeda4(r[k]) || <span className="text-muted-foreground">pendente</span>,
  });
  const colunas = [
    { chave: "ano", rotulo: "Ano", render: (r) => <span className="font-medium">{r.ano}</span> },
    { chave: "descricao", rotulo: "Combustível" },
    { chave: "unidade", rotulo: "Unidade" },
    porUnidade("cbs_por_unidade"),
    porUnidade("ibs_por_unidade"),
    { chave: "fonte", rotulo: "Fonte", quebrar: true },
    { chave: "status", rotulo: "Status" },
    {
      chave: "editar", rotulo: "Ações", valor: () => "", ordenavel: false, filtravel: false,
      render: (r) => <button type="button" onClick={() => { setForm(r); setEditing(r); setOpen(true); }} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label={`Editar ${r.descricao} ${r.ano}`}><Pencil className="w-3.5 h-3.5" /></button>,
    },
  ];

  const save = async (e) => {
    e.preventDefault();
    const meta = PRODUTOS_COMBUSTIVEL.find((p) => p.id === form.produto);
    // Ao editar a mesma linha, mantém a descrição gravada (ela traz o "exceto..." da Portaria); em linha nova ou com outro produto, usa o nome do produto.
    const mesmoProduto = editing !== "new" && editing?.produto === form.produto;
    const payload = { ...form, descricao: mesmoProduto && form.descricao ? form.descricao : (meta?.nome || form.produto), unidade: meta?.unidade || form.unidade };
    if (editing === "new") await api.entities.AliquotaCombustivel.create(payload);
    else await api.entities.AliquotaCombustivel.update(editing.id, payload);
    setOpen(false); qc.invalidateQueries({ queryKey: ["aliquotaCombustivel"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-3xl">
          Regime específico de combustíveis (LC 214, arts. 172 a 180): IBS e CBS em reais por litro ou quilo, uma única vez na cadeia.
          A CBS de 2027 é a da Portaria MF nº 3.074/2026 (efeitos a partir de 08/01/2027). O IBS por unidade, de 2029 em diante, ainda
          não foi divulgado pelo Comitê Gestor: deixe em branco até lá. Anos sem linha repetem a CBS do último ano divulgado.
        </p>
        <button onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 shrink-0">
          <Plus className="w-4 h-4" /> Novo
        </button>
      </div>
      <TabelaPadrao id="catalogos:combustiveis" ariaLabel="Alíquotas de combustíveis" colunas={colunas} linhas={rows} ordemInicial={null} vazio="Nenhuma alíquota cadastrada." />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing === "new" ? "Nova alíquota de combustível" : `Editar ${editing?.descricao} ${editing?.ano}`}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FixedSelect label="Combustível" value={form.produto} fallback="diesel" onChange={(v) => set("produto", v)}
                options={PRODUTOS_COMBUSTIVEL.map((p) => ({ value: p.id, label: `${p.nome} (${p.unidade})` }))} />
              <div><label className="text-xs text-muted-foreground">Ano</label><Input type="number" value={form.ano ?? ""} onChange={(e) => set("ano", Number(e.target.value))} required /></div>
              <div><label className="text-xs text-muted-foreground">CBS por unidade (R$)</label><Input type="number" step="any" min="0" value={form.cbs_por_unidade ?? ""} onChange={(e) => set("cbs_por_unidade", e.target.value === "" ? "" : Number(e.target.value))} placeholder="vazio = pendente" /></div>
              <div><label className="text-xs text-muted-foreground">IBS por unidade (R$)</label><Input type="number" step="any" min="0" value={form.ibs_por_unidade ?? ""} onChange={(e) => set("ibs_por_unidade", e.target.value === "" ? "" : Number(e.target.value))} placeholder="vazio = pendente" /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">Fonte (ato e dispositivo)</label><Input value={form.fonte || ""} onChange={(e) => set("fonte", e.target.value)} placeholder="Ex.: Portaria MF nº ..., Anexo" /></div>
            <FixedSelect label="Status" value={form.status} fallback="Oficial" onChange={(v) => set("status", v)}
              options={[{ value: "Oficial", label: "Oficial (ato publicado)" }, { value: "Estimativa", label: "Estimativa" }]} />
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
