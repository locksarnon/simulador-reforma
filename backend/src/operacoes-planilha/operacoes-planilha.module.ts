import { Module } from '@nestjs/common';
import { OperacoesPlanilhaController } from './operacoes-planilha.controller';
import { OperacoesPlanilhaService } from './operacoes-planilha.service';

@Module({
  controllers: [OperacoesPlanilhaController],
  providers: [OperacoesPlanilhaService],
})
export class OperacoesPlanilhaModule {}
