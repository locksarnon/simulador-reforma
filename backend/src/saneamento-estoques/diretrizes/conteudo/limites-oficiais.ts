/**
 * Limites de caracteres dos leiautes oficiais para os campos do cadastro de itens (docs/limites-caracteres.md). Leiaute oficial é o TETO;
 * o ERP (Cadastro de ERPs, tipo LIMITE_CAMPO) e o cliente só restringem mais. Pesquisa de 26/11/2026, só em fonte oficial.
 *
 * SPED: nos dois Guias Práticos, campo alfanumérico ("C") com tamanho "-" tem máximo de 255 caracteres (regra geral da Seção 3), não
 * "sem limite". NF-e/NFC-e: o mesmo leiaute (MOC 7.00, Anexo I) e o schema leiauteNFe_v4.00.xsd do pacote vigente dão os tamanhos.
 * Limite não confirmado em fonte oficial = null e confirmado false; nunca um número genérico.
 */
import type { LinhaLimite } from '../tipos';

const URL_EFD = 'https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi/manuais-e-documentos-tecnicos/guia-pratico-efd-versao-3-2-4.pdf/@@display-file/file';
const URL_CONTRIB = 'https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-contribuicoes/manuais/guia_pratico_efd_contribuicoes_versao_1_35-18_06_2021.pdf';
const URL_MOC = 'https://dfe-portal.svrs.rs.gov.br/NFE/DownloadArquivoEstatico/?sistema=NFE&tipoArquivo=1&nomeArquivo=moc7-anexo-i-leiaute-e-rv.pdf';

const EFD = 'Guia Prático EFD ICMS/IPI 3.2.4 (atualização 30/07/2026; leiaute 020, mantido no 021 da NT 2026.001)';
const REGRA_255_EFD = 'campo "C" sem tamanho = até 255 caracteres (Cap. I, Seção 3, p. 19)';
const CONTRIB = 'Guia Prático EFD-Contribuições 1.35 (18/06/2021)';
const REGRA_255_CONTRIB = 'campo "C" sem tamanho = até 255 caracteres (Seção 3, p. 34; legenda dos registros, p. 56)';
const NFE = 'MOC 7.00, Anexo I (Leiaute e Regras de Validação da NF-e e da NFC-e) e leiauteNFe_v4.00.xsd do pacote PL_010c (NT 2022.002 v1.30, 11/03/2026)';

type Base = Pick<LinhaLimite, 'destino' | 'campo' | 'campoItem' | 'limite' | 'referencia' | 'url'>;
const linha = (b: Base): LinhaLimite => ({
  ...b, origem: 'LEIAUTE_OFICIAL', confirmado: b.limite !== null, tratamento: 'SUGERIR_ABREVIACAO', preservar: ['NOME', 'REFERENCIA'],
});

