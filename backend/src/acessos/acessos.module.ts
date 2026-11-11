import { Module } from '@nestjs/common';
import { AcessosController } from './acessos.controller';
import { AcessosService } from './acessos.service';

@Module({
  controllers: [AcessosController],
  providers: [AcessosService],
  exports: [AcessosService],
})
export class AcessosModule {}
