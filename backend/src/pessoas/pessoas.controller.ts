import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PessoasService } from './pessoas.service';

/** Clientes > Pessoas físicas. */
@Controller('pessoas-fisicas')
export class PessoasController {
  constructor(private readonly pessoas: PessoasService) {}

  @Get()
  listar() {
    return this.pessoas.listar();
  }

  @Post()
  criar(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.pessoas.criar(user, body ?? {});
  }

  @Put(':id')
  atualizar(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.pessoas.atualizar(id, body ?? {});
  }

  @Delete(':id')
  excluir(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pessoas.excluir(user, id);
  }
}
