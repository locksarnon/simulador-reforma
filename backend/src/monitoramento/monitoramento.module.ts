import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CertificadosModule } from '../certificados/certificados.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { MonitoramentoController } from './monitoramento.controller';
import { MonitoramentoService } from './monitoramento.service';
import { ContratoIntegraService } from './contrato.service';
import { PdfService } from '../pdf/pdf.service';
import { EscritorioService } from './escritorio.service';

@Module({
  imports: [StorageModule, CertificadosModule, NotificacoesModule],
  controllers: [MonitoramentoController],
  providers: [MonitoramentoService, ContratoIntegraService, PdfService, EscritorioService],
  exports: [MonitoramentoService, ContratoIntegraService],
})
export class MonitoramentoModule {}
