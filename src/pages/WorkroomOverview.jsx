import React from "react";
import { useParams, useOutletContext, Link } from "react-router-dom";
import { ChevronRight, Building2, FileText, SlidersHorizontal, LayoutDashboard, CalendarClock, BookMarked, UploadCloud, FileSearch } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";

export default function WorkroomOverview() {
  const { id } = useParams();
  const { grupo } = useOutletContext() || {};

  const modules = [
    { label: "Empresas do Grupo", to: `/workroom/${id}/empresas`, icon: Building2, desc: "Cadastro mestre de empresas vinculadas ao grupo" },
    { label: "Operações FAL", to: `/workroom/${id}/operacoes`, icon: FileText, desc: "Lançamentos e modelagem de operações do grupo" },
    { label: "Importação XML", to: `/workroom/${id}/importacao-xml`, icon: FileSearch, desc: "Upload de NF-e/NFC-e com validador DF-e e staging auditável" },
  ];

  // Compartilhados entre todos os grupos — não são exclusivos deste
  // (Cenário, Configuração, Transição e Catálogos não têm vínculo com
  // nenhum grupo específico no banco; editar aqui afeta todo mundo).
  const globalModules = [
    { label: "Painel Executivo", to: `/cockpit?grupo=${encodeURIComponent(grupo?.numero || "")}`, icon: LayoutDashboard, desc: "Visão consolidada e cálculos do motor, filtrada por este grupo" },
    { label: "Cenários", to: "/cenarios", icon: SlidersHorizontal, desc: "Fatores de volume, preço e custo aplicados ao motor" },
    { label: "Transição 2026–2033", to: "/transicao", icon: CalendarClock, desc: "Parâmetros normativos por ano" },
    { label: "Catálogos IBS/CBS", to: "/catalogos", icon: BookMarked, desc: "CST, cClassTrib e cCredPres" },
  ];

  return (
    <div className="px-6 lg:px-8 pb-12">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-heading font-semibold text-base">Pipeline do Diagnóstico</h2>
            <InfoTooltip pagina="workroom" chave="header" />
          </div>
          <p className="text-sm text-muted-foreground">
            Empresas, operações e importação de XML ficam só neste grupo. As bases técnicas abaixo são compartilhadas com os outros grupos.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:border-primary hover:bg-muted/40 transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-0.5" />
              </Link>
            );
          })}
        </div>

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
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border">
          <UploadCloud className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Comece cadastrando as empresas deste grupo, depois lance operações manualmente ou importe XMLs de NF-e/NFC-e para gerá-las automaticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
