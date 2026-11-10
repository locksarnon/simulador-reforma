import { MaterialCertificado } from '../certificados/certificados.service';
import { Ambiente, ErroDeComunicacao } from './distribuicao-dfe.cliente';

export type PedidoCiencia = {
  ambiente: Ambiente;
  /** CNPJ (ou CPF) do destinatário da NF-e: é ele o autor do evento. */
  documentoDestinatario: string;
  /** Chaves de acesso (44 posições) das NF-e a manifestar. */
  chaves: string[];
  /** Instante do evento (dhEvento); o padrão é a hora atual. */
  agora?: Date;
};

export type StatusCiencia = 'REGISTRADA' | 'JA_REGISTRADA' | 'NAO_APLICAVEL' | 'REJEITADA';

export type ResultadoCiencia = {
  chave: string;
  status: StatusCiencia;
  cStat: string;
  xMotivo: string;
  protocolo: string | null;
};

/**
 * Falha de comunicação no meio de uma sequência de lotes: traz o que os lotes anteriores já registraram, para quem chamou
 * não perder esses resultados. As chaves que não aparecem em `resultados` não foram processadas.
 */
export class ErroCienciaParcial extends ErroDeComunicacao {
  constructor(mensagem: string, readonly resultados: ResultadoCiencia[]) {
    super(mensagem);
  }
}

/**
 * Registro da Ciência da Operação (evento 210210) de NF-e recebidas, em nome do destinatário. Classe abstrata para o motor da captura
 * poder ser testado sem rede. Falha de comunicação lança ErroDeComunicacao; a rejeição da SEFAZ a uma NF-e vem no resultado dela.
 */
export abstract class ManifestacaoCliente {
  abstract registrarCiencia(pedido: PedidoCiencia, certificado: MaterialCertificado): Promise<ResultadoCiencia[]>;
}
