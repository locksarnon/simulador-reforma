import { Module } from '@nestjs/common';
import { BaseLegalController } from './base-legal.controller';
import { BaseLegalService } from './base-legal.service';
import { CartoesService } from './cartoes.service';
import { ConhecimentoLegalController } from './conhecimento-legal.controller';
import { ConhecimentoLegalService } from './conhecimento-legal.service';
import { ConsultaAprofundadaService } from './consulta-aprofundada.service';
import { PdfService } from '../pdf/pdf.service';
import { RevisaoLegalService } from './revisao-legal.service';
import { RevisaoSemanalService } from './revisao-semanal.service';

@Module({
  controllers: [BaseLegalController, ConhecimentoLegalController],
  providers: [BaseLegalService, CartoesService, RevisaoLegalService, RevisaoSemanalService, ConhecimentoLegalService, ConsultaAprofundadaService, PdfService],
  exports: [BaseLegalService, RevisaoLegalService, ConhecimentoLegalService],
})
export class BaseLegalModule {}
