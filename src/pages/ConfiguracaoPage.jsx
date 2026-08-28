import React, { useState, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";

const empty = {
  versao_simulador: "v0.16",
  data_base_normativa: "2026-07-20T00:00:00.000Z",
  cenario_ativo: "Base",
  margem_meta_pct: 0.18,
  prazo_realizacao_credito_dias: 60,
  taxa_custo_financeiro_pct: 0.015,
  observacao: "",
};

export default function ConfiguracaoPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["config"], queryFn: () => base44.entities.Configuracao.list() });
  const existing = data?.[0];
  const [form, setForm] = useState(() => ({ ...empty, ...existing }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sincroniza o formulário quando a consulta assíncrona termina.
  useEffect(() => {
    if (existing) setForm({ ...empty, ...existing });
  }, [existing]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };
  // Percentuais: exibe em pontos (18) e armazena fração (0,18).
  const setPct = (k) => (e) => set(k, Number(e.target.value) / 100);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    if (existing?.id) await base44.entities.Configuracao.update(existing.id, form);
    else await base44.entities.Configuracao.create(form);
    setSaving(false);
    setSaved(true);
    qc.invalidateQueries({ queryKey: ["config"] });
  };

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-heading font-semibold">Configuração</h1>
          <InfoTooltip pagina="config" chave="header" />
        </div>
        <p className="text-sm text-muted-foreground">Premissas centrais, cenário ativo e parâmetros globais do motor</p>
      </div>

      <form onSubmit={save} className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Versão do simulador <InfoTooltip pagina="config" chave="versao_simulador" /></Label>
            <Input value={form.versao_simulador || ""} onChange={(e) => set("versao_simulador", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Cenário ativo <InfoTooltip pagina="config" chave="cenario_ativo" /></Label>
            <Input value={form.cenario_ativo || ""} onChange={(e) => set("cenario_ativo", e.target.value)} className="mt-1" placeholder="Base / Conservador / Estresse" />
          </div>
          <div>
            <Label className="text-xs">Data-base normativa <InfoTooltip pagina="config" chave="data_base_normativa" /></Label>
            <Input type="date" value={form.data_base_normativa ? form.data_base_normativa.slice(0, 10) : ""} onChange={(e) => set("data_base_normativa", e.target.value ? e.target.value + "T00:00:00.000Z" : "")} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Margem meta (%) <InfoTooltip pagina="config" chave="margem_meta_pct" /></Label>
            <Input type="number" step="any" value={(form.margem_meta_pct ?? 0.18) * 100} onChange={setPct("margem_meta_pct")} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Prazo realização crédito (dias) <InfoTooltip pagina="config" chave="prazo_realizacao_credito_dias" /></Label>
            <Input type="number" value={form.prazo_realizacao_credito_dias ?? 60} onChange={(e) => set("prazo_realizacao_credito_dias", Number(e.target.value))} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Taxa custo financeiro (% a.m.) <InfoTooltip pagina="config" chave="taxa_custo_financeiro_pct" /></Label>
            <Input type="number" step="any" value={(form.taxa_custo_financeiro_pct ?? 0.015) * 100} onChange={setPct("taxa_custo_financeiro_pct")} className="mt-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Observação <InfoTooltip pagina="config" chave="observacao" /></Label>
          <Input value={form.observacao || ""} onChange={(e) => set("observacao", e.target.value)} className="mt-1" />
        </div>
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          {saved && <span className="text-xs text-chart-2">Configuração salva.</span>}
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50">
            <Save className="w-4 h-4" /> Salvar
          </button>
        </div>
      </form>
    </div>
  );
}