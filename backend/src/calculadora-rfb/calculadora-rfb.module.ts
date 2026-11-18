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

@Module({
  controllers: [CalculadoraRfbController],
  providers: [CalculadoraRfbService],
  exports: [CalculadoraRfbService],
})
export class CalculadoraRfbModule {}
