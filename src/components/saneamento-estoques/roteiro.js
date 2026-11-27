/**
 * Roteiro do projeto (botão no alto do Saneamento): as fases e etapas do trabalho, em linguagem para o cliente, com a situação real de cada
 * etapa quando ela já existe no projeto. Plano em docs/saneamento-fases.md.
 */
import { regimeDoCliente } from "./logica";

export const SITUACAO_ETAPA = {
  CONCLUIDA: { texto: "Concluída", tom: "ok" },
  ANDAMENTO: { texto: "Em andamento", tom: "alerta" },
  NAO_INICIADA: { texto: "Não iniciada", tom: "neutro" },
  PROXIMA_FASE: { texto: "Próxima fase", tom: "neutro" },
  AGUARDANDO_LIBERACAO: { texto: "Aguardando liberação", tom: "neutro" },
};

/** `camada`: camada do sistema que mede a etapa (situação real). `faz`: o que é feito; `fornece`: o que o cliente entrega; `recebe`: o que ele recebe. */
export const FASES_ROTEIRO = [
  {
    id: "fase1", titulo: "Fase 1 · Saneamento de estoques",
    objetivo: "Cadastro de estoque sem itens mortos, sem duplicados, organizado e padronizado, executado no ERP: a base única para a fase tributária.",
    etapas: [
      { id: "preparar", titulo: "Preparar", resumo: "Configurar e importar", camada: null,
        faz: "Definimos o ERP, a data-base, o corte de movimentação e a última escrituração entregue, e importamos o cadastro de itens com prévia e conferência das colunas.",
        fornece: "Exportação do cadastro de itens do ERP (com grupo, unidade, NCM, saldo e última movimentação).",
        recebe: "Base importada e conferida, com os avisos do que veio incompleto." },
      { id: "identificacao", titulo: "Identificação", resumo: "Códigos e formatos", camada: "IDENTIFICACAO",
        faz: "Conferimos se cada item tem código único, no formato certo, sem código antigo em uso e sem descrições diferentes para o mesmo código.",
        fornece: "Esclarecimentos sobre códigos antigos e repetidos, quando houver.",
        recebe: "Lista de códigos a corrigir ou bloquear." },
      { id: "qualidade", titulo: "Qualidade", resumo: "Sem movimento e saldos", camada: "QUALIDADE",
        faz: "Separamos os itens sem movimento desde o corte (sem saldo: inativar; com saldo: regularizar antes), saldos negativos ou inválidos e cadastros incompletos.",
        fornece: "Confirmação dos itens a inativar e da regularização dos saldos.",
        recebe: "Lista de inativações e de saldos a regularizar." },
      { id: "duplicidades", titulo: "Duplicidades", resumo: "Mapa de unificações", camada: "DUPLICIDADE",
        faz: "Encontramos o mesmo produto cadastrado mais de uma vez e montamos o mapa: o código que fica, o que sai e para onde vai o saldo.",
        fornece: "Validação dos pares de itens duplicados.",
        recebe: "Mapa de unificações pronto para o time do ERP executar." },
      { id: "grupos", titulo: "Grupos", resumo: "Estrutura de grupos", camada: "GRUPOS_FINALIDADE",
        faz: "Organizamos a estrutura de grupos: grafias diferentes do mesmo grupo, grupos genéricos ou sobrepostos e itens no grupo errado.",
        fornece: "Validação da estrutura de grupos proposta.",
        recebe: "Estrutura de grupos e lista de itens a mover." },
      { id: "nomes", titulo: "Nomes e unidades", resumo: "Padrão das Diretrizes", camada: "NOMES_UNIDADES",
        faz: "Padronizamos descrição e unidade pelas Diretrizes do projeto (componentes do nome, atributos, unidades, conversões e limite de caracteres da nota e do SPED).",
        fornece: "Aprovação das Diretrizes de cadastro.",
        recebe: "Descrições e unidades padronizadas e a política de cadastro." },
      { id: "ncm", titulo: "Validar NCM", resumo: "Existência e vigência", camada: "NCM",
        faz: "Conferimos se o NCM de cada item existe e está vigente na tabela oficial. A reclassificação fica para a fase tributária.",
        fornece: "—",
        recebe: "Lista de NCM ausentes, inválidos ou não vigentes." },
      { id: "sped", titulo: "SPED do saneamento", resumo: "0200, 0205 e H010", camada: "OBRIGACOES",
        faz: "Indicamos o reflexo de cada inativação, unificação e troca de unidade nos registros 0200, 0205 e H010 da EFD.",
        fornece: "—",
        recebe: "Checklist para quem entrega a EFD." },
      { id: "erp", titulo: "Ações no ERP", resumo: "Lista e execução", camada: null,
        faz: "Consolidamos tudo o que foi aprovado numa lista de ações para o time do ERP (inativar, unificar e transferir saldo, mover de grupo, renomear, trocar unidade).",
        fornece: "Execução das ações no ERP e confirmação.",
        recebe: "Lista de ações por tipo, em Excel." },
    ],
    liberacao: { titulo: "Liberação", resumo: "Cadastro saneado", recebe: "Versão congelada do cadastro saneado, relatório, política de cadastro e base antes × depois." },
  },
  {
    id: "fase2", titulo: "Fase 2 · Tributário e Reforma",
    objetivo: "Cada item, em cada operação, com o tratamento de IBS e CBS (cClassTrib, CST e fundamento legal) e o crédito do estoque de transição.",
    etapas: [
      { id: "premissas", titulo: "Premissas", resumo: "Regime e participantes", premissas: true, faz: "Definimos o regime do cliente no IBS e na CBS, as atividades (CNAE) e os tipos de participante previstos na LC 214 (contribuinte, Simples, produtor rural, exterior e outros).", fornece: "Regime tributário e perfil de clientes e fornecedores.", recebe: "Premissas registradas, com o fundamento de cada uma." },
      { id: "finalidade", titulo: "Finalidade", resumo: "Tipo do item 0200", camada: "FINALIDADE", faz: "Classificamos cada grupo pelo tipo do item do registro 0200 da EFD (revenda, matéria-prima, embalagem, uso e consumo, imobilizado, outros insumos), com as exceções por item.", fornece: "Confirmação do uso real dos itens.", recebe: "Tipo do item aprovado por grupo e exceções." },
      { id: "ncm2", titulo: "NCM", resumo: "Reclassificação", camada: "NCM_CLASSIFICACAO", faz: "Revisamos o NCM incompatível com a descrição ou divergente entre itens iguais.", fornece: "Fichas técnicas, quando necessárias.", recebe: "NCM revisados com evidência." },
      { id: "operacoes", titulo: "Operações", resumo: "CFOP × participante", faz: "Mapeamos as operações do cliente (compra, venda, transferência, devolução, remessa) a partir do CFOP e do ERP.", fornece: "Operações usadas no ERP.", recebe: "Mapa de operações." },
      { id: "tratamento", titulo: "Tratamento", resumo: "cClassTrib e CST", camada: "TRIBUTARIO", faz: "Montamos a matriz operação × participante × NCM × tipo do item com cClassTrib, CST e fundamento legal.", fornece: "—", recebe: "Matriz tributária para parametrizar o ERP." },
      { id: "estoque", titulo: "Crédito do estoque", resumo: "Transição para 2027", faz: "Apuramos o crédito presumido de CBS sobre o estoque existente na transição (LC 214, art. 381; Decreto 12.955, arts. 605 a 611).", fornece: "Inventário da data de corte.", recebe: "Memória de cálculo do crédito." },
      { id: "sped2", titulo: "SPED tributário", resumo: "Reflexos do tratamento", camada: "OBRIGACOES", faz: "Indicamos os reflexos do NCM e do tratamento tributário nas obrigações.", fornece: "—", recebe: "Checklist das obrigações." },
    ],
    liberacao: { titulo: "Liberação", resumo: "Tributário aprovado", recebe: "Matriz tributária aprovada e crédito do estoque." },
  },
  {
    id: "fechamento", titulo: "Fechamento",
    objetivo: "Entrega consolidada e auditável do que foi aprovado.",
    etapas: [
      { id: "base", titulo: "Base final", resumo: "Antes × depois", faz: "Base completa com todas as colunas do ERP, como era e como ficou, com o ajuste destacado.", fornece: "—", recebe: "Excel da base final." },
      { id: "homologacao", titulo: "Homologação", resumo: "Calculadora oficial RFB", faz: "Conferimos notas emitidas pelo ERP parametrizado com a calculadora oficial da Receita Federal.", fornece: "Notas de teste emitidas pelo ERP.", recebe: "Resultado da homologação." },
      { id: "relatorios", titulo: "Relatórios e política", resumo: "Cadastro, controles, fiscal", faz: "Relatório final e política de estoques: cadastro, controles internos e seção fiscal.", fornece: "—", recebe: "Relatório e política." },
      { id: "parecer", titulo: "Parecer", resumo: "Só decisões aprovadas", faz: "Parecer final sobre o que foi aprovado, revisado e assinado pelo consultor.", fornece: "—", recebe: "Parecer." },
      { id: "solicitacoes", titulo: "Solicitações", resumo: "Pendências ao cliente", faz: "O que ainda depende do cliente vira uma lista objetiva de solicitações.", fornece: "Respostas às solicitações.", recebe: "Lista de solicitações." },
    ],
  },
];

