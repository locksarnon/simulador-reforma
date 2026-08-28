import React from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronRight, Building2, FileText, SlidersHorizontal, LayoutDashboard, CalendarClock, BookMarked, ShieldCheck, FileSearch } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";

export default function WorkroomOverview() {
  const { id } = useParams();

  const modules = [
    { label: "Empresas do Grupo", to: `/workroom/${id}/empresas`, icon: Building2, desc: "Cadastro mestre de empresas vinculadas ao grupo" },
    { label: "Operações FAL", to: `/workroom/${id}/operacoes`, icon: FileText, desc: "Lançamentos e modelagem de operações do grupo" },
    { label: "Importação XML", to: `/workroom/${id}/importacao-xml`, icon: FileSearch, desc: "Upload de NF-e/NFC-e com validador DF-e e staging auditável" },
    { label: "Cenários", to: `/workroom/${id}/cenarios`, icon: SlidersHorizontal, desc: "Fatores de volume, preço e custo aplicados ao motor" },
  ];

  const externalModules = [
    { label: "Painel Executivo", to: "/cockpit", icon: LayoutDashboard, desc: "Visão consolidada e cálculos do motor" },
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
            Navegue pelas etapas. Cada módulo abre dentro do contexto deste grupo.
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
          <h3 className="font-heading font-medium text-sm mb-3">Bases Técnicas e Análise</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {externalModules.map((item) => {
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

        <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
          <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-700 leading-relaxed">
            Importação XML com Validador DF-e ativo: upload de NF-e/NFC-e, processamento backend, 4 camadas de validação e staging auditável.
          </p>
        </div>
      </div>
    </div>
  );
}