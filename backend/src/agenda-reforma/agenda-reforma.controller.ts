import { Body, Controller, Delete, ForbiddenException, Get, Header, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AgendaReformaService, ConsultaAgenda } from './agenda-reforma.service';

/** Agenda da Reforma: marcos e prazos com fonte oficial, filtráveis por regime e UF (ou pela empresa), .ics e lembretes por e-mail. */
@Controller('agenda-reforma')
export class AgendaReformaController {
  constructor(private readonly agenda: AgendaReformaService) {}

  /** Query: regime, uf, empresa_id (usa o regime e a UF da empresa), categoria, passados=1. */
  @Get('marcos')
  marcos(@Query() consulta: ConsultaAgenda) {
    return this.agenda.listar(consulta);
  }

  @Get('calendario.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="agenda-reforma.ics"')
  calendario(@Query() consulta: ConsultaAgenda) {
    return this.agenda.calendario(consulta);
  }

  // ───── Lembretes por e-mail (cada pessoa cuida dos seus) ─────

  @Get('lembretes')
  lembretes(@CurrentUser() user: AuthUser) {
    return this.agenda.meusLembretes(user.email);
  }

  @Put('lembretes')
  salvarLembrete(@CurrentUser() user: AuthUser, @Body() body: { escopo?: string; dias_antes?: number[]; ativo?: boolean }) {
    return this.agenda.salvarLembrete(user.email, body ?? {});
  }

  @Delete('lembretes/:id')
  removerLembrete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.agenda.removerLembrete(user.email, id);
  }

  /** Manda ao próprio usuário uma mensagem de teste com as datas dos próximos 60 dias. */
  @Post('lembretes/teste')
  testeLembrete(@CurrentUser() user: AuthUser, @Body() body: { escopo?: string }) {
    return this.agenda.enviarTeste(user.email, body?.escopo || 'todas');
  }

  // ───── Administração ─────

  /** Grava (ou atualiza) as datas oficiais da semente, conferindo cada trecho contra a Base legal. Só administradores. */
  @Post('semear')
  semear(@CurrentUser() user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
    return this.agenda.semear();
  }
}
