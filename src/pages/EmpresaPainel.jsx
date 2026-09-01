import React from "react";
import { useOutletContext } from "react-router-dom";
import PainelExecutivoView from "@/components/painel/PainelExecutivoView";

export default function EmpresaPainel() {
  const { grupo, empresa } = useOutletContext() || {};

  if (!grupo || !empresa) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <PainelExecutivoView
      grupoNumero={grupo.numero}
      empresaId={empresa.id_empresa}
      grupoLabel={`Grupo ${grupo.numero} · ${grupo.nome}`}
      empresaLabel={`${empresa.id_empresa} · ${empresa.razao_social}`}
      escopo="empresa"
      grupoId={grupo.id}
      empresaDbId={empresa.id}
    />
  );
}
