import { Body, Controller, Param, Post } from '@nestjs/common';
import { SanCriteriosIaService } from '../criterios/criterios-ia.service';
import { Permissao } from '../../permissoes/permissao.decorator';
import { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParecerIaService } from './parecer-ia.service';

/**
 * Parecer da IA nos casos de borda. As duas rotas GRAVAM `parecer_ia` do caso (nada além disso), por isso seguem a regra do módulo:
 * exigem a tela de Projetos, "Alterar dados" e "Fazer consultas pagas" (gastam IA paga). A IA fora do ar não é erro: a resposta traz `motivo` e o caso segue como estava.
 */
@Controller('saneamento-estoques')
export class IaSaneamentoController {
  constructor(private readonly pareceres: ParecerIaService, private readonly criterios: SanCriteriosIaService) {}

  /**
   * "Acrescentar critério (texto livre)": a IA encaixa a frase num critério ajustável (devolve a PROPOSTA, nada é gravado) ou ela fica como
   * verificação manual (gravada). IA fora do ar: gravada como manual, com nota. Gasta IA paga: mesmas permissões do parecer.
   */
  @Post('projetos/:id/criterios/normalizar')
  @Permissao('alterar', 'consultas_pagas')
  normalizarCriterio(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: { camada?: string; texto?: string }) {
    return this.criterios.normalizar(id, String(b?.camada ?? ''), b?.texto, user);
  }

  @Post('casos/:id/parecer-ia')
  @Permissao('alterar', 'consultas_pagas')
  gerar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pareceres.gerarEGravar(id, user.email);
  }

  @Post('projetos/:id/pareceres-ia')
  @Permissao('alterar', 'consultas_pagas')
  lote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pareceres.gerarLote(id, user.email);
  }
}
