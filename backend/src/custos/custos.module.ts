import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CustosController } from './custos.controller';
import { CustosService } from './custos.service';
import { ContratosService } from './contratos.service';

@Module({
  imports: [StorageModule],
  controllers: [CustosController],
  providers: [CustosService, ContratosService],
  exports: [CustosService],
})
export class CustosModule {}
