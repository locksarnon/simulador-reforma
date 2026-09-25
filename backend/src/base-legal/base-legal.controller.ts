import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BaseLegalService } from './base-legal.service';

@Controller('base-legal')
export class BaseLegalController {
  constructor(private readonly service: BaseLegalService) {}

  @Get('normas')
  normas() {
    return this.service.listar();
  }

  @Get('normas/:chave')
  estrutura(@Param('chave') chave: string) {
    return this.service.estrutura(chave);
  }

  @Get('normas/:chave/dispositivos/:caminho')
  dispositivo(@Param('chave') chave: string, @Param('caminho') caminho: string) {
    return this.service.dispositivo(chave, caminho);
  }

  @Get('busca')
  busca(@Query('q') q: string, @Query('norma') norma?: string) {
    return this.service.buscar(q, norma || undefined);
  }

  /** Pergunta livre ao assistente (responde só com o texto das normas carregadas). */
  @Post('perguntar')
  perguntar(@CurrentUser() user: AuthUser, @Body() body: { pergunta?: string }) {
    return this.service.perguntar(user.email, body?.pergunta ?? '');
  }

  @Put('perguntas/:id/feedback')
  feedback(@Param('id') id: string, @Body() body: { util?: boolean }) {
    return this.service.feedback(id, body?.util === true);
  }

  /** Perguntas recentes (para achar lacunas na base). Só administradores. */
  @Get('perguntas')
  perguntas(@CurrentUser() user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
    return this.service.listarPerguntas();
  }

  /** Avisos de texto oficial alterado / norma nova citada pelo Radar. Só administradores. */
  @Get('alertas')
  alertas(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    this.exigirAdmin(user);
    return this.service.listarAlertas(status === 'todos' ? 'todos' : 'pendente');
  }

  @Post('alertas/verificar')
  verificar(@CurrentUser() user: AuthUser) {
    this.exigirAdmin(user);
    return this.service.verificarAtualizacoes('manual');
  }

  @Post('alertas/:id/aprovar')
  aprovar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { url?: string }) {
    this.exigirAdmin(user);
    return this.service.resolverAlerta(id, 'aprovar', user.email, body?.url);
  }

  @Post('alertas/:id/descartar')
  descartar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.exigirAdmin(user);
    return this.service.resolverAlerta(id, 'descartar', user.email);
  }

  private exigirAdmin(user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
  }

  /** Captura/atualiza do texto oficial. Só administradores. */
  @Post('importar')
  importar(@CurrentUser() user: AuthUser, @Body() body: { chave?: string; forcar?: boolean }) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
    return body?.chave ? this.service.importar(body.chave, { forcar: body.forcar }) : this.service.importarTodas();
  }
}
