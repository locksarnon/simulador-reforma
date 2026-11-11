import { Body, Controller, ForbiddenException, Get, Put } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PinCertificadoService } from './pin.service';

/** PIN do cofre de certificados: qualquer um vê se está ligado; só administrador define, troca ou tira. */
@Controller('certificados/pin')
export class PinCertificadoController {
  constructor(private readonly pin: PinCertificadoService) {}

  @Get()
  estado() {
    return this.pin.estado();
  }

  @Put()
  definir(@CurrentUser() user: AuthUser, @Body() body: { atual?: string; novo?: string }) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores mudam o PIN do cofre.');
    return this.pin.definir(body ?? {});
  }
}
