import { Controller, Param, Post } from '@nestjs/common';
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
  constructor(private readonly pareceres: ParecerIaService) {}

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
