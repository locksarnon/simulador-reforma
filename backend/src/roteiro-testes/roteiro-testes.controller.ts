import { Body, Controller, ForbiddenException, Get, Put } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

/** Autosave do Roteiro de testes (provisório): cada tester grava o seu; o admin vê o de todos. */
@Controller('roteiro-testes')
export class RoteiroTestesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('meu')
  async meu(@CurrentUser() user: AuthUser) {
    const r = await this.prisma.roteiroTesteProgresso.findUnique({ where: { user_email: user.email } });
    return { estado: r?.estado ?? null, atualizado_em: r?.updatedAt ?? null };
  }

  @Put('meu')
  async salvar(@CurrentUser() user: AuthUser, @Body() body: { estado?: unknown }) {
    const estado = body?.estado && typeof body.estado === 'object' ? body.estado : {};
    if (JSON.stringify(estado).length > 500_000) throw new ForbiddenException('Estado grande demais');
    const r = await this.prisma.roteiroTesteProgresso.upsert({
      where: { user_email: user.email },
      create: { user_email: user.email, user_nome: user.name ?? null, estado: estado as object },
      update: { estado: estado as object, user_nome: user.name ?? null },
    });
    return { ok: true, atualizado_em: r.updatedAt };
  }

  @Get('todos')
  async todos(@CurrentUser() user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
    const rows = await this.prisma.roteiroTesteProgresso.findMany({ orderBy: { updatedAt: 'desc' } });
    return rows.map((r) => ({ email: r.user_email, nome: r.user_nome, estado: r.estado, atualizado_em: r.updatedAt }));
  }
}
