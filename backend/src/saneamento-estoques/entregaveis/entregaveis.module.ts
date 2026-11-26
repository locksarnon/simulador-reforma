import { Module } from '@nestjs/common';
import { PdfService } from '../../pdf/pdf.service';
import { SanVersoesService } from '../dados/versoes.service';
import { SAN_ENTREGAVEIS } from '../dados/portas';
import { EntregaveisController } from './entregaveis.controller';
import { EntregaveisService } from './entregaveis.service';

/**
 * Módulo dos entregáveis. Independente do módulo de dados (sem importação circular): tem o próprio SanVersoesService (só lê o banco, sem estado).
 * O integrador o importa e usa o provider do token SAN_ENTREGAVEIS no lugar do stub.
 */
@Module({
  controllers: [EntregaveisController],
  providers: [PdfService, SanVersoesService, EntregaveisService, { provide: SAN_ENTREGAVEIS, useExisting: EntregaveisService }],
  exports: [SAN_ENTREGAVEIS, EntregaveisService],
})
export class EntregaveisModule {}
