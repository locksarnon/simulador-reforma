/**
 * Contrato das DIRETRIZES do Saneamento (docs/saneamento-diretrizes.md). Tipos puros, sem Nest nem Prisma.
 * Regras por ASPECTO e por GRUPO comandam as análises; as aprovadas formam a política. Biblioteca FAL = regras-modelo reaproveitadas;
 * o projeto aponta para a regra da biblioteca e só guarda as exceções. Quem precisar de campo novo descreve no relatório; o integrador decide.
 */

/** Os 5 aspectos analisados. Controles internos NÃO são aspecto (entram na política como procedimento fixo). */
export const ASPECTOS = ['NOMES', 'ATRIBUTOS', 'UNIDADES', 'LIMITES', 'FISCAL'] as const;
export type Aspecto = (typeof ASPECTOS)[number];
export const ROTULO_ASPECTO: Record<Aspecto, string> = {
  NOMES: 'Padrão de nomes', ATRIBUTOS: 'Atributos técnicos', UNIDADES: 'Unidades e embalagens', LIMITES: 'Limites de caracteres', FISCAL: 'Classificação fiscal',
};
/** Prefixo do código da regra no PDF (N01, A01, U01, L01, F01). */
export const PREFIXO_ASPECTO: Record<Aspecto, string> = { NOMES: 'N', ATRIBUTOS: 'A', UNIDADES: 'U', LIMITES: 'L', FISCAL: 'F' };

/** Situação de uma regra no projeto. "revisar" é marca, não situação. */
export type SituacaoRegra = 'RASCUNHO' | 'APROVADA';

/** Abrangência: TODOS = padrão global (vale para grupos novos); senão, lista de grupos (e subgrupos opcionais). */
export type Abrangencia = { todos: true } | { todos: false; grupos: string[]; subgrupos?: string[] };

// ── Conteúdo por aspecto ─────────────────────────────────────────────────────

export const COMPONENTES_NOME = ['NOME', 'REFERENCIA', 'MARCA', 'CARACTERISTICA', 'APRESENTACAO', 'COMPLEMENTO'] as const;
export type ComponenteNome = (typeof COMPONENTES_NOME)[number];
export type RegraNomes = {
  aspecto: 'NOMES';
  /** Ordem dos componentes na descrição. */
  componentes: ComponenteNome[];
  obrigatorios: ComponenteNome[];
  separador: ' ' | '-' | string;
  capitalizacao: 'MAIUSCULAS' | 'MINUSCULAS' | 'PRESERVAR';
  removerEspacosDuplicados: boolean;
  /** Expressão completa → abreviação aprovada. */
  abreviacoes: { completa: string; abreviacao: string }[];
  /** Termo proibido → substituição (null = só remover/apontar). */
  termosProibidos: { termo: string; substituicao: string | null }[];
};

export type RegraAtributos = {
  aspecto: 'ATRIBUTOS';
  atributos: {
    /** Ex.: MARCA, REFERENCIA, COMPOSICAO, PRINCIPIO_ATIVO, CONCENTRACAO, FORMULACAO, DIMENSAO, MATERIAL, APRESENTACAO ou outro cadastrado. */
    atributo: string;
    onde: 'DESCRICAO' | 'CAMPO_PROPRIO' | 'AMBOS';
    /** Nome do campo próprio (coluna mapeada na importação), quando onde ≠ DESCRICAO. */
    campo?: string | null;
    aplicabilidade: 'OBRIGATORIO' | 'QUANDO_APLICAVEL';
    /** Texto da condição quando QUANDO_APLICAVEL (ex.: "defensivos com princípio ativo registrado"). */
    condicao?: string | null;
  }[];
};

export type RegraUnidades = {
  aspecto: 'UNIDADES';
  /** MENOR_PRATICA = padrão (menor unidade prática da medida); DEFINIDA = unidade fixa para o grupo. */
  criterioEstoque: 'MENOR_PRATICA' | 'DEFINIDA';
  unidadeDefinida?: string | null;
  unidadesCompra: string[];
  unidadesSaida: string[];
  conversoes: { origem: string; destino: string; fator: number; abrangencia: 'GRUPO' | 'PRODUTO'; codigoProduto?: string | null }[];
  /** Conversão desconhecida: sempre pendência pedindo o fator (não há outra opção). */
  conversaoDesconhecida: 'PENDENCIA';
};

