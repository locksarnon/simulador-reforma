/**
 * Contrato comum do Saneamento de Estoques (docs/saneamento-estoques.md). Tipos puros, sem Nest nem Prisma.
 * Quem precisar de um campo novo NÃO altera este arquivo: descreve o pedido no relatório final e o integrador decide.
 */

/** Colunas da tabela única (uma por camada de análise). ESTOQUE só existe com o módulo opcional ligado. */
export const CAMADAS = ['IDENTIFICACAO', 'QUALIDADE', 'DUPLICIDADE', 'GRUPOS_FINALIDADE', 'NOMES_UNIDADES', 'NCM', 'TRIBUTARIO', 'ESTOQUE', 'OBRIGACOES'] as const;
export type Camada = (typeof CAMADAS)[number];

/** As 5 situações de uma célula (item × camada). "Revisão necessária" NÃO é situação: é a marca `revisar`. */
export const SITUACOES = ['PENDENTE', 'SEM_PROBLEMA', 'PROPOSTO', 'APROVADO', 'AGUARDANDO_INFORMACAO'] as const;
export type Situacao = (typeof SITUACOES)[number];

/** Finalidade do item (lista fechada). Uma principal; o resto vai em `tambemUsadoComo`. */
export const FINALIDADES = ['REVENDA', 'MATERIA_PRIMA', 'INSUMO_PRODUCAO', 'EMBALAGEM', 'USO_CONSUMO', 'MANUTENCAO', 'IMOBILIZADO', 'MATERIAL_TERCEIROS'] as const;
export type Finalidade = (typeof FINALIDADES)[number];
export const ROTULO_FINALIDADE: Record<Finalidade, string> = {
  REVENDA: 'Revenda', MATERIA_PRIMA: 'Matéria-prima', INSUMO_PRODUCAO: 'Insumo de produção', EMBALAGEM: 'Embalagem',
  USO_CONSUMO: 'Uso e consumo', MANUTENCAO: 'Manutenção', IMOBILIZADO: 'Imobilizado', MATERIAL_TERCEIROS: 'Material de terceiros',
};

/** Os 4 cenários tributários. */
export const CENARIOS = ['COMPRA_REVENDA', 'VENDA', 'USO_CONSUMO', 'DEVOLUCAO'] as const;
export type Cenario = (typeof CENARIOS)[number];
export const ROTULO_CENARIO: Record<Cenario, string> = {
  COMPRA_REVENDA: 'Compra para revenda', VENDA: 'Venda', USO_CONSUMO: 'Uso e consumo', DEVOLUCAO: 'Devolução',
};

/** Item da base de trabalho, como as análises o enxergam. Códigos e NCM são SEMPRE texto (zeros à esquerda). */
export type ItemTrabalho = {
  /** Identificador interno estável (não muda na reimportação). */
  id: string;
  codigo: string;
  /** Estabelecimento/depósito; null = único. O mesmo código pode existir em estabelecimentos distintos. */
  estabelecimento: string | null;
  descricao: string;
  unidade: string | null;
  ncm: string | null;
  grupo: string | null;
  /** Item ativo (não bloqueado/inativo no ERP); null = desconhecido. */
  ativo: boolean | null;
  saldo: number | null;
  /** ISO yyyy-mm-dd da última movimentação, quando a base traz. */
  ultimaMovimentacao: string | null;
  fabricante: string | null;
  referencia: string | null;
  finalidade: Finalidade | null;
  /** Demais colunas mapeadas na importação (nome do campo → valor), todas como texto ou número. */
  campos: Record<string, string | number | null>;
};

/** Evidência exibida no caso: um rótulo e um valor curto. */
export type Evidencia = { rotulo: string; valor: string };

/** Um problema encontrado por uma camada. A persistência o transforma em caso. */
export type CasoProposto = {
  camada: Camada;
  /** Tipo estável do problema dentro da camada (ex.: DESCRICAO_CURTA, DUPLICIDADE_EXATA). */
  tipo: string;
  /** Ids dos itens envolvidos (um para caso individual; vários para conjunto). */
  itens: string[];
  problema: string;
  evidencia: Evidencia[];
  /** Como é hoje (campo → valor). */
  atual: Record<string, string | number | null>;
  /** Como seria (campo → valor). Vazio quando só há alerta. */
  proposta: Record<string, string | number | null>;
  justificativa: string;
  /** Fundamento (norma, artigo, regra interna, critério de similaridade). Nunca inventado. */
  fundamento: string | null;
  /** Efeitos a conferir em outras camadas ou nas obrigações. */
  impactos: string[];
  /** Quem produziu: regra determinística ou IA (a IA só entra na camada de pareceres). */
  origem: 'REGRA' | 'IA';
  /** Camadas que passam a ser "revisar" se este caso for aprovado/alterado. */
  afeta: Camada[];
};

/** Resultado de uma camada sobre um conjunto de itens. */
export type ResultadoCamada = {
  camada: Camada;
  analisados: number;
  /** Faltou dado para analisar: motivo e quantos itens ficaram de fora. A camada fica "aguardando informação". */
  semDados: { motivo: string; itens: number } | null;
  casos: CasoProposto[];
  /** Itens analisados sem problema identificado. */
  semProblema: string[];
};

/** Parâmetros do projeto que as análises conhecem. */
export type ContextoAnalise = {
  /** yyyy-mm-dd */
  dataBase: string;
  /** Atividades confirmadas pelo consultor (ids estáveis, ver fiscal/atividades). */
  atividades: string[];
  /** Nome do ERP do Cadastro de ERPs (sem vínculo, o texto antigo do projeto). Só informativo: regra que dependa do ERP usa erp_id e o perfil. */
  erp: string | null;
  /** ERP do Cadastro de ERPs (Administração > Configuração e ERPs). */
  erp_id?: string | null;
  /** Corte da Triagem: itens sem movimentação desde esta data (yyyy-mm-dd) saem do escopo. */
  corteMovimentacao: string | null;
};

/** Toda camada que roda no servidor implementa isto: função pura, sem acesso a banco. */
export interface AnalisadorCamada {
  readonly camada: Camada;
  analisar(itens: ItemTrabalho[], contexto: ContextoAnalise): ResultadoCamada;
}
