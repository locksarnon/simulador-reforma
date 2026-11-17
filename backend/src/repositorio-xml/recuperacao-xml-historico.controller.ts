import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissao } from '../permissoes/permissao.decorator';
import { RecuperacaoXmlHistoricoService } from './recuperacao-xml-historico.service';

@Controller('repositorio-xml/empresas/:empresaId/historico')
export class RecuperacaoXmlHistoricoController {
  constructor(private readonly service: RecuperacaoXmlHistoricoService) {}

  @Get()
  listar(@Param('empresaId') empresaId: string) {
    return this.service.listar(empresaId);
  }

  @Post('previa')
  @Permissao('consultas_pagas')
  preparar(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string, @Body() body: { de?: string; ate?: string }) {
    return this.service.preparar(empresaId, body?.de, body?.ate, user.email);
  }

  @Post(':id/confirmar')
  @Permissao('consultas_pagas', 'autorizar_lotes')
  confirmar(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string, @Param('id') id: string) {
    return this.service.confirmar(empresaId, id, user.email);
  }
}
