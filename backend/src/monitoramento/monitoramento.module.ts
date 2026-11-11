import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CertificadosModule } from '../certificados/certificados.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { MonitoramentoController } from './monitoramento.controller';
import { MonitoramentoService } from './monitoramento.service';

@Module({
  imports: [StorageModule, CertificadosModule, NotificacoesModule],
  controllers: [MonitoramentoController],
  providers: [MonitoramentoService],
  exports: [MonitoramentoService],
})
export class MonitoramentoModule {}
