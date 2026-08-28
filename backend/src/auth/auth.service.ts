import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, JwtPayload } from './auth.types';
import { LoginDto, RegisterDto, ResetPasswordDto, ResetPasswordRequestDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto, meta?: { ip?: string; userAgent?: string }) {
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
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const authUser: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    const tokens = await this.issueTokens(authUser, meta);
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
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    // Não revela se o e-mail existe ou não (evita enumeração de contas).
    if (!user) {
      return { ok: true };
    }

    const resetToken = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(resetToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // Não há infraestrutura de e-mail neste ambiente self-hosted — o link é
    // registrado no log do backend para uso manual em dev/local.
    this.logger.warn(
      `Reset de senha solicitado para ${user.email}. Token (válido por 1h): ${resetToken}`,
    );
    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.resetToken);
    const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Token de redefinição inválido ou expirado.');
    }

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
