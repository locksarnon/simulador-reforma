import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { base } from "./formatos";

function Cartao({ rotulo, valor, destaque, onClick }) {
  const classe = `rounded-xl border bg-card px-4 py-3 text-left ${destaque ? "border-amber-400/60" : "border-border"}`;
  const conteudo = (
    <>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor ?? "—"}</p>
    </>
  );
  if (!onClick) return <div className={classe}>{conteudo}</div>;
  return <button type="button" onClick={onClick} title="Abrir a aba Resumos e eventos SEFAZ" className={`${classe} hover:bg-muted/50`}>{conteudo}</button>;
}

/** Os números do repositório da empresa, acima das abas de documentos. O cartão "Resumos e eventos SEFAZ" abre a aba deles e fica em destaque quando há documento só em resumo. */
export default function CartoesDoRepositorio({ empresaId, aoAbrirResumos }) {
  const { data: resumo } = useQuery({ queryKey: ["repo-xml-resumo", empresaId], queryFn: () => api.get(`${base(empresaId)}/resumo`) });
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Cartao rotulo="Documentos no repositório" valor={resumo?.total} />
      <Cartao rotulo="Enviados por arquivo" valor={resumo?.por_origem?.UPLOAD ?? 0} />
      <Cartao rotulo="Captura automática" valor={resumo?.por_origem?.CAPTURA ?? 0} />
      <Cartao rotulo="Resumos e eventos SEFAZ" valor={resumo?.resumos_e_eventos} destaque={(resumo?.so_resumo ?? 0) > 0} onClick={aoAbrirResumos} />
      <Cartao rotulo="Aguardando o importador" valor={resumo?.nao_enviados_ao_importador} destaque={(resumo?.nao_enviados_ao_importador ?? 0) > 0} />
    </div>
  );
}
