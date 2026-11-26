import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { Permissao } from '../permissoes/permissao.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AnalisarIaService } from './analisar-ia.service';
import type { ModoRascunho } from './contexto';

/**
 * Botão "Analisar com IA" dos serviços de consultoria. O POST inicia o rascunho e volta na hora (o trabalho segue em segundo plano);
 * o GET devolve o estado e o último rascunho guardado do projeto. O projeto em si não muda.
 */
@Controller('consultoria')
export class IaConsultoriaController {
  constructor(private readonly analisar: AnalisarIaService) {}

  @Get('projetos/:id/analisar-ia')
  @Permissao('consultas_pagas')
  estado(@Param('id') id: string) {
    return this.analisar.estado(id);
  }

  @Post('projetos/:id/analisar-ia')
  @Permissao('consultas_pagas')
  analisarProjeto(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { modo?: ModoRascunho } = {}) {
    return this.analisar.iniciar(id, user.email, body?.modo ?? 'rapido');
  }
}
