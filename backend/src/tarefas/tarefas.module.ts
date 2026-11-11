import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { ProcessosService } from './processos.service';
import { TarefasController } from './tarefas.controller';
import { TarefasService } from './tarefas.service';

@Module({
  imports: [NotificacoesModule],
  controllers: [TarefasController],
  providers: [TarefasService, ProcessosService],
  exports: [TarefasService, ProcessosService],
})
export class TarefasModule {}
