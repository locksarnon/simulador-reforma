/**
 * Dispositivos legais do crédito presumido de CBS sobre o estoque de abertura (transição 2026 → 2027).
 *
 * Fontes oficiais lidas em 27/11/2026:
 * - LC nº 214/2025, arts. 57, 381, 382 e 383 — texto compilado do Planalto
 *   (https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm) e cópia do InTAX (captura de 25/09/2026): idênticos.
 * - Decreto nº 12.955/2026, arts. 605 a 613 — Planalto
 *   (https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12955.htm) e cópia do InTAX: idênticos.
 *
 * Divergência registrada: o art. 613 do Decreto (prazo de 5 anos) remete entre parênteses ao "Art. 382 da LC 214",
 * mas o conteúdo corresponde ao art. 383 da LC 214 (o art. 382 trata da preferência na compensação). O erro está no
 * próprio texto publicado no Planalto. Este módulo cita os dois: LC 214, art. 383, e Decreto 12.955, art. 613.
 */
export const DISP = {
  caput: 'LC 214/2025, art. 381, caput; Decreto 12.955/2026, art. 605, caput',
  hipoteseCumulativo: 'LC 214/2025, art. 381, caput, I; Decreto 12.955/2026, art. 605, I',
  hipoteseMonofasicoSt: 'LC 214/2025, art. 381, caput, II; Decreto 12.955/2026, art. 605, II',
  hipoteseVedacaoParcial: 'LC 214/2025, art. 381, caput, III; Decreto 12.955/2026, art. 605, III',
  bensNovosDestinacao: 'LC 214/2025, art. 381, § 1º, I; Decreto 12.955/2026, art. 607, caput',
  aliquotaZeroIsencao: 'LC 214/2025, art. 381, § 1º, II; Decreto 12.955/2026, art. 607, § 1º',
  usoConsumoPessoal: 'LC 214/2025, art. 381, § 1º, III, c/c art. 57; Decreto 12.955/2026, art. 607, § 1º',
  imobilizado: 'LC 214/2025, art. 381, § 1º, IV, "a"; Decreto 12.955/2026, art. 607, § 1º',
  imovel: 'LC 214/2025, art. 381, § 1º, IV, "b"; Decreto 12.955/2026, art. 607, § 1º',
  ativoConcessionaria: 'LC 214/2025, art. 381, § 5º; Decreto 12.955/2026, art. 607, § 2º',
  inventario: 'LC 214/2025, art. 381, § 2º; Decreto 12.955/2026, art. 606, caput',
  composicaoEstoque: 'Decreto 12.955/2026, art. 606, § 1º',
  documentacaoIdonea: 'Decreto 12.955/2026, art. 606, § 2º',
  guardaDocumentos: 'Decreto 12.955/2026, art. 606, § 3º',
  percentualNacional: 'LC 214/2025, art. 381, § 3º, I; Decreto 12.955/2026, art. 607, § 3º, I',
  importados: 'LC 214/2025, art. 381, § 3º, II; Decreto 12.955/2026, art. 607, § 3º, II',
  prazoApropriacao: 'LC 214/2025, art. 381, § 4º, I; Decreto 12.955/2026, art. 607, § 4º, I',
  parcelas: 'LC 214/2025, art. 381, § 4º, II; Decreto 12.955/2026, art. 607, § 4º, II',
  somenteCbs: 'LC 214/2025, art. 381, § 4º, III; Decreto 12.955/2026, art. 607, § 4º, III',
  dataInventario: 'Decreto 12.955/2026, art. 608, caput e § 1º',
  inventarioUnico: 'Decreto 12.955/2026, art. 608, § 2º',
  custoAquisicaoIrpj: 'Decreto 12.955/2026, art. 609, caput e § 3º',
  segregacaoOrigem: 'Decreto 12.955/2026, art. 609, § 1º',
  acabadosEmProcesso: 'Decreto 12.955/2026, art. 609, § 2º',
  livroInventario: 'Decreto 12.955/2026, art. 610',
  estornoDevolucoes: 'Decreto 12.955/2026, art. 611',
  preferenciaCompensacao: 'LC 214/2025, art. 382; Decreto 12.955/2026, art. 612',
  prazoExtincao: 'LC 214/2025, art. 383; Decreto 12.955/2026, art. 613',
} as const;

export type ChaveDispositivo = keyof typeof DISP;

/** 9,25% sobre o valor do estoque — bens adquiridos no País (LC 214, art. 381, § 3º, I; Decreto 12.955, art. 607, § 3º, I). */
export const PERCENTUAL_NACIONAL = 0.0925;

/** Data do inventário: exclusivamente 31/12/2026 (Decreto 12.955, art. 608, caput e § 1º). */
export const DATA_INVENTARIO = '2026-12-31';

/** Prazo para apurar e apropriar: último dia de junho de 2027 (LC 214, art. 381, § 4º, I). */
export const ULTIMO_MES_APROPRIACAO = '2027-06';

/** Utilização em 12 parcelas mensais iguais e sucessivas (LC 214, art. 381, § 4º, II). */
export const NUMERO_PARCELAS = 12;

/** Prazo de extinção do direito de utilização: 5 anos (LC 214, art. 383; Decreto 12.955, art. 613). */
export const ANOS_EXTINCAO = 5;

/**
 * Leis da incidência monofásica / substituição tributária listadas no art. 381, II (alíneas "a" a "e").
 * Só o dispositivo é citado: o alcance de produtos de cada lei NÃO foi lido nesta tarefa e deve ser conferido
 * no texto da própria lei antes de marcar o item.
 */
export const LEIS_MONOFASICO_ST = {
  LEI_10147_ART1_I: 'Lei 10.147/2000, art. 1º, I (LC 214, art. 381, II, "a")',
  LEI_10485_ART1_ART3_II_ART5: 'Lei 10.485/2002, art. 1º, caput, art. 3º, II, e art. 5º, caput (LC 214, art. 381, II, "b")',
  MP_2158_ART43: 'MP 2.158-35/2001, art. 43 (LC 214, art. 381, II, "c")',
  LEI_9532_ART53: 'Lei 9.532/1997, art. 53 (LC 214, art. 381, II, "d")',
  LEI_12402_ART6_II: 'Lei 12.402/2011, art. 6º, II (LC 214, art. 381, II, "e")',
} as const;

export type LeiMonofasicoSt = keyof typeof LEIS_MONOFASICO_ST;
