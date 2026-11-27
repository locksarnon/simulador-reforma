import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissao } from '../../permissoes/permissao.decorator';
import { SanCriteriosService } from './criterios.service';

/** "O que foi considerado" por camada (aba Análise de cada fase): listar, ajustar um critério e as verificações manuais. */
@Controller('saneamento-estoques')
export class SanCriteriosController {
  constructor(private readonly criterios: SanCriteriosService) {}

  @Get('projetos/:id/criterios')
  listar(@Param('id') id: string) { return this.criterios.listar(id); }

  /** Ajusta o valor de um critério (ex.: similaridade mínima). A camada passa a "desatualizada" até ser analisada de novo. */
  @Put('projetos/:id/criterios/:camada/:chave')
  ajustar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('camada') camada: string, @Param('chave') chave: string, @Body() b: { valor?: unknown }) {
    return this.criterios.ajustar(id, camada, chave, b?.valor, user);
  }

  /** Verificação manual sem passar pela IA (vai para a política; o sistema não aplica). */
  @Post('projetos/:id/criterios/manuais')
  incluirManual(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: { camada?: string; texto?: string }) {
    return this.criterios.incluirManual(id, String(b?.camada ?? ''), b?.texto, user);
  }

  /** Remover uma verificação manual é alterar o projeto (não excluir registro): fica no histórico. */
  @Delete('projetos/:id/criterios/manuais/:manualId')
  @Permissao('alterar')
  removerManual(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('manualId') manualId: string) {
    return this.criterios.removerManual(id, manualId, user);
  }
}
