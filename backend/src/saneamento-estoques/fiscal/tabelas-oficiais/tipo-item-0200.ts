/**
 * Tipo do item do registro 0200 da EFD ICMS/IPI (campo 07 TIPO_ITEM) e indicador de propriedade/posse do registro H010
 * (campo 07 IND_PROP), conforme o Guia Prático EFD-ICMS/IPI 3.2.4 (ver FONTE_GUIA_EFD).
 * Inclui o de-para da finalidade interna (tipos.ts FINALIDADES) → tipo do item + marcadores (docs/saneamento-fases.md).
 */
import type { Finalidade } from '../../tipos';
import { FONTE_GUIA_EFD, FONTE_LC214, FonteOficial } from './fontes';

export const CODIGOS_TIPO_ITEM_0200 = ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '99'] as const;
export type CodigoTipoItem0200 = (typeof CODIGOS_TIPO_ITEM_0200)[number];

export type TipoItem0200 = {
  codigo: CodigoTipoItem0200;
  /** Descrição exatamente como na tabela do campo 07 do registro 0200. */
  descricao: string;
  /** Conceito do Guia Prático (orientação de preenchimento do campo 07); null quando o Guia não define o conceito. */
  conceito: string | null;
};

export const TIPOS_ITEM_0200: readonly TipoItem0200[] = [
  { codigo: '00', descricao: 'Mercadoria para Revenda', conceito: 'Produto adquirido para comercialização.' },
  {
    codigo: '01', descricao: 'Matéria-prima',
    conceito: 'A mercadoria que componha, física e/ou quimicamente, um produto em processo ou produto acabado e que não seja oriunda do processo '
      + 'produtivo. A mercadoria recebida para industrialização é classificada como Tipo 01, pois não decorre do processo produtivo, mesmo que no '
      + 'processo de produção se produza mercadoria similar classificada como Tipo 03.',
  },
  { codigo: '02', descricao: 'Embalagem', conceito: null },
  {
    codigo: '03', descricao: 'Produto em Processo',
    conceito: 'O produto que possua as seguintes características, cumulativamente: oriundo do processo produtivo; e, predominantemente, consumido no '
      + 'processo produtivo. Dentre os produtos em processo está incluído o produto resultante caracterizado como retorno de produção.',
  },
  {
    codigo: '04', descricao: 'Produto Acabado',
    conceito: 'O produto que possua as seguintes características, cumulativamente: oriundo do processo produtivo; produto final resultante do objeto '
      + 'da atividade econômica do contribuinte; e pronto para ser comercializado.',
  },
  {
    codigo: '05', descricao: 'Subproduto',
    conceito: 'O produto que possua as seguintes características, cumulativamente: oriundo do processo produtivo e não é objeto da produção principal '
      + 'do estabelecimento; tem aproveitamento econômico; não se enquadre no conceito de produto em processo (Tipo 03) ou de produto acabado (Tipo 04).',
  },
  {
    codigo: '06', descricao: 'Produto Intermediário',
    conceito: 'Aquele que, embora não se integrando ao novo produto, for consumido no processo de industrialização.',
  },
  { codigo: '07', descricao: 'Material de Uso e Consumo', conceito: null },
  { codigo: '08', descricao: 'Ativo Imobilizado', conceito: null },
  { codigo: '09', descricao: 'Serviços', conceito: null },
  { codigo: '10', descricao: 'Outros insumos', conceito: null },
  { codigo: '99', descricao: 'Outras', conceito: null },
];

/** Regras gerais do campo 07 no Guia Prático (valem para todos os tipos). */
export const REGRAS_TIPO_ITEM_0200: readonly string[] = [
  'Nas situações de um mesmo código de item possuir mais de um tipo de item (destinação), deve ser informado o tipo de maior relevância na '
    + 'movimentação física, observadas, no que couberem, as regras de escrituração do Bloco K.',
  'Deve ser informada a destinação inicial do produto.',
  'A classificação da mercadoria não se altera a cada movimentação.',
  'Deve ser considerada a atividade econômica do estabelecimento informante, e não da empresa.',
  'O COD_NCM fica dispensado quando o tipo do item for 07, 08, 09, 10 ou 99 (campo 08 do 0200).',
];

export const FONTE_TIPO_ITEM_0200: FonteOficial = FONTE_GUIA_EFD;

export const CODIGOS_IND_PROP_H010 = ['0', '1', '2'] as const;
export type CodigoIndPropH010 = (typeof CODIGOS_IND_PROP_H010)[number];

/** Registro H010, campo 07 IND_PROP — Indicador de propriedade/posse do item. COD_PART é obrigatório quando 1 ou 2. */
export const IND_PROP_H010: readonly { codigo: CodigoIndPropH010; descricao: string; exigeParticipante: boolean }[] = [
  { codigo: '0', descricao: 'Item de propriedade do informante e em seu poder', exigeParticipante: false },
  { codigo: '1', descricao: 'Item de propriedade do informante em posse de terceiros', exigeParticipante: true },
  { codigo: '2', descricao: 'Item de propriedade de terceiros em posse do informante', exigeParticipante: true },
];

/** Marcadores do item na Fase 2 (somam-se ao tipo do item; não são códigos da EFD). */
export const MARCADORES_ITEM = ['USO_CONSUMO_PESSOAL', 'CREDITO_ESTOQUE', 'IMOBILIZADO', 'DE_TERCEIROS', 'MANUTENCAO'] as const;
export type MarcadorItem = (typeof MARCADORES_ITEM)[number];

