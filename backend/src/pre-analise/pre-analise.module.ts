import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CnpjModule } from '../cnpj/cnpj.module';
import { MonitoramentoModule } from '../monitoramento/monitoramento.module';
import { CertificadosModule } from '../certificados/certificados.module';
import { PdfService } from '../pdf/pdf.service';
import { CertidoesController, IntegracoesExternasController, PreAnaliseController } from './pre-analise.controller';
import { InfosimplesService } from '../infosimples/infosimples.service';
import { DividaAtivaService } from '../divida-ativa/divida-ativa.service';
import { CertidoesService } from './certidoes.service';
import { PreAnaliseService } from './pre-analise.service';
import { ConsultaCccHttp } from './ccc.http';
import { SerproCertidoes } from './serpro-certidoes';

@Module({
  imports: [StorageModule, CnpjModule, MonitoramentoModule, CertificadosModule],
  controllers: [PreAnaliseController, CertidoesController, IntegracoesExternasController],
  providers: [PreAnaliseService, PdfService, ConsultaCccHttp, SerproCertidoes, CertidoesService, InfosimplesService, DividaAtivaService],
})
export class PreAnaliseModule {}
