import React from "react";
import { ListChecks } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import LimparDadosButton from "@/components/LimparDadosButton";
import ValidadorCadastro from "@/components/ferramentas/ValidadorCadastro";

export default function FerramentasValidadorCadastro() {
  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Validador de cadastro" }]} />
      <div className="p-6 lg:p-8 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2"><ListChecks className="w-5 h-5 text-muted-foreground" /><h1 className="text-xl font-heading font-semibold">Validador de cadastro de produtos</h1></div>
            <p className="text-sm text-muted-foreground">Confere NCM e classificação (cClassTrib) de uma planilha de produtos do ERP — Excel ou CSV, até 50 mil itens — e devolve a planilha corrigida.</p>
          </div>
          <LimparDadosButton
            tela="validacoes" rotulo="Limpar meu histórico"
            oQueApaga="Apaga o seu histórico de validações salvas, com as planilhas guardadas no armazenamento. O histórico de outras pessoas não é afetado."
          />
        </div>
        <ValidadorCadastro modo="interno" />
      </div>
    </div>
  );
}
