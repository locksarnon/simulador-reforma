import type { ItemTrabalho } from '../tipos';

/** Campos de ItemTrabalho que a planilha pode alimentar (o resto vai em `campos`). */
export const CAMPOS_BASE = ['codigo', 'estabelecimento', 'descricao', 'unidade', 'ncm', 'grupo', 'ativo', 'saldo', 'ultimaMovimentacao', 'fabricante', 'referencia', 'finalidade'] as const;
export type CampoBase = (typeof CAMPOS_BASE)[number];
export const CAMPOS_OBRIGATORIOS: readonly CampoBase[] = ['codigo', 'descricao'];
export const ROTULO_CAMPO: Record<CampoBase, string> = {
  codigo: 'Código', estabelecimento: 'Estabelecimento/depósito', descricao: 'Descrição', unidade: 'Unidade', ncm: 'NCM', grupo: 'Grupo',
  ativo: 'Ativo', saldo: 'Saldo', ultimaMovimentacao: 'Última movimentação', fabricante: 'Fabricante', referencia: 'Referência', finalidade: 'Finalidade',
};

/** Campo → índice da coluna (base 0, como em `Planilha.cabecalho`); null/ausente = sem coluna. */
export type Mapeamento = Partial<Record<CampoBase, number | null>>;

/** A coluna "ativo" pode dizer o contrário: SAP `frozenFor`, Protheus `B1_MSBLQL` e "Inativo" marcam o item BLOQUEADO (S/Y/1 = não ativo). */
export type SemanticaAtivo = 'ATIVO' | 'BLOQUEADO';

export type Certeza = 'ALTA' | 'MEDIA';

export type SugestaoColuna = {
  indice: number;
  nome: string;
  /** Primeiro valor não vazio da coluna, para o consultor conferir. */
  exemplo: string;
  /** Campo sugerido; null = a coluna vira `campos` (ou fica de fora). */
  campo: CampoBase | null;
  certeza: Certeza | null;
  motivo: string;
};

export type SugestaoMapeamento = {
  colunas: SugestaoColuna[];
  mapeamento: Mapeamento;
  semanticaAtivo: SemanticaAtivo;
  /** Campos obrigatórios sem coluna: a importação não pode seguir até o consultor escolher. */
  faltando: CampoBase[];
};

export type ConfigImportacao = {
  mapeamento: Mapeamento;
  /** Colunas que viram `campos`: lista de índices, ou 'demais' (padrão) = todas as não mapeadas, ou 'nenhuma'. */
  colunasExtras?: number[] | 'demais' | 'nenhuma';
  semanticaAtivo?: SemanticaAtivo;
  /** Por coluna: veio como número no Excel (zeros à esquerda perdidos). Vem de `Planilha.ncmNumerico`. */
  colunaNumerica?: boolean[];
  /** Por coluna: separador decimal detectado na base inteira (texto/CSV), para a coluna toda ser lida do mesmo jeito. Preenchido por conferirBase. */
  decimalPorColuna?: ('BR' | 'PONTO' | undefined)[];
  /** Quando a planilha é de um único depósito e não tem a coluna. */
  estabelecimentoFixo?: string | null;
  /** Data de referência para rejeitar datas no futuro (padrão: agora). */
  hoje?: Date;
  /** Quantas linhas com problema o relatório detalha por situação (padrão 2000). */
  maxLinhasDetalhadas?: number;
};

export type SituacaoLinha = 'ACEITA' | 'REJEITADA' | 'PENDENTE';

export type Ocorrencia = { codigo: string; texto: string; /** Complemento da linha (valor lido, linha da primeira ocorrência...). */ detalhe?: string };

/** Item pronto para persistir (o `id` é do Agente 1). */
export type ItemImportado = Omit<ItemTrabalho, 'id'>;

export type LinhaConferida = {
  /** Número da linha física no arquivo (o cabeçalho é a linha 1). */
  linhaOrigem: number;
  situacao: SituacaoLinha;
  /** Preenchidos só em REJEITADA (motivos) e PENDENTE (o que falta). */
  ocorrencias: Ocorrencia[];
  chave: string | null;
  /** null quando rejeitada. */
  item: ItemImportado | null;
  /** Código e descrição como vieram (aparados), para citar a linha no relatório mesmo quando rejeitada. */
  referencia: { codigo: string; descricao: string };
};

export type ExemploLinha = { linha: number; codigo: string; descricao: string };
export type GrupoOcorrencia = { codigo: string; texto: string; quantidade: number; exemplos: ExemploLinha[] };

export type TotaisImportacao = { linhas: number; aceitas: number; pendentes: number; rejeitadas: number; importaveis: number };

export type RelatorioImportacao = {
  arquivo: { nome: string; sha256: string; formato: 'xlsx' | 'csv'; tamanhoBytes: number };
  /** Mapeamento efetivamente usado: campo → coluna (índice e nome). */
  mapeamentoUsado: Partial<Record<CampoBase, { indice: number; nome: string }>>;
  semanticaAtivo: SemanticaAtivo;
  colunasExtras: string[];
  totais: TotaisImportacao;
  motivosRejeicao: GrupoOcorrencia[];
  pendencias: GrupoOcorrencia[];
  /** Avisos do mapeamento (ex.: campo importante sem coluna). */
  avisos: string[];
  /** Linhas rejeitadas/pendentes, limitadas por `maxLinhasDetalhadas`. */
  linhasRejeitadas: { linha: number; chave: string | null; ocorrencias: string[] }[];
  linhasPendentes: { linha: number; chave: string | null; ocorrencias: string[] }[];
  truncado: boolean;
};

export type PreviaImportacao = {
  formato: 'xlsx' | 'csv';
  totalLinhas: number;
  colunas: { indice: number; nome: string; primeiroValor: string }[];
  /** As 10 primeiras linhas já normalizadas (com situação). */
  amostra: LinhaConferida[];
  contagens: TotaisImportacao;
  relatorio: RelatorioImportacao;
};
