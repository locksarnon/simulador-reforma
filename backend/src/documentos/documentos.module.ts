import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { StorageModule } from '../storage/storage.module';
import { DocumentosController, DownloadsController } from './documentos.controller';
import { DocumentosService } from './documentos.service';

@Module({
  imports: [StorageModule, NotificacoesModule],
  controllers: [DocumentosController, DownloadsController],
  providers: [DocumentosService],
})
export class DocumentosModule {}
