import { Body, Controller, Param, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientesService, NovoCliente } from './clientes.service';

/** Clientes > Novo cliente: um passo só, com os serviços marcados e o grupo econômico opcional. */
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Post(':id/arquivar')
  arquivar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clientes.arquivar(id, user);
  }

  @Post(':id/desarquivar')
  desarquivar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clientes.desarquivar(id, user);
  }

  /** Atualiza o cadastro com os dados públicos do CNPJ (Receita Federal). */
  @Post(':id/atualizar-cnpj')
  atualizarCnpj(@Param('id') id: string) {
    return this.clientes.atualizarPeloCnpj(id);
  }

  @Post()
  criar(@CurrentUser() user: AuthUser, @Body() body: NovoCliente) {
    return this.clientes.criar(body ?? {}, user);
  }
}
