import { Module } from '@nestjs/common';
import { ServicosContratadosController } from './servicos-contratados.controller';
import { ServicosContratadosService } from './servicos-contratados.service';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';

@Module({
  controllers: [ServicosContratadosController, ClientesController],
  providers: [ServicosContratadosService, ClientesService],
  exports: [ServicosContratadosService],
})
export class ServicosContratadosModule {}
