import { MaterialCertificado } from '../certificados/certificados.service';

export type TipoCaptura = 'NFE' | 'CTE' | 'MDFE' | 'NFSE';
export type Ambiente = 'PRODUCAO' | 'HOMOLOGACAO';

export type DocumentoDistribuido = { nsu: string; schema: string; xml: string };

export type RespostaDistribuicao = {
  cStat: string;
  xMotivo: string;
  ultNSU: string;
  maxNSU: string;
  documentos: DocumentoDistribuido[];
  /**
   * O serviço indica se há mais documentos a buscar já (ADN: lote cheio). Sem isso, o motor compara ultNSU com maxNSU,
   * como na Distribuição de DF-e da SEFAZ.
   */
  maisDocumentos?: boolean;
};

export type ConsultaDistribuicao = {
  tipo: TipoCaptura;
  ambiente: Ambiente;
  /** CNPJ (ou CPF) consultado: o da empresa, que pode ser filial do titular do certificado. */
  documento: string;
  /** Código IBGE da UF do interessado (cUFAutor). A NFS-e (ADN) não usa. */
  ufAutor: string;
  /** Último NSU já recebido (15 dígitos; o NSU do ADN pode ter até 20). */
  ultNSU: string;
};

/** Falha de comunicação (rede, TLS, tempo esgotado, resposta fora do padrão): a consulta pode ser repetida depois. */
export class ErroDeComunicacao extends Error {}

/**
 * Serviço de distribuição de DF-e (NF-e, CT-e e MDF-e na SEFAZ; NFS-e Nacional no ADN). Classe abstrata para o motor da captura
 * poder ser testado sem rede; a implementação de verdade usa TLS mútuo com o certificado A1 do cliente.
 */
export abstract class DistribuicaoDfeCliente {
  abstract consultar(consulta: ConsultaDistribuicao, certificado: MaterialCertificado): Promise<RespostaDistribuicao>;
}
