import React from "react";
import { useOutletContext } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import TituloPagina from "@/components/TituloPagina";
import AgendaReforma from "@/components/agenda/AgendaReforma";
import { useAuth } from "@/lib/AuthContext";

/** Aba "Agenda da Reforma" da empresa: só as datas que valem para o regime e a UF do cadastro dela. */
export default function EmpresaAgenda() {
  const { empresa } = useOutletContext();
  const { user } = useAuth();
  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div>
        <TituloPagina icon={CalendarDays}>Agenda da Reforma</TituloPagina>
        <p className="text-sm text-muted-foreground mt-1">Marcos e prazos que valem para {empresa.razao_social} ({empresa.regime_atual || "regime não informado"}{empresa.uf ? `, ${empresa.uf}` : ", UF não informada"}), cada um com a fonte oficial.</p>
      </div>
      <AgendaReforma empresa={empresa} admin={user?.role === "admin"} />
    </div>
  );
}
