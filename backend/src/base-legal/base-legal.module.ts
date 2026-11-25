import { Module } from '@nestjs/common';
import { BaseLegalController } from './base-legal.controller';
import { BaseLegalService } from './base-legal.service';
import { CartoesService } from './cartoes.service';
import { ConsultaAprofundadaService } from './consulta-aprofundada.service';
import { PdfService } from '../pdf/pdf.service';
import { RevisaoLegalService } from './revisao-legal.service';

@Module({
  controllers: [BaseLegalController],
  providers: [BaseLegalService, CartoesService, RevisaoLegalService, ConsultaAprofundadaService, PdfService],
  exports: [BaseLegalService, RevisaoLegalService],
})
export class BaseLegalModule {}
