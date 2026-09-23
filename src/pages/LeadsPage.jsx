import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/PageHeader";

const STATUS = ["Novo", "Contatado", "Qualificado", "Reunião", "Fechado", "Perdido"];
const DESTINOS = { consultoria: "Consultoria", bpo: "BPO fiscal", parceria: "Parceria", nutricao: "Nutrição" };
const COR_DEST = {
  consultoria: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  bpo: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  parceria: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  nutricao: "bg-muted text-muted-foreground",
};
const ORIGEM = { calculadora: "Calculadora", consulta_ncm: "Consulta NCM", validador_cadastro: "Validador", site: "Site" };

const fmtData = (v) => new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Funil comercial: contatos captados pelas ferramentas públicas, já pontuados e encaminhados. */
export default function LeadsPage() {
  const qc = useQueryClient();
  const { data: leads = [], isLoading } = useQuery({ queryKey: ["leads"], queryFn: () => base44.entities.Lead.filter({}, "-createdAt", 1000) });
  const [destino, setDestino] = useState("");
  const [status, setStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(null);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return leads.filter((l) => (!destino || l.destino === destino) && (!status || l.status === status)
      && (!t || `${l.nome} ${l.email} ${l.empresa || ""}`.toLowerCase().includes(t)));
  }, [leads, destino, status, busca]);

  const kpis = useMemo(() => ({
    total: leads.length,
    novos: leads.filter((l) => l.status === "Novo").length,
    consultoria: leads.filter((l) => l.destino === "consultoria").length,
    scoreMedio: leads.length ? Math.round(leads.reduce((a, l) => a + (l.score || 0), 0) / leads.length) : 0,
  }), [leads]);

  const atualizar = async (l, campos) => {
    await base44.entities.Lead.update(l.id, campos);
    qc.invalidateQueries({ queryKey: ["leads"] });
  };

  const exportar = () => {
    const cab = ["Data", "Nome", "E-mail", "Telefone", "Empresa", "Cargo", "Porte", "Perfil", "Origem", "Score", "Destino", "Status", "Newsletter"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = filtrados.map((l) => [fmtData(l.createdAt), l.nome, l.email, l.telefone, l.empresa, l.cargo, l.porte, l.perfil, ORIGEM[l.origem] || l.origem, l.score, DESTINOS[l.destino] || l.destino, l.status, l.consentimento_email ? "sim" : "não"].map(esc).join(";"));
    const blob = new Blob(["﻿" + [cab.map(esc).join(";"), ...linhas].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "leads-intax.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Leads" }]} />
      <div className="p-6 lg:p-8 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2"><Users className="w-5 h-5 text-muted-foreground" /><h1 className="text-xl font-heading font-semibold">Leads</h1></div>
            <p className="text-sm text-muted-foreground">Contatos das ferramentas públicas, pontuados por porte, impacto, regime e cargo — o destino sugere o próximo passo.</p>
          </div>
          <button onClick={exportar} disabled={filtrados.length === 0} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50"><Download className="w-4 h-4" /> Exportar CSV</button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[["Leads", kpis.total], ["Novos (sem contato)", kpis.novos], ["Perfil consultoria", kpis.consultoria], ["Score médio", kpis.scoreMedio]].map(([t, v]) => (
            <div key={t} className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{t}</p><p className="text-2xl font-semibold tabular-nums">{v}</p></div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, e-mail ou empresa" className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm" />
          <select value={destino} onChange={(e) => setDestino(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="">Todos os destinos</option>{Object.entries(DESTINOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="">Todos os status</option>{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
              <th className="px-3 py-2 font-medium">Data</th><th className="px-3 py-2 font-medium">Contato</th><th className="px-3 py-2 font-medium">Perfil</th>
              <th className="px-3 py-2 font-medium">Origem</th><th className="px-3 py-2 font-medium">Score</th><th className="px-3 py-2 font-medium">Destino</th><th className="px-3 py-2 font-medium">Status</th>
            </tr></thead>
            <tbody>
              {filtrados.map((l, i) => {
                let extra = null;
                try { extra = l.dados_json ? JSON.parse(l.dados_json) : null; } catch { /* dado antigo */ }
                return (
                  <React.Fragment key={l.id}>
                    <tr onClick={() => setAberto(aberto === l.id ? null : l.id)} className={`border-b border-border align-top cursor-pointer hover:bg-muted/30 ${i % 2 ? "bg-muted/15" : ""}`}>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{fmtData(l.createdAt)}</td>
                      <td className="px-3 py-2"><div className="font-medium">{l.nome}</div><div className="text-xs text-muted-foreground">{l.email}{l.telefone ? ` · ${l.telefone}` : ""}</div>{l.empresa && <div className="text-xs text-muted-foreground">{l.empresa}{l.cargo ? ` — ${l.cargo}` : ""}</div>}</td>
                      <td className="px-3 py-2 text-xs">{l.segmento || "—"}<div className="text-muted-foreground">{l.porte || ""}</div></td>
                      <td className="px-3 py-2 text-xs">{ORIGEM[l.origem] || l.origem}</td>
                      <td className="px-3 py-2 tabular-nums font-medium">{l.score}</td>
                      <td className="px-3 py-2"><span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${COR_DEST[l.destino] || COR_DEST.nutricao}`}>{DESTINOS[l.destino] || "—"}</span></td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <select value={l.status} onChange={(e) => atualizar(l, { status: e.target.value })} className="h-8 rounded-md border border-input bg-background px-1.5 text-xs">{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
                      </td>
                    </tr>
                    {aberto === l.id && (
                      <tr className="border-b border-border bg-muted/20">
                        <td colSpan={7} className="px-4 py-3 space-y-2 text-xs">
                          {extra && <p className="text-muted-foreground">Resultado da ferramenta: {extra.atual_pct != null ? `carga hoje ${Number(extra.atual_pct).toFixed(1)}% → 2033 ${Number(extra.pct_2033).toFixed(1)}% (${Number(extra.impacto_pp_2033) >= 0 ? "+" : ""}${Number(extra.impacto_pp_2033).toFixed(1)} p.p.)` : JSON.stringify(extra)}{extra.faturamento_anual ? ` · faturamento anual estimado R$ ${Math.round(extra.faturamento_anual).toLocaleString("pt-BR")}` : ""}</p>}
                          <p className="text-muted-foreground">Newsletter: {l.consentimento_email ? "consentiu" : "não consentiu"}</p>
                          <textarea defaultValue={l.notas || ""} onBlur={(e) => e.target.value !== (l.notas || "") && atualizar(l, { notas: e.target.value })} placeholder="Notas do contato (salva ao sair do campo)" rows={2} className="w-full rounded-md border border-input bg-background p-2 text-sm" />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {!isLoading && filtrados.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{leads.length === 0 ? "Nenhum lead ainda. Divulgue a Calculadora, a Consulta NCM e o Validador de cadastro." : "Nenhum lead neste filtro."}</p>}
        </div>
      </div>
    </div>
  );
}
