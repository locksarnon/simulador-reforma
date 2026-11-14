import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EntradaProjeto, ProjetosDiagnosticoService } from './projetos.service';

/** Diagnósticos > Projetos: o trabalho pontual com o escopo de CNPJs escolhido. */
@Controller('projetos-diagnostico')
export class ProjetosDiagnosticoController {
  constructor(private readonly projetos: ProjetosDiagnosticoService) {}

  @Get()
  listar() {
    return this.projetos.listar();
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.projetos.obter(id);
  }

  @Post()
  criar(@CurrentUser() user: AuthUser, @Body() body: EntradaProjeto) {
    return this.projetos.criar(body ?? {}, user);
  }

  @Put(':id')
  atualizar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: EntradaProjeto) {
    return this.projetos.atualizar(id, body ?? {}, user);
  }

  @Post(':id/solicitacao-exclusao/aprovar')
  aprovarExclusao(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projetos.aprovarExclusao(id, user);
  }

  @Delete(':id/solicitacao-exclusao')
  recusarExclusao(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projetos.recusarExclusao(id, user);
  }

  @Delete(':id')
  excluir(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projetos.excluir(id, user);
  }
}
