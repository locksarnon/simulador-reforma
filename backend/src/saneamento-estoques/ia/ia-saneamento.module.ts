import { Module } from '@nestjs/common';
import { BaseLegalModule } from '../../base-legal/base-legal.module';
import { SAN_PARECER_IA } from '../dados/portas';
import { SaneamentoEstoquesModule } from '../dados/saneamento-estoques.module';
import { IaSaneamentoController } from './ia-saneamento.controller';
import { ParecerIaService } from './parecer-ia.service';
import { SanCriteriosIaService } from '../criterios/criterios-ia.service';

/**
 * Troca o stub da porta SAN_PARECER_IA pelo parecer real. O integrador registra ESTE módulo no AppModule (junto do SaneamentoEstoquesModule).
 * Quem precisar da porta importa este módulo; o stub do módulo de dados não é injetado em ninguém.
 */
@Module({
  imports: [SaneamentoEstoquesModule, BaseLegalModule],
  controllers: [IaSaneamentoController],
  providers: [ParecerIaService, SanCriteriosIaService, { provide: SAN_PARECER_IA, useExisting: ParecerIaService }],
  exports: [ParecerIaService, SAN_PARECER_IA],
})
export class IaSaneamentoModule {}
