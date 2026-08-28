import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { calcOperacao } from "../../base44/shared/taxEngine";

const PCT = (n) => n / 100;

/** Carrega e calcula todas as operações com o motor. */
export function useSimuladorData() {
  const operacoesQ = useQuery({
    queryKey: ["operacoes"],
    queryFn: () => base44.entities.Operacao.filter({}, "-ano", 500),
  });
  const transicaoQ = useQuery({
    queryKey: ["transicao"],
    queryFn: () => base44.entities.TransicaoAno.list(),
  });
  const classTribQ = useQuery({
    queryKey: ["classTrib"],
    queryFn: () => base44.entities.ClassTrib.list(),
  });
  const cenarioQ = useQuery({
    queryKey: ["cenario"],
    queryFn: () => base44.entities.Cenario.list(),
  });
  const configQ = useQuery({
    queryKey: ["config"],
    queryFn: () => base44.entities.Configuracao.list(),
  });
  const empresasQ = useQuery({
    queryKey: ["empresas"],
    queryFn: () => base44.entities.Empresa.list(),
  });
  const credPresQ = useQuery({
    queryKey: ["credPres"],
    queryFn: () => base44.entities.CredPres.list(),
  });

  const isLoading =
    operacoesQ.isLoading || transicaoQ.isLoading || classTribQ.isLoading ||
    cenarioQ.isLoading || configQ.isLoading || empresasQ.isLoading || credPresQ.isLoading;

  const config = configQ.data?.[0] || {};
  const cenarios = cenarioQ.data || [];
  const cenarioAtivo =
    cenarios.find((c) => c.nome === (config.cenario_ativo || "Base")) || cenarios[0] || {};
  const transicaoMap = new Map((transicaoQ.data || []).map((t) => [t.ano, t]));
  const classTribMap = new Map((classTribQ.data || []).map((c) => [c.c_class_trib, c]));
  const credPresMap = new Map((credPresQ.data || []).map((c) => [c.c_cred_pres, c]));

  const operacoes = (operacoesQ.data || []).filter((op) => !op.situacao || op.situacao === "ATIVA");
  const empresas = empresasQ.data || [];

  const calculadas = operacoes.map((op) => {
    const opNorm = { ...op, direcao: String(op.direcao || "").startsWith("S") ? "Saida" : op.direcao };
    const anoParams = transicaoMap.get(Number(op.ano)) || {};
    const classTrib = classTribMap.get(op.c_class_trib) || {};
    return {
      op: opNorm,
      ...calcOperacao(opNorm, anoParams, classTrib, cenarioAtivo, config, credPresMap),
    };
  });

  return {
    isLoading,
    operacoes,
    operacoesCalculadas: calculadas,
    transicao: transicaoQ.data || [],
    classTrib: classTribQ.data || [],
    cenarios,
    cenarioAtivo,
    config,
    empresas,
    credPres: credPresQ.data || [],
    refetch: () =>
      Promise.all([
        operacoesQ.refetch(),
        transicaoQ.refetch(),
        classTribQ.refetch(),
        cenarioQ.refetch(),
        configQ.refetch(),
        empresasQ.refetch(),
        credPresQ.refetch(),
      ]),
  };
}