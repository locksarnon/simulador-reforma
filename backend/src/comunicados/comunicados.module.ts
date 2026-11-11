import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { StorageModule } from '../storage/storage.module';
import { ComunicacoesController, ComunicadosController, ComunicadosPublicoController } from './comunicados.controller';
import { ComunicadosService } from './comunicados.service';

@Module({
  imports: [StorageModule, NotificacoesModule],
  controllers: [ComunicadosController, ComunicacoesController, ComunicadosPublicoController],
  providers: [ComunicadosService],
})
export class ComunicadosModule {}
