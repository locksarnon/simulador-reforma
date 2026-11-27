import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import { san, chaves } from "@/components/saneamento-estoques/api";
import { EstadoCarregando, EstadoErro } from "@/components/saneamento-estoques/comuns";
import { PainelRoteiro } from "@/components/saneamento-estoques/RoteiroProjeto";
import { naoEncontrado } from "@/components/saneamento-estoques/logica";

/** Roteiro do projeto em tela própria (aberto pelo botão Roteiro do projeto, no saneamento). */
export default function RoteiroSaneamentoPagina() {
  const { id } = useParams();
  const diag = useQuery({ queryKey: ["projetos-diagnostico", id], queryFn: () => api.get(`/projetos-diagnostico/${id}`) });
  const consulta = useQuery({ queryKey: chaves.projeto(id), queryFn: () => san.projetoDoDiagnostico(id), retry: (n, e) => !naoEncontrado(e) && n < 2 });
  const nome = diag.data?.nome || "Projeto";
  const crumbs = [
    { label: "Consultoria Tributária", to: "/consultoria/carteira" }, { label: "Projetos", to: "/consultoria/projetos" },
    { label: nome, to: `/diagnostico/projetos/${id}` }, { label: "Saneamento de estoques", to: `/diagnostico/projetos/${id}/saneamento` }, { label: "Roteiro do projeto" },
  ];
  let corpo;
  if (consulta.isError) corpo = <EstadoErro erro={consulta.error} aoTentar={() => consulta.refetch()} texto="Não foi possível abrir o roteiro. Abra o saneamento do projeto primeiro." />;
  else if (!consulta.data) corpo = <EstadoCarregando texto="Abrindo o roteiro…" />;
  else corpo = <PainelRoteiro projeto={consulta.data} nome={nome} />;
  return (
    <div>
      <PageHeader crumbs={crumbs} title="Roteiro do projeto" subtitle="As fases e etapas do saneamento: o que é feito, o que o cliente fornece e o que recebe." />
      <div className="px-6 py-5 lg:px-8">{corpo}</div>
    </div>
  );
}
