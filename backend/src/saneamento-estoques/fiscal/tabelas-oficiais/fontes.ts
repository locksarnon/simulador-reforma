/**
 * Fontes oficiais das tabelas da Fase 2 (Tributário e Reforma). Regra do projeto: só fonte oficial (gov.br, Planalto, RFB,
 * CONFAZ, portal da NF-e/SPED). O que não foi conferido na fonte fica marcado como "não confirmado" no próprio dado.
 */
export type FonteOficial = {
  /** Nome do documento e versão. */
  documento: string;
  url: string;
  /** Data do documento (publicação/atualização), quando informada pela fonte. */
  dataDocumento: string | null;
  /** Data em que a fonte foi lida para montar a tabela (yyyy-mm-dd). */
  lidaEm: string;
  observacao?: string;
};

export const FONTE_GUIA_EFD: FonteOficial = {
  documento: 'Guia Prático EFD-ICMS/IPI – Versão 3.2.4 (registro 0200, campo 07 TIPO_ITEM; registro H010, campo 07 IND_PROP)',
  url: 'https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi/manuais-e-documentos-tecnicos/guia-pratico-efd-versao-3-2-4.pdf',
  dataDocumento: '2026-07-30',
  lidaEm: '2026-11-27',
  observacao: 'Versão 3.2.4 é a mais recente listada na página da EFD ICMS/IPI no gov.br/sped em 27/11/2026. Registro 0200 nas páginas 37 e 38; H010 nas páginas 267 e 268.',
};

export const FONTE_CFOP: FonteOficial = {
  documento: 'Convênio s/nº, de 15 de dezembro de 1970, Anexo II — Código Fiscal de Operações e de Prestações (CFOP), redação do Ajuste SINIEF 03/24',
  url: 'https://www.confaz.fazenda.gov.br/legislacao/ajustes/sinief/cfop_cvsn_1-6.24',
  dataDocumento: '2024-06-01',
  lidaEm: '2026-11-27',
  observacao:
    'Texto consolidado do CONFAZ, com efeitos a partir de 01.06.24 e anotação do Ajuste SINIEF 39/25 (CFOP 7.667, efeitos a partir de 01.02.26). '
    + 'Ajustes SINIEF de 2025 que alteram o Convênio (10/25 e 18/25) conferidos: não tocam o CFOP. '
    + 'A lista de Ajustes SINIEF de 2026 não abriu no portal do CONFAZ (página pede login/cookies): alteração de CFOP em 2026 não confirmada.',
};

export const FONTE_LC214: FonteOficial = {
  documento: 'Lei Complementar nº 214, de 16 de janeiro de 2025 — texto compilado (inclui alterações da LC 227/2026)',
  url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm',
  dataDocumento: null,
  lidaEm: '2026-11-27',
  observacao: 'Lido por artigo na cópia do texto compilado do Planalto guardada na Base legal do InTAX (capturada em 26/11/2026).',
};

/** Marca usada no dado quando a fonte oficial não foi conferida. */
export const NAO_CONFIRMADO = 'não confirmado' as const;
