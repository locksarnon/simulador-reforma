import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CATALOGO_CONSULTORIA, ConsultoriaService } from './consultoria.service';

@Controller('consultoria')
export class ConsultoriaController {
  constructor(private readonly service: ConsultoriaService) {}
  @Get('catalogo')
  catalogo() { return CATALOGO_CONSULTORIA; }
  @Get('vinculos')
  listar() { return this.service.listar(); }
  @Get('empresas/:id/perfil-fiscal')
  perfilFiscal(@Param('id') id: string) { return this.service.perfilFiscal(id); }
  @Get('servicos/:servico/clientes/:id/documentos')
  documentos(@Param('servico') servico: string, @Param('id') id: string, @Query('de') de: string, @Query('ate') ate: string) {
    return this.service.documentos(servico, id, de, ate);
  }
  @Post('servicos/:servico/clientes/:id/documentos')
  controlarDocumento(@Param('servico') servico: string, @Param('id') id: string,
    @Body() entrada: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    return this.service.controlarDocumento(servico, id, entrada ?? {}, user.email);
  }
  @Post('vinculos')
  vincular(@Body() entrada: { servico?: string; cliente_id?: string }, @CurrentUser() user: AuthUser) {
    return this.service.vincular(entrada ?? {}, user.email);
  }
}
