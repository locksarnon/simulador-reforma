import React from "react";
import ValidadorCadastro from "@/components/ferramentas/ValidadorCadastro";

export default function ValidadorPublico() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-heading font-semibold">Seu cadastro de produtos está pronto para a reforma?</h1>
        <p className="text-muted-foreground mt-2">Envie a planilha de produtos do seu ERP e descubra quantos itens têm NCM inválido, sem classificação ou com benefício possivelmente perdido. Análise gratuita de até 300 produtos.</p>
      </div>
      <ValidadorCadastro modo="publico" />
    </div>
  );
}
