import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CertificadosModule } from '../certificados/certificados.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { MonitoramentoController } from './monitoramento.controller';
import { MonitoramentoService } from './monitoramento.service';
import { ContratoIntegraService } from './contrato.service';
import { PdfService } from '../pdf/pdf.service';
import { EscritorioService } from './escritorio.service';
import { SpedDownloadService } from '../receitanetbx/sped-download.service';
import { SimplesService } from './simples.service';
import { InfosimplesService } from '../infosimples/infosimples.service';
import { EnvioDocumentosService } from './envio-documentos.service';

@Module({
  imports: [StorageModule, CertificadosModule, NotificacoesModule],
  controllers: [MonitoramentoController],
  providers: [MonitoramentoService, ContratoIntegraService, PdfService, EscritorioService, SpedDownloadService, SimplesService, EnvioDocumentosService, InfosimplesService],
  exports: [MonitoramentoService, ContratoIntegraService],
})
export class MonitoramentoModule {}
