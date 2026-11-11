/** Situações do projeto de diagnóstico, com o tom do selo. */
export const SITUACOES_PROJETO = {
  EM_ANDAMENTO: { rotulo: "Em andamento", tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  PAUSADO: { rotulo: "Pausado", tom: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  CONCLUIDO: { rotulo: "Concluído", tom: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  CANCELADO: { rotulo: "Cancelado", tom: "bg-muted text-muted-foreground" },
};

/** As ferramentas de diagnóstico de uma empresa (as telas que já existem no trabalho da empresa). */
export const FERRAMENTAS = [
  { id: "servicos", rotulo: "Serviços e análises", caminho: "servicos" },
  { id: "xml", rotulo: "XML das notas", caminho: "importacao-xml" },
  { id: "planilha", rotulo: "Planilha de operações", caminho: "importacao-planilha" },
  { id: "operacoes", rotulo: "Operações", caminho: "operacoes" },
  { id: "painel", rotulo: "Painel", caminho: "painel" },
  { id: "cadastro", rotulo: "Validação de cadastro", caminho: "validador-cadastro" },
  { id: "saneamento", rotulo: "Saneamento de estoques", caminho: "saneamento-estoque" },
  { id: "classificacao", rotulo: "Classificação de serviços", caminho: "classificacao-servicos" },
  { id: "nfse", rotulo: "Validador de NFS-e", caminho: "validador-nfse" },
  { id: "historico", rotulo: "Histórico", caminho: "historico" },
];

/** Caminho de uma ferramenta para a empresa (o trabalho da empresa continua dentro do grupo dela); null sem grupo. */
export function caminhoDaFerramenta(empresa, grupos, caminho) {
  const g = (grupos || []).find((x) => x.numero === empresa?.grupo);
  return g ? `/workroom/${g.id}/empresas/${empresa.id}/${caminho}` : null;
}

/** Nome sugerido para um projeto novo: "Diagnóstico <alvo> <mês/ano>". */
export function nomeSugerido(alvo, agora = new Date()) {
  const mes = agora.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });
  return `Diagnóstico ${alvo ? `${alvo} ` : ""}${mes}`.trim();
}

/** O projeto cobre o grupo inteiro? (serve para mostrar o painel consolidado do grupo). */
export function cobreGrupoInteiro(projeto, empresas) {
  if (!projeto?.grupo_numero) return false;
  const doGrupo = (empresas || []).filter((e) => e.grupo === projeto.grupo_numero).map((e) => e.id);
  return doGrupo.length > 0 && doGrupo.every((id) => projeto.empresa_ids.includes(id));
}
