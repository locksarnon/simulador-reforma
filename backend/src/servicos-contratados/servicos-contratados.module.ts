import { Module } from '@nestjs/common';
import { CnpjModule } from '../cnpj/cnpj.module';
import { ServicosContratadosController } from './servicos-contratados.controller';
import { ServicosContratadosService } from './servicos-contratados.service';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { ProjetosDiagnosticoController } from './projetos.controller';
import { ProjetosDiagnosticoService } from './projetos.service';
import { ConsultoriaController } from './consultoria.controller';
import { ConsultoriaService } from './consultoria.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [CnpjModule, StorageModule],
  controllers: [ServicosContratadosController, ClientesController, ProjetosDiagnosticoController, ConsultoriaController],
  providers: [ServicosContratadosService, ClientesService, ProjetosDiagnosticoService, ConsultoriaService],
  exports: [ServicosContratadosService],
})
export class ServicosContratadosModule {}
