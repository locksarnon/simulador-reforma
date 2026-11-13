import { Module } from '@nestjs/common';
import { CorrelacaoServicosController } from './correlacao-servicos.controller';
import { CorrelacaoServicosService } from './correlacao-servicos.service';

@Module({
  controllers: [CorrelacaoServicosController],
  providers: [CorrelacaoServicosService],
})
export class CorrelacaoServicosModule {}
