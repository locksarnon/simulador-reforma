import { Module } from '@nestjs/common';
import { CertificadosModule } from '../certificados/certificados.module';
import { RepositorioXmlModule } from '../repositorio-xml/repositorio-xml.module';
import { CapturaXmlController } from './captura-xml.controller';
import { CapturaXmlService } from './captura-xml.service';
import { DistribuicaoDfeCliente } from './distribuicao-dfe.cliente';
import { DistribuicaoDfeHttp } from './distribuicao-dfe.http';
import { DistribuicaoDfeRoteador } from './distribuicao-dfe.roteador';
import { ManifestacaoCliente } from './manifestacao.cliente';
import { ManifestacaoHttp } from './manifestacao.http';
import { NfseAdnHttp } from './nfse-adn.http';

@Module({
  imports: [CertificadosModule, RepositorioXmlModule],
  controllers: [CapturaXmlController],
  providers: [
    CapturaXmlService,
    DistribuicaoDfeHttp,
    NfseAdnHttp,
    { provide: DistribuicaoDfeCliente, useClass: DistribuicaoDfeRoteador },
    { provide: ManifestacaoCliente, useClass: ManifestacaoHttp },
  ],
})
export class CapturaXmlModule {}
