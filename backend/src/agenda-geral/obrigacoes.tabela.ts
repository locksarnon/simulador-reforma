import type { Fonte, Obrigacao } from './obrigacoes';

/**
 * Obrigações federais principais, cada uma com a regra de prazo lida no texto oficial vigente (conferido em 11/11/2026).
 * `confirmado: false` quando a data-base é oficial mas o ajuste por dia não útil não está escrito na norma (a observação diz qual).
 */
const CGSN140 = 'https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=92278';
const IN2237 = 'https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=141910';
const f = (norma: string, dispositivo: string, url: string, trecho: string): Fonte => ({ norma, dispositivo, url, trecho });

export const OBRIGACOES_FEDERAIS: Obrigacao[] = [
  {
    id: 'das-simples', nome: 'DAS do Simples Nacional', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 20, ajuste: 'PRORROGA' }, regimes: ['Simples Nacional'],
    fonte: f('Resolução CGSN nº 140/2018', 'art. 40, caput e § 3º', CGSN140, 'deverão ser pagos até o dia 20 (vinte) do mês subsequente àquele em que houver sido auferida a receita bruta'),
    confirmado: true,
  },
  {
    id: 'pgdas-d', nome: 'PGDAS-D', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 20, ajuste: 'NENHUM' }, regimes: ['Simples Nacional'],
    fonte: f('Resolução CGSN nº 140/2018', 'art. 38, § 2º, II', CGSN140, 'até o vencimento do prazo para pagamento dos tributos devidos no âmbito do Simples Nacional em cada mês, previsto no art. 40'),
    confirmado: false, observacao: 'A data-base é oficial; a norma não diz o que acontece se o dia 20 não for útil.',
  },
  {
    id: 'defis', nome: 'DEFIS', tipo: 'DECLARACAO', periodicidade: 'ANUAL', mesesDepois: 0, mesAnual: 3, vigenteAte: '2026-12-31',
    regra: { tipo: 'DIA_FIXO', dia: 31, ajuste: 'NENHUM' }, regimes: ['Simples Nacional'],
    fonte: f('Resolução CGSN nº 140/2018', 'art. 72, § 1º', CGSN140, 'até 31 de março do ano-calendário subsequente'),
    confirmado: true, observacao: 'Revogada a partir de 01/01/2027 pela Resolução CGSN nº 190/2026 (art. 8º, XXI, e art. 9º).',
  },
  {
    id: 'socioeconomicas-pgdas', nome: 'Informações socioeconômicas no PGDAS-D (substitui a DEFIS)', tipo: 'DECLARACAO', periodicidade: 'ANUAL', mesesDepois: 0, mesAnual: 3, vigenteDesde: '2027-01-01',
    regra: { tipo: 'DIA_FIXO', dia: 31, ajuste: 'NENHUM' }, regimes: ['Simples Nacional'],
    fonte: f('Resolução CGSN nº 140/2018, com a redação da Resolução CGSN nº 190/2026', 'art. 38-B, § 1º', 'https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=152832', 'uma única vez no PGDAS-D, no período de janeiro a março de cada ano-calendário'),
    confirmado: true, observacao: 'Prazo: de janeiro a março; a data mostrada é o fim do período.',
  },
  {
    id: 'das-mei', nome: 'DAS do MEI', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 20, ajuste: 'PRORROGA' }, regimes: ['MEI'],
    fonte: f('Resolução CGSN nº 140/2018', 'art. 104, § 2º (remete ao art. 40)', CGSN140, 'O pagamento mensal deverá ser efetuado no prazo definido no art. 40'),
    confirmado: true,
  },
  {
    id: 'dasn-simei', nome: 'DASN-SIMEI', tipo: 'DECLARACAO', periodicidade: 'ANUAL', mesesDepois: 0, mesAnual: 5,
    regra: { tipo: 'DIA_FIXO', dia: 31, ajuste: 'NENHUM' }, regimes: ['MEI'],
    fonte: f('Resolução CGSN nº 140/2018', 'art. 109, caput', CGSN140, 'até o último dia de maio de cada ano'),
    confirmado: false, observacao: 'A data-base é oficial; a norma fala em "último dia" e não diz o que acontece se ele não for útil.',
  },
  {
    id: 'dctfweb', nome: 'DCTFWeb (inclui o MIT)', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'ULTIMO_DIA_UTIL' }, regimes: ['Lucro Real', 'Lucro Presumido', 'Simples Nacional', 'Produtor rural PF'],
    condicao: 'Quem tem contribuições, retenções ou tributos a declarar no mês (no Simples, só o que fica fora do DAS).',
    fonte: f('IN RFB nº 2.237/2024 (redação da IN RFB nº 2.248/2025)', 'art. 6º, caput, e art. 9º', IN2237, 'A DCTFWeb mensal deverá ser apresentada até o último dia útil do mês seguinte ao da ocorrência dos fatos geradores.'),
    confirmado: true,
  },
  {
    id: 'efd-reinf', nome: 'EFD-Reinf', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 15, ajuste: 'PRORROGA' }, regimes: 'TODOS', condicao: 'Quem tem eventos a informar no mês (retenções, receita de produção rural, CPRB…).',
    fonte: f('IN RFB nº 2.043/2021', 'art. 6º, caput e § 2º', 'https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=119859', 'até o dia 15 (quinze) do mês subsequente ao mês a que se refere a escrituração'),
    confirmado: true,
  },
  {
    id: 'previdencia', nome: 'Contribuições previdenciárias (DARF da DCTFWeb)', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 20, ajuste: 'ANTECIPA' }, regimes: 'TODOS', condicao: 'Quem tem folha, contratação de contribuinte individual ou produção rural.',
    fonte: f('Lei nº 8.212/1991', 'art. 30, I, "b", e § 2º, II', 'https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm', 'até o dia 20 (vinte) do mês subsequente ao da competência'),
    confirmado: true,
  },
  {
    id: 'fgts', nome: 'FGTS (FGTS Digital)', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 20, ajuste: 'ANTECIPA' }, regimes: 'TODOS', condicao: 'Quem tem empregados.',
    fonte: f('Lei nº 8.036/1990 (redação da Lei nº 14.438/2022)', 'art. 15, caput', 'https://www.planalto.gov.br/ccivil_03/leis/l8036consol.htm', 'até o vigésimo dia de cada mês'),
    confirmado: false, observacao: 'A data-base é da lei; a antecipação para o dia útil anterior consta do Manual de Orientação do FGTS Digital (MTE), não da lei.',
  },
  {
    id: 'pis-cofins', nome: 'PIS/Pasep e Cofins', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'DIA_FIXO', dia: 25, ajuste: 'ANTECIPA' }, regimes: ['Lucro Real', 'Lucro Presumido'],
    fonte: f('Medida Provisória nº 2.158-35/2001 (redação da Lei nº 11.933/2009)', 'art. 18, II, e parágrafo único', 'https://www.planalto.gov.br/ccivil_03/mpv/2158-35.htm', 'até o 25º (vigésimo quinto) dia do mês subsequente ao mês de ocorrência dos fatos geradores, pelas demais pessoas jurídicas'),
    confirmado: true, observacao: 'Bancos e instituições financeiras: dia 20 (inciso I). O Planalto anota "Vide LC nº 214/2025": a transição para a CBS muda este prazo.',
  },
  {
    id: 'irrf-trabalho', nome: 'IRRF sobre rendimentos do trabalho', tipo: 'PAGAMENTO', periodicidade: 'MENSAL', mesesDepois: 1,
    regra: { tipo: 'ULTIMO_DIA_UTIL_ATE', dia: 20 }, regimes: 'TODOS', condicao: 'Quem pagou salários ou outros rendimentos com retenção.',
    fonte: f('Lei nº 11.196/2005', 'art. 70, I, "e"', 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2005/lei/l11196.htm', 'até o último dia útil do segundo decêndio do mês subsequente ao mês de ocorrência dos fatos geradores'),
    confirmado: true,
  },
  {
    id: 'irpj-csll-trimestral', nome: 'IRPJ e CSLL trimestrais (quota única ou 1ª quota)', tipo: 'PAGAMENTO', periodicidade: 'TRIMESTRAL', mesesDepois: 1,
    regra: { tipo: 'ULTIMO_DIA_UTIL' }, regimes: ['Lucro Presumido', 'Lucro Real'], condicao: 'Lucro real trimestral ou presumido.',
    fonte: f('Lei nº 9.430/1996', 'art. 5º (CSLL pelo art. 28)', 'https://www.planalto.gov.br/ccivil_03/leis/l9430.htm', 'será pago em quota única, até o último dia útil do mês subseqüente ao do encerramento do período de apuração'),
    confirmado: true, observacao: 'Em quotas: as seguintes vencem no último dia útil dos dois meses seguintes (§ 1º).',
  },
  {
    id: 'efd-contribuicoes', nome: 'EFD-Contribuições', tipo: 'DECLARACAO', periodicidade: 'MENSAL', mesesDepois: 2,
    regra: { tipo: 'ENESIMO_DIA_UTIL', n: 10 }, regimes: ['Lucro Real', 'Lucro Presumido'],
    fonte: f('IN RFB nº 1.252/2012', 'art. 7º', 'https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=37466', 'até o 10º (décimo) dia útil do 2º (segundo) mês subsequente ao que se refira a escrituração'),
    confirmado: true,
  },
  {
    id: 'ecd', nome: 'ECD', tipo: 'DECLARACAO', periodicidade: 'ANUAL', mesesDepois: 0, mesAnual: 6,
    regra: { tipo: 'ULTIMO_DIA_UTIL' }, regimes: ['Lucro Real', 'Lucro Presumido'], condicao: 'Quem é obrigado à ECD pela IN RFB nº 2.003/2021 (confira a obrigatoriedade de cada empresa).',
    fonte: f('IN RFB nº 2.003/2021 (redação da IN RFB nº 2.142/2023)', 'art. 5º', 'https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=114965', 'até o último dia útil do mês de junho do ano subsequente ao ano-calendário'),
    confirmado: true,
  },
  {
    id: 'ecf', nome: 'ECF', tipo: 'DECLARACAO', periodicidade: 'ANUAL', mesesDepois: 0, mesAnual: 7,
    regra: { tipo: 'ULTIMO_DIA_UTIL' }, regimes: ['Lucro Real', 'Lucro Presumido'],
    fonte: f('IN RFB nº 2.004/2021', 'art. 3º', 'https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=114966', 'até o último dia útil do mês de julho do ano seguinte'),
    confirmado: true,
  },
];
