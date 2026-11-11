import { Body, Controller, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientesService, NovoCliente } from './clientes.service';

/** Clientes > Novo cliente: um passo só, com os serviços marcados e o grupo econômico opcional. */
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Post()
  criar(@CurrentUser() user: AuthUser, @Body() body: NovoCliente) {
    return this.clientes.criar(body ?? {}, user);
  }
}
