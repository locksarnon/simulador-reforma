import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';

@Controller('empresas/:empresaId/analises')
export class AnalisesController {
  constructor(private readonly prisma: PrismaService) {}
  private async empresa(id: string) {
    if (!await this.prisma.empresa.findUnique({ where: { id } })) throw new NotFoundException('Empresa não encontrada.');
  }
  @Get()
  async listar(@Param('empresaId') empresa_id: string) {
    await this.empresa(empresa_id);
    return this.prisma.analiseEmpresa.findMany({ where: { empresa_id }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, titulo: true, servico: true, criado_por: true, createdAt: true } });
  }
  @Get(':id')
  async obter(@Param('empresaId') empresa_id: string, @Param('id') id: string) {
    await this.empresa(empresa_id);
    const r = await this.prisma.analiseEmpresa.findFirst({ where: { id, empresa_id } });
    if (!r) throw new NotFoundException('Análise não encontrada nesta empresa.');
    return r;
  }
  @Post()
  async salvar(@Param('empresaId') empresa_id: string, @Body() body: { servico?: string; titulo?: string; dados?: Prisma.InputJsonValue }, @CurrentUser() user: AuthUser) {
    await this.empresa(empresa_id);
    if (!['classificacao-servicos', 'validador-nfse'].includes(body.servico || '') || !body.titulo?.trim() || !body.dados || JSON.stringify(body.dados).length > 2_000_000) throw new BadRequestException('Informe um serviço, título e análise válida (até 2 MB).');
    return this.prisma.analiseEmpresa.create({ data: { empresa_id, servico: body.servico!, titulo: body.titulo.trim().slice(0, 200), dados: body.dados, criado_por: user.email } });
  }
  /** Exclui uma análise salva da empresa (quem salvou ou administrador). */
  @Delete(':id')
  async excluir(@Param('empresaId') empresa_id: string, @Param('id') id: string, @CurrentUser() user: AuthUser) {
    const r = await this.prisma.analiseEmpresa.findFirst({ where: { id, empresa_id }, select: { id: true, criado_por: true } });
    if (!r) throw new NotFoundException('Análise não encontrada nesta empresa.');
    if (user.role !== 'admin' && r.criado_por !== user.email) throw new ForbiddenException(`Só quem salvou a análise (${r.criado_por}) ou um administrador pode excluir.`);
    await this.prisma.analiseEmpresa.delete({ where: { id } });
    return { ok: true };
  }
}