/** Resposta de GET fases: a linha de uma fase ("fase1" → FASE1). */
const linhaDaFase = (fases, faseId) => (fases?.fases || []).find((l) => l.fase === (faseId === "fase1" ? "FASE1" : faseId === "fase2" ? "FASE2" : null)) || null;

/** Situação de uma etapa medida por camada: casos em aberto, aguardando e aprovados. Nada analisado: null. */
function situacaoDaCamada(e) {
  if (!e || !e.executadaEm) {
    const abertos = Number(e?.abertos) || 0;
    if (!abertos) return null;
  }
  const abertos = Number(e.abertos) || 0; const aguardando = Number(e.aguardando) || 0; const aprovados = Number(e.aprovados) || 0;
  if (abertos || aguardando) {
    const partes = [abertos && `${fmt(abertos)} em aberto`, aguardando && `${fmt(aguardando)} aguardando o cliente`, aprovados && `${fmt(aprovados)} aprovados`].filter(Boolean);
    return { ...SITUACAO_ETAPA.ANDAMENTO, detalhe: partes.join(" · ") };
  }
  return { ...SITUACAO_ETAPA.CONCLUIDA, detalhe: aprovados ? `${fmt(aprovados)} aprovados` : null };
}

/**
 * Situação de uma etapa a partir do projeto. `estado`: linhas de estado-camadas por camada; `itens`: total importado; `liberadas`: versões
 * liberadas; `projeto`: regime (parametros.regimeCliente) e atividades confirmadas; `fases`: resposta de GET fases (liberação e bloqueio).
 * Na Fase 2, as etapas com camada seguem a camada; com a fase bloqueada, "Aguardando liberação". Operações, Crédito do estoque e o
 * Fechamento ainda não são medidos pelo sistema: "Próxima fase".
 */
