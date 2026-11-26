import type { ContextoAnalise } from '../tipos';

/** Consulta à tabela NCM (Siscomex). O adaptador Prisma/Siscomex é do integrador; o motor só conhece esta interface. */
export interface TabelaNcm {
  /** O NCM (8 dígitos, texto) existe na tabela, em qualquer vigência. */
  existe(ncm: string): boolean;
  /** O NCM consta como ativo (hoje a tabela do Siscomex só traz o status atual, não a vigência por data; `dataBase` é repassada para um adaptador que a tenha). */
  vigente(ncm: string, dataBase: string): boolean;
  /** Descrição oficial do NCM, ou null se a tabela não a traz. */
  descricao(ncm: string): string | null;
  /** NCM(s) que sucedem um código encerrado (vazio se não há ou não se sabe). */
  sucessores(ncm: string): string[];
}

/** Limites de tamanho dos campos no ERP do cliente. Sem limite informado, o motor não emite caso de tamanho (nunca inventa limite). */
export type LimitesCampo = Partial<Record<'codigo' | 'descricao' | 'unidade' | 'grupo' | 'fabricante' | 'referencia', number>>;

/** Regra de unidade definida pelo analista para uma unidade (chave = chaveUnidade): manter como está ou classificá-la numa medida. */
export type RegraUnidade = { manter?: boolean; grandeza?: string; fator?: number | string | null };

/** Parâmetros do projeto que o motor lê (todos opcionais; o que não vier usa o padrão descrito). */
export type ParametrosMotor = {
  /** O projeto exige estabelecimento em todo item (padrão: não exige). */
  exigeEstabelecimento?: boolean;
  /** Campos obrigatórios ALÉM dos que as camadas já cobrem (código, descrição, unidade, NCM e grupo têm caso próprio). Nome de ItemTrabalho ou de `campos`. Padrão: nenhum. */
  camposObrigatorios?: string[];
  /** Itens sem data de movimentação: SINALIZAR (padrão) ou tratar como ANTERIOR_AO_CORTE (saem do escopo e não geram caso). */
  semDataMovimentacao?: 'SINALIZAR' | 'ANTERIOR_AO_CORTE';
  limites?: LimitesCampo;
  /** Política da menor unidade de estoque (padrão: ativa, sem regras nem rótulos do projeto). */
  politicaUnidade?: { ativa?: boolean; regras?: Record<string, RegraUnidade>; rotulos?: Partial<Record<'massa' | 'volume' | 'comprimento' | 'area' | 'contagem', string>> };
  /** Abreviações aprovadas pelo analista na padronização da descrição (de → para). */
  abreviacoesAprovadas?: Record<string, string>;
  /** Padroniza a descrição em CAIXA ALTA (padrão: false; ligado, gera um caso por item que não está em maiúsculas e afoga a fila). */
  padronizarCaixaAlta?: boolean;
  /**
   * Regra do cadastro de peças: padrão false = original e paralelo em códigos DISTINTOS (como na tela atual do saneamento). true = original e paralelos podem ficar no MESMO código
   * (decisão pendente com o usuário para a política da Crestani): a condição (original/paralelo/similar...) deixa de separar itens na duplicidade.
   */
  paralelosNoMesmoCodigo?: boolean;
  /** Mínimo de itens para um grupo ou palavra valer como evidência (padrão 5). */
  minimoItensEvidencia?: number;
};

/** O contexto que o motor entende: o contrato (`ContextoAnalise`) mais parâmetros e a tabela NCM. As camadas continuam recebendo `ContextoAnalise`. */
export type ContextoMotor = ContextoAnalise & { parametros?: ParametrosMotor; tabelaNcm?: TabelaNcm };

export const parametrosDe = (contexto: ContextoAnalise): ParametrosMotor => (contexto as ContextoMotor).parametros ?? {};
export const tabelaNcmDe = (contexto: ContextoAnalise): TabelaNcm | null => (contexto as ContextoMotor).tabelaNcm ?? null;
