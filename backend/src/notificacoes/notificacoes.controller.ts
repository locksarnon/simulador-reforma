import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificacoesService } from './notificacoes.service';

/** O sino de cada pessoa: cada um só vê e marca as próprias notificações. */
@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly notificacoes: NotificacoesService) {}

  @Get()
  listar(@CurrentUser() user: AuthUser, @Query() q: { categoria?: string; nao_lidas?: string; limite?: number }) {
    return this.notificacoes.listar(user.id, q);
  }

  @Get('contagem')
  contagem(@CurrentUser() user: AuthUser) {
    return this.notificacoes.contagem(user.id);
  }

  @Post('lidas')
  marcarTodas(@CurrentUser() user: AuthUser, @Query('categoria') categoria?: string) {
    return this.notificacoes.marcarTodasLidas(user.id, categoria);
  }

  @Post(':id/lida')
  marcar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notificacoes.marcarLida(user.id, id);
  }
}
