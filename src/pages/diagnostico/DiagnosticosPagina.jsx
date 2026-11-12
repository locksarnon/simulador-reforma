import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import BotaoExportar from "@/components/BotaoExportar";
import NovoDiagnosticoDialog from "@/components/diagnostico/NovoDiagnosticoDialog";
import { useCarteiras } from "@/lib/useCarteiras";
import { fmtDataCurta } from "@/lib/servicos";
import { SITUACOES_PROJETO } from "@/lib/projetos";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Diagnósticos > Projetos: cada trabalho pontual com o seu escopo; "Novo diagnóstico" é a ação principal. */
export default function DiagnosticosPagina() {
  const navigate = useNavigate();
  const { empresas, grupos, carregando: carregandoCadastro } = useCarteiras();
  const projetos = useQuery({ queryKey: ["projetos-diagnostico"], queryFn: () => api.get("/projetos-diagnostico") });
  const [novo, setNovo] = useState(false);
  const [filtro, setFiltro] = useState({ busca: "", situacao: "abertos" });
  const nomeDe = useMemo(() => new Map(empresas.map((e) => [e.id, e.razao_social])), [empresas]);
  const lista = useMemo(() => {
    const q = filtro.busca.trim().toLowerCase();
    return (projetos.data || [])
      .filter((p) => filtro.situacao === "todos" || (filtro.situacao === "abertos" ? ["EM_ANDAMENTO", "PAUSADO"].includes(p.situacao) : p.situacao === filtro.situacao))
      .filter((p) => !q || p.nome.toLowerCase().includes(q) || p.empresa_ids.some((id) => (nomeDe.get(id) || "").toLowerCase().includes(q)));
  }, [projetos.data, filtro, nomeDe]);
  const atrasado = (p) => p.prazo && ["EM_ANDAMENTO", "PAUSADO"].includes(p.situacao) && new Date(p.prazo) < new Date(new Date().toISOString().slice(0, 10));

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "Diagnósticos" }]}
        title="Diagnósticos"
        actions={<button type="button" onClick={() => setNovo(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Novo diagnóstico</button>}
      />
      <div className="px-6 lg:px-8 py-5 space-y-3">
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex-1 min-w-[220px] space-y-1"><span className="block text-xs text-muted-foreground">Buscar</span><input type="search" className={`${campo} w-full`} placeholder="Nome do projeto ou da empresa" value={filtro.busca} onChange={(e) => setFiltro((f) => ({ ...f, busca: e.target.value }))} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Situação</span>
            <select className={campo} value={filtro.situacao} onChange={(e) => setFiltro((f) => ({ ...f, situacao: e.target.value }))}>
              <option value="abertos">Em andamento e pausados</option><option value="todos">Todos</option>
              {Object.entries(SITUACOES_PROJETO).map(([k, s]) => <option key={k} value={k}>{s.rotulo}</option>)}
            </select></label>
          <BotaoExportar titulo="Diagnósticos" linhas={lista} colunas={[
            { chave: "nome", rotulo: "Diagnóstico" }, { chave: "empresas", rotulo: "Empresas", valor: (p) => p.empresa_ids.map((id) => nomeDe.get(id) || "").join(", ") },
            { chave: "situacao", rotulo: "Situação", valor: (p) => SITUACOES_PROJETO[p.situacao]?.rotulo || p.situacao },
            { chave: "prazo", rotulo: "Prazo", valor: (p) => (p.prazo ? fmtDataCurta(p.prazo) : "") }, { chave: "responsavel", rotulo: "Responsável" },
          ]} />
          <Link to="/diagnostico/carteira" className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Clientes com diagnóstico</Link>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-[13px]" aria-label="Projetos de diagnóstico">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-3 py-2">Diagnóstico</th><th className="px-2 py-2">Empresas</th><th className="px-2 py-2">Situação</th><th className="px-2 py-2">Prazo</th><th className="px-2 py-2">Responsável</th></tr></thead>
            <tbody>
              {(projetos.isLoading || carregandoCadastro) && <tr><td colSpan={5} className="py-10 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</td></tr>}
              {!projetos.isLoading && !carregandoCadastro && lista.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">
                  {(projetos.data || []).length === 0 ? <>Nenhum diagnóstico ainda. <button type="button" onClick={() => setNovo(true)} className="text-primary hover:underline">Criar o primeiro</button></> : "Nenhum diagnóstico com esses filtros."}
                </td></tr>
              )}
              {lista.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/diagnostico/projetos/${p.id}`)} className="cursor-pointer border-b border-border/60 last:border-0 align-top hover:bg-muted/40">
                  <td className="px-3 py-2"><Link to={`/diagnostico/projetos/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary hover:underline">{p.nome}</Link>{p.escopo && <p className="line-clamp-1 text-[11px] text-muted-foreground">{p.escopo}</p>}</td>
                  <td className="px-2 py-2 text-xs">{p.empresa_ids.slice(0, 3).map((id) => nomeDe.get(id) || "empresa removida").join(", ")}{p.empresa_ids.length > 3 ? ` e mais ${p.empresa_ids.length - 3}` : ""}</td>
                  <td className="px-2 py-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SITUACOES_PROJETO[p.situacao]?.tom || ""}`}>{SITUACOES_PROJETO[p.situacao]?.rotulo || p.situacao}</span></td>
                  <td className={`px-2 py-2 whitespace-nowrap tabular-nums ${atrasado(p) ? "font-medium text-red-700 dark:text-red-400" : ""}`}>{p.prazo ? fmtDataCurta(p.prazo) : "—"}{atrasado(p) ? " · atrasado" : ""}</td>
                  <td className="px-2 py-2 text-muted-foreground">{p.responsavel || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <NovoDiagnosticoDialog aberto={novo} aoFechar={() => setNovo(false)} empresas={empresas} grupos={grupos} />
    </div>
  );
}
