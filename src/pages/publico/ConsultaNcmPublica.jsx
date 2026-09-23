import React from "react";
import { Link } from "react-router-dom";
import ConsultaNcm from "@/components/ferramentas/ConsultaNcm";

export default function ConsultaNcmPublica() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-heading font-semibold">Consulta NCM na reforma tributária</h1>
        <p className="text-muted-foreground mt-2">Digite o NCM ou o nome do produto e veja como ele é tratado na LC 214/2025: alíquota zero, redução ou regra geral.</p>
      </div>
      <ConsultaNcm />
      <div className="rounded-xl border border-border bg-card p-5 text-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <span>Tem uma lista de produtos? Valide o cadastro inteiro de uma vez.</span>
        <Link to="/validador-cadastro" className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm text-center">Validar cadastro de produtos</Link>
      </div>
    </div>
  );
}