export function situacaoDaEtapa(fase, etapa, { estado, itens, liberadas, projeto, fases } = {}) {
  if (fase === "fase1") {
    if (etapa.id === "preparar") return itens > 0 ? { ...SITUACAO_ETAPA.CONCLUIDA, detalhe: `${fmt(itens)} itens importados` } : { ...SITUACAO_ETAPA.NAO_INICIADA, detalhe: null };
    if (etapa.id === "erp") return liberadas > 0 ? { ...SITUACAO_ETAPA.ANDAMENTO, detalhe: `${liberadas} versão(ões) liberada(s)` } : { ...SITUACAO_ETAPA.NAO_INICIADA, detalhe: null };
    return situacaoDaCamada(estado?.get(etapa.camada)) || { ...SITUACAO_ETAPA.NAO_INICIADA, detalhe: null };
  }
  if (fase === "fase2" && etapa.premissas) {
    const regime = regimeDoCliente(projeto?.parametros?.regimeCliente);
    const atividades = !!projeto?.atividadesConfirmadas;
    const detalhe = [regime ? `Regime: ${regime.rotulo}` : "Regime não informado", atividades ? "atividades confirmadas" : "atividades a confirmar"].join(" · ");
    if (regime && atividades) return { ...SITUACAO_ETAPA.CONCLUIDA, detalhe };
    if (regime || atividades) return { ...SITUACAO_ETAPA.ANDAMENTO, detalhe };
    return { ...SITUACAO_ETAPA.NAO_INICIADA, detalhe: null };
  }
  if (fase === "fase2" && etapa.camada) {
    // Impacto no SPED também roda na Fase 1: na Fase 2, enquanto a fase está bloqueada, todas as etapas medidas aguardam a liberação.
    const bloqueio = linhaDaFase(fases, "fase2")?.bloqueio;
    if (bloqueio) return { ...SITUACAO_ETAPA.AGUARDANDO_LIBERACAO, detalhe: bloqueio.mensagem || null };
    return situacaoDaCamada(estado?.get(etapa.camada)) || { ...SITUACAO_ETAPA.NAO_INICIADA, detalhe: null };
  }
  return { ...SITUACAO_ETAPA.PROXIMA_FASE, detalhe: null };
}

/** Liberação de uma fase: concluída quando GET fases traz a versão liberada dela (sem a resposta, a Fase 1 vale pelas versões liberadas). */
export function situacaoDaLiberacao(fase, { liberadas, fases } = {}) {
  if (fase !== "fase1" && fase !== "fase2") return { ...SITUACAO_ETAPA.PROXIMA_FASE, detalhe: null };
  const linha = linhaDaFase(fases, fase);
  const liberada = linha ? !!linha.liberada : fase === "fase1" && liberadas > 0;
  return liberada ? { ...SITUACAO_ETAPA.CONCLUIDA, detalhe: linha?.liberada?.numero ? `Versão ${linha.liberada.numero}` : null } : { ...SITUACAO_ETAPA.NAO_INICIADA, detalhe: null };
}

const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
