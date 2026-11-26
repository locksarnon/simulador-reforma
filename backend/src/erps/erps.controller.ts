import { Body, Controller, ForbiddenException, Get, Param, Post, Put } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ErpsService } from './erps.service';

const soAdmin = (user: AuthUser) => {
  if (user?.role !== 'admin') throw new ForbiddenException('Somente administradores alteram o Cadastro de ERPs.');
};

/**
 * Cadastro de ERPs. Ler é livre para quem está logado (todas as telas que pedem o ERP usam a lista e o perfil); criar e alterar,
 * só o administrador. Não há exclusão: o ERP ou o item é desativado e o histórico fica.
 */
@Controller('erps')
export class ErpsController {
  constructor(private readonly erps: ErpsService) {}

  @Get()
  listar() { return this.erps.listar(); }

  @Get(':id')
  obter(@Param('id') id: string) { return this.erps.obter(id); }

  /** Só o conhecimento ativo: o que as telas usam. */
  @Get(':id/perfil')
  perfil(@Param('id') id: string) { return this.erps.perfil(id); }

  @Post()
  criar(@CurrentUser() user: AuthUser, @Body() b: Record<string, unknown>) { soAdmin(user); return this.erps.criar(b ?? {}, user); }

  @Put(':id')
  atualizar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: Record<string, unknown>) { soAdmin(user); return this.erps.atualizar(id, b ?? {}, user); }

  @Post(':id/conhecimentos')
  criarItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: Record<string, unknown>) { soAdmin(user); return this.erps.criarItem(id, b ?? {}, user); }

  @Put(':id/conhecimentos/:itemId')
  atualizarItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('itemId') itemId: string, @Body() b: Record<string, unknown>) {
    soAdmin(user);
    return this.erps.atualizarItem(id, itemId, b ?? {}, user);
  }
}