export type DefinicaoMarcador = {
  codigo: MarcadorItem;
  rotulo: string;
  /** Fundamento oficial; null quando o marcador é interno (sem fundamento legal). */
  fundamento: string | null;
  efeito: string;
  fonte: FonteOficial | null;
};

export const MARCADORES: readonly DefinicaoMarcador[] = [
  {
    codigo: 'USO_CONSUMO_PESSOAL', rotulo: 'Uso ou consumo pessoal', fundamento: 'LC 214/2025, art. 57 (vedação de crédito no § 5º)',
    efeito: 'Bens e serviços de uso ou consumo pessoal não dão crédito de IBS/CBS; não se consideram pessoais os utilizados preponderantemente na '
      + 'atividade econômica (art. 57, § 3º).',
    fonte: FONTE_LC214,
  },
  {
    codigo: 'CREDITO_ESTOQUE', rotulo: 'Conta para o crédito do estoque', fundamento: 'LC 214/2025, art. 381, § 1º',
    efeito: 'Crédito presumido de CBS sobre o estoque de bens materiais existente em 1º/1/2027, só para bens novos adquiridos de PJ no País ou '
      + 'importados para revenda, produção de bens destinados à venda ou prestação de serviços; não se aplica a uso ou consumo pessoal (art. 57), '
      + 'ativo imobilizado, imóveis nem produtos com alíquota zero, isenção, suspensão ou sem incidência de PIS/Cofins.',
    fonte: FONTE_LC214,
  },
  {
    codigo: 'IMOBILIZADO', rotulo: 'Imobilizado', fundamento: 'LC 214/2025, art. 47, § 7º (e art. 381, § 1º, IV, "a")',
    efeito: 'No roubo ou furto de bem do ativo imobilizado o estorno do crédito é proporcional à vida útil e às taxas de depreciação; bens do '
      + 'imobilizado não entram no crédito presumido do estoque de transição.',
    fonte: FONTE_LC214,
  },
  {
    codigo: 'DE_TERCEIROS', rotulo: 'De terceiros', fundamento: 'Guia Prático EFD-ICMS/IPI 3.2.4, registro H010, campo 07 IND_PROP = 2',
    efeito: 'Item de propriedade de terceiros em posse do informante: no inventário (H010) vai com IND_PROP 2 e COD_PART do proprietário.',
    fonte: FONTE_GUIA_EFD,
  },
  {
    codigo: 'MANUTENCAO', rotulo: 'Manutenção', fundamento: null,
    efeito: 'Marcador interno do saneamento (separa material de manutenção dentro do tipo 07); sem fundamento legal próprio.',
    fonte: null,
  },
];

/** Indicador do H010 ligado ao marcador "de terceiros". */
export const IND_PROP_DE_TERCEIROS: CodigoIndPropH010 = '2';

export type DeParaFinalidade = {
  finalidade: Finalidade;
  /** null = o tipo do item sai da natureza do item (caso de material de terceiros). */
  tipoItem: CodigoTipoItem0200 | null;
  marcadores: readonly MarcadorItem[];
  observacao?: string;
};

/** De-para da finalidade atual → tipo do item (0200) + marcador, conforme docs/saneamento-fases.md. */
export const DE_PARA_FINALIDADE_TIPO_ITEM: readonly DeParaFinalidade[] = [
  { finalidade: 'REVENDA', tipoItem: '00', marcadores: [] },
  { finalidade: 'MATERIA_PRIMA', tipoItem: '01', marcadores: [] },
  { finalidade: 'EMBALAGEM', tipoItem: '02', marcadores: [] },
  { finalidade: 'USO_CONSUMO', tipoItem: '07', marcadores: [] },
  { finalidade: 'MANUTENCAO', tipoItem: '07', marcadores: ['MANUTENCAO'] },
  { finalidade: 'IMOBILIZADO', tipoItem: '08', marcadores: ['IMOBILIZADO'] },
  {
    finalidade: 'INSUMO_PRODUCAO', tipoItem: '10', marcadores: [],
    observacao: 'Conferir caso a caso: o Guia define o tipo 06 (produto intermediário) como o que, sem se integrar ao novo produto, é consumido '
      + 'no processo de industrialização.',
  },
  {
    finalidade: 'MATERIAL_TERCEIROS', tipoItem: null, marcadores: ['DE_TERCEIROS'],
    observacao: 'O tipo do item segue a natureza do item; o fato de ser de terceiros vai no H010 (IND_PROP 2).',
  },
];

export function tipoItem0200(codigo: string): TipoItem0200 | null {
  const c = codigo.trim().padStart(2, '0');
  return TIPOS_ITEM_0200.find((t) => t.codigo === c) ?? null;
}

export function ehTipoItem0200(codigo: string): codigo is CodigoTipoItem0200 {
  return (CODIGOS_TIPO_ITEM_0200 as readonly string[]).includes(codigo);
}

export function indProp(codigo: string) {
  return IND_PROP_H010.find((i) => i.codigo === codigo.trim()) ?? null;
}

export function marcador(codigo: MarcadorItem): DefinicaoMarcador {
  return MARCADORES.find((m) => m.codigo === codigo)!;
}

export function deParaDaFinalidade(finalidade: Finalidade): DeParaFinalidade {
  return DE_PARA_FINALIDADE_TIPO_ITEM.find((d) => d.finalidade === finalidade)!;
}
