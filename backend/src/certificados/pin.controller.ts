import { Body, Controller, ForbiddenException, Get, Put } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissao } from '../permissoes/permissao.decorator';
import { exigirFuncao } from '../permissoes/permissoes';
import { PinCertificadoService } from './pin.service';

/** PIN do cofre de certificados: qualquer um vê se está ligado; quem tem a função "certificados" define, troca ou tira. */
@Controller('certificados/pin')
export class PinCertificadoController {
  constructor(private readonly pin: PinCertificadoService) {}

  @Get()
  estado() {
    return this.pin.estado();
  }

  @Put()
  @Permissao('certificados')
  definir(@CurrentUser() user: AuthUser, @Body() body: { atual?: string; novo?: string }) {
    exigirFuncao(user, 'certificados');
    return this.pin.definir(body ?? {});
  }
}
