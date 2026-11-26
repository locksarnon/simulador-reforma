import { Module } from '@nestjs/common';
import { SanCasosService } from './casos.service';
import { SanImportacaoService } from './importacao.service';
import { SanImpactosService } from './impactos.service';
import { SanItensService } from './itens.service';
import { CatalogosFiscaisPrisma } from '../fiscal';
import { ImportadorPlanilha } from './importador.provider';
import { MotorSaneamento } from './motor.provider';
import { SanOrquestracaoService } from './orquestracao.service';
import {
  SAN_ENTREGAVEIS, SAN_IMPORTADOR, SAN_MOTOR, SAN_PARECER_IA, entregaveisStub, parecerIaStub,
} from './portas';
import { SanProjetoService } from './projeto.service';
import { SaneamentoEstoquesController } from './saneamento-estoques.controller';
import { SanVersoesService } from './versoes.service';

/**
 * Importador (Agente 2) e motor (Agentes 3 e 4) são REAIS. SAN_PARECER_IA (Agente 7) e SAN_ENTREGAVEIS (Agente 6) ainda são STUBS: quando
 * ia/ e entregaveis/ terminarem, o integrador troca as duas linhas marcadas "TROCAR" abaixo por useClass/useFactory dos módulos deles.
 */
@Module({
  controllers: [SaneamentoEstoquesController],
  providers: [
    SanProjetoService, SanImportacaoService, SanItensService, SanCasosService, SanVersoesService, SanImpactosService, SanOrquestracaoService,
    CatalogosFiscaisPrisma,
    { provide: SAN_IMPORTADOR, useClass: ImportadorPlanilha },
    { provide: SAN_MOTOR, useClass: MotorSaneamento },
    { provide: SAN_PARECER_IA, useValue: parecerIaStub }, // TROCAR (Agente 7)
    { provide: SAN_ENTREGAVEIS, useValue: entregaveisStub }, // TROCAR (Agente 6)
  ],
  exports: [SanProjetoService, SanCasosService, SanVersoesService, SanImpactosService, SAN_PARECER_IA, SAN_ENTREGAVEIS],
})
export class SaneamentoEstoquesModule {}
