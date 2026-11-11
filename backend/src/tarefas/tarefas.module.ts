import { Module } from '@nestjs/common';
import { ProcessosService } from './processos.service';
import { TarefasController } from './tarefas.controller';
import { TarefasService } from './tarefas.service';

@Module({
  controllers: [TarefasController],
  providers: [TarefasService, ProcessosService],
  exports: [TarefasService, ProcessosService],
})
export class TarefasModule {}
