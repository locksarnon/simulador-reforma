import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import PageHeader from "@/components/PageHeader";
import EmpresaFormDialog from "@/components/empresas/EmpresaFormDialog";

export default function EmpresasPage() {
  const { id: grupoId } = useParams();
  const navigate = useNavigate();
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
  const [open, setOpen] = useState(false);

  const del = async (em) => {
    if (!confirm(`Excluir ${em.id_empresa}?`)) return;
    await base44.entities.Empresa.delete(em.id);
    qc.invalidateQueries({ queryKey: ["empresas"] });
  };

  const start = (em) => { setEditing(em); setOpen(true); };

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: "DataHub", to: "/" },
          { label: grupo?.nome || "Grupo", to: `/workroom/${grupoId}` },
          { label: "Empresas" },
        ]}
      />
    <div className="p-6 lg:p-8 max-w-screen-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-heading font-semibold">Empresas do Grupo</h1>
            <InfoTooltip pagina="empresas" chave="header" />
          </div>
          <p className="text-sm text-muted-foreground">Vinculadas a {grupoNumero || "—"} · clique numa empresa para abrir o workspace dela</p>
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
              <tr
                key={em.id}
                onClick={() => grupoId && navigate(`/workroom/${grupoId}/empresas/${em.id}`)}
                className={`border-t border-border/50 hover:bg-muted/20 ${grupoId ? "cursor-pointer" : ""}`}
              >
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
                <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
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

      <EmpresaFormDialog open={open} onOpenChange={setOpen} editing={editing} grupoNumero={grupoNumero} />
    </div>
    </div>
  );
}
