import { Link, useOutletContext } from "react-router-dom";
import React from "react";
import { ListChecks } from "lucide-react";
import ValidadorCadastro from "@/components/ferramentas/ValidadorCadastro";
import TituloPagina from "@/components/TituloPagina";

export default function FerramentasValidadorCadastro() {
  const { empresa } = useOutletContext() || {};
  return (
    <div>
      <div className="p-6 lg:p-8 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <TituloPagina icon={ListChecks}>Validador de cadastro de produtos</TituloPagina>
            <p className="text-sm text-muted-foreground">Confere NCM e classificação (cClassTrib) de uma planilha de produtos do ERP — Excel ou CSV, até 50 mil itens — e devolve a planilha corrigida. Para o projeto completo, passo a passo, use o <Link className="text-primary underline" to="../saneamento-estoque">Saneamento de estoques</Link>.</p>
          </div>
        </div>
        <ValidadorCadastro modo="interno" empresa={empresa} />
      </div>
    </div>
  );
}
