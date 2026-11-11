import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Entrada, ServicosContratadosService } from './servicos-contratados.service';

/**
 * Serviços contratados por empresa (BPO fiscal ou diagnóstico pontual). Qualquer pessoa logada lê e grava; cada gravação
 * guarda o e-mail de quem fez. Mudar o cadastro da empresa continua em Grupos e empresas.
 */
@Controller('servicos-contratados')
export class ServicosContratadosController {
  constructor(private readonly servicos: ServicosContratadosService) {}

  /** Query: tipo, situacao, empresa_id. */
  @Get()
  listar(@Query() q: { tipo?: string; situacao?: string; empresa_id?: string }) {
    return this.servicos.listar(q);
  }

  @Get('resumo')
  resumo() {
    return this.servicos.resumo();
  }

  @Get('empresa/:empresaId')
  daEmpresa(@Param('empresaId') empresaId: string) {
    return this.servicos.daEmpresa(empresaId);
  }

  @Post('em-lote')
  emLote(@CurrentUser() user: AuthUser, @Body() body: Entrada & { empresa_ids?: string[] }) {
    return this.servicos.definirEmLote(body ?? {}, user);
  }

  @Post()
  criar(@CurrentUser() user: AuthUser, @Body() body: Entrada & { empresa_id?: string }) {
    const { empresa_id, ...entrada } = body ?? {};
    return this.servicos.criar(String(empresa_id ?? ''), entrada, user);
  }

  @Put(':id')
  atualizar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Entrada) {
    return this.servicos.atualizar(id, body ?? {}, user);
  }
}
