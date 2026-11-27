import { api } from "@/api/client";
import { enderecoDeEntrega, enderecoDoMapa, nomeDeEntrega, paramsDoMapa } from "./logica";
import { enderecoDaPolitica, nomeDaPolitica } from "./diretrizes/logica";

const B = "/saneamento-estoques";

/** Chamadas do módulo (rotas de docs/saneamento-estoques-contrato.md). Toda alteração leva a `versao` que a tela viu. */
export const san = {
  projetoDoDiagnostico: (diagnosticoId) => api.get(`${B}/projetos/por-diagnostico/${diagnosticoId}`),
  criarProjeto: (diagnostico_id) => api.post(`${B}/projetos`, { diagnostico_id }),
  configurar: (id, corpo) => api.put(`${B}/projetos/${id}`, corpo),
  adicionarAtividade: (id, corpo) => api.post(`${B}/projetos/${id}/atividades`, corpo),
  alterarAtividade: (id, atividadeId, mantida) => api.put(`${B}/projetos/${id}/atividades/${atividadeId}`, { mantida }),
  buscarAtividadesCnpj: (id, versao) => api.post(`${B}/projetos/${id}/atividades/buscar-cnpj`, { versao }),
  confirmarAtividades: (id, versao) => api.post(`${B}/projetos/${id}/atividades/confirmar`, { versao }),
  reabrirAtividades: (id, versao) => api.post(`${B}/projetos/${id}/atividades/reabrir`, { versao }),

  /** `opcoes`: página e filtro das diferenças da reimportação ({ pagina, limite, filtro: TODAS | COM_PROTEGIDO | SEM_PROTEGIDO }). */
  previaImportacao: (id, arquivo, mapeamento, opcoes) => api.upload(`${B}/projetos/${id}/importacoes/previa`, arquivo, { mapeamento, ...(opcoes || {}) }),
  /** `incorporar`: lista de ids ou filtro { filtro: "ALTERADOS" | "ALTERADOS_SEM_PROTEGIDO", exceto?: [ids] }. */
  /** `escalaSaldo`: divisor do saldo escolhido na prévia (1 ou vazio = como veio). */
  importar: (id, arquivo, mapeamento, incorporar, escalaSaldo) => api.upload(`${B}/projetos/${id}/importacoes`, arquivo, { mapeamento, incorporar: incorporar || [], ...(escalaSaldo > 1 ? { escalaSaldo } : {}) }),
  importacoes: (id) => api.get(`${B}/projetos/${id}/importacoes`),

  itens: (id, params) => api.get(`${B}/projetos/${id}/itens`, params),
  /** Colunas da Tabela: campos fundamentais importados (alteravel = par como era × como ficou; senão uma coluna) e nomes das colunas extras do ERP. */
  colunasDosItens: (id) => api.get(`${B}/projetos/${id}/itens-colunas`),
  item: (itemId) => api.get(`${B}/itens/${itemId}`),
  historicoDoItem: (itemId, campo) => api.get(`${B}/itens/${itemId}/historico`, campo ? { campo } : undefined),
  visaoGeral: (id) => api.get(`${B}/projetos/${id}/visao-geral`),
  camadasDisponiveis: () => api.get(`${B}/camadas-disponiveis`),
  executarCamada: (id, camada) => api.post(`${B}/projetos/${id}/camadas/${camada}/executar`, {}),
  /** Análise em segundo plano no servidor (segue mesmo fora da tela): { execucao: { rodando, camadas, atual, feitas, erro, iniciadaEm, terminadaEm } }. */
  iniciarAnalises: (id, camadas) => api.post(`${B}/projetos/${id}/analises`, { camadas }),
  analises: (id) => api.get(`${B}/projetos/${id}/analises`),
  /** { camadas: [{ camada, abertos, aguardando, aprovados, executadaEm, desatualizada }], abertos, aguardando, aprovados, efeitos }. */
  estadoCamadas: (id) => api.get(`${B}/projetos/${id}/estado-camadas`),

  // ── "O que foi considerado" por camada (aba Análise): critérios, ajuste, verificações manuais e texto livre (a IA encaixa ou vira manual). ──
  criterios: (id) => api.get(`${B}/projetos/${id}/criterios`),
  ajustarCriterio: (id, camada, chave, valor) => api.put(`${B}/projetos/${id}/criterios/${camada}/${chave}`, { valor }),
  removerCriterioManual: (id, manualId) => api.delete(`${B}/projetos/${id}/criterios/manuais/${manualId}`),
  /** { resultado: "PROPOSTA", proposta } (nada gravado) ou { resultado: "MANUAL", iaDisponivel, manual, camadas } (gravado). */
  normalizarCriterio: (id, camada, texto) => api.post(`${B}/projetos/${id}/criterios/normalizar`, { camada, texto }),

  casos: (id, params) => api.get(`${B}/projetos/${id}/casos`, params),
  /** Casos iguais agrupados (mesmos filtros da lista, mais `busca`); com `chave`, o grupo com todos os ids e as linhas dos casos. */
  casosAgrupados: (id, params) => api.get(`${B}/projetos/${id}/casos/agrupados`, params),
  registrarCasos: (id, resultado) => api.post(`${B}/projetos/${id}/casos`, resultado),
  caso: (casoId) => api.get(`${B}/casos/${casoId}`),
  /** Quantos itens do caso há em cada grupo (caso de conjunto pode juntar vários grupos). */
  gruposDoCaso: (casoId) => api.get(`${B}/casos/${casoId}/grupos`),
  salvarRascunho: (casoId, corpo) => api.put(`${B}/casos/${casoId}/rascunho`, corpo),
  aprovar: (casoId, corpo) => api.post(`${B}/casos/${casoId}/aprovar`, corpo),
  rejeitar: (casoId, corpo) => api.post(`${B}/casos/${casoId}/rejeitar`, corpo),
  pedirInformacao: (casoId, corpo) => api.post(`${B}/casos/${casoId}/pedir-informacao`, corpo),
  reabrir: (casoId, versao) => api.post(`${B}/casos/${casoId}/reabrir`, { versao }),
  pedirParecerIa: (casoId) => api.post(`${B}/casos/${casoId}/parecer-ia`, {}),
  lotePrevia: (id, corpo) => api.post(`${B}/projetos/${id}/casos/lote/previa`, corpo),
  loteAprovar: (id, corpo) => api.post(`${B}/projetos/${id}/casos/lote/aprovar`, corpo),
  /** Pedir informação ou rejeitar em lote, com o texto comum e as versões da prévia. */
  loteRejeitar: (id, corpo) => api.post(`${B}/projetos/${id}/casos/lote/rejeitar`, corpo),
  lotePedirInformacao: (id, corpo) => api.post(`${B}/projetos/${id}/casos/lote/pedir-informacao`, corpo),

  /** Paginado: { linhas, proximo, total, totalGeral, porTipo }. */
  impactos: (id, params) => api.get(`${B}/projetos/${id}/impactos-sped`, params),
  vinculos: (id) => api.get(`${B}/projetos/${id}/vinculos-codigo`),
  /** Mapa de unificações e inativações (paginado): { linhas, pagina, limite, total, totalGeral, porSituacao, porTipo, comAlerta, corteDefinido }. */
  unificacoes: (id, filtro) => api.get(`${B}/projetos/${id}/unificacoes`, paramsDoMapa(filtro)),
  /** Marca "Executado no ERP" de uma linha do mapa (`chave` da linha): marcar grava quem e quando; desmarcar apaga. */
  marcarExecutada: (id, chave) => api.post(`${B}/projetos/${id}/unificacoes/executadas`, { chave }),
  desmarcarExecutada: (id, chave) => api.delete(`${B}/projetos/${id}/unificacoes/executadas?chave=${encodeURIComponent(chave)}`),
  baixarUnificacoes: (id, filtro) => api.baixar("GET", enderecoDoMapa(id, filtro), { nome: "saneamento-estoques-unificacoes-e-inativacoes.xlsx", nomeDoServidor: true }),

  versoes: (id) => api.get(`${B}/projetos/${id}/versoes`),
  /** { fases: [{ fase: "FASE1"|"FASE2", camadas, liberada: { versaoId, numero, em } | null, bloqueio: { codigo, mensagem } | null }] }. */
  fases: (id) => api.get(`${B}/projetos/${id}/fases`),
  liberarVersao: (id, rotulo, extra) => api.post(`${B}/projetos/${id}/versoes`, { rotulo, ...(extra || {}) }),
  compararVersoes: (id, a, b) => api.get(`${B}/projetos/${id}/versoes/comparar`, { a, b }),
  /** Continuar a partir de uma versão liberada: prévia (só lê), restauração ({ versao, previa, justificativa }) e desfazer. */
  previaContinuar: (id, versaoId) => api.get(`${B}/projetos/${id}/versoes/${versaoId}/continuar`),
  continuarVersao: (id, versaoId, corpo) => api.post(`${B}/projetos/${id}/versoes/${versaoId}/continuar`, corpo),
  desfazerRestauracao: (id, versaoId, restauracaoId, versao) => api.post(`${B}/projetos/${id}/versoes/${versaoId}/restauracoes/${restauracaoId}/desfazer`, { versao }),
  /** `fase` (só na revisão): "FASE1" = sem a parte tributária. */
  baixarEntrega: (id, tipo, versao, fase) => api.baixar("GET", enderecoDeEntrega(id, tipo, versao?.id, fase), { nome: nomeDeEntrega(tipo, versao, fase), nomeDoServidor: true }),
  /** Política (PDF): sem versão = a política de agora (Rascunho enquanto houver regra não aprovada); com versão = a congelada nela. */
  baixarPolitica: (id, versao) => api.baixar("GET", enderecoDaPolitica(id, versao?.id), { nome: nomeDaPolitica(versao), nomeDoServidor: true }),

  // ── Diretrizes (docs/saneamento-diretrizes.md, seção 11). Toda alteração leva a `versao` que a tela viu. ──
  diretrizes: (id) => api.get(`${B}/projetos/${id}/diretrizes`),
  salvarCabecalhoDiretrizes: (id, corpo) => api.put(`${B}/projetos/${id}/diretrizes`, corpo),
  /** Várias regras de uma vez: prévia agregada (só lê) e aplicação com uma só reanálise. */
  previaAplicarVarias: (id, ids) => api.get(`${B}/projetos/${id}/diretrizes/aplicar-varias/previa`, { regras: ids.join(",") }),
  aplicarVarias: (id, corpo) => api.post(`${B}/projetos/${id}/diretrizes/aplicar-varias`, corpo),
  aplicarModelo: (id, modeloId) => api.post(`${B}/projetos/${id}/diretrizes/aplicar-modelo`, { modeloId }),
  criarRegra: (id, corpo) => api.post(`${B}/projetos/${id}/diretrizes/regras`, corpo),
  alterarRegra: (regraId, corpo) => api.put(`${B}/diretrizes/regras/${regraId}`, corpo),
  previaRegra: (regraId) => api.get(`${B}/diretrizes/regras/${regraId}/previa`),
  exemplosRegra: (regraId) => api.get(`${B}/diretrizes/regras/${regraId}/exemplos`),
  aplicarRegra: (regraId, corpo) => api.post(`${B}/diretrizes/regras/${regraId}/aplicar`, corpo),
  aprovarRegra: (regraId, versao) => api.post(`${B}/diretrizes/regras/${regraId}/aprovar`, { versao }),
  historicoRegra: (regraId) => api.get(`${B}/diretrizes/regras/${regraId}/historico`),
  adotarVersao: (regraId, versao) => api.post(`${B}/diretrizes/regras/${regraId}/adotar-versao`, { versao }),
  transformarEmRegra: (id, corpo) => api.post(`${B}/projetos/${id}/diretrizes/transformar`, corpo),

  // ── Biblioteca de diretrizes (Administração; só o administrador grava) ──
  biblioteca: () => api.get(`${B}/biblioteca`),
  regraBiblioteca: (regraId) => api.get(`${B}/biblioteca/${regraId}`),
  criarRegraBiblioteca: (corpo) => api.post(`${B}/biblioteca`, corpo),
  alterarRegraBiblioteca: (regraId, corpo) => api.put(`${B}/biblioteca/${regraId}`, corpo),
  historicoBiblioteca: (regraId) => api.get(`${B}/biblioteca/${regraId}/historico`),
  procedimentos: () => api.get(`${B}/biblioteca/procedimentos`),
  modelos: () => api.get(`${B}/biblioteca/modelos`),

  // ── Planilha de decisão por camada: baixar, prévia da reimportação (só lê) e aplicar (com confirmação). ──
  baixarPlanilhaDecisao: (id, camada) => api.baixar("GET", `${B}/projetos/${id}/camadas/${camada}/planilha`, { nome: `planilha-de-decisao-${camada}.xlsx`, nomeDoServidor: true }),
  previaPlanilhaDecisao: (id, camada, arquivo) => api.upload(`${B}/projetos/${id}/camadas/${camada}/planilha/previa`, arquivo),
  aplicarPlanilhaDecisao: (id, camada, arquivo) => api.upload(`${B}/projetos/${id}/camadas/${camada}/planilha/aplicar`, arquivo, { confirmar: "true" }),
};

