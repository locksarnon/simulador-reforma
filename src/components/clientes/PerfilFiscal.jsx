import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import TabelaPadrao from "@/components/TabelaPadrao";

const naoConfirmado = "Não confirmado";

export default function PerfilFiscal({ empresaId }) {
  const perfil = useQuery({
    queryKey: ["consultoria", "perfil-fiscal", empresaId],
    queryFn: () => api.get(`/consultoria/empresas/${encodeURIComponent(empresaId)}/perfil-fiscal`),
  });
  if (perfil.isLoading) return <p role="status" className="text-sm">Carregando perfil fiscal…</p>;
  if (perfil.isError) return <p role="alert" className="text-sm">Não foi possível consultar o perfil fiscal. <button type="button" onClick={() => perfil.refetch()} className="text-primary underline">Tentar novamente</button></p>;
  return <TabelaPadrao id="perfil-fiscal" ariaLabel="Perfil fiscal por competência" titulo="Perfil fiscal"
    linhas={perfil.data || []} chaveLinha={(x) => x.competencia} vazio="Aguardando importação do MIT ou da EFD-Contribuições."
    colunas={[
      { chave: "competencia", rotulo: "Competência" },
      { chave: "forma", rotulo: "Tipo de apuração", render: (x) => x.forma || naoConfirmado },
      { chave: "metodo", rotulo: "Método mensal do Lucro Real Anual", render: (x) => x.metodo || (x.forma && x.forma !== "Lucro Real Anual" ? "Não se aplica" : naoConfirmado) },
      { chave: "pis_cofins", rotulo: "PIS e Cofins", render: (x) => x.pis_cofins ? `${x.pis_cofins} · declarado` : x.forma && x.forma !== "Lucro Presumido" ? "Fora do escopo" : naoConfirmado },
      { chave: "irpj_csll", rotulo: "IRPJ e CSLL", render: (x) => x.irpj_csll ? `${x.irpj_csll} · inferido` : x.forma && x.forma !== "Lucro Presumido" ? "Fora do escopo" : naoConfirmado },
      { chave: "fonte", rotulo: "Evidência", render: (x) => [x.fonte_mit && "MIT encerrado", x.fonte_efd?.nome].filter(Boolean).join(" · ") || "—" },
      { chave: "pendencia", rotulo: "Pendência", render: (x) => x.pendencia || "—" },
    ]} />;
}
