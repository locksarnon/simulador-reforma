/**
 * Normas das bases legais (fonte oficial). `prioridade` 0 = muda cálculo/enquadramento/obrigação.
 * Só entram aqui URLs conferidas (a página abre e o leitor extrai os dispositivos). Os convênios e ajustes do Confaz são lidos por
 * cláusula (ver confaz.ts). O que a fonte oficial só publica em página dinâmica (Normas da RFB) ou em PDF escaneado entra como
 * `formato: 'externo'`: fica no catálogo com o link, mas sem texto por artigo.
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
  /** Norma estadual: a UF e o rótulo do botão na tela Regras estaduais ("RICMS", "Lei do ICMS", "FETHAB"). */
  uf?: string;
  botao?: string;
  /**
   * Só referência: endereço que a revisão semanal confere quando o do botão não serve para isso (em RO o arquivo de cada
   * consolidação ganha endereço novo; a lista dos arquivos atuais muda quando sai a consolidação nova).
   */
  url_monitoramento?: string;
};

/** UFs da tela Regras estaduais, na ordem em que aparecem. */
export const UFS_REGRAS_ESTADUAIS: { uf: string; nome: string }[] = [
  { uf: 'PA', nome: 'Pará' }, { uf: 'MS', nome: 'Mato Grosso do Sul' }, { uf: 'MT', nome: 'Mato Grosso' }, { uf: 'MA', nome: 'Maranhão' },
  { uf: 'SP', nome: 'São Paulo' }, { uf: 'MG', nome: 'Minas Gerais' }, { uf: 'GO', nome: 'Goiás' }, { uf: 'BA', nome: 'Bahia' },
  { uf: 'PI', nome: 'Piauí' }, { uf: 'TO', nome: 'Tocantins' }, { uf: 'RO', nome: 'Rondônia' },
];

/** Rótulo do botão de cada norma estadual na tela Regras estaduais (sem rótulo: "Lei" ou "Decreto"). */
const BOTAO_ESTADUAL: Record<string, string> = {
  'mt-lei-7098-1998': 'Lei do ICMS', 'mt-dec-2212-2014': 'RICMS', 'mt-lei-7263-2000': 'FETHAB',
  'go-lei-11651-1991': 'Código Tributário (CTE)', 'go-dec-4852-1997': 'RICMS (RCTE)', 'go-lei-21670-2022': 'FUNDEINFRA', 'go-lei-14469-2003': 'PROTEGE',
  'ms-lei-1810-1997': 'Lei do ICMS', 'ms-dec-9203-1998': 'RICMS', 'ms-lei-1963-1999': 'FUNDERSUL',
  'ba-lei-7014-1996': 'Lei do ICMS', 'ba-dec-13780-2012': 'RICMS', 'ba-dec-14500-2013': 'Crédito de grãos', 'ba-lei-7932-2001': 'PROALBA', 'ba-dec-8064-2001': 'Regulamento do PROALBA',
  'ma-lei-7799-2002': 'Lei do ICMS', 'ma-dec-19714-2003': 'RICMS', 'ma-lei-12428-2024': 'Contribuição de grãos',
  'pa-lei-5530-1989': 'Lei do ICMS', 'pa-dec-4676-2001': 'RICMS',
  'sp-lei-6374-1989': 'Lei do ICMS', 'sp-dec-45490-2000': 'RICMS', 'mg-lei-6763-1975': 'Lei do ICMS', 'mg-dec-48589-2023': 'RICMS',
  'pi-lei-4257-1989': 'Lei do ICMS', 'pi-dec-21866-2023': 'RICMS', 'to-lei-1287-2001': 'Código Tributário', 'to-sefaz-legislacao': 'RICMS (página da SEFAZ-TO)',
  'ro-lei-688-1996': 'Lei do ICMS', 'ro-dec-22721-2018': 'RICMS',
};