export const chaves = {
  projeto: (diagId) => ["san", "projeto", diagId],
  todos: (projetoId) => ["san", projetoId],
  itens: (projetoId, filtro) => ["san", projetoId, "itens", filtro],
  colunasDosItens: (projetoId) => ["san", projetoId, "itens-colunas"],
  visao: (projetoId) => ["san", projetoId, "visao"],
  camadas: () => ["san", "camadas-disponiveis"],
  estadoCamadas: (projetoId) => ["san", projetoId, "estado-camadas"],
  analises: (projetoId) => ["san", projetoId, "analises"],
  criterios: (projetoId) => ["san", projetoId, "criterios"],
  casos: (projetoId, filtro) => ["san", projetoId, "casos", filtro],
  casosAgrupados: (projetoId, filtro) => ["san", projetoId, "casos-agrupados", filtro],
  grupoDeCasos: (projetoId, filtro, chave) => ["san", projetoId, "casos-agrupados", filtro, chave],
  caso: (casoId) => ["san", "caso", casoId],
  gruposDoCaso: (projetoId, casoId) => ["san", projetoId, "caso-grupos", casoId],
  impactos: (projetoId, tipo = "") => ["san", projetoId, "impactos", tipo],
  unificacoes: (projetoId, filtro) => ["san", projetoId, "unificacoes", filtro],
  versoes: (projetoId) => ["san", projetoId, "versoes"],
  fases: (projetoId) => ["san", projetoId, "fases"],
  continuar: (projetoId, versaoId) => ["san", projetoId, "continuar", versaoId],
  importacoes: (projetoId) => ["san", projetoId, "importacoes"],
  diretrizes: (projetoId) => ["san", projetoId, "diretrizes"],
  exemplosRegra: (projetoId, regraId) => ["san", projetoId, "diretrizes", "exemplos", regraId],
  historicoRegra: (projetoId, regraId) => ["san", projetoId, "diretrizes", "historico", regraId],
  cliente: (empresaId) => ["san", "cliente", empresaId],
  biblioteca: () => ["san-biblioteca", "lista"],
  regraBiblioteca: (regraId) => ["san-biblioteca", "regra", regraId],
  historicoBiblioteca: (regraId) => ["san-biblioteca", "historico", regraId],
  procedimentos: () => ["san-biblioteca", "procedimentos"],
  modelos: () => ["san-biblioteca", "modelos"],
};

/**
 * Depois de uma gravação: renova o que a tela mostra sem refazer todas as páginas da tabela. As listas de itens (infinitas) voltam
 * a só a primeira página antes de recarregar, para não buscar de novo dezenas de páginas; o resto é invalidado normalmente.
 */
export async function atualizarTudo(qc, projetoId) {
  const base = chaves.todos(projetoId);
  qc.setQueriesData({ queryKey: [...base, "itens"] }, (d) => (d && d.pages ? { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) } : d));
  await qc.invalidateQueries({ queryKey: base });
}

/**
 * Depois de restaurar ou desfazer uma restauração, com sucesso OU erro (ex.: 409 por versão do projeto desatualizada): renova o projeto
 * (a versão que vai no próximo pedido) e as versões, para o botão não ficar preso no conflito.
 */
export async function renovarAposRestauracao(qc, projetoId) {
  await Promise.all([qc.invalidateQueries({ queryKey: ["san", "projeto"] }), qc.invalidateQueries({ queryKey: chaves.versoes(projetoId) })]);
}
