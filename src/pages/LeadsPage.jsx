import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Users } from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import TituloPagina from "@/components/TituloPagina";
import TabelaPadrao from "@/components/TabelaPadrao";

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
  const { data: leads = [], isLoading } = useQuery({ queryKey: ["leads"], queryFn: () => api.entities.Lead.filter({}, "-createdAt", 1000) });
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
    await api.entities.Lead.update(l.id, campos);
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
            <TituloPagina icon={Users}>Leads</TituloPagina>
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

        <TabelaPadrao id="leads" ariaLabel="Leads" linhas={filtrados} ordemInicial={{ chave: "createdAt", dir: -1 }}
          vazio={isLoading ? "Carregando…" : leads.length === 0 ? "Nenhum lead ainda. Divulgue a Calculadora, a Consulta NCM e o Validador de cadastro." : "Nenhum lead neste filtro."}
          aoClicarLinha={(l) => setAberto(aberto === l.id ? null : l.id)}
          destaqueLinha={(l) => (aberto === l.id ? "bg-primary/5" : "")}
          colunas={[
            { chave: "createdAt", rotulo: "Data", tipo: "data", render: (l) => <span className="text-xs text-muted-foreground">{fmtData(l.createdAt)}</span> },
            { chave: "nome", rotulo: "Nome", render: (l) => <span className="font-medium">{l.nome}</span> },
            { chave: "email", rotulo: "E-mail" },
            { chave: "telefone", rotulo: "Telefone" },
            { chave: "empresa", rotulo: "Empresa" },
            { chave: "cargo", rotulo: "Cargo" },
            { chave: "segmento", rotulo: "Segmento", valor: (l) => l.segmento || "—" },
            { chave: "porte", rotulo: "Porte" },
            { chave: "origem", rotulo: "Origem", valor: (l) => ORIGEM[l.origem] || l.origem },
            { chave: "score", rotulo: "Score", tipo: "numero", alinhar: "direita", render: (l) => <span className="font-medium">{l.score}</span> },
            { chave: "destino", rotulo: "Destino", valor: (l) => DESTINOS[l.destino] || "—", render: (l) => <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${COR_DEST[l.destino] || COR_DEST.nutricao}`}>{DESTINOS[l.destino] || "—"}</span> },
            { chave: "status", rotulo: "Status", render: (l) => <select value={l.status} onClick={(e) => e.stopPropagation()} onChange={(e) => atualizar(l, { status: e.target.value })} aria-label={`Status de ${l.nome}`} className="h-7 rounded-md border border-input bg-background px-1.5 text-xs">{STATUS.map((s) => <option key={s}>{s}</option>)}</select> },
          ]}
        />
        {filtrados.filter((l) => l.id === aberto).map((l) => {
          let extra = null;
          try { extra = l.dados_json ? JSON.parse(l.dados_json) : null; } catch { /* dado antigo */ }
          return (
            <section key={l.id} aria-label={`Detalhe de ${l.nome}`} className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{l.nome}</h3>
                <button type="button" onClick={() => setAberto(null)} className="text-xs text-muted-foreground hover:text-foreground">Fechar</button>
              </div>
              {extra && <p className="text-muted-foreground">Resultado da ferramenta: {extra.atual_pct != null ? `carga hoje ${Number(extra.atual_pct).toFixed(1)}% → 2033 ${Number(extra.pct_2033).toFixed(1)}% (${Number(extra.impacto_pp_2033) >= 0 ? "+" : ""}${Number(extra.impacto_pp_2033).toFixed(1)} p.p.)` : JSON.stringify(extra)}{extra.faturamento_anual ? ` · faturamento anual estimado R$ ${Math.round(extra.faturamento_anual).toLocaleString("pt-BR")}` : ""}</p>}
              <p className="text-muted-foreground">Newsletter: {l.consentimento_email ? "consentiu" : "não consentiu"}</p>
              <textarea defaultValue={l.notas || ""} onBlur={(e) => e.target.value !== (l.notas || "") && atualizar(l, { notas: e.target.value })} placeholder="Notas do contato (salva ao sair do campo)" rows={2} className="w-full rounded-md border border-input bg-background p-2 text-sm" />
            </section>
          );
        })}
      </div>
    </div>
  );
}