/** Origem de um limite, em ordem de confiança: leiaute oficial é o teto. */
export type OrigemLimite = 'LEIAUTE_OFICIAL' | 'ERP' | 'CLIENTE';
export type LinhaLimite = {
  /** Ex.: "SPED EFD ICMS/IPI", "NF-e", "SAP Business One", "Cliente". */
  destino: string;
  /** Campo do destino (ex.: "0200 DESCR_ITEM", "xProd", "OITM.ItemName"). */
  campo: string;
  /** Campo do item a que se aplica. */
  campoItem: 'descricao' | 'codigo' | 'unidade' | 'referencia' | 'fabricante';
  /** null = limite não confirmado (pendente). Nunca um número genérico. */
  limite: number | null;
  origem: OrigemLimite;
  /** Documento, versão e vigência; URL quando houver. */
  referencia: string | null;
  url?: string | null;
  confirmado: boolean;
  tratamento: 'SUGERIR_ABREVIACAO' | 'SOLICITAR_REVISAO';
  preservar: ComponenteNome[];
};
export type RegraLimites = { aspecto: 'LIMITES'; linhas: LinhaLimite[] };

export type RegraFiscal = {
  aspecto: 'FISCAL';
  validarNcm: boolean;
  /** Exceções justificadas (itens/grupos não sujeitos à classificação). */
  excecoesNcm: { alvo: string; justificativa: string }[];
  validarCClassTrib: boolean;
  cenarios: ('ENTRADA' | 'SAIDA' | 'USO_INTERNO')[];
  ausente: 'PENDENCIA';
  ambiguo: 'REVISAO_FISCAL';
};

export type ConteudoRegra = RegraNomes | RegraAtributos | RegraUnidades | RegraLimites | RegraFiscal;

// ── Regra (biblioteca e projeto) ─────────────────────────────────────────────

/** Regra-modelo da biblioteca FAL (Administração). Versionada. */
export type RegraBiblioteca = {
  id: string;
  aspecto: Aspecto;
  nome: string;
  /** Para quais tipos de grupo serve (texto livre, ex.: "Peças de manutenção"); ajuda a sugerir. */
  indicadaPara: string | null;
  observacao: string | null;
  conteudo: ConteudoRegra;
  versao: number;
  ativa: boolean;
};

/** Regra no projeto: aponta para a biblioteca (e versão adotada) e guarda só o que o cliente muda. */
export type RegraProjeto = {
  id: string;
  projetoId: string;
  aspecto: Aspecto;
  /** Código no PDF (N01…), estável no projeto. */
  codigo: string;
  nome: string;
  abrangencia: Abrangencia;
  observacao: string | null;
  bibliotecaId: string | null;
  bibliotecaVersao: number | null;
  /** Conteúdo efetivo = conteúdo da biblioteca (versão adotada) + estas alterações do projeto (mesmo formato, parcial). */
  alteracoes: Partial<ConteudoRegra> | null;
  situacao: SituacaoRegra;
  revisar: boolean;
  aprovadaPor: string | null;
  aprovadaEm: string | null;
  versao: number;
};

/** Resultado da resolução para um grupo: a regra efetiva por aspecto (no máximo uma). */
export type RegrasDoGrupo = Partial<Record<Aspecto, { regraId: string; codigo: string; conteudo: ConteudoRegra; aprovada: boolean }>>;

/** Prévia de "Aplicar e reanalisar": o que muda antes de aplicar. */
export type PreviaAplicacao = {
  regraId: string;
  grupos: string[];
  itens: number;
  /** Sobreposições do mesmo aspecto que impedem aplicar (grupo → regra que já cobre). */
  sobreposicoes: { grupo: string; regraAtual: string }[];
  /** Camadas que serão reexecutadas para esses itens. */
  camadas: string[];
};

/** Camada que executa cada aspecto. */
export const CAMADAS_DO_ASPECTO: Record<Aspecto, string[]> = {
  NOMES: ['NOMES_UNIDADES'], ATRIBUTOS: ['QUALIDADE'], UNIDADES: ['NOMES_UNIDADES'], LIMITES: ['NOMES_UNIDADES'], FISCAL: ['NCM', 'TRIBUTARIO'],
};

// ── Política (PDF) ───────────────────────────────────────────────────────────

/** Procedimento fixo da política (biblioteca), com fluxograma. Conteúdo efetivo, sem metacomentário. */
export type Procedimento = {
  id: string;
  titulo: string;
  /** Para que serve, em 1–2 frases. */
  objetivo: string;
  /** Passos do fluxograma, em ordem; decisão = losango com ramos. */
  fluxo: ({ tipo: 'passo'; texto: string; responsavel?: string | null } | { tipo: 'decisao'; pergunta: string; sim: string; nao: string; /** Ramo que continua o fluxo principal (o outro vira desvio). Padrão: SIM. */ segue?: 'SIM' | 'NAO' })[];
  /** Regras práticas (tópicos curtos). */
  regras: string[];
  /** Evidência a guardar. */
  evidencias: string[];
  /** Fundamento com fonte oficial, quando houver. */
  fundamento: string | null;
};
