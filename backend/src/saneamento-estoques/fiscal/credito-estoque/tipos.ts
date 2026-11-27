/**
 * Tipos do cálculo do crédito presumido de CBS sobre o estoque de abertura (LC 214/2025, art. 381; Decreto 12.955/2026, arts. 605 a 613).
 * Valores monetários em reais (number). Campo `null`/ausente = dado não informado → vira pendência, nunca é presumido.
 */
import type { LeiMonofasicoSt } from './dispositivos';

/** Regime de apuração do PIS/Cofins da pessoa jurídica em 31/12/2026 (LC 214, art. 381, caput, I e III). */
export type RegimePisCofins =
  | 'CUMULATIVO' // Lei 9.718/1998 (lucro presumido/arbitrado, entre outros)
  | 'NAO_CUMULATIVO' // Leis 10.637/2002 e 10.833/2003, sem receitas no cumulativo
  | 'MISTO' // não cumulativo com parte das receitas no cumulativo (vedação parcial: art. 3º, §§ 7º a 9º)
  | 'SIMPLES_NACIONAL';

export type Premissas = {
  /** Contribuinte estará no regime regular da CBS em 2027? (LC 214, art. 381, caput). */
  regimeRegularCbs2027: boolean | null;
  /** Regime de PIS/Cofins em 31/12/2026. */
  regimePisCofins31122026: RegimePisCofins | null;
  /** Data do inventário entregue (AAAA-MM-DD). Deve ser 2026-12-31 (Decreto 12.955, art. 608). */
  dataInventario: string | null;
  /**
   * Regime MISTO: percentual (0 a 1) do valor do estoque que ficou sem crédito pela vedação parcial
   * (Leis 10.637 e 10.833, art. 3º, §§ 7º a 9º). Vale para todos os itens sem percentual próprio.
   * O método (apropriação direta ou rateio) é o que a empresa já usa na EFD-Contribuições; o módulo não o calcula.
   */
  percentualVedacaoParcial?: number | null;
  /** Mês (AAAA-MM) em que o crédito será apropriado; até 2027-06 (LC 214, art. 381, § 4º, I). Opcional: gera o cronograma. */
  mesApropriacao?: string | null;
};

/** Destinação do bem (LC 214, art. 381, § 1º, I). */
export type Destinacao =
  | 'REVENDA'
  | 'PRODUCAO_PARA_VENDA'
  | 'PRESTACAO_SERVICOS_TERCEIROS'
  | 'USO_CONSUMO' // material de uso e consumo do estabelecimento
  | 'ATIVO_IMOBILIZADO'
  | 'OUTRA';

/** Tratamento do PIS/Cofins na AQUISIÇÃO (LC 214, art. 381, § 1º, II). */
export type TratamentoAquisicao = 'TRIBUTADA' | 'ALIQUOTA_ZERO' | 'ISENCAO' | 'SUSPENSAO' | 'NAO_INCIDENCIA';

/** Propriedade do item no inventário (registro H010, campo IND_PROP): 0 próprio em seu poder, 1 próprio em poder de terceiros, 2 de terceiros em seu poder. */
export type IndicadorPropriedade = '0' | '1' | '2';

