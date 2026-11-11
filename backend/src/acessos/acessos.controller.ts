import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AcessosService } from './acessos.service';
import { ipDoCliente } from './ip';

function exigirAdmin(user: AuthUser) {
  if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
}

/** Registro de acesso e lista de IPs permitidos: só administradores. */
@Controller('acessos')
export class AcessosController {
  constructor(private readonly acessos: AcessosService) {}

  /** Query: resultado (OK, FALHA, INATIVO, BLOQUEADO_IP), email, limite. */
  @Get('log')
  log(@CurrentUser() user: AuthUser, @Query() q: { resultado?: string; email?: string; limite?: string }) {
    exigirAdmin(user);
    return this.acessos.listar({ resultado: q.resultado, email: q.email, limite: q.limite ? Number(q.limite) : undefined });
  }

  @Get('ips')
  ips(@CurrentUser() user: AuthUser, @Req() req: Request) {
    exigirAdmin(user);
    return this.acessos.configuracao(ipDoCliente(req));
  }

  @Post('ips')
  adicionar(@CurrentUser() user: AuthUser, @Body() body: { faixa?: string; descricao?: string }) {
    exigirAdmin(user);
    return this.acessos.adicionarIp(body ?? {}, user);
  }

  @Delete('ips/:id')
  remover(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    exigirAdmin(user);
    return this.acessos.removerIp(id, ipDoCliente(req));
  }

  @Put('restricao')
  restricao(@CurrentUser() user: AuthUser, @Body() body: { ativo?: boolean }, @Req() req: Request) {
    exigirAdmin(user);
    return this.acessos.definirRestricao(Boolean(body?.ativo), ipDoCliente(req));
  }
}
