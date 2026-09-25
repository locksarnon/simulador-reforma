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
];
