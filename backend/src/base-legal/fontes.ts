/**
 * Normas das bases legais (fonte oficial). `prioridade` 0 = muda cálculo/enquadramento/obrigação.
 * Só entram aqui URLs conferidas (a página abre e o leitor extrai os dispositivos). O que a fonte oficial só publica em página
 * dinâmica (Normas da RFB, Confaz) entra como `formato: 'externo'`: fica no catálogo com o link, mas sem texto por artigo.
 */
export type GrupoNorma = 'fundamentos' | 'reforma' | 'federal' | 'agro' | 'territorial' | 'operacional';

export const GRUPOS_NORMAS: { chave: GrupoNorma; rotulo: string; descricao: string }[] = [
  { chave: 'fundamentos', rotulo: 'Fundamentos', descricao: 'Constituição, CTN, processo administrativo fiscal e normas gerais de apuração.' },
  { chave: 'reforma', rotulo: 'Reforma do consumo', descricao: 'EC 132, leis complementares, regulamentos da CBS e do IBS, atos do Comitê Gestor.' },
  { chave: 'federal', rotulo: 'Tributação federal atual', descricao: 'IRPJ, CSLL, PIS/Cofins, IPI, IRPF, IOF, previdenciário, benefícios e regularização de dívida.' },
  { chave: 'agro', rotulo: 'Agro', descricao: 'Atividade rural, cooperativas, insumos, ITR e contribuições do produtor.' },
  { chave: 'territorial', rotulo: 'ICMS, ISS e benefícios estaduais', descricao: 'Leis complementares do ICMS e do ISS, convênios e benefícios fiscais.' },
  { chave: 'operacional', rotulo: 'Obrigações e documentos fiscais', descricao: 'Instruções normativas, resoluções do Simples Nacional e atos operacionais.' },
];

export type FonteNorma = {
  chave: string;
  tipo: string;
  numero: string;
  titulo: string;
  orgao: string;
  /** Data de publicação (fallback; a do cabeçalho do texto prevalece). Sem ela, a data vem do próprio texto na primeira captura. */
  data_publicacao?: string;
  url_oficial: string;
  prioridade: number;
  grupo?: GrupoNorma;
  /** html (padrão) | pdf | externo (só referência: sem texto por artigo) */
  formato?: 'html' | 'pdf' | 'externo';
  observacao?: string;
};

const PLANALTO = 'https://www.planalto.gov.br/ccivil_03';
const PR = 'Presidência da República';
const NORMAS_RFB = 'https://normas.receita.fazenda.gov.br/sijut2consulta';
const CGIBS_ARQ = 'https://www.cgibs.gov.br/upload/arquivos';

