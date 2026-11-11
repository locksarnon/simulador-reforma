import { Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PainelCarteiraService } from './painel-carteira.service';

/** Painel da carteira (BI feito com o cadastro). Completar pelo CNPJ grava no cadastro: só administradores. */
@Controller('painel-carteira')
export class PainelController {
  constructor(private readonly painel: PainelCarteiraService) {}

  @Get()
  resumo() {
    return this.painel.resumo();
  }

  @Post('completar')
  completar(@CurrentUser() user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores completam o cadastro pelo CNPJ.');
    return this.painel.completarPeloCnpj();
  }
}
