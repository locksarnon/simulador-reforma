/**
 * Datas da Agenda da Reforma, cada uma com a fonte oficial: instrumento, dispositivo, data do ato, endereço e o trecho
 * literal de onde a data foi lida.
 *
 * - Fonte que está na Base legal (norma + caminho): o trecho é conferido, palavra por palavra, contra o texto carregado
 *   quando a semente é gravada. Se o trecho não consta, o marco é gravado como "não confirmado".
 * - Fonte fora da Base legal (atos do CGSN, da RFB e do CGIBS): o trecho foi lido no texto oficial indicado em `lida_em`.
 * - Só entra como confirmada a data lida em texto oficial vigente; o resto leva `confirmado: false` e a observação
 *   "não confirmado em fonte oficial".
 */
import { FONTES_NORMAS } from '../base-legal/fontes';
import { Categoria, Regime, TipoMarco } from './agenda.regras';

export type FonteInicial = {
  instrumento: string;
  dispositivo: string;
  /** Data do ato (AAAA-MM-DD). */
  data: string;
  url: string;
  trecho: string;
  /** Ligação com a Base legal do InTAX (chave da norma e caminho do dispositivo). */
  norma_chave?: string;
  caminho?: string;
};

export type MarcoInicial = {
  chave: string;
  titulo: string;
  descricao: string;
  categoria: Categoria;
  tipo: TipoMarco;
  /** AAAA-MM-DD: início da vigência ou do período, ou o prazo, quando não há `data_fim`. */
  data: string;
  data_fim?: string;
  regimes?: Regime[];
  ufs?: string[];
  fontes: FonteInicial[];
  confirmado: boolean;
  /** Dia em que a fonte fora da Base legal foi lida (AAAA-MM-DD). */
  lida_em?: string;
  observacao?: string;
};

const urlDaNorma = (chave: string) => {
  const f = FONTES_NORMAS.find((x) => x.chave === chave);
  if (!f) throw new Error(`Norma "${chave}" não está no manifesto da Base legal`);
  return f.url_oficial;
};

type Ato = { instrumento: string; data: string };

const LC214: Ato = { instrumento: 'Lei Complementar nº 214, de 16 de janeiro de 2025', data: '2025-01-16' };
const DEC12955: Ato = { instrumento: 'Decreto nº 12.955, de 29 de abril de 2026 (Regulamento da CBS)', data: '2026-04-29' };
const DEC12955_RURAL: Ato = { instrumento: 'Decreto nº 12.955, de 29 de abril de 2026 (Regulamento da CBS), com redação do Decreto nº 13.075, de 2026', data: '2026-04-29' };
const ADCT: Ato = { instrumento: 'Constituição Federal, Ato das Disposições Constitucionais Transitórias (Emenda Constitucional nº 132, de 20 de dezembro de 2023)', data: '2023-12-20' };

/** Fonte que está na Base legal: a URL é a da própria norma e o trecho é conferido contra o texto carregado. */
const daBase = (ato: Ato, norma: string, caminho: string, dispositivo: string, trecho: string): FonteInicial => ({
  instrumento: ato.instrumento, dispositivo, data: ato.data, url: urlDaNorma(norma), trecho, norma_chave: norma, caminho,
});

const CGSN194_URL = 'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/153801';
const CGSN194: Ato = { instrumento: 'Resolução CGSN nº 194, de 25 de setembro de 2026 (DOU de 28/09/2026, seção 1-C, p. 8), que altera a Resolução CGSN nº 186, de 9 de abril de 2026', data: '2026-09-25' };
const cgsn194 = (dispositivo: string, trecho: string): FonteInicial => ({ instrumento: CGSN194.instrumento, dispositivo, data: CGSN194.data, url: CGSN194_URL, trecho });

const MANUAL_CGSN: FonteInicial = {
  instrumento: 'Manual da Opção pelo Regime Regular do IBS e da CBS no Simples Nacional (Secretaria-Executiva do CGSN, publicado em 01/09/2026, versão de 07/10/2026)',
  dispositivo: 'item 1',
  data: '2026-10-07',
  url: 'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/Manual%20op%C3%A7%C3%A3o%20regime%20regular%20IBS%20e%20CBS%20no%20Simples%20Nacional.pdf',
  trecho: 'A opção pelo regime de apuração do IBS e da CBS estará disponível nos meses de setembro e março de cada ano.',
};

const ATO4_URL = 'https://www.cgibs.gov.br/upload/arquivos/202607/31091735-20260730-16h30-ato-conjunto-rfb-cgibs-na-c2-ba-4-260731-090909.pdf';
const ATO4_INSTRUMENTO = 'Ato Conjunto RFB/CGIBS nº 4, de 30 de julho de 2026 (DOU de 31/07/2026)';
const ato4 = (dispositivo: string, trecho: string): FonteInicial => ({ instrumento: ATO4_INSTRUMENTO, dispositivo, data: '2026-07-30', url: ATO4_URL, trecho });
const SEM_ALTERACAO_DO_ATO4 = 'Em consulta de 10/11/2026 não foi localizado ato posterior que altere este cronograma.';

const ato5 = (dispositivo: string, trecho: string): FonteInicial => ({
  instrumento: 'Ato Conjunto RFB/CGIBS nº 5, de 12 de agosto de 2026 (DOU de 13/08/2026, seção 1-A, p. 2)',
  dispositivo, data: '2026-08-12', url: 'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/152862', trecho,
});

