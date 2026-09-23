import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { NewsletterService } from './newsletter.service';

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly service: NewsletterService) {}

  @Get('resumo')
  resumo() {
    return this.service.resumo();
  }

  @Post('rascunho')
  rascunho() {
    return this.service.gerarRascunho();
  }

  @Put('edicoes/:id')
  atualizar(@Param('id') id: string, @Body() b: { assunto?: string; corpo_html?: string }) {
    return this.service.atualizar(id, b);
  }

  @Post('edicoes/:id/aprovar')
  aprovar(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.aprovar(id, user.email);
  }

  @Post('edicoes/:id/teste')
  teste(@Param('id') id: string, @Body('para') para: string, @CurrentUser() user: AuthUser) {
    return this.service.enviarTeste(id, para || user.email);
  }

  @Post('edicoes/:id/enviar')
  enviar(@Param('id') id: string) {
    return this.service.enviar(id);
  }
}
