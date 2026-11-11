import { Module } from '@nestjs/common';
import { ServicosContratadosController } from './servicos-contratados.controller';
import { ServicosContratadosService } from './servicos-contratados.service';

@Module({
  controllers: [ServicosContratadosController],
  providers: [ServicosContratadosService],
  exports: [ServicosContratadosService],
})
export class ServicosContratadosModule {}
