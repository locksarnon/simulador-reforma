import { Module } from '@nestjs/common';
import { CnpjModule } from '../cnpj/cnpj.module';
import { ServicosContratadosController } from './servicos-contratados.controller';
import { ServicosContratadosService } from './servicos-contratados.service';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { ProjetosDiagnosticoController } from './projetos.controller';
import { ProjetosDiagnosticoService } from './projetos.service';

@Module({
  imports: [CnpjModule],
  controllers: [ServicosContratadosController, ClientesController, ProjetosDiagnosticoController],
  providers: [ServicosContratadosService, ClientesService, ProjetosDiagnosticoService],
  exports: [ServicosContratadosService],
})
export class ServicosContratadosModule {}
