import { Module } from '@nestjs/common';
import { CustosController } from './custos.controller';
import { CustosService } from './custos.service';

@Module({
  controllers: [CustosController],
  providers: [CustosService],
})
export class CustosModule {}
