import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const LIMITE_ESTADO = 8 * 1024 * 1024;

/** O estado do projeto é um objeto JSON livre (a tela evolui sem migração), mas sempre um objeto e com tamanho limitado. */
export function validarEstado(estado: unknown): string {
  if (!estado || typeof estado !== 'object' || Array.isArray(estado)) throw new BadRequestException('Estado do projeto inválido.');
  const json = JSON.stringify(estado);
  if (json.length > LIMITE_ESTADO) throw new BadRequestException('O estado do projeto passou do limite de tamanho.');
  return json;
}

@Injectable()
export class SaneamentoService {
  constructor(private readonly prisma: PrismaService) {}

  private async achar(id: string, empresa_id?: string) {
    const p = await this.prisma.saneamentoProjeto.findUnique({ where: { id } });
    if (!p || (empresa_id && p.empresa_id !== empresa_id)) throw new NotFoundException('Projeto de saneamento não encontrado nesta empresa.');
    return p;
  }

  private saida(p: { estado_json: string | null } & Record<string, unknown>) {
    const { estado_json, ...resto } = p;
    let estado: unknown = {};
    try { estado = estado_json ? JSON.parse(estado_json) : {}; } catch { estado = {}; }
    return { ...resto, estado };
  }

  async criar(user: AuthUser, empresa_id: string, nome: string, validacao_id?: string) {
    if (!empresa_id || !await this.prisma.empresa.findUnique({ where: { id: empresa_id } })) throw new BadRequestException('Escolha uma empresa válida.');
    const limpo = (nome || '').trim().slice(0, 120);
    if (!limpo) throw new BadRequestException('Dê um nome ao projeto.');
    const p = await this.prisma.saneamentoProjeto.create({ data: { empresa_id, nome: limpo, criado_por: user.email, validacao_id: validacao_id || null, estado_json: JSON.stringify({}) } });
    return this.saida(p);
  }

  listar(empresa_id: string) {
    return this.prisma.saneamentoProjeto.findMany({
      where: { empresa_id }, orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, nome: true, criado_por: true, validacao_id: true, status: true, createdAt: true, updatedAt: true },
    });
  }

  async obter(id: string, empresa_id?: string) { return this.saida(await this.achar(id, empresa_id)); }

  /** Autosave: qualquer combinação de nome, base vinculada, status e estado. */
  async salvar(id: string, dados: { nome?: string; validacao_id?: string | null; status?: string; estado?: unknown }, empresa_id?: string) {
    await this.achar(id, empresa_id);
    if (dados.status !== undefined && !['ANDAMENTO', 'CONCLUIDO'].includes(dados.status)) throw new BadRequestException('Situação inválida.');
    const p = await this.prisma.saneamentoProjeto.update({
      where: { id },
      data: {
        ...(dados.nome !== undefined ? { nome: dados.nome.trim().slice(0, 120) || 'Projeto' } : {}),
        ...(dados.validacao_id !== undefined ? { validacao_id: dados.validacao_id || null } : {}),
        ...(dados.status !== undefined ? { status: dados.status } : {}),
        ...(dados.estado !== undefined ? { estado_json: validarEstado(dados.estado) } : {}),
      },
    });
    return { ok: true, salvo_em: p.updatedAt.toISOString() };
  }

  async excluir(id: string, user: AuthUser, empresa_id?: string) {
    const p = await this.achar(id, empresa_id);
    if (user.role !== 'admin' && p.criado_por !== user.email) throw new ForbiddenException('Só quem criou ou um administrador pode excluir.');
    await this.prisma.saneamentoProjeto.delete({ where: { id } });
    return { ok: true };
  }
}
