import { Body, Controller, ForbiddenException, Get, Module, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CalculadoraRfbService } from './calculadora-rfb.service';

/** Administração > Integrações > Calculadora oficial da Receita: estado, versão e atualização (só administradores). */
@Controller('integracoes/calculadora-rfb')
export class CalculadoraRfbController {
  constructor(private readonly calc: CalculadoraRfbService) {}

  @Get()
  estado(@CurrentUser() user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
    return this.calc.estado();
  }

  @Post('conferir-github')
  async conferirGithub(@CurrentUser() user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
    await this.calc.verificarGithub();
    return this.calc.estado();
  }

  @Post('atualizar')
  atualizar(@CurrentUser() user: AuthUser, @Body() corpo: { confirmar?: boolean }) {
    return this.calc.pedirAtualizacao(user, corpo?.confirmar === true);
  }
}

/** Simulador > operação: a conferência do cálculo com a calculadora oficial. Qualquer usuário logado (só lê). */
@Controller('calculadora-rfb')
export class ConferirOperacaoController {
  constructor(private readonly calc: CalculadoraRfbService) {}

  @Post('conferir-operacao')
  conferir(@Body() corpo: Record<string, unknown>) {
    const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const t = (v: unknown) => (typeof v === 'string' && v.length <= 40 ? v : undefined);
    const f = (corpo.fatores ?? {}) as Record<string, unknown>;
    const a = corpo.aliquotas as Record<string, unknown> | undefined;
    return this.calc.conferirOperacao({
      data: t(corpo.data), ano: n(corpo.ano), cst: t(corpo.cst), cClassTrib: t(corpo.cClassTrib), ncm: t(corpo.ncm), nbs: t(corpo.nbs), valorBruto: n(corpo.valorBruto),
      pisPct: n(corpo.pisPct), cofinsPct: n(corpo.cofinsPct), icmsPct: n(corpo.icmsPct), fcpPct: n(corpo.fcpPct), issPct: n(corpo.issPct),
      fatores: { pisCofins: n(f.pisCofins), icms: n(f.icms), iss: n(f.iss) },
      aliquotas: a ? { cbs: n(a.cbs), ibsUf: n(a.ibsUf), ibsMun: n(a.ibsMun) } : undefined,
      semAlcance: typeof corpo.semAlcance === 'string' ? corpo.semAlcance.slice(0, 300) : null,
    });
  }
}

@Module({
  controllers: [CalculadoraRfbController, ConferirOperacaoController],
  providers: [CalculadoraRfbService],
  exports: [CalculadoraRfbService],
})
export class CalculadoraRfbModule {}