const PLANALTO = 'https://www.planalto.gov.br/ccivil_03';
const PR = 'Presidência da República';
const NORMAS_RFB = 'https://normas.receita.fazenda.gov.br/sijut2consulta';
const CGIBS_ARQ = 'https://www.cgibs.gov.br/upload/arquivos';
const CONFAZ = 'https://www.confaz.fazenda.gov.br/legislacao';

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
  {
    chave: 'lei-12058-2009', tipo: 'Lei', numero: 'Lei 12.058/2009', grupo: 'agro',
    titulo: 'Suspensão de PIS/Cofins e crédito presumido na cadeia de animais vivos e carnes (arts. 32 a 34)', orgao: PR, data_publicacao: '2009-10-13',
    url_oficial: `${PLANALTO}/_ato2007-2010/2009/lei/l12058.htm`, prioridade: 1,
    observacao: 'Art. 32: suspensão na venda de animais vivos das posições 01.02 e 01.04 da NCM; art. 33: crédito presumido de quem produz carnes (02.01, 02.02, 02.04...); art. 34: crédito presumido na industrialização.',
  },
  {
    chave: 'lei-12350-2010', tipo: 'Lei', numero: 'Lei 12.350/2010', grupo: 'agro',
    titulo: 'Suspensão de PIS/Cofins e crédito presumido na cadeia de aves e suínos (arts. 54 a 56-B)', orgao: PR, data_publicacao: '2010-12-20',
    url_oficial: `${PLANALTO}/_ato2007-2010/2010/lei/l12350.htm`, prioridade: 1,
    observacao: 'Art. 54: suspensão na venda de insumos (cereais das posições 10.01 a 10.08 e outros); art. 55: crédito presumido de quem produz carnes suínas e de aves (02.03, 02.07...) para exportação; art. 56-B: uso do saldo de crédito presumido.',
  },
  {
    chave: 'lei-12865-2013', tipo: 'Lei', numero: 'Lei 12.865/2013', grupo: 'agro',
    titulo: 'Suspensão de PIS/Cofins na venda de soja e crédito presumido da cadeia da soja (arts. 29 a 33)', orgao: PR, data_publicacao: '2013-10-09',
    url_oficial: `${PLANALTO}/_ato2011-2014/2013/lei/l12865.htm`, prioridade: 1,
    observacao: 'Art. 29: suspensão na venda de soja (12.01) e derivados; arts. 31 e 32: crédito presumido, apurado em separado, com ressarcimento e compensação.',
  },
  {
    chave: 'lei-12599-2012', tipo: 'Lei', numero: 'Lei 12.599/2012', grupo: 'agro',
    titulo: 'Crédito presumido de PIS/Cofins na exportação e na aquisição de café (arts. 5º a 7º-A)', orgao: PR, data_publicacao: '2012-03-23',
    url_oficial: `${PLANALTO}/_ato2011-2014/2012/lei/l12599.htm`, prioridade: 1,
  },
  {
    chave: 'lei-11051-2004', tipo: 'Lei', numero: 'Lei 11.051/2004', grupo: 'agro',
    titulo: 'Crédito de CSLL sobre depreciação (art. 1º) e limite do crédito presumido de PIS/Cofins sobre bens recebidos de cooperado (art. 9º)', orgao: PR, data_publicacao: '2004-12-29',
    url_oficial: `${PLANALTO}/_ato2004-2006/2004/lei/l11051.htm`, prioridade: 2,
  },
  {
    chave: 'lei-11116-2005', tipo: 'Lei', numero: 'Lei 11.116/2005', grupo: 'agro',
    titulo: 'Registro especial e PIS/Cofins do biodiesel; ressarcimento do saldo credor de PIS/Cofins (art. 16)', orgao: PR, data_publicacao: '2005-05-18',
    url_oficial: `${PLANALTO}/_ato2004-2006/2005/lei/l11116.htm`, prioridade: 2,
  },
  {
    chave: 'lei-8315-1991', tipo: 'Lei', numero: 'Lei 8.315/1991', grupo: 'agro',
    titulo: 'Cria o Serviço Nacional de Aprendizagem Rural (Senar) e define suas contribuições (art. 3º)', orgao: PR, data_publicacao: '1991-12-23',
    url_oficial: `${PLANALTO}/leis/l8315.htm`, prioridade: 1,
  },
  {
    chave: 'lei-13606-2018', tipo: 'Lei', numero: 'Lei 13.606/2018', grupo: 'agro',
    titulo: 'Programa de Regularização Tributária Rural (PRR) e alíquotas da contribuição do produtor rural e da agroindústria (arts. 14 e 15)', orgao: PR, data_publicacao: '2018-01-09',
    url_oficial: `${PLANALTO}/_ato2015-2018/2018/lei/l13606.htm`, prioridade: 1,
  },
  {
    chave: 'lei-8929-1994', tipo: 'Lei', numero: 'Lei 8.929/1994', grupo: 'agro',
    titulo: 'Cédula de Produto Rural (CPR)', orgao: PR, data_publicacao: '1994-08-22',
    url_oficial: `${PLANALTO}/leis/l8929.htm`, prioridade: 2,
  },
  {
    chave: 'lei-11076-2004', tipo: 'Lei', numero: 'Lei 11.076/2004', grupo: 'agro',
    titulo: 'Certificado de Depósito Agropecuário (CDA), Warrant (WA), CDCA, LCA e CRA', orgao: PR, data_publicacao: '2004-12-30',
    url_oficial: `${PLANALTO}/_ato2004-2006/2004/lei/l11076.htm`, prioridade: 2,
  },
  {
    chave: 'lei-9973-2000', tipo: 'Lei', numero: 'Lei 9.973/2000', grupo: 'agro',
    titulo: 'Sistema de armazenagem dos produtos agropecuários', orgao: PR, data_publicacao: '2000-05-29',
    url_oficial: `${PLANALTO}/leis/l9973.htm`, prioridade: 2,
  },
  {
    chave: 'lei-13986-2020', tipo: 'Lei', numero: 'Lei 13.986/2020', grupo: 'agro',
    titulo: 'Fundo Garantidor Solidário, patrimônio rural em afetação, Cédula Imobiliária Rural e escrituração de títulos do agro', orgao: PR, data_publicacao: '2020-04-07',
    url_oficial: `${PLANALTO}/_ato2019-2022/2020/lei/l13986.htm`, prioridade: 2,
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
  {
    chave: 'lcp-192-2022', tipo: 'Lei Complementar', numero: 'LC 192/2022', grupo: 'territorial',
    titulo: 'Combustíveis com ICMS cobrado uma única vez (monofásico)', orgao: PR, data_publicacao: '2022-03-11',
    url_oficial: `${PLANALTO}/leis/lcp/lcp192.htm`, prioridade: 1,
  },
  // ── Convênios e ajustes do Confaz (texto por cláusula; a redação anterior fica guardada à parte) ─────────────────────
  {
    chave: 'conv-icms-100-1997', tipo: 'Convênio ICMS', numero: 'Convênio ICMS 100/1997', grupo: 'agro',
    titulo: 'Redução da base de cálculo do ICMS nas saídas de insumos agropecuários', orgao: 'Confaz', data_publicacao: '1997-11-04',
    url_oficial: `${CONFAZ}/convenios/1997/CV100_97`, prioridade: 0,
    observacao: 'A página do Confaz registra a prorrogação até 31.12.27 pelo Convênio ICMS 79/25; as reduções foram alteradas pelo Convênio ICMS 26/21.',
  },
  {
    chave: 'conv-icms-52-1991', tipo: 'Convênio ICMS', numero: 'Convênio ICMS 52/1991', grupo: 'agro',
    titulo: 'Redução da base de cálculo do ICMS em máquinas e equipamentos industriais (Anexo I) e máquinas e implementos agrícolas (Anexo II)', orgao: 'Confaz',
    url_oficial: `${CONFAZ}/convenios/1991/CV052_91`, prioridade: 1,
  },
  {
    chave: 'conv-icms-106-1996', tipo: 'Convênio ICMS', numero: 'Convênio ICMS 106/1996', grupo: 'territorial',
    titulo: 'Crédito presumido de 20% do ICMS para prestadores de serviço de transporte, opcional, em lugar dos demais créditos', orgao: 'Confaz',
    url_oficial: `${CONFAZ}/convenios/1996/CV106_96`, prioridade: 1,
  },
  {
    chave: 'conv-icms-190-2017', tipo: 'Convênio ICMS', numero: 'Convênio ICMS 190/2017', grupo: 'territorial',
    titulo: 'Remissão dos créditos tributários de benefícios fiscais de ICMS e sua reinstituição (LC 160/2017)', orgao: 'Confaz',
    url_oficial: `${CONFAZ}/convenios/2017/CV190_17`, prioridade: 1,
  },
  {
    chave: 'conv-icms-142-2018', tipo: 'Convênio ICMS', numero: 'Convênio ICMS 142/2018', grupo: 'territorial',
    titulo: 'Substituição tributária do ICMS: normas gerais e segmentos de mercadorias (anexos)', orgao: 'Confaz',
    url_oficial: `${CONFAZ}/convenios/2018/CV142_18`, prioridade: 1,
  },
  {
    chave: 'conv-icms-84-2009', tipo: 'Convênio ICMS', numero: 'Convênio ICMS 84/2009', grupo: 'territorial',
    titulo: 'Controle das saídas de mercadorias com o fim específico de exportação', orgao: 'Confaz',
    url_oficial: `${CONFAZ}/convenios/2009/CV084_09`, prioridade: 1,
  },
  {
    chave: 'aj-sinief-7-2005', tipo: 'Ajuste SINIEF', numero: 'Ajuste SINIEF 7/2005', grupo: 'operacional',
    titulo: 'Institui a Nota Fiscal Eletrônica (NF-e, modelo 55) e o DANFE', orgao: 'Confaz',
    url_oficial: `${CONFAZ}/ajustes/2005/AJ_007_05`, prioridade: 1,
  },
  {
    chave: 'aj-sinief-9-2007', tipo: 'Ajuste SINIEF', numero: 'Ajuste SINIEF 9/2007', grupo: 'operacional',
    titulo: 'Institui o Conhecimento de Transporte Eletrônico (CT-e, modelo 57) e o DACTE', orgao: 'Confaz',
    url_oficial: `${CONFAZ}/ajustes/2007/AJ_009_07`, prioridade: 1,
  },
  // ── Tributação federal: IRPJ/CSLL, incentivos e obrigações ──────────────────────────────────────────────────────────
  {
    chave: 'lei-14789-2023', tipo: 'Lei', numero: 'Lei 14.789/2023', grupo: 'federal',
    titulo: 'Crédito fiscal decorrente de subvenção para implantação ou expansão de empreendimento econômico', orgao: PR, data_publicacao: '2023-12-29',
    url_oficial: `${PLANALTO}/_ato2023-2026/2023/lei/l14789.htm`, prioridade: 0,
    observacao: 'Pela ementa: altera as Leis 9.249/1995, 14.592/2023 e 14.754/2023 e revoga dispositivos do DL 1.598/1977.',
  },
  {
    chave: 'lei-14596-2023', tipo: 'Lei', numero: 'Lei 14.596/2023', grupo: 'federal',
    titulo: 'Preços de transferência no IRPJ e na CSLL', orgao: PR, data_publicacao: '2023-06-14',
    url_oficial: `${PLANALTO}/_ato2023-2026/2023/lei/l14596.htm`, prioridade: 1,
  },
  {
    chave: 'lei-8981-1995', tipo: 'Lei', numero: 'Lei 8.981/1995', grupo: 'federal',
    titulo: 'Altera a legislação tributária federal (IRPJ, CSLL e IRPF)', orgao: PR, data_publicacao: '1995-01-20',
    url_oficial: `${PLANALTO}/leis/l8981.htm`, prioridade: 1,
    observacao: 'Arts. 42 e 58: limite de 30% na compensação de prejuízo fiscal e de base negativa da CSLL.',
  },
  {
    chave: 'lei-9065-1995', tipo: 'Lei', numero: 'Lei 9.065/1995', grupo: 'federal',
    titulo: 'Dá nova redação a dispositivos da Lei 8.981/1995', orgao: PR, data_publicacao: '1995-06-20',
    url_oficial: `${PLANALTO}/leis/l9065.htm`, prioridade: 1,
    observacao: 'Art. 15: compensação do prejuízo fiscal com o lucro líquido ajustado.',
  },
  {
    chave: 'lei-9532-1997', tipo: 'Lei', numero: 'Lei 9.532/1997', grupo: 'federal',
    titulo: 'Altera a legislação tributária federal (texto compilado)', orgao: PR, data_publicacao: '1997-12-10',
    url_oficial: `${PLANALTO}/leis/l9532.htm`, prioridade: 2,
  },
  {
    chave: 'lei-11196-2005', tipo: 'Lei', numero: 'Lei 11.196/2005', grupo: 'federal',
    titulo: 'Lei do Bem: incentivos fiscais à inovação tecnológica (art. 17 e seguintes) e outras medidas tributárias', orgao: PR, data_publicacao: '2005-11-21',
    url_oficial: `${PLANALTO}/_ato2004-2006/2005/lei/l11196.htm`, prioridade: 2,
  },
  {
    chave: 'lei-10426-2002', tipo: 'Lei', numero: 'Lei 10.426/2002', grupo: 'federal',
    titulo: 'Altera a legislação tributária federal (art. 7º: multas por atraso ou falta de DCTF, DIRF e outras declarações)', orgao: PR, data_publicacao: '2002-04-24',
    url_oficial: `${PLANALTO}/leis/2002/l10426.htm`, prioridade: 1,
  },
  {
    chave: 'lei-6404-1976', tipo: 'Lei', numero: 'Lei 6.404/1976', grupo: 'fundamentos',
    titulo: 'Sociedades por Ações (texto compilado)', orgao: PR, data_publicacao: '1976-12-15',
    url_oficial: `${PLANALTO}/leis/l6404consol.htm`, prioridade: 2,
    observacao: 'Inclui o art. 195-A: reserva de incentivos fiscais (doações e subvenções governamentais para investimentos).',
  },
  // ── Processo, cobrança e penalidades ────────────────────────────────────────────────────────────────────────────────
  {
    chave: 'dec-7574-2011', tipo: 'Decreto', numero: 'Decreto 7.574/2011', grupo: 'fundamentos',
    titulo: 'Regulamenta o processo de determinação e exigência de créditos tributários da União e o processo de consulta', orgao: PR, data_publicacao: '2011-09-29',
    url_oficial: `${PLANALTO}/_ato2011-2014/2011/decreto/d7574.htm`, prioridade: 1,
  },
  {
    chave: 'lei-14689-2023', tipo: 'Lei', numero: 'Lei 14.689/2023', grupo: 'fundamentos',
    titulo: 'Empate no Carf, autorregularização, conformidade tributária e contencioso administrativo fiscal', orgao: PR, data_publicacao: '2023-09-20',
    url_oficial: `${PLANALTO}/_ato2023-2026/2023/lei/l14689.htm`, prioridade: 1,
  },
  {
    chave: 'lei-9784-1999', tipo: 'Lei', numero: 'Lei 9.784/1999', grupo: 'fundamentos',
    titulo: 'Processo administrativo no âmbito da Administração Pública Federal', orgao: PR, data_publicacao: '1999-01-29',
    url_oficial: `${PLANALTO}/leis/l9784.htm`, prioridade: 2,
  },
  {
    chave: 'lei-6830-1980', tipo: 'Lei', numero: 'Lei 6.830/1980', grupo: 'fundamentos',
    titulo: 'Cobrança judicial da Dívida Ativa da Fazenda Pública (execução fiscal)', orgao: PR, data_publicacao: '1980-09-22',
    url_oficial: `${PLANALTO}/leis/l6830.htm`, prioridade: 2,
  },
  {
    chave: 'lei-8137-1990', tipo: 'Lei', numero: 'Lei 8.137/1990', grupo: 'fundamentos',
    titulo: 'Crimes contra a ordem tributária, econômica e contra as relações de consumo', orgao: PR, data_publicacao: '1990-12-27',
    url_oficial: `${PLANALTO}/leis/l8137.htm`, prioridade: 2,
  },
  // ── Obrigações e documentos fiscais ─────────────────────────────────────────────────────────────────────────────────
  {
    chave: 'lcp-199-2023', tipo: 'Lei Complementar', numero: 'LC 199/2023', grupo: 'operacional',
    titulo: 'Estatuto Nacional de Simplificação de Obrigações Tributárias Acessórias', orgao: PR, data_publicacao: '2023-08-01',
    url_oficial: `${PLANALTO}/leis/lcp/lcp199.htm`, prioridade: 1,
  },
  {
    chave: 'dec-6022-2007', tipo: 'Decreto', numero: 'Decreto 6.022/2007', grupo: 'operacional',
    titulo: 'Institui o Sistema Público de Escrituração Digital (Sped)', orgao: PR, data_publicacao: '2007-01-22',
    url_oficial: `${PLANALTO}/_ato2007-2010/2007/decreto/d6022.htm`, prioridade: 2,
  },
  {
    chave: 'dec-8373-2014', tipo: 'Decreto', numero: 'Decreto 8.373/2014', grupo: 'operacional',
    titulo: 'Institui o eSocial', orgao: PR, data_publicacao: '2014-12-11',
    url_oficial: `${PLANALTO}/_ato2011-2014/2014/decreto/d8373.htm`, prioridade: 2,
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
  // ── Legislação estadual (UFs dos clientes): só referência. Os sites estaduais não riscam a redação anterior: ela fica no meio
  //    do texto (classe em GO, cor verde em MS, blocos "Redação anterior..." em MT, BA, PA e MA), e o leitor a tomaria por vigente.
  ...estadual('MT', 'SEFAZ-MT', [
    ['mt-lei-7098-1998', 'Lei', 'Lei 7.098/1998', 'Lei do ICMS de Mato Grosso (consolidada)', '1998-12-30', 'https://app1.sefaz.mt.gov.br/sistema/legislacao/legislacaotribut.nsf/07fa81bed2760c6b84256710004d3940/cc9c3b9886404baa0325678b0043a842?OpenDocument'],
    ['mt-dec-2212-2014', 'Decreto', 'Decreto 2.212/2014', 'Regulamento do ICMS de Mato Grosso (RICMS/MT)', '2014-03-20', 'https://www.sefaz.mt.gov.br/legislacao/SubIndice.aspx?ID=6', 'No portal da SEFAZ-MT o regulamento consolidado é publicado por capítulo, uma página para cada.'],
    ['mt-lei-7263-2000', 'Lei', 'Lei 7.263/2000', 'Fundo Estadual de Transporte e Habitação (FETHAB)', '2000-03-27', 'https://app1.sefaz.mt.gov.br/sistema/legislacao/legislacaotribut.nsf/07fa81bed2760c6b84256710004d3940/3866792553b6de7b032568b30044c0d4?OpenDocument', 'O art. 7º condiciona o diferimento do ICMS de soja, gado, madeira e feijão à contribuição ao FETHAB.'],
  ]),
  ...estadual('GO', 'Secretaria da Economia de Goiás', [
    ['go-lei-11651-1991', 'Lei', 'Lei 11.651/1991', 'Código Tributário do Estado de Goiás (CTE)', '1991-12-26', 'https://appasp.economia.go.gov.br/legislacao/arquivos/CTE/CTE.htm'],
    ['go-dec-4852-1997', 'Decreto', 'Decreto 4.852/1997', 'Regulamento do Código Tributário de Goiás (RCTE), com os anexos em arquivos separados', '1997-12-29', 'https://appasp.economia.go.gov.br/legislacao/arquivos/RCTE/RCTE.htm'],
    ['go-lei-21670-2022', 'Lei', 'Lei 21.670/2022', 'Fundo Estadual de Infraestrutura (FUNDEINFRA)', '2022-12-06', 'https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/106378/pdf', 'Art. 5º, I: contribuição como condição para a fruição de benefício ou incentivo fiscal. A página oficial registra eficácia suspensa por liminar (ADI 7885) em dispositivos incluídos em 2024.'],
    ['go-lei-14469-2003', 'Lei', 'Lei 14.469/2003', 'PROTEGE GOIÁS: contribuição para fruição de benefício ou incentivo fiscal', '2003-07-16', 'https://appasp.economia.go.gov.br/legislacao/arquivos/Leis/L_14469.htm'],
  ]),
  ...estadual('MS', 'SEFAZ-MS', [
    ['ms-lei-1810-1997', 'Lei', 'Lei 1.810/1997', 'Tributos de competência do Estado de Mato Grosso do Sul (ICMS)', '1997-12-22', 'https://aacpdappls.net.ms.gov.br/appls/legislacao/serc/legato.nsf/23b657614c182061042579c80053770d/9b9e5fd2565751de042579cf004d33a6?OpenDocument'],
    ['ms-dec-9203-1998', 'Decreto', 'Decreto 9.203/1998', 'Regulamento do ICMS de Mato Grosso do Sul (RICMS/MS), com os anexos em documentos separados', '1998-09-18', 'https://aacpdappls.net.ms.gov.br/appls/legislacao/serc/legato.nsf/7a2675fdf26e910204256b1f005348a7/d3cc39d3a6aeeda803256cc20066f1fb?OpenDocument'],
    ['ms-lei-1963-1999', 'Lei', 'Lei 1.963/1999', 'Fundo de Desenvolvimento do Sistema Rodoviário (FUNDERSUL)', '1999-06-11', 'https://aacpdappls.net.ms.gov.br/appls/legislacao/serc/legato.nsf/23b657614c182061042579c80053770d/0fabf2cd6f2fefed04256ae7004d34c5?OpenDocument', 'O art. 9º condiciona o diferimento do ICMS de produtos agropecuários à contribuição dos produtores.'],
  ]),
  ...estadual('BA', 'SEFAZ-BA', [
    ['ba-lei-7014-1996', 'Lei', 'Lei 7.014/1996', 'Lei do ICMS da Bahia (versão com notas da SEFAZ)', '1996-12-04', 'https://mbusca.sefaz.ba.gov.br/DITRI/leis/leis_estaduais/legest_1996_7014_icmscomnotas.pdf'],
    ['ba-dec-13780-2012', 'Decreto', 'Decreto 13.780/2012', 'Regulamento do ICMS da Bahia (RICMS/BA)', '2012-03-16', 'https://mbusca.sefaz.ba.gov.br/DITRI/normas_complementares/decretos/decreto_2012_13780_ricms_texto_2021.pdf'],
    ['ba-dec-14500-2013', 'Decreto', 'Decreto 14.500/2013', 'Crédito fiscal na compra de soja, milho, café e sorgo, com contribuição a fundo privado', '2013-05-28', 'https://mbusca.sefaz.ba.gov.br/DITRI/normas_complementares/decretos/decreto_2013_14500.pdf'],
    ['ba-lei-7932-2001', 'Lei', 'Lei 7.932/2001', 'Programa de Incentivo à Cultura do Algodão (PROALBA)', '2001-09-19', 'https://mbusca.sefaz.ba.gov.br/DITRI/leis/leis_estaduais/legest_2001_7932.pdf'],
    ['ba-dec-8064-2001', 'Decreto', 'Decreto 8.064/2001', 'Regulamento do PROALBA (contribuição a fundo privado da cotonicultura)', '2001-11-21', 'https://mbusca.sefaz.ba.gov.br/DITRI/normas_complementares/decretos/decreto_2001_8064.pdf'],
  ]),
  ...estadual('MA', 'SEFAZ-MA', [
    ['ma-lei-7799-2002', 'Lei', 'Lei 7.799/2002', 'Sistema Tributário do Estado do Maranhão (ICMS)', '2002-12-19', 'https://portal-sgc.sefaz.ma.gov.br/sgc/api/portal/arquivos/public/identificador?identificador=2e774d84-6990-4fd3-bdfb-863829fd3c08'],
    ['ma-dec-19714-2003', 'Decreto', 'Decreto 19.714/2003', 'Regulamento do ICMS do Maranhão (RICMS/MA), com os anexos em arquivos separados', '2003-07-10', 'https://portal-sgc.sefaz.ma.gov.br/sgc/api/portal/arquivos/public/identificador?identificador=99eaa3a0-b9c2-44ee-968f-d241aa074ff4'],
    ['ma-lei-12428-2024', 'Lei', 'Lei 12.428/2024', 'Contribuição Especial de Grãos (CEG)', '2024-11-25', 'https://portal-sgc.sefaz.ma.gov.br/sgc/api/portal/arquivos/public/identificador?identificador=24a61d21-3267-4f45-b289-dc5985f84cb1'],
  ]),
  ...estadual('PA', 'SEFA-PA', [
    ['pa-lei-5530-1989', 'Lei', 'Lei 5.530/1989', 'Lei do ICMS do Pará', '1989-01-13', 'https://www.sefa.pa.gov.br/legislacao/interna/lei/lp1989_05530.pdf'],
    ['pa-dec-4676-2001', 'Decreto', 'Decreto 4.676/2001', 'Regulamento do ICMS do Pará (RICMS/PA)', '2001-06-18', 'https://www.sefa.pa.gov.br/legislacao/interna/decreto/dc2001_04676.pdf'],
  ]),
  ...estadual('SP', 'SEFAZ-SP', [
    ['sp-lei-6374-1989', 'Lei', 'Lei 6.374/1989', 'Lei do ICMS de São Paulo', '1989-03-01', 'https://legislacao.fazenda.sp.gov.br/Paginas/texto6374.aspx'],
    ['sp-dec-45490-2000', 'Decreto', 'Decreto 45.490/2000', 'Regulamento do ICMS de São Paulo (RICMS/2000), com os anexos na mesma página', '2000-11-30', 'https://legislacao.fazenda.sp.gov.br/Paginas/textoricms.aspx'],
  ]),
  ...estadual('MG', 'SEF-MG', [
    ['mg-lei-6763-1975', 'Lei', 'Lei 6.763/1975', 'Consolida a legislação tributária de Minas Gerais (o ICMS está no Título II)', '1975-12-26', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/6763/1975/?cons=1', { orgao: 'Assembleia Legislativa de Minas Gerais' }],
    ['mg-dec-48589-2023', 'Decreto', 'Decreto 48.589/2023', 'Regulamento do ICMS de Minas Gerais (RICMS/2023), com os anexos em PDFs separados', '2023-03-22', 'https://www.fazenda.mg.gov.br/empresas/legislacao_tributaria/ricms_2023_seco/regulamento2023seco.pdf'],
  ]),
  ...estadual('PI', 'SEFAZ-PI', [
    ['pi-lei-4257-1989', 'Lei', 'Lei 4.257/1989', 'Lei do ICMS do Piauí', '1989-01-06', 'https://portaldalegislacao.sefaz.pi.gov.br/Arquivos/ARQUIVOS_CHRONUS/ARQUIVO_PRINCIPAL_LEGISLACAO/2081/Lei_n_4.257_1989.pdf'],
    ['pi-dec-21866-2023', 'Decreto', 'Decreto 21.866/2023', 'Regulamento do ICMS do Piauí (RICMS/PI), com os anexos em PDFs separados', '2023-03-06', 'https://portaldalegislacao.sefaz.pi.gov.br/Arquivos/ARQUIVOS_CHRONUS/ARQUIVO_PRINCIPAL_LEGISLACAO/1400/Decreto_n_21.866_2023_-_REGULAMENTO_DO_ICMS_DO_ESTADO_DO_PIAUI.pdf'],
  ]),
  ...estadual('TO', 'Assembleia Legislativa do Tocantins', [
    ['to-lei-1287-2001', 'Lei', 'Lei 1.287/2001', 'Código Tributário do Estado do Tocantins (institui o ICMS)', '2001-12-28', 'https://www.al.to.leg.br/arquivo/68306'],
    ['to-sefaz-legislacao', 'Página', 'Página da legislação tributária', 'Página oficial da legislação tributária do Tocantins (RICMS)', '', 'https://www.to.gov.br/sefaz/legislacao-tributaria/3lb4r1ekdyvb', {
      orgao: 'SEFAZ-TO',
      observacao: 'Em 26/11/2026 o link do RICMS nesta página apontava para um servidor da SEFAZ-TO que não respondia, e o regulamento não foi achado em outro endereço oficial. A revisão semanal avisa quando a página mudar.',
    }],
  ]),
  ...estadual('RO', 'SEFIN-RO', [
    ['ro-lei-688-1996', 'Lei', 'Lei 688/1996', 'Lei do ICMS de Rondônia (consolidada)', '1996-12-27', 'https://legislacao.sefin.ro.gov.br/normas/77', { monitorarEm: 'https://legislacao.sefin.ro.gov.br/link_arquivo/77' }],
    ['ro-dec-22721-2018', 'Decreto', 'Decreto 22.721/2018', 'Regulamento do ICMS de Rondônia (RICMS/RO), consolidado; anexos em fichas separadas', '2018-04-05', 'https://legislacao.sefin.ro.gov.br/normas/128', { monitorarEm: 'https://legislacao.sefin.ro.gov.br/link_arquivo/128' }],
  ]),
];

type ExtraEstadual = { observacao?: string; orgao?: string; monitorarEm?: string };

/** Norma estadual só com o link oficial: o número leva a UF ("Lei 7.098/1998 (MT)") para não se confundir com ato federal. */
function estadual(uf: string, orgao: string, itens: [string, string, string, string, string, string, (string | ExtraEstadual)?][]): FonteNorma[] {
  return itens.map(([chave, tipo, numero, titulo, data, url, extra]) => {
    const x: ExtraEstadual = typeof extra === 'string' ? { observacao: extra } : extra ?? {};
    return {
      chave, tipo: `${tipo} estadual`, numero: `${numero} (${uf})`, titulo, orgao: x.orgao ?? orgao, data_publicacao: data || undefined, url_oficial: url,
      prioridade: 1, grupo: 'territorial' as const, formato: 'externo' as const, uf, botao: BOTAO_ESTADUAL[chave] ?? tipo,
      ...(x.monitorarEm ? { url_monitoramento: x.monitorarEm } : {}),
      observacao: x.observacao ?? 'Texto consolidado no site oficial do estado; a redação anterior fica no meio do texto, por isso a norma fica só como referência.',
    };
  });
}

/** Endereço que a revisão semanal confere em cada norma só de referência (o do botão, salvo quando o catálogo indica outro). */
export const URL_MONITORAMENTO = new Map(FONTES_NORMAS.filter((f) => f.url_monitoramento).map((f) => [f.chave, f.url_monitoramento as string]));
