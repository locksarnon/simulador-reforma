import React from "react";
import { useParams, Outlet, NavLink } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { LayoutDashboard, FileText, FileSearch, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";

const tabs = [
  { label: "Painel", to: "", icon: LayoutDashboard, end: true },
  { label: "Operações", to: "operacoes", icon: FileText },
  { label: "Importação XML", to: "importacao-xml", icon: FileSearch },
];

export default function EmpresaWorkroom() {
  const { id: grupoId, empresaId } = useParams();
  const qc = useQueryClient();

  const { data: grupo } = useQuery({
    queryKey: ["grupo", grupoId],
    queryFn: () => base44.entities.Grupo.get(grupoId),
    enabled: !!grupoId,
  });
  const { data: empresa, isLoading } = useQuery({
    queryKey: ["empresa", empresaId],
    queryFn: () => base44.entities.Empresa.get(empresaId),
    enabled: !!empresaId,
  });

  const handleDelete = async () => {
    if (!confirm(`Excluir a empresa "${empresa?.razao_social}"? Esta ação não pode ser desfeita.`)) return;
    await base44.entities.Empresa.delete(empresaId);
    qc.invalidateQueries({ queryKey: ["empresas"] });
    window.location.assign(`/workroom/${grupoId}`);
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        crumbs={[
          { label: "DataHub", to: "/" },
          { label: grupo?.nome || "Grupo", to: `/workroom/${grupoId}` },
          { label: isLoading ? "Carregando..." : (empresa?.razao_social || "Empresa") },
        ]}
        title={isLoading ? "Carregando..." : empresa?.razao_social}
        subtitle={empresa ? `${empresa.id_empresa} · ${empresa.regime_atual || "Regime não informado"}` : ""}
        actions={
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Excluir empresa
          </button>
        }
      />

      <div className="border-b border-border bg-card px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 transition-colors ${
                    isActive
                      ? "border-primary text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </NavLink>
            );
          })}
        </div>
      </div>

      <Outlet context={{ grupo, empresa }} />
    </div>
  );
}
