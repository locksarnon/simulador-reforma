import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AgendaGeralService, EntradaEvento } from './agenda-geral.service';

function exigirAdmin(user: AuthUser) {
  if (user.role !== 'admin') throw new ForbiddenException('Somente administradores mudam os tipos de evento.');
}

/** Calendário geral do escritório (eventos, tipos e camadas) e agenda de obrigações federais. */
@Controller('agenda-geral')
export class AgendaGeralController {
  constructor(private readonly agenda: AgendaGeralService) {}

  @Get('tipos')
  tipos() {
    return this.agenda.listarTipos();
  }

  @Post('tipos')
  criarTipo(@CurrentUser() user: AuthUser, @Body() body: { nome?: string; cor?: string }) {
    exigirAdmin(user);
    return this.agenda.criarTipo(body ?? {});
  }

  @Put('tipos/:id')
  atualizarTipo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { nome?: string; cor?: string }) {
    exigirAdmin(user);
    return this.agenda.atualizarTipo(id, body ?? {});
  }

  @Delete('tipos/:id')
  excluirTipo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    exigirAdmin(user);
    return this.agenda.excluirTipo(id);
  }

  @Get('eventos')
  eventos(@Query() q: { de?: string; ate?: string; empresa_id?: string }) {
    return this.agenda.listarEventos(q);
  }

  @Post('eventos')
  criarEvento(@CurrentUser() user: AuthUser, @Body() body: EntradaEvento) {
    return this.agenda.criarEvento(user, body ?? {});
  }

  @Put('eventos/:id')
  atualizarEvento(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: EntradaEvento) {
    return this.agenda.atualizarEvento(user, id, body ?? {});
  }

  @Delete('eventos/:id')
  excluirEvento(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.agenda.excluirEvento(user, id);
  }

  @Get('camadas')
  camadas(@Query() q: { de?: string; ate?: string; empresa_id?: string }) {
    return this.agenda.camadas(q);
  }

  @Get('obrigacoes')
  obrigacoes(@Query() q: { mes?: string; empresa_id?: string }) {
    return this.agenda.obrigacoes(q);
  }
}
