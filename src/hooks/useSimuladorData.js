import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { calcOperacao } from "@/motor/taxEngine";
import { agruparPorCodigo, escolherVigente } from "@/lib/vigencia";
import { useTransicaoComCenario } from "@/lib/cenarioAliquotasStore";
import { aliquotasCombustivelDoAno } from "@/motor/combustiveis";

const PCT = (n) => n / 100;

/**
 * Roda o motor (calcOperacao) sobre uma lista de operações já filtradas,
 * para um cenário arbitrário — extraído de useSimuladorData para permitir
 * recalcular a MESMA base de operações sob outros cenários (comparação
 * Normal/Conservador/Otimista no Painel Executivo) sem refazer as queries.
 */
export function calcularOperacoes(operacoes, transicaoMap, classTribGrouped, credPresGrouped, cenario, config) {
  return operacoes.map((op) => {
    const opNorm = { ...op, direcao: String(op.direcao || "").startsWith("S") ? "Saida" : op.direcao };
    const anoParams = transicaoMap.get(Number(op.ano)) || {};
    const dataOp = op.data ? new Date(op.data) : new Date(Number(op.ano) || new Date().getFullYear(), 0, 1);
    const classTrib = escolherVigente(classTribGrouped.get(op.c_class_trib) || [], dataOp) || {};
    const credPresResolvida = escolherVigente(credPresGrouped.get(op.c_cred_pres) || [], dataOp);
    const credPresMap = new Map(credPresResolvida ? [[op.c_cred_pres, credPresResolvida]] : []);
    return {
      op: opNorm,
      ...calcOperacao(opNorm, anoParams, classTrib, cenario, config, credPresMap),
    };
  });
}

/**
 * Carrega e calcula todas as operações com o motor.
 * @param {{ grupoNumero?: string, empresaId?: string, cenarioNome?: string }} opts —
 * grupoNumero restringe às empresas daquele grupo; empresaId (Empresa.id_empresa)
 * é mais restrito ainda e trava numa única empresa, ignorando grupoNumero quando
 * os dois são informados. Sem nenhum dos dois, mantém todos os grupos/empresas.
 * cenarioNome escolhe qual Cenario usar no motor — sem ele, usa
 * Configuracao.cenario_ativo (comportamento de sempre).
 */
