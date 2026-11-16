import { useSearchParams } from "react-router-dom";
import SeletorMes, { mesDeHoje, mesValido } from "@/components/SeletorMes";

export function useCompetenciaXml() {
  const [params, setParams] = useSearchParams();
  const valor = params.get("competencia");
  const competencia = mesValido(valor) ? valor : mesDeHoje();
  const mudar = (mes) => {
    if (!mesValido(mes)) return;
    setParams((anteriores) => {
      const novos = new URLSearchParams(anteriores);
      novos.set("competencia", mes);
      return novos;
    });
  };
  return { competencia, mudar };
}

/** Competência de emissão dos XML: o seletor de mês padrão do InTAX. */
export default function CompetenciaXml({ competencia, mudar }) {
  return <SeletorMes valor={competencia} mudar={mudar} ariaLabel="Competência de emissão dos XML" />;
}
