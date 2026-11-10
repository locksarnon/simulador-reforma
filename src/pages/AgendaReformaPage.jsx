import React from "react";
import { CalendarDays } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import TituloPagina from "@/components/TituloPagina";
import AgendaReforma from "@/components/agenda/AgendaReforma";
import { useAuth } from "@/lib/AuthContext";

/** Agenda da Reforma (visão geral): marcos e prazos com a fonte oficial, por regime, UF ou empresa. */
export default function AgendaReformaPage() {
  const { user } = useAuth();
  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Agenda da Reforma" }]} />
      <div className="p-6 lg:p-8 space-y-6">
        <div>
          <TituloPagina icon={CalendarDays}>Agenda da Reforma</TituloPagina>
          <p className="text-sm text-muted-foreground mt-1">Marcos e prazos da Reforma Tributária do consumo, cada um com a fonte oficial (instrumento, dispositivo e data do ato). Filtre pelo regime e pela UF, escolha uma empresa para ver só o que vale para ela, baixe o calendário (.ics) e receba lembretes por e-mail.</p>
        </div>
        <AgendaReforma admin={user?.role === "admin"} />
        <p className="text-xs text-muted-foreground">As datas vêm de texto oficial vigente (Planalto, Receita Federal e Comitê Gestor do IBS). O que não foi confirmado em fonte oficial vem marcado. Em caso de dúvida, vale o texto publicado no órgão oficial.</p>
      </div>
    </div>
  );
}
