import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SaneamentoService } from './saneamento.service';

/** Projeto de saneamento de estoques (passo a passo), por empresa. */
@Controller('produtos/saneamentos')
export class SaneamentoController {
  constructor(private readonly service: SaneamentoService) {}

  @Get() listar(@Query('empresa_id') empresa_id: string) { return this.service.listar(empresa_id); }

  @Post() criar(@CurrentUser() user: AuthUser, @Body() b: { empresa_id: string; nome: string; validacao_id?: string }) {
    return this.service.criar(user, b?.empresa_id, b?.nome, b?.validacao_id);
  }

  @Get(':id') obter(@Param('id') id: string, @Query('empresa_id') empresa_id?: string) { return this.service.obter(id, empresa_id); }

  @Put(':id') salvar(@Param('id') id: string, @Body() b: { nome?: string; validacao_id?: string | null; status?: string; estado?: unknown; empresa_id?: string }) {
    return this.service.salvar(id, { nome: b?.nome, validacao_id: b?.validacao_id, status: b?.status, estado: b?.estado }, b?.empresa_id);
  }

  /** `apagar_base=true` apaga junto a base importada neste projeto (se nenhum outro projeto a usa). */
  @Delete(':id') excluir(@Param('id') id: string, @CurrentUser() user: AuthUser, @Query('empresa_id') empresa_id?: string, @Query('apagar_base') apagarBase?: string) {
    return this.service.excluir(id, user, empresa_id, apagarBase === 'true');
  }
}