export const LIMITES_OFICIAIS: LinhaLimite[] = [
  // ── SPED EFD ICMS/IPI ──────────────────────────────────────────────────────
  linha({ destino: 'SPED EFD ICMS/IPI', campo: '0200 COD_ITEM', campoItem: 'codigo', limite: 60, referencia: `${EFD}, registro 0200, campo 02 (C 060), p. 36`, url: URL_EFD }),
  linha({ destino: 'SPED EFD ICMS/IPI', campo: '0200 DESCR_ITEM', campoItem: 'descricao', limite: 255, referencia: `${EFD}, registro 0200, campo 03 (C -), p. 36; ${REGRA_255_EFD}`, url: URL_EFD }),
  linha({ destino: 'SPED EFD ICMS/IPI', campo: '0200 UNID_INV', campoItem: 'unidade', limite: 6, referencia: `${EFD}, registro 0200, campo 06 (C 006), p. 36`, url: URL_EFD }),
  linha({ destino: 'SPED EFD ICMS/IPI', campo: '0190 UNID', campoItem: 'unidade', limite: 6, referencia: `${EFD}, registro 0190, campo 02 (C 006), p. 35`, url: URL_EFD }),
  linha({ destino: 'SPED EFD ICMS/IPI', campo: '0205 DESCR_ANT_ITEM', campoItem: 'descricao', limite: 255, referencia: `${EFD}, registro 0205, campo 02 (C -), p. 39; ${REGRA_255_EFD}`, url: URL_EFD }),
  linha({ destino: 'SPED EFD ICMS/IPI', campo: '0205 COD_ANT_ITEM', campoItem: 'codigo', limite: 60, referencia: `${EFD}, registro 0205, campo 05 (C 060), p. 39`, url: URL_EFD }),
  linha({ destino: 'SPED EFD ICMS/IPI', campo: '0220 UNID_CONV', campoItem: 'unidade', limite: 6, referencia: `${EFD}, registro 0220, campo 02 (C 006), p. 41`, url: URL_EFD }),
  linha({ destino: 'SPED EFD ICMS/IPI', campo: 'C170 COD_ITEM', campoItem: 'codigo', limite: 60, referencia: `${EFD}, registro C170, campo 03 (C 060), p. 80`, url: URL_EFD }),
  linha({ destino: 'SPED EFD ICMS/IPI', campo: 'C170 DESCR_COMPL', campoItem: 'descricao', limite: 255, referencia: `${EFD}, registro C170, campo 04 (C -), p. 80; ${REGRA_255_EFD}`, url: URL_EFD }),
  linha({ destino: 'SPED EFD ICMS/IPI', campo: 'C170 UNID', campoItem: 'unidade', limite: 6, referencia: `${EFD}, registro C170, campo 06 (C 006), p. 80`, url: URL_EFD }),
  linha({ destino: 'SPED EFD ICMS/IPI', campo: 'H010 COD_ITEM', campoItem: 'codigo', limite: 60, referencia: `${EFD}, registro H010, campo 02 (C 060), p. 267`, url: URL_EFD }),
  linha({ destino: 'SPED EFD ICMS/IPI', campo: 'H010 UNID', campoItem: 'unidade', limite: 6, referencia: `${EFD}, registro H010, campo 03 (C 006), p. 267`, url: URL_EFD }),

  // ── SPED EFD-Contribuições ─────────────────────────────────────────────────
  linha({ destino: 'SPED EFD-Contribuições', campo: '0200 COD_ITEM', campoItem: 'codigo', limite: 60, referencia: `${CONTRIB}, registro 0200, campo 02 (C 060), p. 83`, url: URL_CONTRIB }),
  linha({ destino: 'SPED EFD-Contribuições', campo: '0200 DESCR_ITEM', campoItem: 'descricao', limite: 255, referencia: `${CONTRIB}, registro 0200, campo 03 (C -), p. 83; ${REGRA_255_CONTRIB}`, url: URL_CONTRIB }),
  linha({ destino: 'SPED EFD-Contribuições', campo: '0200 UNID_INV', campoItem: 'unidade', limite: 6, referencia: `${CONTRIB}, registro 0200, campo 06 (C 006), p. 83`, url: URL_CONTRIB }),
  linha({ destino: 'SPED EFD-Contribuições', campo: '0190 UNID', campoItem: 'unidade', limite: 6, referencia: `${CONTRIB}, registro 0190, campo 02 (C 006), p. 83`, url: URL_CONTRIB }),
  linha({ destino: 'SPED EFD-Contribuições', campo: '0205 DESCR_ANT_ITEM', campoItem: 'descricao', limite: 255, referencia: `${CONTRIB}, registro 0205, campo 02 (C -), p. 85; ${REGRA_255_CONTRIB}`, url: URL_CONTRIB }),
  linha({ destino: 'SPED EFD-Contribuições', campo: '0205 COD_ANT_ITEM', campoItem: 'codigo', limite: 60, referencia: `${CONTRIB}, registro 0205, campo 05 (C 060), p. 85`, url: URL_CONTRIB }),
  linha({ destino: 'SPED EFD-Contribuições', campo: 'C170 DESCR_COMPL', campoItem: 'descricao', limite: 255, referencia: `${CONTRIB}, registro C170, campo 04 (C -), p. 118; ${REGRA_255_CONTRIB}`, url: URL_CONTRIB }),

  // ── NF-e e NFC-e (mesmo leiaute) ───────────────────────────────────────────
  linha({ destino: 'NF-e e NFC-e', campo: 'cProd (I02)', campoItem: 'codigo', limite: 60, referencia: `${NFE}; Anexo I, p. 17 (1-60); xsd: maxLength 60`, url: URL_MOC }),
  linha({ destino: 'NF-e e NFC-e', campo: 'xProd (I04)', campoItem: 'descricao', limite: 120, referencia: `${NFE}; Anexo I, p. 17 (1-120); xsd: maxLength 120`, url: URL_MOC }),
  linha({ destino: 'NF-e e NFC-e', campo: 'uCom (I09)', campoItem: 'unidade', limite: 6, referencia: `${NFE}; Anexo I, p. 18 (1-6); xsd: maxLength 6`, url: URL_MOC }),
  linha({ destino: 'NF-e e NFC-e', campo: 'uTrib (I13)', campoItem: 'unidade', limite: 6, referencia: `${NFE}; Anexo I, p. 19 (1-6); xsd: maxLength 6`, url: URL_MOC }),
];