const NAO_CONFIRMADO_MES = 'A lei indica o mês, não o dia: não confirmado em fonte oficial.';

/** Regimes do cadastro a que se aplicam as alíquotas de teste de 2026 (a lei exclui os optantes pelo Simples). */
const NAO_SIMPLES: Regime[] = ['Lucro Real', 'Lucro Presumido', 'Produtor rural PF'];
/** Pessoas jurídicas fora do Simples: a pessoa física e o produtor rural pessoa física têm prazo próprio (Decreto 12.955, arts. 105 e 115). */
const PJ_NAO_SIMPLES: Regime[] = ['Lucro Real', 'Lucro Presumido'];

export const MARCOS_INICIAIS: MarcoInicial[] = [
  // ───────────────────────── Transição ─────────────────────────
  {
    chave: 'teste-2026',
    titulo: 'Ano de teste do IBS e da CBS (2026)',
    descricao: 'Em 2026 o IBS é cobrado à alíquota estadual de 0,1% e a CBS à alíquota de 0,9%. O montante recolhido é compensado com o valor devido, no mesmo período de apuração, das contribuições do art. 195, I, “b”, e IV, e da contribuição para o PIS do art. 239 da Constituição (Cofins e PIS). Fica dispensado o recolhimento do IBS e da CBS dos sujeitos passivos que cumprirem as obrigações acessórias previstas na legislação. As alíquotas de teste não se aplicam às operações dos optantes pelo Simples Nacional.',
    categoria: 'Transição', tipo: 'marco', data: '2026-01-01', data_fim: '2026-12-31', regimes: NAO_SIMPLES,
    fontes: [
      daBase(LC214, 'lcp-214-2025', 'art-343', 'art. 343', 'ocorridos de 1º de janeiro a 31 de dezembro de 2026, o IBS será cobrado mediante aplicação da alíquota estadual de 0,1% (um décimo por cento)'),
      daBase(LC214, 'lcp-214-2025', 'art-346', 'art. 346', 'ocorridos de 1º de janeiro a 31 de dezembro de 2026, a CBS será cobrada mediante aplicação da alíquota de 0,9% (nove décimos por cento)'),
      daBase(LC214, 'lcp-214-2025', 'art-348', 'art. 348, I', 'o montante recolhido do IBS e da CBS será compensado com o valor devido, no mesmo período de apuração, das contribuições previstas no art. 195, inciso I, alínea “b”, e inciso IV'),
      daBase(LC214, 'lcp-214-2025', 'art-348', 'art. 348, § 1º', 'Fica dispensado o recolhimento do IBS e da CBS relativo aos fatos geradores ocorridos no período indicado no caput em relação aos sujeitos passivos que cumprirem as obrigações acessórias previstas na legislação'),
      daBase(LC214, 'lcp-214-2025', 'art-348', 'art. 348, III, “c”', 'não serão aplicadas em relação às operações dos contribuintes optantes pelo Simples Nacional'),
    ],
    confirmado: true,
  },
  {
    chave: 'cbs-inicio-2027',
    titulo: 'Início da CBS e fim do PIS e da Cofins (2027)',
    descricao: 'A partir de 2027 são cobrados a contribuição do art. 195, V, da Constituição (a CBS) e o imposto do art. 153, VIII (Imposto Seletivo); são extintas as contribuições do art. 195, I, “b”, e IV, e a contribuição para o PIS do art. 239, desde que instituída a CBS; e o IPI tem as alíquotas reduzidas a zero, exceto para os produtos com industrialização incentivada na Zona Franca de Manaus.',
    categoria: 'Transição', tipo: 'marco', data: '2027-01-01',
    fontes: [
      daBase(ADCT, 'cf-1988', 'adct-art-126', 'ADCT, art. 126', 'A partir de 2027:'),
      daBase(ADCT, 'cf-1988', 'adct-art-126', 'ADCT, art. 126, II', 'serão extintas as contribuições previstas no art. 195, I,'),
      daBase(ADCT, 'cf-1988', 'adct-art-126', 'ADCT, art. 126, III, “a”', 'terá suas alíquotas reduzidas a zero, exceto em relação aos produtos que tenham industrialização incentivada na Zona Franca de Manaus'),
    ],
    confirmado: true,
  },
  {
    chave: 'aliquotas-2027-2028',
    titulo: 'Alíquotas de IBS e CBS em 2027 e 2028',
    descricao: 'De 1º de janeiro de 2027 a 31 de dezembro de 2028 o IBS é cobrado à alíquota estadual de 0,05% e à alíquota municipal de 0,05%, e a CBS à alíquota fixada nos termos do art. 14 da LC 214, reduzida em 0,1 ponto percentual.',
    categoria: 'Transição', tipo: 'marco', data: '2027-01-01', data_fim: '2028-12-31',
    fontes: [
      daBase(LC214, 'lcp-214-2025', 'art-344', 'art. 344', 'de 1º de janeiro de 2027 a 31 de dezembro de 2028, o IBS será cobrado à alíquota estadual de 0,05% (cinco centésimos por cento) e à alíquota municipal de 0,05% (cinco centésimos por cento)'),
      daBase(LC214, 'lcp-214-2025', 'art-347', 'art. 347', 'de 1º de janeiro de 2027 a 31 de dezembro de 2028, a alíquota da CBS será aquela fixada nos termos do inciso I do caput e dos §§ 2º e 3º, todos do art. 14, reduzida em 0,1 (um décimo) ponto percentual'),
    ],
    confirmado: true,
  },
  {
    chave: 'icms-iss-reducao-2029',
    titulo: 'Redução gradual do ICMS e do ISS (2029 a 2032)',
    descricao: 'De 2029 a 2032 as alíquotas do ICMS e do ISS são fixadas em 9/10 (2029), 8/10 (2030), 7/10 (2031) e 6/10 (2032) das alíquotas fixadas nas respectivas legislações.',
    categoria: 'Transição', tipo: 'marco', data: '2029-01-01', data_fim: '2032-12-31',
    fontes: [
      daBase(ADCT, 'cf-1988', 'adct-art-128', 'ADCT, art. 128', 'De 2029 a 2032, as alíquotas dos impostos previstos nos arts. 155, II, e 156, III, da Constituição Federal, serão fixadas nas seguintes proporções das alíquotas fixadas nas respectivas legislações'),
    ],
    confirmado: true,
  },
  {
    chave: 'icms-iss-extincao-2033',
    titulo: 'Extinção do ICMS e do ISS (2033)',
    descricao: 'A partir de 2033 ficam extintos os impostos dos arts. 155, II (ICMS), e 156, III (ISS), da Constituição.',
    categoria: 'Transição', tipo: 'marco', data: '2033-01-01',
    fontes: [
      daBase(ADCT, 'cf-1988', 'adct-art-129', 'ADCT, art. 129', 'Ficam extintos, a partir de 2033, os impostos previstos nos arts. 155, II, e 156, III, da Constituição Federal'),
    ],
    confirmado: true,
  },

  // ───────────────────────── Alíquotas de referência (ciclo anual do TCU e do Senado) ─────────────────────────
  ...[2026, 2027].flatMap((ano): MarcoInicial[] => {
    const vigencia = ano + 1;
    const observacao = 'O ciclo se repete todos os anos, até o de 2032, que fixa as alíquotas de 2033.';
    return [
      {
        chave: `tcu-calculos-${ano}`,
        titulo: `Prazo do TCU para enviar ao Senado os cálculos das alíquotas de ${vigencia}`,
        descricao: `O Tribunal de Contas da União envia ao Senado Federal, até 15 de setembro do ano anterior ao da vigência, os cálculos das alíquotas de referência e do redutor das compras governamentais. Aqui, os cálculos para vigorar em ${vigencia}.`,
        categoria: 'Alíquotas de referência' as Categoria, tipo: 'prazo' as TipoMarco, data: `${ano}-09-15`,
        fontes: [daBase(LC214, 'lcp-214-2025', 'art-349', 'art. 349, § 1º, I', 'o Tribunal de Contas da União enviará ao Senado Federal os cálculos a que se refere este parágrafo até o dia 15 de setembro do ano anterior ao de vigência das alíquotas de referência e do redutor')],
        confirmado: true, observacao,
      },
      {
        chave: `senado-aliquotas-${ano}`,
        titulo: `Prazo do Senado para fixar as alíquotas de referência de ${vigencia}`,
        descricao: `O Senado Federal fixa as alíquotas de referência e o redutor até 31 de outubro do ano anterior ao da vigência, com base nos cálculos do TCU. Aqui, as alíquotas para vigorar em ${vigencia}.`,
        categoria: 'Alíquotas de referência' as Categoria, tipo: 'prazo' as TipoMarco, data: `${ano}-10-31`,
        fontes: [daBase(LC214, 'lcp-214-2025', 'art-349', 'art. 349, § 1º, II', 'o Senado Federal fixará as alíquotas de referência e o redutor até o dia 31 de outubro do ano anterior ao de sua vigência')],
        confirmado: true, observacao,
      },
      {
        chave: `senado-limite-${ano}`,
        titulo: `Limite de 22 de dezembro: sem resolução do Senado, valem os cálculos do TCU (${vigencia})`,
        descricao: `Se o prazo do Senado passar de 22 de dezembro do ano anterior ao da vigência, enquanto o Senado não fixar as alíquotas ou a sua vigência são utilizadas as alíquotas de referência calculadas pelo TCU. Aqui, para ${vigencia}.`,
        categoria: 'Alíquotas de referência' as Categoria, tipo: 'prazo' as TipoMarco, data: `${ano}-12-22`,
        fontes: [daBase(LC214, 'lcp-214-2025', 'art-349', 'art. 349, § 2º', 'Caso o prazo previsto no inciso II do § 1º ultrapasse a data de 22 de dezembro do ano anterior ao de sua vigência, enquanto não ocorrer a fixação das alíquotas pelo Senado Federal ou sua vigência serão utilizadas as alíquotas de referência calculadas pelo Tribunal de Contas da União')],
        confirmado: true, observacao,
      },
    ];
  }),

  // ───────────────────────── Crédito presumido do estoque ─────────────────────────
  {
    chave: 'estoque-inventario-2026',
    titulo: 'Inventário do estoque de abertura em 31/12/2026',
    descricao: 'O inventário do estoque existente em 1º de janeiro de 2027, base do crédito presumido de CBS sobre o estoque, é de responsabilidade do contribuinte e deve ser realizado em 31 de dezembro de 2026: o dia 1º de janeiro de 2027 fica excluído da contagem do inventário. Vale para quem estiver sujeito ao regime regular da CBS.',
    categoria: 'Crédito presumido do estoque', tipo: 'prazo', data: '2026-12-31',
    fontes: [
      daBase(DEC12955, 'dec-12955-2026', 'art-608', 'art. 608, caput', 'É de responsabilidade do contribuinte a realização do inventário em 31 de dezembro de 2026'),
      daBase(DEC12955, 'dec-12955-2026', 'art-608', 'art. 608, § 1º', 'devendo este ser realizado exclusivamente em 31 de dezembro de 2026'),
      daBase(LC214, 'lcp-214-2025', 'art-381', 'art. 381, caput', 'poderá apropriar crédito presumido sobre o estoque de bens materiais existente em 1º de janeiro de 2027'),
    ],
    confirmado: true,
  },
  {
    chave: 'estoque-apropriacao-2027',
    titulo: 'Prazo para apurar e apropriar o crédito presumido do estoque (30/06/2027)',
    descricao: 'O crédito presumido sobre o estoque deve ser apurado e apropriado até o último dia de junho de 2027, utilizado em 12 parcelas mensais iguais e sucessivas a partir do período subsequente ao da apropriação e somente para compensar a CBS (vedada a compensação com outros tributos e o ressarcimento). O direito de utilização se extingue após 5 anos, contados do último dia do período de apuração da apropriação.',
    categoria: 'Crédito presumido do estoque', tipo: 'prazo', data: '2027-06-30',
    fontes: [
      daBase(LC214, 'lcp-214-2025', 'art-381', 'art. 381, § 4º, I', 'deverá ser apurado e apropriado até o último dia de junho de 2027'),
      daBase(LC214, 'lcp-214-2025', 'art-383', 'art. 383', 'extinguir-se-á após o prazo de 5 (cinco) anos, contado do último dia do período de apuração em que tiver ocorrido a apropriação do crédito'),
    ],
    confirmado: true,
  },

  // ───────────────────────── Produtor rural e créditos presumidos ─────────────────────────
  {
    chave: 'produtor-rural-contribuinte-2026',
    titulo: 'Produtor rural com receita de R$ 3,6 milhões ou mais em 2024 é contribuinte desde 2026',
    descricao: 'O produtor rural que tenha auferido receita igual ou superior a R$ 3.600.000,00 no ano-calendário de 2024 é considerado contribuinte a partir de 1º de janeiro de 2026, independentemente de qualquer providência.',
    categoria: 'Produtor rural', tipo: 'marco', data: '2026-01-01',
    fontes: [
      daBase(DEC12955, 'dec-12955-2026', 'art-243', 'art. 243', 'será considerado contribuinte a partir de 1º de janeiro de 2026, independentemente de qualquer providência'),
      daBase(LC214, 'lcp-214-2025', 'art-165', 'art. 165, § 3º', 'será considerado contribuinte a partir do início da produção de efeitos desta Lei Complementar, independentemente de qualquer providência'),
    ],
    confirmado: true,
  },
  {
    chave: 'produtor-rural-pf-cnpj-2027',
    titulo: 'Inscrição no CNPJ do produtor rural pessoa física (a partir de 2027)',
    descricao: 'A obrigatoriedade de inscrição no CNPJ produz efeitos a partir de 1º de janeiro de 2027 para a pessoa física na condição de contribuinte ou de responsável tributário e para o produtor rural pessoa física de que trata o art. 239, caput, incisos I e II, do Regulamento da CBS.',
    categoria: 'Produtor rural', tipo: 'marco', data: '2027-01-01', regimes: ['Produtor rural PF'],
    fontes: [daBase(DEC12955_RURAL, 'dec-12955-2026', 'art-105', 'art. 105, § 4º-A', 'A obrigatoriedade de inscrição no CNPJ de que trata este artigo produz efeitos a partir de 1º de janeiro de 2027')],
    confirmado: true,
  },
  {
    chave: 'produtor-rural-pf-doc-fiscal-2027',
    titulo: 'Documento fiscal do produtor rural pessoa física (a partir de 2027)',
    descricao: 'A obrigatoriedade de emissão de documentos fiscais produz efeitos a partir de 1º de janeiro de 2027 para a pessoa física na condição de contribuinte ou de responsável tributário e para o produtor rural pessoa física de que trata o art. 239, caput, incisos I e II, do Regulamento da CBS.',
    categoria: 'Produtor rural', tipo: 'marco', data: '2027-01-01', regimes: ['Produtor rural PF'],
    fontes: [daBase(DEC12955_RURAL, 'dec-12955-2026', 'art-115', 'art. 115, § 3º', 'A obrigatoriedade de emissão de documentos fiscais de que trata este artigo produz efeitos a partir de 1º de janeiro de 2027')],
    confirmado: true,
  },
  {
    chave: 'creditos-presumidos-2027',
    titulo: 'Início dos créditos presumidos das compras de produtor rural, transportador autônomo, resíduos e bem usado (2027)',
    descricao: 'Os arts. 168 a 171 da LC 214 (créditos presumidos de IBS e de CBS nas aquisições de produtor rural não contribuinte, de transportador autônomo de carga, de resíduos sólidos de coletores incentivados e de bem móvel usado de pessoa física, para revenda) produzem efeitos a partir de 1º de janeiro de 2027.',
    categoria: 'Produtor rural', tipo: 'marco', data: '2027-01-01',
    fontes: [daBase(LC214, 'lcp-214-2025', 'art-544', 'art. 544, III', 'a partir de 1º de janeiro de 2027, em relação aos arts. 168 a 171')],
    confirmado: true,
  },
  ...[2026, 2027].map((ano): MarcoInicial => ({
    chave: `percentuais-credito-presumido-${ano}`,
    titulo: `Percentuais do crédito presumido do produtor rural e do transportador autônomo para ${ano + 1}`,
    descricao: `Os percentuais são definidos e divulgados anualmente até o mês de setembro, por ato conjunto do Ministro de Estado da Fazenda e do Comitê Gestor do IBS, e entram em vigor a partir de 1º de janeiro do ano seguinte. Aqui, o ato para vigorar em ${ano + 1}.`,
    categoria: 'Produtor rural', tipo: 'prazo', data: `${ano}-09-01`, data_fim: `${ano}-09-30`,
    fontes: [
      daBase(LC214, 'lcp-214-2025', 'art-168', 'art. 168, § 4º', 'Os percentuais serão definidos e divulgados anualmente até o mês de setembro, por ato conjunto do Ministro de Estado da Fazenda e do Comitê Gestor do IBS'),
      daBase(LC214, 'lcp-214-2025', 'art-169', 'art. 169, § 4º', 'Os percentuais serão definidos e divulgados anualmente até o mês de setembro, por ato conjunto do Ministro de Estado da Fazenda e do Comitê Gestor do IBS'),
    ],
    confirmado: false,
    observacao: ano === 2026
      ? 'A lei fixa o mês (setembro), não o dia. O ato conjunto com os percentuais de 2027 não foi localizado em fonte oficial em 10/11/2026: não confirmado em fonte oficial.'
      : NAO_CONFIRMADO_MES,
  })),

  // ───────────────────────── Simples Nacional ─────────────────────────
  {
    chave: 'simples-opcao-2027',
    titulo: 'Opção pelo Simples Nacional para 2027',
    descricao: 'A opção pelo Simples Nacional para o ano-calendário de 2027, formalizada no Portal do Simples Nacional, é exercida do dia 1º de setembro de 2026 ao dia 15 de outubro de 2026 e produz efeitos a partir de 1º de janeiro de 2027. Se for indeferida, as pendências impeditivas ao ingresso podem ser regularizadas até 30 de outubro de 2026.',
    categoria: 'Simples Nacional', tipo: 'prazo', data: '2026-09-01', data_fim: '2026-10-15',
    fontes: [
      cgsn194('art. 1º (nova redação do art. 1º da Resolução CGSN nº 186/2026)', 'deverá ser exercida no período do dia 01 de setembro de 2026 ao dia 15 de outubro de 2026 e produzirá efeitos a partir de 1º de janeiro de 2027'),
      cgsn194('art. 1º (nova redação do art. 1º, § 1º, II, da Resolução CGSN nº 186/2026)', 'as pendências impeditivas ao ingresso no Simples Nacional poderão ser regularizadas até o dia 30 de outubro de 2026'),
    ],
    confirmado: true, lida_em: '2026-11-10',
  },
  {
    chave: 'simples-regime-regular-2027',
    titulo: 'Opção pelo regime regular do IBS e da CBS no Simples Nacional (janeiro a junho de 2027)',
    descricao: 'Para o período de janeiro a junho de 2027, a opção de apurar e recolher o IBS e a CBS pelo regime regular, fora do Simples Nacional, é exercida no Portal do Simples Nacional do dia 1º de setembro de 2026 ao dia 30 de outubro de 2026 e produz efeitos a partir de 1º de janeiro de 2027; as parcelas de IBS e CBS deixam de ser devidas pelo Simples.',
    categoria: 'Simples Nacional', tipo: 'prazo', data: '2026-09-01', data_fim: '2026-10-30', regimes: ['Simples Nacional'],
    fontes: [cgsn194('art. 2º (nova redação do art. 2º da Resolução CGSN nº 186/2026)', 'no período do dia 01 de setembro de 2026 ao dia 30 de outubro de 2026 e produzirá efeitos a partir de 1º de janeiro de 2027, hipótese em que as parcelas a eles relativas não serão devidas pelo regime do Simples Nacional')],
    confirmado: true, lida_em: '2026-11-10',
  },
  {
    chave: 'simples-cancelamento-opcao-2027',
    titulo: 'Cancelamento, em caráter irretratável, da opção pelo Simples Nacional para 2027',
    descricao: 'A opção pelo Simples Nacional para 2027 pode ser cancelada pelo solicitante, em caráter irretratável, do dia 3 de novembro de 2026 ao dia 20 de dezembro de 2026.',
    categoria: 'Simples Nacional', tipo: 'prazo', data: '2026-11-03', data_fim: '2026-12-20',
    fontes: [cgsn194('art. 1º (nova redação do art. 1º, § 1º, I, da Resolução CGSN nº 186/2026)', 'poderá ser cancelada pelo solicitante em caráter irretratável no período do dia 03 de novembro de 2026 ao dia 20 de dezembro de 2026')],
    confirmado: true, lida_em: '2026-11-10',
  },
  {
    chave: 'simples-cancelamento-regime-regular-2027',
    titulo: 'Cancelamento, em caráter irretratável, da opção pelo regime regular do IBS e da CBS (janeiro a junho de 2027)',
    descricao: 'A opção pelo regime regular do IBS e da CBS para o período de janeiro a junho de 2027 pode ser cancelada pelo solicitante, em caráter irretratável, do dia 3 de novembro de 2026 ao dia 20 de dezembro de 2026.',
    categoria: 'Simples Nacional', tipo: 'prazo', data: '2026-11-03', data_fim: '2026-12-20', regimes: ['Simples Nacional'],
    fontes: [cgsn194('art. 2º, parágrafo único (nova redação da Resolução CGSN nº 186/2026)', 'A opção de que trata o caput poderá ser cancelada pelo solicitante em caráter irretratável no período do dia 03 de novembro de 2026 ao dia 20 de dezembro de 2026')],
    confirmado: true, lida_em: '2026-11-10',
  },
  ...([
    { chave: 'simples-regime-regular-marco-2027', mes: '2027-03', fim: '2027-03-31', mesTexto: 'março de 2027', semestre: 'julho de 2027' },
    { chave: 'simples-regime-regular-setembro-2027', mes: '2027-09', fim: '2027-09-30', mesTexto: 'setembro de 2027', semestre: 'janeiro de 2028' },
  ].map((j): MarcoInicial => ({
    chave: j.chave,
    titulo: `Opção pelo regime regular do IBS e da CBS no Simples Nacional para o semestre iniciado em ${j.semestre}`,
    descricao: `A opção é exercida para os semestres iniciados em janeiro e julho de cada ano, é irretratável para cada período e deve ser exercida nos meses de setembro e março imediatamente anteriores a cada semestre, na forma regulamentada pelo CGSN. Para o semestre que começa em ${j.semestre}, o mês é ${j.mesTexto}.`,
    categoria: 'Simples Nacional', tipo: 'prazo', data: `${j.mes}-01`, data_fim: j.fim, regimes: ['Simples Nacional'],
    fontes: [
      daBase(LC214, 'lcp-214-2025', 'art-517', 'art. 517 (dá nova redação ao art. 13, § 10, da LC 123/2006)', 'A opção a que se refere o § 9º será exercida para os semestres iniciados em janeiro e julho de cada ano, sendo irretratável para cada um desses períodos, devendo ser exercida nos meses de setembro e março imediatamente anteriores a cada semestre, na forma regulamentada pelo CGSN'),
      MANUAL_CGSN,
    ],
    confirmado: false, lida_em: '2026-11-10',
    observacao: 'A lei e o manual do CGSN indicam os meses (março e setembro); o ato do CGSN com os dias exatos dessa janela e a data de efeito não foi localizado: não confirmado em fonte oficial.',
  }))),

  // ───────────────────────── Documentos fiscais (Ato Conjunto RFB/CGIBS nº 4/2026) ─────────────────────────
  {
    chave: 'nfe-nfce-ibs-cbs-2026-08-03',
    titulo: 'NF-e e NFC-e com IBS e CBS: obrigatoriedade a partir de 03/08/2026',
    descricao: 'A obrigatoriedade de emissão dos documentos fiscais eletrônicos de que trata o art. 112 dos regulamentos do IBS e da CBS inicia-se, para a NF-e (modelo 55) e a NFC-e (modelo 65), em relação aos fatos geradores a partir de 3 de agosto de 2026. Para os optantes pelo Simples Nacional, a obrigatoriedade inicia-se em 1º de janeiro de 2027.',
    categoria: 'Documentos fiscais', tipo: 'marco', data: '2026-08-03', regimes: PJ_NAO_SIMPLES,
    fontes: [
      ato4('art. 1º, I', 'I - Nota Fiscal Eletrônica - NF-e, modelo 55: 3 de agosto de 2026'),
      ato4('art. 1º, II', 'II - Nota Fiscal de Consumidor Eletrônica - NFC-e, modelo 65: 3 de agosto de 2026'),
    ],
    confirmado: true, lida_em: '2026-11-10', observacao: SEM_ALTERACAO_DO_ATO4,
  },
  {
    chave: 'cte-mdfe-ibs-cbs-2026-08-03',
    titulo: 'CT-e, CT-e OS e MDF-e com IBS e CBS: obrigatoriedade a partir de 03/08/2026',
    descricao: 'A obrigatoriedade de emissão do CT-e (modelo 57), do CT-e OS (modelo 67) e do MDF-e (modelo 58) com IBS e CBS inicia-se em relação aos fatos geradores a partir de 3 de agosto de 2026. Para os optantes pelo Simples Nacional, a obrigatoriedade inicia-se em 1º de janeiro de 2027.',
    categoria: 'Documentos fiscais', tipo: 'marco', data: '2026-08-03', regimes: ['Lucro Real', 'Lucro Presumido'],
    fontes: [
      ato4('art. 1º, IV', 'IV - Conhecimento de Transporte Eletrônico - CT-e, modelo 57: 3 de agosto de 2026'),
      ato4('art. 1º, V', 'V - Conhecimento de Transporte Eletrônico Para Outros Serviços - CT-e OS, modelo 67: 3 de agosto de 2026'),
      ato4('art. 1º, VII', 'VII - Manifesto Eletrônico de Documentos Fiscais - MDF-e, modelo 58: 3 de agosto de 2026'),
    ],
    confirmado: true, lida_em: '2026-11-10', observacao: SEM_ALTERACAO_DO_ATO4,
  },
  {
    chave: 'nfse-ibs-cbs-2026-10-01',
    titulo: 'NFS-e com IBS e CBS: serviços sujeitos ao ISS, a partir de 01/10/2026',
    descricao: 'A obrigatoriedade de emissão da NFS-e com IBS e CBS inicia-se em 1º de outubro de 2026 nos fornecimentos de serviços também sujeitos ao ISS, enquadrados na lista de serviços da LC 116 e não incluídos nas hipóteses que começam em 1º de dezembro de 2026. Para os optantes pelo Simples Nacional, a obrigatoriedade inicia-se em 1º de janeiro de 2027.',
    categoria: 'Documentos fiscais', tipo: 'marco', data: '2026-10-01', regimes: PJ_NAO_SIMPLES,
    fontes: [ato4('art. 1º, III, “d”', 'não incluídos nas alíneas “a”, “b” e “c”: 1º de outubro de 2026')],
    confirmado: true, lida_em: '2026-11-10', observacao: SEM_ALTERACAO_DO_ATO4,
  },
  {
    chave: 'nfse-ibs-cbs-2026-12-01',
    titulo: 'NFS-e com IBS e CBS: plataformas digitais, locações, bens imateriais e demais hipóteses, a partir de 01/12/2026',
    descricao: 'A obrigatoriedade de emissão da NFS-e com IBS e CBS inicia-se em 1º de dezembro de 2026 nos serviços das plataformas digitais, nos subitens 1.03, 1.05, 1.09 e 16.01 da lista da LC 116, nos bens imateriais não sujeitos ao ICMS, nas taxas e valores condominiais, nas locações, cessões onerosas e arrendamentos de bens móveis e imóveis e nos demais fornecimentos não enquadrados nas outras alíneas. Para os optantes pelo Simples Nacional, inicia-se em 1º de janeiro de 2027.',
    categoria: 'Documentos fiscais', tipo: 'marco', data: '2026-12-01', regimes: PJ_NAO_SIMPLES,
    fontes: [
      ato4('art. 1º, III, “a”', 'a) nos fornecimentos de serviços promovidos pelas plataformas digitais de que trata o § 1º do art. 22 da Lei Complementar nº 214, de 16 de janeiro de 2025, bem como nos serviços por elas intermediados nas hipóteses previstas nos §§ 12 a 14 do referido artigo: 1º de dezembro de 2026'),
      ato4('art. 1º, III, “b”', 'b) nos fornecimentos de serviços também sujeitos ao ISS, enquadrados nos subitens 1.03, 1.05 e 1.09 da lista de serviços anexa à Lei Complementar nº 116, de 31 de julho de 2003: 1º de dezembro de 2026'),
      ato4('art. 1º, III, “c”', 'c) nos fornecimentos de serviços também sujeitos ao ISS, enquadrados no subitem 16.01 da lista de serviços anexa à Lei Complementar nº 116, de 31 de julho de 2003: 1º de dezembro de 2026'),
      ato4('art. 1º, III, “e”', 'e não sujeitos à incidência do ICMS, ainda que abrangidos nas alíneas “d” e “e” do inciso VI do art. 150 da Constituição Federal: 1º de dezembro de 2026'),
      ato4('art. 1º, III, “f”', 'f) na cobrança de taxas e demais valores condominiais pelo condomínio edilício, bem como outras receitas do condomínio: 1º de dezembro de 2026'),
      ato4('art. 1º, III, “g”', 'g) nas locações de bens móveis e nas locações, cessões onerosas e arrendamentos de bens imóveis, ressalvados os fornecimentos referidos na alínea “d”: 1º de dezembro de 2026'),
      ato4('art. 1º, III, “h”', 'h) nos fornecimentos de serviços não enquadrados nas alíneas anteriores deste inciso: 1º de dezembro de 2026'),
    ],
    confirmado: true, lida_em: '2026-11-10', observacao: SEM_ALTERACAO_DO_ATO4,
  },
  {
    chave: 'nfe-nao-contribuinte-icms-2026-12-01',
    titulo: 'NF-e do sujeito passivo de IBS e CBS que não é contribuinte do ICMS: a partir de 01/12/2026',
    descricao: 'Para o sujeito passivo do IBS e da CBS que não é contribuinte do ICMS e realiza fornecimentos sujeitos ao IBS e à CBS, movimentações de bens materiais ou devoluções de operações, a obrigatoriedade de emissão da NF-e inicia-se em 1º de dezembro de 2026.',
    categoria: 'Documentos fiscais', tipo: 'marco', data: '2026-12-01', regimes: PJ_NAO_SIMPLES,
    fontes: [ato4('art. 1º, § 4º', 'que realizar fornecimentos sujeitos ao IBS e à CBS, movimentações de bens materiais ou devoluções de operações, iniciar-se-á em 1º de dezembro de 2026')],
    confirmado: true, lida_em: '2026-11-10', observacao: SEM_ALTERACAO_DO_ATO4,
  },
  {
    chave: 'docs-fiscais-simples-2027-01-01',
    titulo: 'Documentos fiscais eletrônicos com IBS e CBS para os optantes pelo Simples Nacional: a partir de 01/01/2027',
    descricao: 'Para os contribuintes optantes pelo Simples Nacional, a obrigatoriedade de emissão dos documentos fiscais eletrônicos com IBS e CBS inicia-se em 1º de janeiro de 2027.',
    categoria: 'Documentos fiscais', tipo: 'marco', data: '2027-01-01', regimes: ['Simples Nacional'],
    fontes: [ato4('art. 1º, § 1º', 'Para os contribuintes optantes pelo Simples Nacional, a obrigatoriedade de emissão dos documentos de que tratam os incisos do caput deste artigo iniciar-se-á em 1º de janeiro de 2027')],
    confirmado: true, lida_em: '2026-11-10', observacao: SEM_ALTERACAO_DO_ATO4,
  },
  {
    chave: 'nfe-monofasica-2027-01-01',
    titulo: 'NF-e com fornecimentos sujeitos à tributação monofásica: a partir de 01/01/2027',
    descricao: 'A obrigatoriedade de emissão da NF-e que registre fornecimentos sujeitos à tributação monofásica inicia-se em 1º de janeiro de 2027.',
    categoria: 'Documentos fiscais', tipo: 'marco', data: '2027-01-01',
    fontes: [ato4('art. 1º, § 2º', 'que registre fornecimentos sujeitos à tributação monofásica iniciar-se-á em 1º de janeiro de 2027')],
    confirmado: true, lida_em: '2026-11-10', observacao: SEM_ALTERACAO_DO_ATO4,
  },
  {
    chave: 'duimp-importacao-2027-01-01',
    titulo: 'Declaração Única de Importação (Duimp) e NF-e na importação com IBS e CBS: a partir de 01/01/2027',
    descricao: 'A obrigatoriedade da Declaração Única de Importação (Duimp) com IBS e CBS inicia-se em 1º de janeiro de 2027, e na importação de bens materiais esse prazo substitui o previsto para a NF-e.',
    categoria: 'Documentos fiscais', tipo: 'marco', data: '2027-01-01',
    fontes: [
      ato4('art. 1º, XIV', 'XIV - Declaração Única de Importação - Duimp: 1º de janeiro de 2027'),
      ato4('art. 1º, § 3º', 'Na importação de bens materiais, em substituição ao prazo previsto no inciso I do caput deste artigo, aplicar-se-á o prazo previsto no inciso XIV do caput deste artigo'),
    ],
    confirmado: true, lida_em: '2026-11-10', observacao: SEM_ALTERACAO_DO_ATO4,
  },

  {
    chave: 'pnct-retificacao-2026',
    titulo: 'Programa Nacional de Conformidade Tributária: prazo para retificar as inconsistências comunicadas (31/12/2026)',
    descricao: 'Em 2026 considera-se enquadrado no Programa Nacional de Conformidade Tributária o sujeito passivo que cumprir as obrigações acessórias do IBS e da CBS. Quem não cumpre permanece enquadrado se atender, cumulativamente, aos critérios do art. 2º, § 1º, entre eles promover, até 31 de dezembro de 2026, a retificação das inconsistências comunicadas pela administração tributária.',
    categoria: 'Documentos fiscais', tipo: 'prazo', data: '2026-12-31', regimes: PJ_NAO_SIMPLES,
    fontes: [
      ato5('art. 2º, caput', 'Considera-se enquadrado no PNCT, para o ano de 2026, ressalvada manifestação em sentido contrário, o sujeito passivo que cumprir as obrigações acessórias previstas na legislação do Imposto sobre Bens e Serviços - IBS e da Contribuição Social sobre Bens e Serviços - CBS'),
      ato5('art. 2º, § 1º, III', 'promover, até 31 de dezembro de 2026, a retificação das inconsistências comunicadas pela administração tributária'),
    ],
    confirmado: true, lida_em: '2026-11-10',
  },

  // ───────────────────────── Zona Franca de Manaus (marcos por UF) ─────────────────────────
  {
    chave: 'zfm-ipi-zero-2027',
    titulo: 'Zona Franca de Manaus: IPI com alíquota zero para os produtos do art. 454 (a partir de 2027)',
    descricao: 'A partir de 1º de janeiro de 2027 as alíquotas do IPI ficam reduzidas a zero para produtos sujeitos a alíquota inferior a 6,5% na Tipi vigente em 31 de dezembro de 2023 que tenham sido industrializados na Zona Franca de Manaus em 2024 ou tenham projeto técnico-econômico aprovado pelo Conselho de Administração da Suframa entre 1º de janeiro de 2022 e a data de publicação da LC 214. A redução não alcança os bens de tecnologia da informação e comunicação do § 2º.',
    categoria: 'Zona Franca de Manaus', tipo: 'marco', data: '2027-01-01', ufs: ['AM'],
    fontes: [daBase(LC214, 'lcp-214-2025', 'art-454', 'art. 454', 'A partir de 1º de janeiro de 2027, as alíquotas do IPI ficam reduzidas a zero para produtos sujeitos a alíquota inferior a 6,5% (seis inteiros e cinco décimos por cento) prevista na Tabela de Incidência do Imposto sobre Produtos Industrializados - Tipi vigente em 31 de dezembro de 2023')],
    confirmado: true,
  },
  {
    chave: 'zfm-credito-presumido-ibs-importacao-2027',
    titulo: 'Zona Franca de Manaus: crédito presumido de IBS na importação para revenda presencial (a partir de 2027)',
    descricao: 'O contribuinte habilitado nos termos do art. 442 e sujeito ao regime regular ou ao Simples Nacional tem crédito presumido de IBS relativo à importação de bem material para revenda presencial na Zona Franca de Manaus, calculado em 50% da alíquota do IBS aplicável na importação. O art. 444 produz efeitos a partir de 1º de janeiro de 2027.',
    categoria: 'Zona Franca de Manaus', tipo: 'marco', data: '2027-01-01', ufs: ['AM'],
    fontes: [
      daBase(LC214, 'lcp-214-2025', 'art-444', 'art. 444', 'crédito presumido de IBS relativo à importação de bem material para revenda presencial na Zona Franca de Manaus'),
      daBase(LC214, 'lcp-214-2025', 'art-544', 'art. 544, III', 'a partir de 1º de janeiro de 2027, em relação aos arts. 168 a 171, 309 a 315, 444'),
    ],
    confirmado: true,
  },
];
