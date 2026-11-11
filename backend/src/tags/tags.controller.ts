import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TagsService } from './tags.service';

/** Etiquetas das empresas e listas salvas. Todo mundo etiqueta; só o administrador apaga uma etiqueta. */
@Controller()
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get('tags')
  listar() {
    return this.tags.listar();
  }

  @Get('tags/por-empresa')
  porEmpresa() {
    return this.tags.porEmpresa();
  }

  @Post('tags')
  criar(@Body() body: { nome?: string; cor?: string }) {
    return this.tags.criar(body ?? {});
  }

  @Post('tags/aplicar')
  aplicar(@Body() body: { tag_id?: string; empresa_ids?: string[]; modo?: string }) {
    return this.tags.aplicar(body ?? {});
  }

  @Put('tags/empresa/:empresaId')
  definirDaEmpresa(@Param('empresaId') empresaId: string, @Body() body: { tag_ids?: string[] }) {
    return this.tags.definirDaEmpresa(empresaId, body?.tag_ids);
  }

  @Put('tags/:id')
  atualizar(@Param('id') id: string, @Body() body: { nome?: string; cor?: string }) {
    return this.tags.atualizar(id, body ?? {});
  }

  @Delete('tags/:id')
  excluir(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores apagam etiquetas.');
    return this.tags.excluir(id);
  }

  // ── Listas salvas ─────────────────────────────────────────────────
  @Get('filtros-salvos')
  filtros(@CurrentUser() user: AuthUser, @Query('escopo') escopo?: string) {
    return this.tags.listarFiltros(user, escopo);
  }

  @Post('filtros-salvos')
  salvarFiltro(@CurrentUser() user: AuthUser, @Body() body: { nome?: string; escopo?: string; criterios?: unknown; compartilhado?: boolean }) {
    return this.tags.salvarFiltro(user, body ?? {});
  }

  @Put('filtros-salvos/:id')
  atualizarFiltro(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { nome?: string; compartilhado?: boolean }) {
    return this.tags.atualizarFiltro(user, id, body ?? {});
  }

  @Delete('filtros-salvos/:id')
  excluirFiltro(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tags.excluirFiltro(user, id);
  }
}
