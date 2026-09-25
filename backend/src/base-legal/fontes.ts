/**
 * Normas da Base legal (fonte oficial). `prioridade` 0 = muda cálculo/enquadramento/obrigação.
 * Só entram aqui URLs conferidas; o restante do mapa mestre fica como "a verificar" em docs.
 */
export type FonteNorma = {
  chave: string;
  tipo: string;
  numero: string;
  titulo: string;
  orgao: string;
  data_publicacao: string; // fallback; a data do cabeçalho do texto prevalece
  url_oficial: string;
  prioridade: number;
  observacao?: string;
};

const PLANALTO = 'https://www.planalto.gov.br/ccivil_03';

export const FONTES_NORMAS: FonteNorma[] = [
  {
    chave: 'ec-132-2023', tipo: 'Emenda Constitucional', numero: 'EC 132/2023',
    titulo: 'Altera o Sistema Tributário Nacional', orgao: 'Congresso Nacional', data_publicacao: '2023-12-20',
    url_oficial: `${PLANALTO}/constituicao/emendas/emc/emc132.htm`, prioridade: 0,
    observacao: 'Marco constitucional: cria IBS, CBS e Imposto Seletivo e as regras de transição (ADCT).',
  },
  {
    chave: 'lcp-214-2025', tipo: 'Lei Complementar', numero: 'LC 214/2025',
    titulo: 'Institui o IBS, a CBS e o Imposto Seletivo (texto compilado)', orgao: 'Presidência da República', data_publicacao: '2025-01-16',
    url_oficial: `${PLANALTO}/leis/lcp/lcp214compilado.htm`, prioridade: 0,
    observacao: 'Texto compilado do Planalto, já com as alterações posteriores (inclui a LC 227/2026).',
  },
  {
    chave: 'lcp-227-2026', tipo: 'Lei Complementar', numero: 'LC 227/2026',
    titulo: 'Institui o Comitê Gestor do IBS, o processo administrativo do IBS e altera a LC 214/2025', orgao: 'Presidência da República', data_publicacao: '2026-01-13',
    url_oficial: `${PLANALTO}/leis/lcp/lcp227.htm`, prioridade: 0,
    observacao: 'Texto original da lei; os dispositivos que alteram outras normas aparecem dentro dos artigos alteradores.',
  },
  {
    chave: 'lcp-235-2026', tipo: 'Lei Complementar', numero: 'LC 235/2026',
    titulo: 'Renúncias de receita e benefícios (minerais críticos, fertilizantes, etanol)', orgao: 'Presidência da República', data_publicacao: '2026-08-27',
    url_oficial: `${PLANALTO}/leis/lcp/lcp235.htm`, prioridade: 0,
    observacao: 'Afeta os segmentos de etanol, fertilizantes e minerais críticos; remete a artigos da LC 214/2025.',
  },
  {
    chave: 'dec-12955-2026', tipo: 'Decreto', numero: 'Decreto 12.955/2026',
    titulo: 'Regulamento da CBS', orgao: 'Presidência da República', data_publicacao: '2026-04-30',
    url_oficial: `${PLANALTO}/_ato2023-2026/2026/decreto/d12955.htm`, prioridade: 0,
    observacao: 'Regulamenta a CBS (referenciado pela própria LC 214 compilada).',
  },
  {
    chave: 'cf-1988', tipo: 'Constituição', numero: 'CF/1988',
    titulo: 'Constituição da República Federativa do Brasil (texto compilado, com o ADCT)', orgao: 'Congresso Nacional', data_publicacao: '1988-10-05',
    url_oficial: `${PLANALTO}/constituicao/constituicao.htm`, prioridade: 1,
    observacao: 'Base constitucional: competências, IBS/CBS/IS (arts. 156-A e 195) e o ADCT com a transição da EC 132.',
  },
  {
    chave: 'lcp-123-2006', tipo: 'Lei Complementar', numero: 'LC 123/2006',
    titulo: 'Estatuto Nacional da Microempresa e da Empresa de Pequeno Porte (Simples Nacional)', orgao: 'Presidência da República', data_publicacao: '2006-12-14',
    url_oficial: `${PLANALTO}/leis/lcp/lcp123.htm`, prioridade: 1,
    observacao: 'Simples Nacional e sua integração com IBS/CBS.',
  },
  {
    chave: 'lcp-87-1996', tipo: 'Lei Complementar', numero: 'LC 87/1996',
    titulo: 'Lei Kandir — ICMS', orgao: 'Presidência da República', data_publicacao: '1996-09-13',
    url_oficial: `${PLANALTO}/leis/lcp/lcp87.htm`, prioridade: 1,
    observacao: 'Convive com o IBS durante a transição do ICMS (créditos e saldos).',
  },
  {
    chave: 'lcp-116-2003', tipo: 'Lei Complementar', numero: 'LC 116/2003',
    titulo: 'Imposto sobre Serviços de Qualquer Natureza (ISS)', orgao: 'Presidência da República', data_publicacao: '2003-07-31',
    url_oficial: `${PLANALTO}/leis/lcp/lcp116.htm`, prioridade: 1,
    observacao: 'Convive com o IBS durante a transição do ISS; lista de serviços.',
  },
  {
    chave: 'ctn-5172-1966', tipo: 'Lei', numero: 'Lei 5.172/1966 (CTN)',
    titulo: 'Código Tributário Nacional (texto compilado)', orgao: 'Presidência da República', data_publicacao: '1966-10-25',
    url_oficial: `${PLANALTO}/leis/l5172compilado.htm`, prioridade: 1,
    observacao: 'Normas gerais de direito tributário; alterado pela LC 236/2026.',
  },
  {
    chave: 'lcp-225-2026', tipo: 'Lei Complementar', numero: 'LC 225/2026',
    titulo: 'Código de Defesa do Contribuinte', orgao: 'Presidência da República', data_publicacao: '2026-01-08',
    url_oficial: `${PLANALTO}/leis/lcp/lcp225.htm`, prioridade: 1,
    observacao: 'Direitos, garantias e deveres na relação entre Fisco e contribuinte.',
  },
  {
    chave: 'lcp-236-2026', tipo: 'Lei Complementar', numero: 'LC 236/2026',
    titulo: 'Altera o CTN: solução de controvérsias, consensualidade e processo administrativo tributário', orgao: 'Presidência da República', data_publicacao: '2026-09-04',
    url_oficial: `${PLANALTO}/leis/lcp/lcp236.htm`, prioridade: 1,
    observacao: 'Os artigos citados do CTN aparecem dentro dos artigos alteradores.',
  },
  {
    chave: 'lei-5764-1971', tipo: 'Lei', numero: 'Lei 5.764/1971',
    titulo: 'Política Nacional de Cooperativismo e regime jurídico das sociedades cooperativas', orgao: 'Presidência da República', data_publicacao: '1971-12-16',
    url_oficial: `${PLANALTO}/leis/l5764.htm`, prioridade: 1,
    observacao: 'Base para o enquadramento de cooperativas (ato cooperativo), relevante no agro.',
  },
];
