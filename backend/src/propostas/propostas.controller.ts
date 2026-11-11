import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EntradaHonorarios } from './honorarios';
import { EntradaProposta, PropostasService } from './propostas.service';

function exigirAdmin(user: AuthUser) {
  if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
}

/** Propostas e honorários. Tabela de honorários e modelos: só administradores mudam. */
@Controller('propostas')
export class PropostasController {
  constructor(private readonly propostas: PropostasService) {}

  @Get('tabela')
  tabela() {
    return this.propostas.tabela();
  }

  @Put('tabela')
  salvarTabela(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    exigirAdmin(user);
    return this.propostas.salvarTabela(body);
  }

  @Post('calcular')
  calcular(@Body() body: EntradaHonorarios) {
    return this.propostas.calcular(body ?? {});
  }

  @Get('modelos')
  modelos() {
    return this.propostas.listarModelos();
  }

  @Post('modelos')
  criarModelo(@CurrentUser() user: AuthUser, @Body() body: Record<string, never>) {
    exigirAdmin(user);
    return this.propostas.criarModelo(body ?? {});
  }

  @Put('modelos/:id')
  atualizarModelo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, never>) {
    exigirAdmin(user);
    return this.propostas.atualizarModelo(id, body ?? {});
  }

  @Delete('modelos/:id')
  excluirModelo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    exigirAdmin(user);
    return this.propostas.excluirModelo(id);
  }

  @Get()
  listar(@Query('status') status?: string) {
    return this.propostas.listar({ status });
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.propostas.obter(id);
  }

  @Post()
  criar(@CurrentUser() user: AuthUser, @Body() body: EntradaProposta) {
    return this.propostas.criar(user, body ?? {});
  }

  @Put(':id')
  atualizar(@Param('id') id: string, @Body() body: EntradaProposta) {
    return this.propostas.atualizar(id, body ?? {});
  }

  @Delete(':id')
  excluir(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.propostas.excluir(user, id);
  }

  @Post(':id/duplicar')
  duplicar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.propostas.duplicar(user, id);
  }

  @Post(':id/status')
  status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { status?: string }) {
    return this.propostas.mudarStatus(user, id, String(body?.status ?? ''));
  }
}
