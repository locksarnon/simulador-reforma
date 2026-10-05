import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { LimpezaService, PedidoLimpeza } from './limpeza.service';

@Controller('limpeza')
export class LimpezaController {
  constructor(private readonly service: LimpezaService) {}

  /** Conta o que seria apagado, sem apagar nada. */
  @Post('previa')
  previa(@Body() body: PedidoLimpeza, @CurrentUser() user: AuthUser) {
    return this.service.previa(body, user);
  }

  /** Apaga de verdade; exige a frase de confirmação no corpo (validada aqui, não só na tela). */
  @Post('executar')
  executar(@Body() body: PedidoLimpeza & { confirmacao?: string }, @CurrentUser() user: AuthUser) {
    return this.service.executar(body, user);
  }
}
