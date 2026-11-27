import { Module } from '@nestjs/common';
import { CnpjModule } from '../../cnpj/cnpj.module';
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
import { SanRestauracaoService } from './restauracao.service';
import { SaneamentoEstoquesController } from './saneamento-estoques.controller';
import { SanVersoesService } from './versoes.service';
import { SanPlanilhaDecisaoController } from './planilha-decisao.controller';
import { SanPlanilhaDecisaoService } from './planilha-decisao.service';
import { SanBibliotecaDiretrizesService } from '../diretrizes/biblioteca.service';
import { SanDiretrizesController } from '../diretrizes/diretrizes.controller';
import { SanDiretrizesService } from '../diretrizes/diretrizes.service';

/**
 * Importador (Agente 2) e motor (Agentes 3 e 4) são REAIS. SAN_PARECER_IA (Agente 7) e SAN_ENTREGAVEIS (Agente 6) ainda são STUBS: quando
 * ia/ e entregaveis/ terminarem, o integrador troca as duas linhas marcadas "TROCAR" abaixo por useClass/useFactory dos módulos deles.
 */
@Module({
  imports: [CnpjModule],
  controllers: [SaneamentoEstoquesController, SanDiretrizesController, SanPlanilhaDecisaoController],
  providers: [
    SanProjetoService, SanImportacaoService, SanItensService, SanCasosService, SanVersoesService, SanImpactosService, SanOrquestracaoService, SanRestauracaoService,
    SanDiretrizesService, SanBibliotecaDiretrizesService, SanPlanilhaDecisaoService,
    CatalogosFiscaisPrisma,
    { provide: SAN_IMPORTADOR, useClass: ImportadorPlanilha },
    { provide: SAN_MOTOR, useClass: MotorSaneamento },
    { provide: SAN_PARECER_IA, useValue: parecerIaStub }, // TROCAR (Agente 7)
    { provide: SAN_ENTREGAVEIS, useValue: entregaveisStub }, // TROCAR (Agente 6)
  ],
  exports: [SanProjetoService, SanCasosService, SanVersoesService, SanImpactosService, SanDiretrizesService, SAN_PARECER_IA, SAN_ENTREGAVEIS],
})
export class SaneamentoEstoquesModule {}
