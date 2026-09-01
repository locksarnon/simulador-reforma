import React from "react";
import { useParams, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";

export default function Workroom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const qc = useQueryClient();
  const { data: grupo, isLoading } = useQuery({
    queryKey: ["grupo", id],
    queryFn: () => base44.entities.Grupo.get(id),
    enabled: !!id,
  });

  const handleDelete = async () => {
    if (!confirm(`Excluir o grupo "${grupo?.nome}"? Esta ação não pode ser desfeita.`)) return;
    await base44.entities.Grupo.delete(id);
    qc.invalidateQueries({ queryKey: ["grupos"] });
    navigate("/");
  };

  // Só mostra o cabeçalho do grupo na visão geral — cada rota filha
  // (Empresas, Operações, Importação XML, workspace de uma empresa) já tem
  // o próprio PageHeader com o breadcrumb completo. Sem isso os dois
  // cabeçalhos empilhavam, duplicando "Voltar" e a trilha.
  const isOverview = location.pathname === `/workroom/${id}`;

  return (
    <div className="min-h-screen">
      {isOverview && (
        <PageHeader
          crumbs={[
            { label: "DataHub", to: "/" },
            { label: isLoading ? "Carregando..." : (grupo?.nome || "Grupo") },
          ]}
          title={isLoading ? "Carregando..." : grupo?.nome || "Grupo"}
          subtitle={grupo ? `${grupo.numero} · ${grupo.tipo}` : ""}
          actions={
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </button>
          }
        />
      )}

      <Outlet context={{ grupo }} />
    </div>
  );
}