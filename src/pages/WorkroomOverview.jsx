import React, { useState } from "react";
import { useParams, useNavigate, useOutletContext, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronRight, SlidersHorizontal, LayoutDashboard, CalendarClock, BookMarked, UploadCloud, Plus } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import EmpresaCard from "@/components/EmpresaCard";
import EmpresaFormDialog from "@/components/empresas/EmpresaFormDialog";

export default function WorkroomOverview() {
  const { id } = useParams();
  const { grupo } = useOutletContext() || {};
  const navigate = useNavigate();
  const qc = useQueryClient();
  const grupoNumero = grupo?.numero;

  const { data: empresas = [], isLoading } = useQuery({
    queryKey: ["empresas", grupoNumero],
    queryFn: () => base44.entities.Empresa.filter({ grupo: grupoNumero }),
    enabled: !!grupoNumero,
  });

  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const startNew = () => { setEditing("new"); setOpen(true); };
  const startEdit = (em) => { setEditing(em); setOpen(true); };
  const del = async (em) => {
    if (!confirm(`Excluir ${em.id_empresa}?`)) return;
    await base44.entities.Empresa.delete(em.id);
    qc.invalidateQueries({ queryKey: ["empresas"] });
  };

  // Compartilhados entre todos os grupos — não são exclusivos deste
  // (Cenário, Configuração, Transição e Catálogos não têm vínculo com
  // nenhum grupo específico no banco; editar aqui afeta todo mundo).
  const globalModules = [
    { label: "Painel Executivo (todo o grupo)", to: `/cockpit?grupo=${encodeURIComponent(grupoNumero || "")}`, icon: LayoutDashboard, desc: "Visão consolidada de todas as empresas do grupo — para ver uma empresa por vez, abra o card dela abaixo" },
    { label: "Cenários", to: "/cenarios", icon: SlidersHorizontal, desc: "Fatores de volume, preço e custo aplicados ao motor" },
    { label: "Transição 2026–2033", to: "/transicao", icon: CalendarClock, desc: "Parâmetros normativos por ano" },
    { label: "Catálogos IBS/CBS", to: "/catalogos", icon: BookMarked, desc: "CST, cClassTrib e cCredPres" },
  ];

  return (
    <div className="px-6 lg:px-8 py-6 pb-12">
      <div className="max-w-screen-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-heading font-semibold text-base">Empresas deste grupo</h2>
              <InfoTooltip pagina="workroom" chave="header" />
            </div>
            <p className="text-sm text-muted-foreground">
              Abra uma empresa para lançar operações, importar XML e ver o resultado dela — sem misturar com as outras.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/workroom/${id}/empresas`}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Ver como tabela
            </Link>
            <button
              onClick={startNew}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" /> Nova empresa
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="w-6 h-6 border-4 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : empresas.length === 0 ? (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border">
            <UploadCloud className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Nenhuma empresa cadastrada ainda. Comece criando a primeira — depois é só abrir o card dela para lançar operações, importar XML ou ver o resultado calculado.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {empresas.map((em) => (
              <EmpresaCard
                key={em.id}
                empresa={em}
                onClick={() => navigate(`/workroom/${id}/empresas/${em.id}`)}
                onEdit={startEdit}
                onDelete={del}
              />
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-heading font-medium text-sm">Bases Técnicas e Análise</h3>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
              Compartilhado entre grupos
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {globalModules.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-start gap-3 p-4 rounded-lg border border-border hover:border-primary hover:bg-muted/40 transition-colors group"
                >
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-0.5" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <EmpresaFormDialog open={open} onOpenChange={setOpen} editing={editing} grupoNumero={grupoNumero} />
    </div>
  );
}
