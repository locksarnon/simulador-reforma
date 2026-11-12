import { ConflictException, ForbiddenException, Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { AcessosService } from '../acessos/acessos.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsuariosService, validarSenha } from '../usuarios/usuarios.service';
import { AuthUser, JwtPayload } from './auth.types';
import { LoginDto, RegisterDto, ResetPasswordDto, ResetPasswordRequestDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly acessos: AcessosService,
    @Optional() private readonly usuarios?: UsuariosService,
  ) {}

  /** Cadastro fechado: com INVITE_CODE definido no servidor, só entra quem tem o código. */
  get conviteObrigatorio() {
    return Boolean(this.config.get<string>('INVITE_CODE'));
  }

  async register(dto: RegisterDto, meta?: { ip?: string; userAgent?: string }) {
    const convite = this.config.get<string>('INVITE_CODE');
    if (convite && dto.inviteCode !== convite) {
      throw new ForbiddenException('O cadastro é por convite. Peça o código de acesso à equipe FAL.');
    }
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Já existe uma conta com este e-mail.');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, name: dto.name, role: 'user' },
    });

    const authUser: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    const tokens = await this.issueTokens(authUser, meta);
    return { user: authUser, ...tokens };
  }

  async login(dto: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    const email = dto.email.toLowerCase();
    const registro = (resultado: 'OK' | 'FALHA' | 'INATIVO' | 'BLOQUEADO_IP', user_id?: string) =>
      this.acessos.registrar({ user_id, email, ip: meta?.ip, user_agent: meta?.userAgent, resultado });
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await registro('FALHA');
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      await registro('FALHA', user.id);
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }
    // Só depois de acertar a senha se diz que a conta está desativada (quem erra a senha não descobre quais contas existem).
    if (!user.ativo) {
      await registro('INATIVO', user.id);
      throw new UnauthorizedException('Esta conta está desativada. Fale com um administrador.');
    }
    if (!(await this.acessos.ipPermitido(meta?.ip))) {
      await registro('BLOQUEADO_IP', user.id);
      throw new ForbiddenException('Entrada não permitida a partir deste endereço IP.');
    }

    const authUser: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    const tokens = await this.issueTokens(authUser, meta);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await registro('OK', user.id);
    return { user: authUser, ...tokens };
  }

  async refresh(refreshToken: string, meta?: { ip?: string; userAgent?: string }) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const authUser: AuthUser = {
      id: stored.user.id,
      email: stored.user.email,
      name: stored.user.name,
      role: stored.user.role,
    };
    return this.issueTokens(authUser, meta);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  async me(user: AuthUser) {
    const full = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    return full;
  }

  async resetPasswordRequest(dto: ResetPasswordRequestDto) {
    // Não revela se o e-mail existe (evita enumeração de contas). O link vai por e-mail e vale 1 hora.
    if (this.usuarios) await this.usuarios.esqueciSenha(dto.email).catch((e) => this.logger.warn(`Falha no pedido de redefinição: ${(e as Error).message}`));
    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.resetToken);
    const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Token de redefinição inválido ou expirado.');
    }

    const dono = await this.prisma.user.findUnique({ where: { id: stored.userId }, select: { email: true } });
    validarSenha(dto.newPassword, dono?.email);
    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  private async issueTokens(user: AuthUser, meta?: { ip?: string; userAgent?: string }) {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, typ: 'access' };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
    } as Parameters<JwtService['signAsync']>[1]);

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL', '7d');
    const expiresAt = this.parseTtlDate(refreshTtl);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        ipAddress: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });

    return { accessToken, refreshToken, expiresAt };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseTtlDate(ttl: string): Date {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    const now = Date.now();
    if (!match) return new Date(now + 7 * 24 * 60 * 60 * 1000);
    const n = Number(match[1]);
    const unit = match[2];
    const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return new Date(now + n * mult);
  }
}
