import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Param, Post, Put } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CapturaXmlService, TIPOS_DISPONIVEIS } from './captura-xml.service';
import { Ambiente, TipoCaptura } from './distribuicao-dfe.cliente';

function tipoDe(valor: string): TipoCaptura {
  const t = String(valor || '').toUpperCase() as TipoCaptura;
  if (!TIPOS_DISPONIVEIS.includes(t)) throw new BadRequestException('Tipo de documento não disponível para captura.');
  return t;
}

/** Captura automática dos XML pela Distribuição de DF-e. Estado para qualquer usuário; ativar, configurar e executar só para administradores. */
@Controller('repositorio-xml/empresas/:empresaId/captura')
export class CapturaXmlController {
  constructor(private readonly service: CapturaXmlService) {}

  private exigirAdmin(user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Apenas administradores configuram a captura.');
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  status(@Param('empresaId') empresaId: string) {
    return this.service.status(empresaId);
  }

  @Put('ambiente')
  ambiente(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string, @Body() body: { ambiente?: Ambiente; uf_autor?: string }) {
    this.exigirAdmin(user);
    return this.service.configurarAmbiente(empresaId, body?.ambiente as Ambiente, body?.uf_autor, user.email);
  }

  @Put('periodo')
  periodo(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string, @Body() body: { periodo?: string }) {
    this.exigirAdmin(user);
    return this.service.configurarPeriodo(empresaId, String(body?.periodo ?? ''), user.email);
  }

  @Put('ciencia')
  ciencia(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string, @Body() body: { ativo?: boolean; confirmo?: boolean }) {
    this.exigirAdmin(user);
    return this.service.configurarCiencia(empresaId, body?.ativo === true, body?.confirmo === true, user.email);
  }

  @Put('tipos/:tipo')
  configurar(
    @CurrentUser() user: AuthUser,
    @Param('empresaId') empresaId: string,
    @Param('tipo') tipo: string,
    @Body() body: { ativo?: boolean; sem_consumidor_concorrente?: boolean },
  ) {
    this.exigirAdmin(user);
    return this.service.configurarTipo(empresaId, tipoDe(tipo), body?.ativo === true, body?.sem_consumidor_concorrente === true, user.email);
  }

  @Post('tipos/:tipo/executar')
  executar(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string, @Param('tipo') tipo: string) {
    this.exigirAdmin(user);
    return this.service.executar(empresaId, tipoDe(tipo), 'MANUAL', user.email);
  }
}
