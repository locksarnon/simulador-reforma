import { Module } from '@nestjs/common';
import { BaseLegalModule } from '../base-legal/base-legal.module';
import { AnalisarIaService } from './analisar-ia.service';
import { IaConsultoriaController } from './ia-consultoria.controller';

/**
 * O integrador registra este módulo no AppModule. Para incluir achados de outro módulo (ex.: o laudo da homologação), forneça o token
 * ACHADOS_IA com uma função `(projeto) => Promise<string[]>`; é opcional.
 */
@Module({ imports: [BaseLegalModule], controllers: [IaConsultoriaController], providers: [AnalisarIaService], exports: [AnalisarIaService] })
export class IaConsultoriaModule {}
