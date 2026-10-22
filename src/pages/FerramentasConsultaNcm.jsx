import React from "react";
import { Search } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ConsultaNcm from "@/components/ferramentas/ConsultaNcm";
import TituloPagina from "@/components/TituloPagina";

export default function FerramentasConsultaNcm() {
  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Consulta NCM" }]} />
      <div className="p-6 lg:p-8 space-y-5 max-w-4xl">
        <div>
          <TituloPagina icon={Search}>Consulta NCM</TituloPagina>
          <p className="text-sm text-muted-foreground">Tratamento de cada NCM na LC 214/2025 (anexos já mapeados), com a tabela oficial vigente do Siscomex.</p>
        </div>
        <ConsultaNcm />
      </div>
    </div>
  );
}
