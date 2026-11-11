import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EntradaProcesso, ProcessosService } from './processos.service';
import { EntradaTarefa, FiltroTarefas, TarefasService } from './tarefas.service';

function exigirAdmin(user: AuthUser) {
  if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
}

/** Tarefas do escritório e processos recorrentes que as geram. */
@Controller()
export class TarefasController {
  constructor(
    private readonly tarefas: TarefasService,
    private readonly processos: ProcessosService,
  ) {}

  // ── Tarefas ───────────────────────────────────────────────────────
  @Get('tarefas')
  listar(@CurrentUser() user: AuthUser, @Query() q: FiltroTarefas) {
    return this.tarefas.listar(user, q);
  }

  @Get('tarefas/resumo')
  resumo(@CurrentUser() user: AuthUser) {
    return this.tarefas.resumo(user);
  }

  @Post('tarefas')
  criar(@CurrentUser() user: AuthUser, @Body() body: EntradaTarefa) {
    return this.tarefas.criar(user, body ?? {});
  }

  @Put('tarefas/:id')
  atualizar(@Param('id') id: string, @Body() body: EntradaTarefa) {
    return this.tarefas.atualizar(id, body ?? {});
  }

  @Delete('tarefas/:id')
  excluir(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tarefas.excluir(user, id);
  }

  // ── Processos recorrentes (só administradores mudam) ──────────────
  @Get('processos')
  listarProcessos() {
    return this.processos.listar();
  }

  @Post('processos/gerar')
  gerar(@CurrentUser() user: AuthUser, @Body() body: { competencia?: string; modelo_id?: string; simular?: boolean }) {
    exigirAdmin(user);
    return this.processos.gerar(body ?? {});
  }

  @Post('processos')
  criarProcesso(@CurrentUser() user: AuthUser, @Body() body: EntradaProcesso) {
    exigirAdmin(user);
    return this.processos.criar(user, body ?? {});
  }

  @Put('processos/:id')
  atualizarProcesso(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: EntradaProcesso) {
    exigirAdmin(user);
    return this.processos.atualizar(id, body ?? {});
  }

  @Delete('processos/:id')
  excluirProcesso(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    exigirAdmin(user);
    return this.processos.excluir(id);
  }
}