export function useSimuladorData({ grupoNumero, empresaId, cenarioNome } = {}) {
  const operacoesQ = useQuery({
    queryKey: ["operacoes"],
    queryFn: () => api.entities.Operacao.filter({}, "-ano", 500),
  });
  const gruposQ = useQuery({
    queryKey: ["grupos"],
    queryFn: () => api.entities.Grupo.list(),
  });
  const transicaoQ = useQuery({
    queryKey: ["transicao"],
    queryFn: () => api.entities.TransicaoAno.list(),
  });
  const classTribQ = useQuery({
    queryKey: ["classTrib"],
    queryFn: () => api.entities.ClassTrib.list(),
  });
  const cenarioQ = useQuery({
    queryKey: ["cenario"],
    queryFn: () => api.entities.Cenario.list(),
  });
  const configQ = useQuery({
    queryKey: ["config"],
    queryFn: () => api.entities.Configuracao.list(),
  });
  const empresasQ = useQuery({
    queryKey: ["empresas"],
    queryFn: () => api.entities.Empresa.list(),
  });
  const credPresQ = useQuery({
    queryKey: ["credPres"],
    queryFn: () => api.entities.CredPres.list(),
  });
  // Alíquotas por litro/quilo do regime específico de combustíveis (LC 214, arts. 172 a 180).
  const combustivelQ = useQuery({
    queryKey: ["aliquotaCombustivel"],
    queryFn: () => api.entities.AliquotaCombustivel.list(),
  });

  const isLoading =
    operacoesQ.isLoading || transicaoQ.isLoading || classTribQ.isLoading ||
    cenarioQ.isLoading || configQ.isLoading || empresasQ.isLoading || credPresQ.isLoading ||
    gruposQ.isLoading || combustivelQ.isLoading;

  const config = configQ.data?.[0] || {};
  const cenarios = cenarioQ.data || [];
  const cenarioAtivo =
    cenarios.find((c) => c.nome === (cenarioNome || config.cenario_ativo || "Base")) || cenarios[0] || {};
  // A tabela TransicaoAno passa pelo cenário de alíquotas 2029–2033 escolhido
  // pelo usuário (src/motor/cenariosAliquota.js): daqui para frente, tudo que
  // usa `transicao`/`transicaoMap` (Painel, Operações, PDF) já enxerga o cenário.
  const { linhas: transicaoLinhas, resumo: cenarioAliquotas, selecao: selecaoCenarioAliquotas } = useTransicaoComCenario(transicaoQ.data);
  // Cada ano leva junto as alíquotas de combustível dele (o motor lê anoParams.combustiveis).
  const aliquotasCombustivel = combustivelQ.data || [];
  const transicaoMap = new Map(transicaoLinhas.map((t) => [t.ano, { ...t, combustiveis: aliquotasCombustivelDoAno(aliquotasCombustivel, t.ano) }]));
  // Só classificações com status "Ativo" alimentam o motor — uma regra
  // desativada não deve continuar sendo aplicada às operações. Agrupadas
  // por código (não Map 1:1) porque pode haver mais de uma versão histórica
  // do mesmo código — escolherVigente() decide qual vale na data da operação.
  const classTribAtivos = (classTribQ.data || []).filter((c) => c.status === "Ativo");
  const credPresAtivos = (credPresQ.data || []).filter((c) => c.status === "Ativo");
  const classTribGrouped = agruparPorCodigo(classTribAtivos, (c) => c.c_class_trib);
  const credPresGrouped = agruparPorCodigo(credPresAtivos, (c) => c.c_cred_pres);

  const todasEmpresas = empresasQ.data || [];
  // Filtro por grupo: restringe às empresas daquele grupo antes de calcular.
  // Sem grupoNumero, mantém o comportamento de sempre (todos os grupos).
  // Operacao.empresa_id referencia Empresa.id_empresa (o código de negócio,
  // ex: "EMP-001") — não Empresa.id (chave interna do banco). Mesma
  // convenção de Empresa.grupo, que guarda Grupo.numero, não Grupo.id.
  // Confirmado em OperacoesPage.jsx, que já usa essa mesma chave.
  // "empresas" continua sendo a lista do grupo inteiro (não reduzida por
  // empresaId) — telas como o seletor do Painel Executivo precisam listar
  // todas as empresas do grupo para montar as opções, mesmo quando uma
  // única empresa está selecionada para o cálculo.
  const empresas = grupoNumero ? todasEmpresas.filter((e) => e.grupo === grupoNumero) : todasEmpresas;
  // empresaId trava as OPERAÇÕES numa única empresa — mais restrito que
  // grupoNumero, usado pelo workspace de empresa.
  const empresaIdsPermitidos = empresaId
    ? new Set([empresaId])
    : (grupoNumero ? new Set(empresas.map((e) => e.id_empresa)) : null);

  const operacoes = (operacoesQ.data || [])
    .filter((op) => !op.situacao || op.situacao === "ATIVA")
    .filter((op) => !empresaIdsPermitidos || empresaIdsPermitidos.has(op.empresa_id));

  const calculadas = calcularOperacoes(operacoes, transicaoMap, classTribGrouped, credPresGrouped, cenarioAtivo, config);

  return {
    isLoading,
    operacoes,
    operacoesCalculadas: calculadas,
    transicao: transicaoLinhas,
    transicaoMap,
    cenarioAliquotas,
    selecaoCenarioAliquotas,
    aliquotasCombustivel,
    classTrib: classTribQ.data || [],
    classTribGrouped,
    credPresGrouped,
    cenarios,
    cenarioAtivo,
    config,
    empresas,
    grupos: gruposQ.data || [],
    credPres: credPresQ.data || [],
    refetch: () =>
      Promise.all([
        operacoesQ.refetch(),
        gruposQ.refetch(),
        transicaoQ.refetch(),
        classTribQ.refetch(),
        cenarioQ.refetch(),
        configQ.refetch(),
        empresasQ.refetch(),
        credPresQ.refetch(),
        combustivelQ.refetch(),
      ]),
  };
}