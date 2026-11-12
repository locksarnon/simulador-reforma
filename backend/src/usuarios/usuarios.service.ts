import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { emailLayout, esc, MailService } from '../mail/mail.service';

export const DIAS_CONVITE = 7;
export const HORAS_REDEFINICAO = 24;
type TipoLink = 'CONVITE' | 'RESET' | 'ESQUECI';
export type SituacaoUsuario = 'ATIVO' | 'CONVITE_PENDENTE' | 'CONVITE_VENCIDO' | 'INATIVO';
const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const dataHora = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

/** Situação da conta para a lista: convite pendente ou vencido enquanto a pessoa não entrou. */
export function situacaoDoUsuario(u: { ativo: boolean; lastLoginAt: Date | null }, convite?: { expiresAt: Date; usedAt: Date | null } | null, agora = new Date()): SituacaoUsuario {
  if (!u.ativo) return 'INATIVO';
  if (u.lastLoginAt || !convite || convite.usedAt) return 'ATIVO';
  return convite.expiresAt.getTime() > agora.getTime() ? 'CONVITE_PENDENTE' : 'CONVITE_VENCIDO';
}

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
  constructor(private readonly prisma: PrismaService, @Optional() private readonly mail?: MailService) {}

  async listar() {
    const [usuarios, vinculos, convites] = await Promise.all([
      this.prisma.user.findMany({ select: publico, orderBy: [{ ativo: 'desc' }, { email: 'asc' }] }),
      this.prisma.vinculoColaborador.groupBy({ by: ['user_id'], _count: { _all: true } }),
      this.prisma.passwordResetToken.findMany({ where: { tipo: 'CONVITE' }, orderBy: { createdAt: 'desc' }, select: { userId: true, expiresAt: true, usedAt: true, createdAt: true, enviadoPor: true } }),
    ]);
    const n = new Map(vinculos.map((v) => [v.user_id, v._count._all]));
    const ultimo = new Map<string, (typeof convites)[number]>();
    for (const c of convites) if (!ultimo.has(c.userId)) ultimo.set(c.userId, c);
    return usuarios.map((u) => {
      const c = ultimo.get(u.id);
      return { ...u, empresas: n.get(u.id) ?? 0, situacao: situacaoDoUsuario(u, c), convite: c ? { enviado_em: c.createdAt, expira_em: c.expiresAt, enviado_por: c.enviadoPor } : null };
    });
  }

  /** Cria um link de uso único (convite ou redefinição), invalidando os anteriores do mesmo tipo. */
  private async novoLink(userId: string, tipo: TipoLink, porQuem?: string) {
    const agora = new Date();
    const tipoBanco = tipo === 'ESQUECI' ? 'RESET' : tipo;
    await this.prisma.passwordResetToken.updateMany({ where: { userId, tipo: tipoBanco, usedAt: null }, data: { usedAt: agora } });
    const token = randomBytes(32).toString('base64url');
    const expira = new Date(agora.getTime() + (tipo === 'CONVITE' ? DIAS_CONVITE * 86_400_000 : tipo === 'ESQUECI' ? 3_600_000 : HORAS_REDEFINICAO * 3_600_000));
    await this.prisma.passwordResetToken.create({ data: { userId, tokenHash: hash(token), expiresAt: expira, tipo: tipoBanco, enviadoPor: porQuem ?? null } });
    const base = this.mail?.urlPublica ?? (process.env.APP_PUBLIC_URL || 'https://simulador.clarityib.com.br').replace(/\/$/, '');
    return { link: `${base}/reset-password?token=${token}${tipo === 'CONVITE' ? '&convite=1' : ''}`, expira };
  }

  /** E-mail do convite ou da redefinição. Sem e-mail configurado, devolve o motivo e a tela mostra o link para copiar. */
  private async enviarLink(u: { email: string; name: string | null }, tipo: TipoLink, link: string, expira: Date, porQuem?: string) {
    if (!this.mail) return { enviado: false, motivo: 'e-mail não configurado no servidor' };
    const nome = u.name?.split(' ')[0] || '';
    const convite = tipo === 'CONVITE';
    const titulo = convite ? 'Você foi convidado para o InTAX' : 'Redefinição de senha do InTAX';
    const proprio = tipo === 'ESQUECI';
    const ola = nome ? `Olá, ${nome}.` : 'Olá.';
    const texto = convite
      ? `${ola} ${porQuem ? `${porQuem} convidou você` : 'Você foi convidado'} para acessar o InTAX, da FAL Agro, com o e-mail ${u.email}. Para entrar, crie a sua senha no link abaixo.`
      : `${ola} ${proprio ? 'Recebemos um pedido para redefinir a senha' : 'Um administrador do InTAX pediu a redefinição da senha'} da sua conta no InTAX (${u.email}). Crie uma senha nova no link abaixo.`;
    const html = emailLayout(titulo, `<p style="margin:0 0 16px;line-height:1.5">${esc(texto)}</p>
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#197148;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:6px">${convite ? 'Criar minha senha' : 'Criar senha nova'}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#5b6b63;line-height:1.5">O link vale até ${esc(dataHora(expira))} e só pode ser usado uma vez. Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all">${esc(link)}</span></p>
<p style="margin:0;font-size:13px;color:#5b6b63">${convite ? 'A senha precisa ter pelo menos 10 caracteres.' : 'Se você não esperava esta mensagem, ignore-a: a senha atual continua valendo até você criar outra.'}</p>`);
    const t = `${titulo}\n\n${texto}\n\n${link}\n\nO link vale até ${dataHora(expira)} e só pode ser usado uma vez.`;
    return this.mail.enviar({ to: u.email, subject: titulo, html, text: t });
  }

  /** Reenvia o convite de quem ainda não entrou (link novo; o anterior deixa de valer). */
  async reenviarConvite(id: string, ator?: { email?: string }) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('Usuário não encontrado.');
    if (!u.ativo) throw new BadRequestException('A conta está desativada. Reative antes de reenviar o convite.');
    if (u.lastLoginAt) throw new BadRequestException(`${u.email} já entrou no InTAX. Use "Enviar link para redefinir a senha".`);
    const { link, expira } = await this.novoLink(u.id, 'CONVITE', ator?.email);
    const envio = await this.enviarLink(u, 'CONVITE', link, expira, ator?.email);
    return { ...envio, link, expira_em: expira };
  }

  /** "Esqueci minha senha" da tela de login: link de 1 hora por e-mail. Não diz se a conta existe. */
  async esqueciSenha(email: string) {
    const u = await this.prisma.user.findUnique({ where: { email: String(email ?? '').trim().toLowerCase() } });
    if (!u || !u.ativo) return { ok: true };
    const { link, expira } = await this.novoLink(u.id, 'ESQUECI', 'próprio usuário');
    await this.enviarLink(u, 'ESQUECI', link, expira);
    return { ok: true };
  }

  /** Manda por e-mail um link para a pessoa criar uma senha nova (vale 24 horas). */
  async enviarRedefinicao(id: string, ator?: { email?: string }) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('Usuário não encontrado.');
    if (!u.ativo) throw new BadRequestException('A conta está desativada. Reative antes de redefinir a senha.');
    const { link, expira } = await this.novoLink(u.id, 'RESET', ator?.email);
    const envio = await this.enviarLink(u, 'RESET', link, expira, ator?.email);
    return { ...envio, link, expira_em: expira };
  }

  async criar(entrada: { email?: string; name?: string; role?: string; senha?: string; convite?: boolean }, ator?: { email?: string }) {
    const email = String(entrada.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw new BadRequestException('Informe um e-mail válido.');
    const role = entrada.role ?? 'user';
    if (!PAPEIS.includes(role as never)) throw new BadRequestException('Papel inválido. Use admin ou user.');
    // Sem senha informada, o padrão é o convite por e-mail: a pessoa cria a própria senha pelo link.
    const convite = entrada.convite ?? !entrada.senha;
    const provisoria = !convite && !entrada.senha;
    const senha = convite || provisoria ? senhaProvisoria() + (convite ? senhaProvisoria() : '') : validarSenha(entrada.senha, email);
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Já existe uma conta com esse e-mail.');
    const user = await this.prisma.user.create({
      data: { email, name: entrada.name?.trim().slice(0, 120) || null, role: role as never, passwordHash: await argon2.hash(senha) },
      select: publico,
    });
    if (convite) {
      const { link, expira } = await this.novoLink(user.id, 'CONVITE', ator?.email);
      const envio = await this.enviarLink(user, 'CONVITE', link, expira, ator?.email);
      return { usuario: user, senha_provisoria: null, convite: { ...envio, link, expira_em: expira } };
    }
    return { usuario: user, senha_provisoria: provisoria ? senha : null, convite: null };
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
