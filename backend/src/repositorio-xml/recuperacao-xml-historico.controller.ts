import { Body, Controller, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RecuperacaoXmlHistoricoService } from './recuperacao-xml-historico.service';

@Controller('repositorio-xml/empresas/:empresaId/historico')
export class RecuperacaoXmlHistoricoController {
  constructor(private readonly service: RecuperacaoXmlHistoricoService) {}

  private exigirAdmin(user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Apenas administradores autorizam a recuperação histórica.');
  }

  @Get()
  listar(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string) {
    this.exigirAdmin(user);
    return this.service.listar(empresaId);
  }

  @Post('previa')
  preparar(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string, @Body() body: { de?: string; ate?: string }) {
    this.exigirAdmin(user);
    return this.service.preparar(empresaId, body?.de, body?.ate, user.email);
  }

  @Post(':id/confirmar')
  confirmar(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string, @Param('id') id: string) {
    this.exigirAdmin(user);
    return this.service.confirmar(empresaId, id, user.email);
  }
}
