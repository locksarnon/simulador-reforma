import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export const PAPEIS = ['admin', 'user'] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_SENHA = 10;

type Ator = { id: string; email: string };

/** A senha precisa de pelo menos 10 caracteres e não pode ser o próprio e-mail. */
export function validarSenha(senha: unknown, email?: string) {
  const s = String(senha ?? '');
  if (s.length < MIN_SENHA) throw new BadRequestException(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`);
  if (email && s.toLowerCase() === email.toLowerCase()) throw new BadRequestException('A senha não pode ser igual ao e-mail.');
  return s;
}

/** Senha provisória legível o bastante para ditar por telefone, mas longa (12 caracteres). */
export const senhaProvisoria = () => randomBytes(9).toString('base64url');

const publico = { id: true, email: true, name: true, role: true, ativo: true, lastLoginAt: true, createdAt: true } as const;

/**
 * Usuários do InTAX (só administradores mexem), o perfil de cada pessoa e a carteira por colaborador. Desativar uma conta vale na hora:
 * o servidor confere a conta a cada pedido (JwtStrategy), não só no login.
 */
@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar() {
    const [usuarios, vinculos] = await Promise.all([
      this.prisma.user.findMany({ select: publico, orderBy: [{ ativo: 'desc' }, { email: 'asc' }] }),
      this.prisma.vinculoColaborador.groupBy({ by: ['user_id'], _count: { _all: true } }),
    ]);
    const n = new Map(vinculos.map((v) => [v.user_id, v._count._all]));
    return usuarios.map((u) => ({ ...u, empresas: n.get(u.id) ?? 0 }));
  }

  async criar(entrada: { email?: string; name?: string; role?: string; senha?: string }) {
    const email = String(entrada.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw new BadRequestException('Informe um e-mail válido.');
    const role = entrada.role ?? 'user';
    if (!PAPEIS.includes(role as never)) throw new BadRequestException('Papel inválido. Use admin ou user.');
    const provisoria = !entrada.senha;
    const senha = provisoria ? senhaProvisoria() : validarSenha(entrada.senha, email);
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Já existe uma conta com esse e-mail.');
    const user = await this.prisma.user.create({
      data: { email, name: entrada.name?.trim().slice(0, 120) || null, role: role as never, passwordHash: await argon2.hash(senha) },
      select: publico,
    });
    return { usuario: user, senha_provisoria: provisoria ? senha : null };
  }

  private async administradoresAtivos(exceto?: string) {
    return this.prisma.user.count({ where: { role: 'admin', ativo: true, ...(exceto ? { id: { not: exceto } } : {}) } });
  }

  async atualizar(id: string, entrada: { name?: string | null; role?: string; ativo?: boolean }, ator: Ator) {
    const alvo = await this.prisma.user.findUnique({ where: { id } });
    if (!alvo) throw new NotFoundException('Usuário não encontrado.');
    const dados: Record<string, unknown> = {};
    if (entrada.name !== undefined) dados.name = entrada.name?.trim().slice(0, 120) || null;
    if (entrada.role !== undefined) {
      if (!PAPEIS.includes(entrada.role as never)) throw new BadRequestException('Papel inválido. Use admin ou user.');
      dados.role = entrada.role;
    }
    if (entrada.ativo !== undefined) dados.ativo = Boolean(entrada.ativo);
    const deixaDeSerAdmin = alvo.role === 'admin' && (dados.role === 'user' || dados.ativo === false);
    if (deixaDeSerAdmin) {
      if (alvo.id === ator.id) throw new ForbiddenException('Você não pode tirar o próprio acesso de administrador nem desativar a própria conta.');
      if ((await this.administradoresAtivos(alvo.id)) === 0) throw new ForbiddenException('O sistema precisa de pelo menos um administrador ativo.');
    }
    if (dados.ativo === false && alvo.id === ator.id) throw new ForbiddenException('Você não pode desativar a própria conta.');
    const user = await this.prisma.user.update({ where: { id }, data: dados as never, select: publico });
    if (dados.ativo === false) await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    return user;
  }

  /** Define uma senha nova (a informada ou uma provisória) e derruba as sessões abertas da pessoa. */
  async redefinirSenha(id: string, senha?: string) {
    const alvo = await this.prisma.user.findUnique({ where: { id } });
    if (!alvo) throw new NotFoundException('Usuário não encontrado.');
    const provisoria = !senha;
    const nova = provisoria ? senhaProvisoria() : validarSenha(senha, alvo.email);
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await argon2.hash(nova) } });
    await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    return { senha_provisoria: provisoria ? nova : null };
  }

  // ── Perfil (cada pessoa cuida do seu) ──────────────────────────────

  async perfil(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: publico });
    if (!u) throw new NotFoundException('Usuário não encontrado.');
    return u;
  }

  async atualizarPerfil(userId: string, entrada: { name?: string | null }) {
    return this.prisma.user.update({ where: { id: userId }, data: { name: entrada.name?.trim().slice(0, 120) || null }, select: publico });
  }

  /** Troca a própria senha (exige a atual) e encerra as outras sessões: quem estiver com a senha antiga é desconectado. */
  async trocarSenha(userId: string, entrada: { atual?: string; nova?: string }) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('Usuário não encontrado.');
    if (!entrada.atual || !(await argon2.verify(u.passwordHash, String(entrada.atual)))) throw new BadRequestException('A senha atual não confere.');
    const nova = validarSenha(entrada.nova, u.email);
    if (nova === entrada.atual) throw new BadRequestException('A senha nova precisa ser diferente da atual.');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(nova) } });
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { trocada: true };
  }

  // ── Carteira por colaborador ───────────────────────────────────────

  /** Cada colaborador ativo com as empresas que atende. */
  async carteira() {
    const [usuarios, vinculos] = await Promise.all([
      this.prisma.user.findMany({ where: { ativo: true }, select: { id: true, email: true, name: true, role: true }, orderBy: { email: 'asc' } }),
      this.prisma.vinculoColaborador.findMany({ select: { user_id: true, empresa_id: true } }),
    ]);
    const porUsuario = new Map<string, string[]>();
    for (const v of vinculos) porUsuario.set(v.user_id, [...(porUsuario.get(v.user_id) ?? []), v.empresa_id]);
    return usuarios.map((u) => ({ ...u, empresa_ids: porUsuario.get(u.id) ?? [] }));
  }

  /** Empresas que nenhum colaborador atende. */
  async semColaborador() {
    const [empresas, vinculos] = await Promise.all([
      this.prisma.empresa.findMany({ select: { id: true, id_empresa: true, razao_social: true, cnpj_cpf: true, grupo: true }, orderBy: { razao_social: 'asc' } }),
      this.prisma.vinculoColaborador.findMany({ select: { empresa_id: true } }),
    ]);
    const comColaborador = new Set(vinculos.map((v) => v.empresa_id));
    return empresas.filter((e) => !comColaborador.has(e.id));
  }

  /**
   * Muda as empresas de um colaborador: `definir` troca a carteira inteira, `adicionar` e `remover` mexem só nas empresas enviadas.
   */
  async vincular(entrada: { user_id?: string; empresa_ids?: string[]; modo?: string }) {
    const modo = entrada.modo ?? 'adicionar';
    if (!['definir', 'adicionar', 'remover'].includes(modo)) throw new BadRequestException('Modo inválido. Use definir, adicionar ou remover.');
    const user = await this.prisma.user.findUnique({ where: { id: String(entrada.user_id ?? '') } });
    if (!user) throw new NotFoundException('Colaborador não encontrado.');
    const ids = [...new Set(entrada.empresa_ids ?? [])];
    if (ids.length > 2000) throw new BadRequestException('Escolha até 2000 empresas por vez.');
    if (ids.length) {
      const existentes = await this.prisma.empresa.count({ where: { id: { in: ids } } });
      if (existentes !== ids.length) throw new NotFoundException('Alguma das empresas escolhidas não existe mais.');
    }
    const atuais = new Set((await this.prisma.vinculoColaborador.findMany({ where: { user_id: user.id }, select: { empresa_id: true } })).map((v) => v.empresa_id));
    const alvo = modo === 'definir' ? new Set(ids) : modo === 'adicionar' ? new Set([...atuais, ...ids]) : new Set([...atuais].filter((id) => !ids.includes(id)));
    const adicionar = [...alvo].filter((id) => !atuais.has(id));
    const remover = [...atuais].filter((id) => !alvo.has(id));
    if (adicionar.length) await this.prisma.vinculoColaborador.createMany({ data: adicionar.map((empresa_id) => ({ user_id: user.id, empresa_id })), skipDuplicates: true });
    if (remover.length) await this.prisma.vinculoColaborador.deleteMany({ where: { user_id: user.id, empresa_id: { in: remover } } });
    return { adicionadas: adicionar.length, removidas: remover.length, total: alvo.size };
  }
}
