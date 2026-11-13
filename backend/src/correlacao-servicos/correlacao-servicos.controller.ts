import { Controller, Get, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CorrelacaoServicosService } from './correlacao-servicos.service';

/** Anexo VIII da NFS-e: a versão carregada e a atualização pela página oficial. */
@Controller('correlacao-servicos')
export class CorrelacaoServicosController {
  constructor(private readonly s: CorrelacaoServicosService) {}

  @Get('situacao')
  situacao() {
    return this.s.situacao();
  }

  @Post('atualizar')
  atualizar(@CurrentUser() user: AuthUser) {
    return this.s.atualizarPeloAdmin(user);
  }
}
