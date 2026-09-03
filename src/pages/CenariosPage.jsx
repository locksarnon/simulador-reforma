import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Check } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import PageHeader from "@/components/PageHeader";

const empty = { nome: "", descricao: "", fator_volume: 1, fator_preco: 1, fator_custo: 1, fator_credito_aproveitado: 1 };

export default function CenariosPage() {
  const qc = useQueryClient();
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: () => base44.entities.Configuracao.list() });
  const { data, isLoading } = useQuery({ queryKey: ["cenario"], queryFn: () => base44.entities.Cenario.list() });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const activeName = config?.[0]?.cenario_ativo;

  const save = async (e) => {
    e.preventDefault();
    if (editing === "new") await base44.entities.Cenario.create(form);
    else await base44.entities.Cenario.update(editing.id, form);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["cenario"] });
  };

  const del = async (c) => {
    if (!confirm(`Excluir cenário ${c.nome}?`)) return;
    await base44.entities.Cenario.delete(c.id);
    qc.invalidateQueries({ queryKey: ["cenario"] });
  };

  const setActive = async (nome) => {
    const cfg = config?.[0];
    if (cfg) await base44.entities.Configuracao.update(cfg.id, { cenario_ativo: nome });
    else await base44.entities.Configuracao.create({ cenario_ativo: nome, versao_simulador: "v0.14" });
    qc.invalidateQueries({ queryKey: ["config"] });
  };

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Cenários" }]} />
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-heading font-semibold">Cenários</h1>
            <InfoTooltip pagina="cenarios" chave="header" />
          </div>
          <p className="text-sm text-muted-foreground">
            Fatores de volume, preço, custo e crédito aplicados ao motor. Os cenários ficam sempre disponíveis lado a lado
            no Painel Executivo — o "padrão" abaixo só define qual deles vem pré-selecionado lá.
          </p>
        </div>
        <button onClick={() => { setForm(empty); setEditing("new"); setOpen(true); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Novo cenário
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(data || []).map((c) => {
          const active = c.nome === activeName;
          return (
            <div key={c.id} className={`rounded-lg border p-5 bg-card ${active ? "border-primary ring-1 ring-primary/30" : "border-border"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-heading font-medium">{c.nome}</h3>
                    {active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground">PADRÃO</span>}
                  </div>
                  {c.descricao && <p className="text-xs text-muted-foreground mt-0.5">{c.descricao}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setForm(c); setEditing(c); setOpen(true); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => del(c)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 text-sm">
                <Factor label="Fator volume" v={c.fator_volume} />
                <Factor label="Fator preço" v={c.fator_preco} />
                <Factor label="Fator custo" v={c.fator_custo} />
                <Factor label="Crédito aproveitado" v={c.fator_credito_aproveitado} />
              </div>
              {!active && (
                <button onClick={() => setActive(c.nome)} className="mt-4 w-full text-xs py-1.5 rounded-md border border-border hover:bg-muted inline-flex items-center justify-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Definir como padrão
                </button>
              )}
            </div>
          );
        })}
        {(!data || data.length === 0) && (
          <div className="col-span-2 py-12 text-center text-muted-foreground border border-dashed border-border rounded-lg">
            Nenhum cenário cadastrado.
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing === "new" ? "Novo cenário" : `Editar ${editing?.nome}`}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div><Label className="text-xs">Nome <InfoTooltip pagina="cenarios" chave="nome" /></Label><Input value={form.nome} onChange={(e) => set("nome", e.target.value)} required /></div>
            <div><Label className="text-xs">Descrição <InfoTooltip pagina="cenarios" chave="descricao" /></Label><Input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Fator volume <InfoTooltip pagina="cenarios" chave="fator_volume" /></Label><Input type="number" step="any" value={form.fator_volume} onChange={(e) => set("fator_volume", Number(e.target.value))} /></div>
              <div><Label className="text-xs">Fator preço <InfoTooltip pagina="cenarios" chave="fator_preco" /></Label><Input type="number" step="any" value={form.fator_preco} onChange={(e) => set("fator_preco", Number(e.target.value))} /></div>
              <div><Label className="text-xs">Fator custo <InfoTooltip pagina="cenarios" chave="fator_custo" /></Label><Input type="number" step="any" value={form.fator_custo} onChange={(e) => set("fator_custo", Number(e.target.value))} /></div>
              <div><Label className="text-xs">Crédito aproveitado <InfoTooltip pagina="cenarios" chave="fator_credito_aproveitado" /></Label><Input type="number" step="any" value={form.fator_credito_aproveitado} onChange={(e) => set("fator_credito_aproveitado", Number(e.target.value))} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm rounded-md border border-border">Cancelar</button>
              <button type="submit" className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground">Salvar</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}

function Factor({ label, v }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}×</span>
    </div>
  );
}