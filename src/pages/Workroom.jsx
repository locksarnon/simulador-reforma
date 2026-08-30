import React from "react";
import { useParams, useNavigate, Outlet, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronLeft, Trash2 } from "lucide-react";
import PipelineStepper from "@/components/PipelineStepper";

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

  const path = location.pathname;
  let currentStep = 1;
  if (path.includes("/operacoes")) currentStep = 2;
  if (path.includes("/importacao-xml")) currentStep = 2;
  if (path.includes("/cenarios")) currentStep = 2;

  const handleStepClick = (step) => {
    if (step === 1) navigate(`/workroom/${id}/empresas`);
    else if (step === 2) navigate(`/workroom/${id}/operacoes`);
    else if (step === 3) navigate(`/cockpit?grupo=${encodeURIComponent(grupo?.numero || "")}`);
    else if (step === 5) navigate(`/workroom/${id}`);
  };

  return (
    <div className="min-h-screen">
      <div className="border-b border-border bg-card px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            DataHub
          </button>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-lg font-heading font-semibold">
                {isLoading ? "Carregando..." : grupo?.nome || "Grupo"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {grupo?.numero} · {grupo?.tipo}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-8 py-6 bg-background">
        <div className="max-w-7xl mx-auto">
          <PipelineStepper currentStep={currentStep} onStepClick={handleStepClick} />
        </div>
      </div>

      <Outlet context={{ grupo }} />
    </div>
  );
}