export type ItemEstoque = {
  id: string;
  descricao?: string | null;
  ncm?: string | null;
  /** Registro 0200, campo TIPO_ITEM (00 revenda, 01 MP, 02 embalagem, 03 em processo, 04 acabado, 05 subproduto, 06 intermediário, 07 uso e consumo, 08 imobilizado, 09 serviços, 10 outros insumos, 99 outras). */
  tipoItem?: string | null;
  quantidade?: number | null;
  /** Valor do item no inventário de 31/12/2026 pelo custo de aquisição (critérios do IRPJ) — Decreto 12.955, art. 609. */
  valorCustoAquisicao?: number | null;
  /** Produtos acabados (04) e em processo (03): só o custo de aquisição de matérias-primas e embalagens — Decreto 12.955, art. 609, § 2º. */
  custoMateriasPrimasEmbalagens?: number | null;
  indicadorPropriedade?: IndicadorPropriedade | null;
  origem?: 'NACIONAL' | 'IMPORTADO' | null;
  /** Bem novo? (LC 214, art. 381, § 1º, I). */
  novo?: boolean | null;
  /** Nacional: adquirido de pessoa jurídica domiciliada no País? (compra de pessoa física não dá direito). */
  adquiridoDePessoaJuridica?: boolean | null;
  /** Destinação. Se ausente, o módulo deduz do tipoItem apenas para os códigos sem dúvida (00, 01, 02, 03, 04, 07, 08, 09). */
  destinacao?: Destinacao | null;
  tratamentoAquisicao?: TratamentoAquisicao | null;
  /** Lei de monofásico/ST do art. 381, II, a que o item esteve sujeito na aquisição (null = não sujeito / não informado). */
  monofasicoSt?: LeiMonofasicoSt | null;
  /** Houve apuração de crédito de PIS/Cofins na aquisição? (hipótese I exige que não tenha havido). */
  houveCreditoPisCofins?: boolean | null;
  /** Regime MISTO: percentual próprio do item que ficou sem crédito (0 a 1). */
  percentualVedacaoParcial?: number | null;
  usoConsumoPessoal?: boolean | null; // LC 214, art. 57
  imovel?: boolean | null;
  /** Concessionária de serviço público: contabilizado como ativo de contrato, intangível ou financeiro (LC 214, art. 381, § 5º). */
  ativoContratoConcessionaria?: boolean | null;
  /** Item respaldado por documentação fiscal idônea (Decreto 12.955, art. 606, § 2º). */
  documentacaoIdonea?: boolean | null;
  /** Importados: PIS-Importação efetivamente pago. */
  pisImportacaoPago?: number | null;
  /** Importados: Cofins-Importação efetivamente paga (incluindo o adicional, se houver). */
  cofinsImportacaoPaga?: number | null;
  /** Importados: parcela da Cofins-Importação relativa ao adicional do art. 8º, § 21, da Lei 10.865/2004 (vedada). */
  adicionalCofinsImportacao?: number | null;
};

export type Hipotese = 'CUMULATIVO' | 'MONOFASICO_ST' | 'VEDACAO_PARCIAL';

export type SituacaoItem = 'ELEGIVEL' | 'NAO_ELEGIVEL' | 'PENDENTE' | 'NAO_CONFIRMADO';

export type AvaliacaoItem = {
  elegivel: boolean;
  situacao: SituacaoItem;
  motivo: string;
  dispositivo: string;
  hipotese?: Hipotese;
  /** Dados que faltam (situacao PENDENTE). */
  faltando?: string[];
};

export type ItemCalculado = {
  id: string;
  hipotese: Hipotese;
  origem: 'NACIONAL' | 'IMPORTADO';
  base: number;
  credito: number;
  dispositivo: string;
  memoria: string;
};

export type Parcela = { numero: number; mes: string; valor: number };

export type ResultadoCredito = {
  total: number;
  totalNacional: number;
  totalImportado: number;
  porItem: ItemCalculado[];
  naoElegiveis: { id: string; motivo: string; dispositivo: string }[];
  pendencias: { id: string | null; faltando: string[]; motivo: string; dispositivo: string }[];
  premissasNaoConfirmadas: { id: string | null; tema: string; motivo: string; dispositivo: string }[];
  /** Cronograma (só se `mesApropriacao` informado e válido). */
  utilizacao: {
    mesApropriacao: string;
    parcelas: Parcela[];
    extincaoDoDireito: string;
    dispositivo: string;
  } | null;
  /** Regras de uso que acompanham o resultado (texto fixo com dispositivo). */
  observacoes: { texto: string; dispositivo: string }[];
};
