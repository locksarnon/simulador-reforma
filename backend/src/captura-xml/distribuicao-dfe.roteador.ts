import { Injectable } from '@nestjs/common';
import { MaterialCertificado } from '../certificados/certificados.service';
import { ConsultaDistribuicao, DistribuicaoDfeCliente, RespostaDistribuicao } from './distribuicao-dfe.cliente';
import { DistribuicaoDfeHttp } from './distribuicao-dfe.http';
import { NfseAdnHttp } from './nfse-adn.http';

/** Escolhe o serviço pelo tipo do documento: NFS-e Nacional vai ao ADN; NF-e, CT-e e MDF-e, à Distribuição de DF-e da SEFAZ. */
@Injectable()
export class DistribuicaoDfeRoteador extends DistribuicaoDfeCliente {
  constructor(
    private readonly sefaz: DistribuicaoDfeHttp,
    private readonly adn: NfseAdnHttp,
  ) {
    super();
  }

  consultar(consulta: ConsultaDistribuicao, certificado: MaterialCertificado): Promise<RespostaDistribuicao> {
    return (consulta.tipo === 'NFSE' ? this.adn : this.sefaz).consultar(consulta, certificado);
  }
}
