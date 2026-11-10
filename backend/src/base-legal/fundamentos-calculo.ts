/**
 * Ligações entre as notas "i" do cálculo e os dispositivos da Base legal em que elas se apoiam.
 *
 * É o espelho, no servidor, das referências de `src/lib/fundamentosLegais.js` (o texto da nota e o aviso
 * de revisão ficam lá): o servidor precisa saber quais notas citam um dispositivo para devolvê-las à revisão
 * quando o texto oficial muda. Um teste do frontend (`src/lib/fundamentosLegais.test.js`) compara este arquivo
 * com o do frontend e falha se as chaves, os títulos ou as referências divergirem.
 */
export type FundamentoCalculo = {
  chave: string;
  titulo: string;
  refs: { norma: string; caminho: string }[];
};

const LC214 = 'lcp-214-2025';
const DEC12955 = 'dec-12955-2026';
const CF = 'cf-1988';

export const FUNDAMENTOS_CALCULO: FundamentoCalculo[] = [
  {
    chave: 'aliquotas_transicao',
    titulo: 'Alíquotas de IBS e CBS na transição',
    refs: [{ norma: CF, caminho: 'adct-art-125' }, { norma: CF, caminho: 'adct-art-127' }, { norma: LC214, caminho: 'art-349' }],
  },
  {
    chave: 'compras_governamentais',
    titulo: 'Redutor nas compras governamentais',
    refs: [{ norma: LC214, caminho: 'art-472' }, { norma: LC214, caminho: 'art-349' }, { norma: LC214, caminho: 'art-370' }],
  },
  {
    chave: 'imposto_seletivo',
    titulo: 'Imposto Seletivo',
    refs: [{ norma: LC214, caminho: 'art-410' }, { norma: LC214, caminho: 'art-417' }, { norma: LC214, caminho: 'art-422' }],
  },
  {
    chave: 'combustiveis',
    titulo: 'Combustíveis: alíquota específica por unidade',
    refs: [{ norma: LC214, caminho: 'art-172' }, { norma: LC214, caminho: 'art-174' }, { norma: LC214, caminho: 'art-180' }],
  },
  {
    chave: 'credito_estoque',
    titulo: 'Crédito presumido de CBS sobre o estoque',
    refs: [{ norma: LC214, caminho: 'art-381' }, { norma: DEC12955, caminho: 'art-607' }, { norma: DEC12955, caminho: 'art-609' }],
  },
  {
    chave: 'extincao_pis_cofins',
    titulo: 'Fim do PIS e da Cofins',
    refs: [{ norma: CF, caminho: 'adct-art-126' }],
  },
  {
    chave: 'icms_iss_transicao',
    titulo: 'Redução gradual do ICMS e do ISS',
    refs: [{ norma: CF, caminho: 'adct-art-128' }],
  },
  {
    chave: 'credito_ibs_cbs',
    titulo: 'Crédito de IBS e CBS nas compras',
    refs: [{ norma: LC214, caminho: 'art-47' }],
  },
  {
    chave: 'credito_presumido',
    titulo: 'Crédito presumido (compras de quem não é contribuinte)',
    refs: [
      { norma: LC214, caminho: 'art-168' }, { norma: LC214, caminho: 'art-169' },
      { norma: LC214, caminho: 'art-170' }, { norma: LC214, caminho: 'art-171' },
      { norma: DEC12955, caminho: 'art-247' }, { norma: DEC12955, caminho: 'art-253' }, { norma: DEC12955, caminho: 'art-254' },
    ],
  },
  {
    chave: 'base_calculo_ibs_cbs',
    titulo: 'Base de cálculo do IBS e da CBS',
    refs: [{ norma: LC214, caminho: 'art-12' }],
  },
  {
    chave: 'split_payment',
    titulo: 'Split payment',
    refs: [
      { norma: LC214, caminho: 'art-31' }, { norma: LC214, caminho: 'art-32' }, { norma: LC214, caminho: 'art-33' },
      { norma: LC214, caminho: 'art-34' }, { norma: LC214, caminho: 'art-35' },
    ],
  },
  {
    chave: 'local_operacao',
    titulo: 'Local da operação',
    refs: [{ norma: LC214, caminho: 'art-11' }],
  },
  {
    chave: 'produtor_rural',
    titulo: 'Produtor rural não contribuinte',
    refs: [{ norma: LC214, caminho: 'art-164' }, { norma: LC214, caminho: 'art-167' }],
  },
];
