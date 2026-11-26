import { Controller, Param, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { Permissao } from '../permissoes/permissao.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AnalisarIaService } from './analisar-ia.service';

/** Botão "Analisar com IA" dos serviços de consultoria. Não grava nada: o rascunho só volta para a tela. */
@Controller('consultoria')
export class IaConsultoriaController {
  constructor(private readonly analisar: AnalisarIaService) {}

  @Post('projetos/:id/analisar-ia')
  @Permissao('consultas_pagas')
  analisarProjeto(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.analisar.analisar(id, user.email);
  }
}