export const FONTES_NORMAS: FonteNorma[] = [
  // ── Reforma do consumo ──────────────────────────────────────────────────────────────────────────────────────────────
  {
    chave: 'ec-132-2023', tipo: 'Emenda Constitucional', numero: 'EC 132/2023', grupo: 'reforma',
    titulo: 'Altera o Sistema Tributário Nacional', orgao: 'Congresso Nacional', data_publicacao: '2023-12-20',
    url_oficial: `${PLANALTO}/constituicao/emendas/emc/emc132.htm`, prioridade: 0,
    observacao: 'Marco constitucional: cria IBS, CBS e Imposto Seletivo e as regras de transição (ADCT).',
  },
  {
    chave: 'lcp-214-2025', tipo: 'Lei Complementar', numero: 'LC 214/2025', grupo: 'reforma',
    titulo: 'Institui o IBS, a CBS e o Imposto Seletivo (texto compilado)', orgao: PR, data_publicacao: '2025-01-16',
    url_oficial: `${PLANALTO}/leis/lcp/lcp214compilado.htm`, prioridade: 0,
    observacao: 'Texto compilado do Planalto, já com as alterações posteriores (inclui a LC 227/2026).',
  },
  {
    chave: 'lcp-227-2026', tipo: 'Lei Complementar', numero: 'LC 227/2026', grupo: 'reforma',
    titulo: 'Institui o Comitê Gestor do IBS, o processo administrativo do IBS e altera a LC 214/2025', orgao: PR, data_publicacao: '2026-01-13',
    url_oficial: `${PLANALTO}/leis/lcp/lcp227.htm`, prioridade: 0,
    observacao: 'Texto original da lei; os dispositivos que alteram outras normas aparecem dentro dos artigos alteradores.',
  },
  {
    chave: 'lcp-235-2026', tipo: 'Lei Complementar', numero: 'LC 235/2026', grupo: 'reforma',
    titulo: 'Renúncias de receita e benefícios (minerais críticos, fertilizantes, etanol)', orgao: PR, data_publicacao: '2026-08-27',
    url_oficial: `${PLANALTO}/leis/lcp/lcp235.htm`, prioridade: 0,
    observacao: 'Afeta os segmentos de etanol, fertilizantes e minerais críticos; remete a artigos da LC 214/2025.',
  },
  {
    chave: 'lcp-239-2026', tipo: 'Lei Complementar', numero: 'LC 239/2026', grupo: 'reforma',
    titulo: 'Altera a LC 224/2025 (incentivos e benefícios federais)', orgao: PR,
    url_oficial: `${PLANALTO}/leis/lcp/lcp239.htm`, prioridade: 1,
    observacao: 'Citada no texto compilado da LC 224/2025 como a que mudou percentuais da redução dos benefícios.',
  },
  {
    chave: 'dec-12955-2026', tipo: 'Decreto', numero: 'Decreto 12.955/2026', grupo: 'reforma',
    titulo: 'Regulamento da CBS', orgao: PR, data_publicacao: '2026-04-30',
    url_oficial: `${PLANALTO}/_ato2023-2026/2026/decreto/d12955.htm`, prioridade: 0,
    observacao: 'Regulamenta a CBS (referenciado pela própria LC 214 compilada).',
  },
  {
    chave: 'dec-13075-2026', tipo: 'Decreto', numero: 'Decreto 13.075/2026', grupo: 'reforma',
    titulo: 'Altera o Regulamento da CBS (Decreto 12.955/2026)', orgao: PR,
    url_oficial: `${PLANALTO}/_ato2023-2026/2026/decreto/d13075.htm`, prioridade: 0,
    observacao: 'Ato alterador: traz a nova redação de artigos do Decreto 12.955/2026 (entre eles os arts. 105, 115 e 619).',
  },
  {
    chave: 'dec-13133-2026', tipo: 'Decreto', numero: 'Decreto 13.133/2026', grupo: 'reforma',
    titulo: 'Delega ao Ministro da Fazenda as alíquotas da CBS sobre combustíveis', orgao: PR,
    url_oficial: `${PLANALTO}/_Ato2023-2026/2026/decreto/d13133.htm`, prioridade: 0,
    observacao: 'Combustíveis: as alíquotas específicas saem por portaria do Ministro da Fazenda (Portaria MF 3.074/2026).',
  },
  {
    chave: 'res-cgibs-6-2026', tipo: 'Resolução CGIBS', numero: 'Resolução CGIBS 6/2026', grupo: 'reforma', formato: 'pdf',
    titulo: 'Regulamento do IBS', orgao: 'Comitê Gestor do IBS', data_publicacao: '2026-04-30',
    url_oficial: `${CGIBS_ARQ}/202604/30084927-res-cgibs-n-6-30-abr-2026-regulamenta-o-ibs.pdf`, prioridade: 0,
    observacao: 'Regulamento do IBS (PDF do CGIBS). Cada artigo traz, entre parênteses, o artigo da LC 214/2025 que regulamenta.',
  },
  {
    chave: 'res-cgibs-13-2026', tipo: 'Resolução CGIBS', numero: 'Resolução CGIBS 13/2026', grupo: 'reforma', formato: 'pdf',
    titulo: 'Altera o Regulamento do IBS', orgao: 'Comitê Gestor do IBS', data_publicacao: '2026-07-22',
    url_oficial: `${CGIBS_ARQ}/202607/22121010-resolucao-cgibs-n-13-de-22-de-julho-de-2026.pdf`, prioridade: 0,
    observacao: 'Ato alterador do Regulamento do IBS (Resolução CGIBS 6/2026).',
  },
  {
    chave: 'pc-mf-cgibs-7-2026', tipo: 'Portaria Conjunta', numero: 'Portaria Conjunta MF/CGIBS 7/2026', grupo: 'reforma', formato: 'pdf',
    titulo: 'Portaria Conjunta MF/CGIBS nº 7/2026', orgao: 'Ministério da Fazenda e CGIBS', data_publicacao: '2026-04-30',
    url_oficial: `${CGIBS_ARQ}/202604/30094136-sei-mgi-60959979-portaria-conjunta.pdf`, prioridade: 1,
    observacao: 'Publicada junto com o Regulamento do IBS.',
  },
  {
    chave: 'lcp-123-2006', tipo: 'Lei Complementar', numero: 'LC 123/2006', grupo: 'reforma',
    titulo: 'Estatuto Nacional da Microempresa e da Empresa de Pequeno Porte (Simples Nacional)', orgao: PR, data_publicacao: '2006-12-14',
    url_oficial: `${PLANALTO}/leis/lcp/lcp123.htm`, prioridade: 1,
    observacao: 'Simples Nacional e sua integração com IBS/CBS.',
  },
  // ── Fundamentos ─────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    chave: 'cf-1988', tipo: 'Constituição', numero: 'CF/1988', grupo: 'fundamentos',
    titulo: 'Constituição da República Federativa do Brasil (texto compilado, com o ADCT)', orgao: 'Congresso Nacional', data_publicacao: '1988-10-05',
    url_oficial: `${PLANALTO}/constituicao/constituicao.htm`, prioridade: 1,
    observacao: 'Base constitucional: competências, IBS/CBS/IS (arts. 156-A e 195) e o ADCT com a transição da EC 132.',
  },
  {
    chave: 'ctn-5172-1966', tipo: 'Lei', numero: 'Lei 5.172/1966 (CTN)', grupo: 'fundamentos',
    titulo: 'Código Tributário Nacional (texto compilado)', orgao: PR, data_publicacao: '1966-10-25',
    url_oficial: `${PLANALTO}/leis/l5172compilado.htm`, prioridade: 1,
    observacao: 'Normas gerais de direito tributário; alterado pela LC 236/2026.',
  },
  {
    chave: 'lcp-225-2026', tipo: 'Lei Complementar', numero: 'LC 225/2026', grupo: 'fundamentos',
    titulo: 'Código de Defesa do Contribuinte', orgao: PR, data_publicacao: '2026-01-08',
    url_oficial: `${PLANALTO}/leis/lcp/lcp225.htm`, prioridade: 1,
    observacao: 'Direitos, garantias e deveres na relação entre Fisco e contribuinte.',
  },
  {
    chave: 'lcp-236-2026', tipo: 'Lei Complementar', numero: 'LC 236/2026', grupo: 'fundamentos',
    titulo: 'Altera o CTN: solução de controvérsias, consensualidade e processo administrativo tributário', orgao: PR, data_publicacao: '2026-09-04',
    url_oficial: `${PLANALTO}/leis/lcp/lcp236.htm`, prioridade: 1,
    observacao: 'Os artigos citados do CTN aparecem dentro dos artigos alteradores.',
  },
  {
    chave: 'dec-70235-1972', tipo: 'Decreto', numero: 'Decreto 70.235/1972', grupo: 'fundamentos',
    titulo: 'Processo administrativo fiscal federal', orgao: PR, data_publicacao: '1972-03-06',
    url_oficial: `${PLANALTO}/decreto/d70235cons.htm`, prioridade: 1,
    observacao: 'Auto de infração, impugnação, recursos e prazos no âmbito federal.',
  },
  {
    chave: 'lei-9430-1996', tipo: 'Lei', numero: 'Lei 9.430/1996', grupo: 'fundamentos',
    titulo: 'Legislação tributária federal, contribuições para a seguridade social, processo administrativo de consulta', orgao: PR, data_publicacao: '1996-12-27',
    url_oficial: `${PLANALTO}/leis/l9430.htm`, prioridade: 1,
    observacao: 'Apuração do lucro, preços de transferência, penalidades, compensação (art. 74) e processo de consulta.',
  },
  // ── Tributação federal atual ────────────────────────────────────────────────────────────────────────────────────────
  {
    chave: 'dec-9580-2018', tipo: 'Decreto', numero: 'Decreto 9.580/2018', grupo: 'federal',
    titulo: 'Regulamento do Imposto sobre a Renda (RIR/2018)', orgao: PR, data_publicacao: '2018-11-22',
    url_oficial: `${PLANALTO}/_ato2015-2018/2018/decreto/d9580.htm`, prioridade: 1,
  },
  {
    chave: 'lei-9249-1995', tipo: 'Lei', numero: 'Lei 9.249/1995', grupo: 'federal',
    titulo: 'Imposto de renda das pessoas jurídicas e CSLL: lucro presumido, dividendos e juros sobre o capital próprio', orgao: PR, data_publicacao: '1995-12-26',
    url_oficial: `${PLANALTO}/leis/l9249.htm`, prioridade: 1,
  },
  {
    chave: 'lei-7689-1988', tipo: 'Lei', numero: 'Lei 7.689/1988', grupo: 'federal',
    titulo: 'Institui a Contribuição Social sobre o Lucro Líquido (CSLL)', orgao: PR, data_publicacao: '1988-12-15',
    url_oficial: `${PLANALTO}/leis/l7689.htm`, prioridade: 1,
  },
  {
    chave: 'del-1598-1977', tipo: 'Decreto-Lei', numero: 'Decreto-Lei 1.598/1977', grupo: 'federal',
    titulo: 'Altera a legislação do imposto sobre a renda (lucro real e escrituração)', orgao: PR, data_publicacao: '1977-12-26',
    url_oficial: `${PLANALTO}/decreto-lei/del1598.htm`, prioridade: 1,
  },
  {
    chave: 'lei-12973-2014', tipo: 'Lei', numero: 'Lei 12.973/2014', grupo: 'federal',
    titulo: 'Ajustes fiscais da adoção das normas contábeis internacionais (IRPJ, CSLL, PIS/Cofins)', orgao: PR, data_publicacao: '2014-05-13',
    url_oficial: `${PLANALTO}/_ato2011-2014/2014/lei/l12973.htm`, prioridade: 1,
  },
  {
    chave: 'lei-9718-1998', tipo: 'Lei', numero: 'Lei 9.718/1998', grupo: 'federal',
    titulo: 'PIS/Pasep e Cofins no regime cumulativo (legislação tributária federal)', orgao: PR, data_publicacao: '1998-11-27',
    url_oficial: `${PLANALTO}/leis/l9718.htm`, prioridade: 1,
  },
  {
    chave: 'lei-9715-1998', tipo: 'Lei', numero: 'Lei 9.715/1998', grupo: 'federal',
    titulo: 'Contribuição para o PIS/Pasep', orgao: PR, data_publicacao: '1998-11-25',
    url_oficial: `${PLANALTO}/leis/l9715.htm`, prioridade: 1,
  },
  {
    chave: 'mp-2158-35-2001', tipo: 'Medida Provisória', numero: 'MP 2.158-35/2001', grupo: 'federal',
    titulo: 'Altera a legislação tributária federal (PIS/Cofins, variação cambial, regimes especiais)', orgao: PR, data_publicacao: '2001-08-24',
    url_oficial: `${PLANALTO}/mpv/2158-35.htm`, prioridade: 1,
  },
  {
    chave: 'lei-10637-2002', tipo: 'Lei', numero: 'Lei 10.637/2002', grupo: 'federal',
    titulo: 'PIS/Pasep não cumulativo', orgao: PR, data_publicacao: '2002-12-30',
    url_oficial: `${PLANALTO}/leis/2002/l10637.htm`, prioridade: 1,
  },
  {
    chave: 'lei-10833-2003', tipo: 'Lei', numero: 'Lei 10.833/2003', grupo: 'federal',
    titulo: 'Cofins não cumulativa', orgao: PR, data_publicacao: '2003-12-29',
    url_oficial: `${PLANALTO}/leis/2003/l10.833.htm`, prioridade: 1,
  },
  {
    chave: 'lei-10865-2004', tipo: 'Lei', numero: 'Lei 10.865/2004', grupo: 'federal',
    titulo: 'PIS/Pasep-Importação e Cofins-Importação', orgao: PR, data_publicacao: '2004-04-30',
    url_oficial: `${PLANALTO}/_ato2004-2006/2004/lei/l10.865.htm`, prioridade: 1,
  },
  {
    chave: 'lei-11033-2004', tipo: 'Lei', numero: 'Lei 11.033/2004', grupo: 'federal',
    titulo: 'Reporto, vendas a prazo e créditos de PIS/Cofins (art. 17)', orgao: PR, data_publicacao: '2004-12-21',
    url_oficial: `${PLANALTO}/_ato2004-2006/2004/lei/l11033.htm`, prioridade: 1,
  },
  {
    chave: 'lei-8218-1991', tipo: 'Lei', numero: 'Lei 8.218/1991', grupo: 'federal',
    titulo: 'Legislação tributária federal: multas por falta de entrega de escrituração', orgao: PR, data_publicacao: '1991-08-29',
    url_oficial: `${PLANALTO}/leis/l8218.htm`, prioridade: 1,
  },
  {
    chave: 'dec-7212-2010', tipo: 'Decreto', numero: 'Decreto 7.212/2010', grupo: 'federal',
    titulo: 'Regulamento do Imposto sobre Produtos Industrializados (RIPI/2010)', orgao: PR, data_publicacao: '2010-06-15',
    url_oficial: `${PLANALTO}/_ato2007-2010/2010/decreto/d7212.htm`, prioridade: 1,
    observacao: 'A TIPI (Decreto 11.158/2022) é publicada em PDF escaneado e entra só como referência.',
  },
  {
    chave: 'lei-7713-1988', tipo: 'Lei', numero: 'Lei 7.713/1988', grupo: 'federal',
    titulo: 'Legislação do imposto de renda (pessoa física)', orgao: PR, data_publicacao: '1988-12-22',
    url_oficial: `${PLANALTO}/leis/l7713.htm`, prioridade: 1,
  },
  {
    chave: 'lei-9250-1995', tipo: 'Lei', numero: 'Lei 9.250/1995', grupo: 'federal',
    titulo: 'Legislação do imposto de renda das pessoas físicas', orgao: PR, data_publicacao: '1995-12-26',
    url_oficial: `${PLANALTO}/leis/l9250.htm`, prioridade: 1,
  },
  {
    chave: 'lei-15270-2025', tipo: 'Lei', numero: 'Lei 15.270/2025', grupo: 'federal',
    titulo: 'Isenção do IRPF para rendas menores e tributação mínima das altas rendas', orgao: PR, data_publicacao: '2025-11-26',
    url_oficial: `${PLANALTO}/_ato2023-2026/2025/lei/l15270.htm`, prioridade: 1,
  },
  {
    chave: 'dec-6306-2007', tipo: 'Decreto', numero: 'Decreto 6.306/2007', grupo: 'federal',
    titulo: 'Regulamento do IOF', orgao: PR, data_publicacao: '2007-12-14',
    url_oficial: `${PLANALTO}/_ato2007-2010/2007/decreto/d6306.htm`, prioridade: 1,
  },
  {
    chave: 'lei-8212-1991', tipo: 'Lei', numero: 'Lei 8.212/1991', grupo: 'federal',
    titulo: 'Organização da Seguridade Social e plano de custeio (texto consolidado)', orgao: PR, data_publicacao: '1991-07-24',
    url_oficial: `${PLANALTO}/leis/l8212cons.htm`, prioridade: 1,
  },
  {
    chave: 'dec-3048-1999', tipo: 'Decreto', numero: 'Decreto 3.048/1999', grupo: 'federal',
    titulo: 'Regulamento da Previdência Social', orgao: PR, data_publicacao: '1999-05-06',
    url_oficial: `${PLANALTO}/decreto/d3048.htm`, prioridade: 1,
  },
  {
    chave: 'lei-12546-2011', tipo: 'Lei', numero: 'Lei 12.546/2011', grupo: 'federal',
    titulo: 'Desoneração da folha de pagamento (contribuição previdenciária sobre a receita bruta)', orgao: PR, data_publicacao: '2011-12-14',
    url_oficial: `${PLANALTO}/_ato2011-2014/2011/lei/l12546.htm`, prioridade: 1,
  },
  {
    chave: 'lei-14973-2024', tipo: 'Lei', numero: 'Lei 14.973/2024', grupo: 'federal',
    titulo: 'Reoneração gradual da folha e compensação de benefícios fiscais', orgao: PR, data_publicacao: '2024-09-16',
    url_oficial: `${PLANALTO}/_ato2023-2026/2024/lei/l14973.htm`, prioridade: 1,
  },
  {
    chave: 'lcp-224-2025', tipo: 'Lei Complementar', numero: 'LC 224/2025', grupo: 'federal',
    titulo: 'Redução dos incentivos e benefícios tributários federais e critérios para novas concessões', orgao: PR, data_publicacao: '2025-12-26',
    url_oficial: `${PLANALTO}/leis/lcp/lcp224.htm`, prioridade: 1,
    observacao: 'Reduz benefícios de PIS/Cofins, IRPJ, CSLL, II, IPI e contribuição previdenciária patronal; o texto compilado já traz mudanças da LC 235 e da LC 239.',
  },
  {
    chave: 'dec-12808-2025', tipo: 'Decreto', numero: 'Decreto 12.808/2025', grupo: 'federal',
    titulo: 'Regulamenta a redução dos incentivos e benefícios tributários federais (LC 224/2025)', orgao: PR, data_publicacao: '2025-12-29',
    url_oficial: `${PLANALTO}/_ato2023-2026/2025/decreto/d12808.htm`, prioridade: 1,
  },
  {
    chave: 'lei-13988-2020', tipo: 'Lei', numero: 'Lei 13.988/2020', grupo: 'federal',
    titulo: 'Transação tributária', orgao: PR, data_publicacao: '2020-04-14',
    url_oficial: `${PLANALTO}/_ato2019-2022/2020/lei/l13988.htm`, prioridade: 1,
  },
  {
    chave: 'lei-10522-2002', tipo: 'Lei', numero: 'Lei 10.522/2002', grupo: 'federal',
    titulo: 'Cadastro Informativo dos créditos não quitados (Cadin), parcelamento e dívida ativa', orgao: PR, data_publicacao: '2002-07-19',
    url_oficial: `${PLANALTO}/leis/2002/l10522.htm`, prioridade: 1,
  },
  // ── Agro ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    chave: 'lei-5764-1971', tipo: 'Lei', numero: 'Lei 5.764/1971', grupo: 'agro',
    titulo: 'Política Nacional de Cooperativismo e regime jurídico das sociedades cooperativas', orgao: PR, data_publicacao: '1971-12-16',
    url_oficial: `${PLANALTO}/leis/l5764.htm`, prioridade: 1,
    observacao: 'Base para o enquadramento de cooperativas (ato cooperativo), relevante no agro.',
  },
  {
    chave: 'lei-8023-1990', tipo: 'Lei', numero: 'Lei 8.023/1990', grupo: 'agro',
    titulo: 'Imposto de renda sobre o resultado da atividade rural', orgao: PR, data_publicacao: '1990-04-12',
    url_oficial: `${PLANALTO}/leis/l8023.htm`, prioridade: 1,
  },
  {
    chave: 'lei-10925-2004', tipo: 'Lei', numero: 'Lei 10.925/2004', grupo: 'agro',
    titulo: 'Redução de alíquotas e créditos presumidos de PIS/Cofins na cadeia agropecuária', orgao: PR, data_publicacao: '2004-07-23',
    url_oficial: `${PLANALTO}/_ato2004-2006/2004/lei/l10.925.htm`, prioridade: 1,
  },
  {
    chave: 'lei-9393-1996', tipo: 'Lei', numero: 'Lei 9.393/1996', grupo: 'agro',
    titulo: 'Imposto sobre a Propriedade Territorial Rural (ITR)', orgao: PR, data_publicacao: '1996-12-19',
    url_oficial: `${PLANALTO}/leis/l9393.htm`, prioridade: 1,
  },
  {
    chave: 'dec-4382-2002', tipo: 'Decreto', numero: 'Decreto 4.382/2002', grupo: 'agro',
    titulo: 'Regulamento do ITR', orgao: PR, data_publicacao: '2002-09-19',
    url_oficial: `${PLANALTO}/decreto/2002/d4382.htm`, prioridade: 1,
  },
  {
    chave: 'lei-8870-1994', tipo: 'Lei', numero: 'Lei 8.870/1994', grupo: 'agro',
    titulo: 'Contribuição previdenciária da agroindústria e do produtor rural', orgao: PR, data_publicacao: '1994-04-15',
    url_oficial: `${PLANALTO}/leis/l8870.htm`, prioridade: 1,
  },
  // ── ICMS, ISS e benefícios estaduais ────────────────────────────────────────────────────────────────────────────────
  {
    chave: 'lcp-87-1996', tipo: 'Lei Complementar', numero: 'LC 87/1996', grupo: 'territorial',
    titulo: 'Lei Kandir — ICMS', orgao: PR, data_publicacao: '1996-09-13',
    url_oficial: `${PLANALTO}/leis/lcp/lcp87.htm`, prioridade: 1,
    observacao: 'Convive com o IBS durante a transição do ICMS (créditos e saldos).',
  },
  {
    chave: 'lcp-116-2003', tipo: 'Lei Complementar', numero: 'LC 116/2003', grupo: 'territorial',
    titulo: 'Imposto sobre Serviços de Qualquer Natureza (ISS)', orgao: PR, data_publicacao: '2003-07-31',
    url_oficial: `${PLANALTO}/leis/lcp/lcp116.htm`, prioridade: 1,
    observacao: 'Convive com o IBS durante a transição do ISS; lista de serviços.',
  },
  {
    chave: 'lcp-24-1975', tipo: 'Lei Complementar', numero: 'LC 24/1975', grupo: 'territorial',
    titulo: 'Convênios para a concessão de isenções do ICMS', orgao: PR, data_publicacao: '1975-01-07',
    url_oficial: `${PLANALTO}/leis/lcp/lcp24.htm`, prioridade: 1,
  },
  {
    chave: 'lcp-160-2017', tipo: 'Lei Complementar', numero: 'LC 160/2017', grupo: 'territorial',
    titulo: 'Convalidação de benefícios fiscais de ICMS', orgao: PR, data_publicacao: '2017-08-07',
    url_oficial: `${PLANALTO}/leis/lcp/lcp160.htm`, prioridade: 1,
  },
  {
    chave: 'lcp-190-2022', tipo: 'Lei Complementar', numero: 'LC 190/2022', grupo: 'territorial',
    titulo: 'Diferencial de alíquotas do ICMS (DIFAL) nas operações com consumidor final', orgao: PR, data_publicacao: '2022-01-04',
    url_oficial: `${PLANALTO}/leis/lcp/lcp190.htm`, prioridade: 1,
  },
  // ── Só referência: a fonte oficial não publica o texto em página que o servidor consiga ler ────────────────────────
  {
    chave: 'cgsn-140-2018', tipo: 'Resolução CGSN', numero: 'Resolução CGSN 140/2018', grupo: 'operacional', formato: 'externo',
    titulo: 'Regulamenta o Simples Nacional (com as alterações até a Resolução CGSN 190/2026)', orgao: 'Comitê Gestor do Simples Nacional', data_publicacao: '2018-05-22',
    url_oficial: `${NORMAS_RFB}/link.action?idAto=152832`, prioridade: 0,
    observacao: 'Página dinâmica do Normas da RFB. Para o Simples 2027, ver também as Resoluções CGSN 186, 190 e 194/2026.',
  },
  {
    chave: 'in-rfb-1700-2017', tipo: 'Instrução Normativa', numero: 'IN RFB 1.700/2017', grupo: 'operacional', formato: 'externo',
    titulo: 'IRPJ e CSLL: determinação e pagamento', orgao: 'Receita Federal', data_publicacao: '2017-03-14',
    url_oficial: `${NORMAS_RFB}/link.action?idAto=81268`, prioridade: 1,
  },
  {
    chave: 'in-rfb-2121-2022', tipo: 'Instrução Normativa', numero: 'IN RFB 2.121/2022', grupo: 'operacional', formato: 'externo',
    titulo: 'Contribuição para o PIS/Pasep, Cofins e PIS/Cofins-Importação (consolidação)', orgao: 'Receita Federal', data_publicacao: '2022-12-15',
    url_oficial: `${NORMAS_RFB}/link.action?idAto=127905`, prioridade: 1,
  },
  {
    chave: 'in-rfb-2055-2021', tipo: 'Instrução Normativa', numero: 'IN RFB 2.055/2021', grupo: 'operacional', formato: 'externo',
    titulo: 'Restituição, compensação, ressarcimento e reembolso', orgao: 'Receita Federal', data_publicacao: '2021-12-06',
    url_oficial: `${NORMAS_RFB}/link.action?idAto=122002`, prioridade: 1,
  },
  {
    chave: 'in-rfb-2237-2024', tipo: 'Instrução Normativa', numero: 'IN RFB 2.237/2024', grupo: 'operacional', formato: 'externo',
    titulo: 'DCTFWeb', orgao: 'Receita Federal',
    url_oficial: `${NORMAS_RFB}/link.action?idAto=141910`, prioridade: 1,
  },
  {
    chave: 'in-rfb-2043-2021', tipo: 'Instrução Normativa', numero: 'IN RFB 2.043/2021', grupo: 'operacional', formato: 'externo',
    titulo: 'EFD-Reinf', orgao: 'Receita Federal', data_publicacao: '2021-08-12',
    url_oficial: `${NORMAS_RFB}/link.action?idAto=119859`, prioridade: 1,
  },
  {
    chave: 'in-rfb-2003-2021', tipo: 'Instrução Normativa', numero: 'IN RFB 2.003/2021', grupo: 'operacional', formato: 'externo',
    titulo: 'Escrituração Contábil Digital (ECD)', orgao: 'Receita Federal', data_publicacao: '2021-01-18',
    url_oficial: `${NORMAS_RFB}/link.action?idAto=114965`, prioridade: 1,
  },
  {
    chave: 'in-rfb-2004-2021', tipo: 'Instrução Normativa', numero: 'IN RFB 2.004/2021', grupo: 'operacional', formato: 'externo',
    titulo: 'Escrituração Contábil Fiscal (ECF)', orgao: 'Receita Federal', data_publicacao: '2021-01-18',
    url_oficial: `${NORMAS_RFB}/link.action?idAto=114966`, prioridade: 1,
  },
  {
    chave: 'in-rfb-1252-2012', tipo: 'Instrução Normativa', numero: 'IN RFB 1.252/2012', grupo: 'operacional', formato: 'externo',
    titulo: 'EFD-Contribuições', orgao: 'Receita Federal', data_publicacao: '2012-03-01',
    url_oficial: `${NORMAS_RFB}/link.action?idAto=37466`, prioridade: 1,
  },
  {
    chave: 'in-rfb-2110-2022', tipo: 'Instrução Normativa', numero: 'IN RFB 2.110/2022', grupo: 'operacional', formato: 'externo',
    titulo: 'Contribuições previdenciárias e de terceiros: normas gerais e retenções', orgao: 'Receita Federal', data_publicacao: '2022-10-17',
    url_oficial: `${NORMAS_RFB}/consulta.action`, prioridade: 1,
    observacao: 'Localizar pelo número no sistema Normas da RFB.',
  },
  {
    chave: 'in-srf-83-2001', tipo: 'Instrução Normativa', numero: 'IN SRF 83/2001', grupo: 'agro', formato: 'externo',
    titulo: 'Tributação do resultado da atividade rural da pessoa física', orgao: 'Secretaria da Receita Federal', data_publicacao: '2001-10-11',
    url_oficial: `${NORMAS_RFB}/consulta.action`, prioridade: 1,
    observacao: 'Localizar pelo número no sistema Normas da RFB (não presumir o órgão: é IN da antiga SRF).',
  },
  {
    chave: 'dec-11158-2022', tipo: 'Decreto', numero: 'Decreto 11.158/2022', grupo: 'federal', formato: 'externo',
    titulo: 'Tabela de Incidência do IPI (TIPI)', orgao: PR, data_publicacao: '2022-07-29',
    url_oficial: `${PLANALTO}/_ato2019-2022/2022/decreto/d11158.htm`, prioridade: 1,
    observacao: 'O anexo (TIPI) é PDF escaneado: sem texto por artigo. A classificação por NCM está na tabela do Siscomex carregada à parte.',
  },
  {
    chave: 'conv-icms-100-1997', tipo: 'Convênio ICMS', numero: 'Convênio ICMS 100/1997', grupo: 'agro', formato: 'externo',
    titulo: 'Reduções de base de cálculo e isenções de ICMS em insumos agropecuários', orgao: 'Confaz', data_publicacao: '1997-11-04',
    url_oficial: 'https://www.confaz.fazenda.gov.br/legislacao/convenios/1997/CV100_97', prioridade: 1,
    observacao: 'O Confaz publica convênios por cláusulas, não por artigos: fica como referência.',
  },
];
