import { api } from "@/api/client";
import { enderecoDeEntrega, enderecoDoMapa, nomeDeEntrega, paramsDoMapa } from "./logica";

const B = "/saneamento-estoques";

/** Chamadas do módulo (rotas de docs/saneamento-estoques-contrato.md). Toda alteração leva a `versao` que a tela viu. */
export const san = {
  projetoDoDiagnostico: (diagnosticoId) => api.get(`${B}/projetos/por-diagnostico/${diagnosticoId}`),
  criarProjeto: (diagnostico_id) => api.post(`${B}/projetos`, { diagnostico_id }),
  configurar: (id, corpo) => api.put(`${B}/projetos/${id}`, corpo),
  adicionarAtividade: (id, corpo) => api.post(`${B}/projetos/${id}/atividades`, corpo),
  alterarAtividade: (id, atividadeId, mantida) => api.put(`${B}/projetos/${id}/atividades/${atividadeId}`, { mantida }),
  confirmarAtividades: (id, versao) => api.post(`${B}/projetos/${id}/atividades/confirmar`, { versao }),
  reabrirAtividades: (id, versao) => api.post(`${B}/projetos/${id}/atividades/reabrir`, { versao }),

  /** `opcoes`: página e filtro das diferenças da reimportação ({ pagina, limite, filtro: TODAS | COM_PROTEGIDO | SEM_PROTEGIDO }). */
  previaImportacao: (id, arquivo, mapeamento, opcoes) => api.upload(`${B}/projetos/${id}/importacoes/previa`, arquivo, { mapeamento, ...(opcoes || {}) }),
  /** `incorporar`: lista de ids ou filtro { filtro: "ALTERADOS" | "ALTERADOS_SEM_PROTEGIDO", exceto?: [ids] }. */
  importar: (id, arquivo, mapeamento, incorporar) => api.upload(`${B}/projetos/${id}/importacoes`, arquivo, { mapeamento, incorporar: incorporar || [] }),
  importacoes: (id) => api.get(`${B}/projetos/${id}/importacoes`),

  itens: (id, params) => api.get(`${B}/projetos/${id}/itens`, params),
  item: (itemId) => api.get(`${B}/itens/${itemId}`),
  historicoDoItem: (itemId, campo) => api.get(`${B}/itens/${itemId}/historico`, campo ? { campo } : undefined),
  visaoGeral: (id) => api.get(`${B}/projetos/${id}/visao-geral`),
  camadasDisponiveis: () => api.get(`${B}/camadas-disponiveis`),
  executarCamada: (id, camada) => api.post(`${B}/projetos/${id}/camadas/${camada}/executar`, {}),

  casos: (id, params) => api.get(`${B}/projetos/${id}/casos`, params),
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

  /** Paginado: { linhas, proximo, total, totalGeral, porTipo }. */
  impactos: (id, params) => api.get(`${B}/projetos/${id}/impactos-sped`, params),
  vinculos: (id) => api.get(`${B}/projetos/${id}/vinculos-codigo`),
  /** Mapa de unificações e inativações (paginado): { linhas, pagina, limite, total, totalGeral, porSituacao, porTipo, comAlerta, corteDefinido }. */
  unificacoes: (id, filtro) => api.get(`${B}/projetos/${id}/unificacoes`, paramsDoMapa(filtro)),
  baixarUnificacoes: (id, filtro) => api.baixar("GET", enderecoDoMapa(id, filtro), { nome: "saneamento-estoques-unificacoes-e-inativacoes.xlsx" }),

  versoes: (id) => api.get(`${B}/projetos/${id}/versoes`),
  liberarVersao: (id, rotulo, extra) => api.post(`${B}/projetos/${id}/versoes`, { rotulo, ...(extra || {}) }),
  compararVersoes: (id, a, b) => api.get(`${B}/projetos/${id}/versoes/comparar`, { a, b }),
  /** Continuar a partir de uma versão liberada: prévia (só lê), restauração ({ versao, previa, justificativa }) e desfazer. */
  previaContinuar: (id, versaoId) => api.get(`${B}/projetos/${id}/versoes/${versaoId}/continuar`),
  continuarVersao: (id, versaoId, corpo) => api.post(`${B}/projetos/${id}/versoes/${versaoId}/continuar`, corpo),
  desfazerRestauracao: (id, versaoId, restauracaoId, versao) => api.post(`${B}/projetos/${id}/versoes/${versaoId}/restauracoes/${restauracaoId}/desfazer`, { versao }),
  baixarEntrega: (id, tipo, versao) => api.baixar("GET", enderecoDeEntrega(id, tipo, versao?.id), { nome: nomeDeEntrega(tipo, versao) }),
};

export const chaves = {
  projeto: (diagId) => ["san", "projeto", diagId],
  todos: (projetoId) => ["san", projetoId],
  itens: (projetoId, filtro) => ["san", projetoId, "itens", filtro],
  visao: (projetoId) => ["san", projetoId, "visao"],
  camadas: () => ["san", "camadas-disponiveis"],
  casos: (projetoId, filtro) => ["san", projetoId, "casos", filtro],
  caso: (casoId) => ["san", "caso", casoId],
  gruposDoCaso: (projetoId, casoId) => ["san", projetoId, "caso-grupos", casoId],
  impactos: (projetoId, tipo = "") => ["san", projetoId, "impactos", tipo],
  unificacoes: (projetoId, filtro) => ["san", projetoId, "unificacoes", filtro],
  versoes: (projetoId) => ["san", projetoId, "versoes"],
  continuar: (projetoId, versaoId) => ["san", projetoId, "continuar", versaoId],
  importacoes: (projetoId) => ["san", projetoId, "importacoes"],
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
