import React from "react";
import { useParams, useLocation, Outlet, NavLink, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { LayoutDashboard, FileText, FileSearch, Trash2, Lock } from "lucide-react";
import PageHeader from "@/components/PageHeader";

const tabs = [
  { label: "Importação XML", to: "importacao-xml", icon: FileSearch },
  { label: "Operações", to: "operacoes", icon: FileText },
  { label: "Painel", to: "painel", icon: LayoutDashboard },
];

export default function EmpresaWorkroom() {
  const { id: grupoId, empresaId } = useParams();
  const location = useLocation();
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
  // Trava do Painel: só libera depois de existir pelo menos 1 operação
  // lançada pra essa empresa — o resultado é a última etapa do processo,
  // não a porta de entrada. Enquanto a query carrega, trata como travado
  // (padrão seguro: nunca libera antes de confirmar que há dados).
  const { data: operacoesDaEmpresa, isLoading: isLoadingOperacoes } = useQuery({
    queryKey: ["empresa-tem-operacoes", empresa?.id_empresa],
    queryFn: () => base44.entities.Operacao.filter({ empresa_id: empresa.id_empresa }, undefined, 1),
    enabled: !!empresa?.id_empresa,
  });
  const painelLiberado = !isLoadingOperacoes && (operacoesDaEmpresa?.length || 0) > 0;
  const estaNoPainel = location.pathname.endsWith("/painel");
  // Só redireciona quando a checagem já terminou E deu vazio — enquanto
  // carrega, mostra um spinner em vez do conteúdo (evita "piscar" o Painel
  // antes de decidir se ele deveria estar bloqueado).
  const deveRedirecionarDoPainel = estaNoPainel && !isLoadingOperacoes && !painelLiberado && !!empresa;

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
        <div className="max-w-screen-2xl mx-auto flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const bloqueado = tab.to === "painel" && !painelLiberado;
            if (bloqueado) {
              return (
                <span
                  key={tab.to}
                  title="Lance ao menos uma operação (manual ou via importação de XML) para liberar o Painel — o resultado é a última etapa, não a primeira."
                  className="flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 border-transparent text-muted-foreground/40 cursor-not-allowed select-none"
                >
                  <Lock className="w-3 h-3" />
                  {tab.label}
                </span>
              );
            }
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
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

      {estaNoPainel && isLoadingOperacoes ? (
        <div className="p-12 flex items-center justify-center">
          <div className="w-6 h-6 border-4 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : deveRedirecionarDoPainel ? (
        <Navigate to={`/workroom/${grupoId}/empresas/${empresaId}/importacao-xml`} replace />
      ) : (
        <Outlet context={{ grupo, empresa }} />
      )}
    </div>
  );
}
