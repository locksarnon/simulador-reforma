import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CustosService } from './custos.service';

/** Custos das ferramentas externas: o do usuário logado (barra lateral) e o painel do administrador. */
@Controller('custos')
export class CustosController {
  constructor(private readonly custos: CustosService) {}

  @Get('meu')
  meu(@CurrentUser() user: AuthUser, @Query('mes') mes?: string) {
    return this.custos.meu(user?.email, mes);
  }

  @Get()
  geral(@CurrentUser() user: AuthUser, @Query('mes') mes?: string) {
    return this.custos.geral(mes, user);
  }

  @Put('precos')
  salvar(@CurrentUser() user: AuthUser, @Body() body: { precos?: Record<string, number>; fixos?: { rotulo: string; valor: number }[] }) {
    return this.custos.salvarPrecos(body ?? {}, user);
  }
}
