import { Body, Controller, Delete, Get, Param, Post, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PreAnaliseService } from './pre-analise.service';

const disposicao = (nome: string, inline = false) => `${inline ? 'inline' : 'attachment'}; filename="${nome.replace(/[^\w.\- ()]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nome)}`;

/** Pré-análise por CNPJ: sete consultas com status e relatório em PDF. */
@Controller('pre-analises')
export class PreAnaliseController {
  constructor(private readonly s: PreAnaliseService) {}

  @Get()
  listar(@Query('cnpj') cnpj?: string) {
    return this.s.listar(cnpj);
  }

  @Post()
  criar(@CurrentUser() user: AuthUser, @Body() body: { cnpj?: string }) {
    return this.s.criar(String(body?.cnpj ?? ''), user);
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.s.obter(id);
  }

  @Post(':id/reprocessar')
  reprocessar(@Param('id') id: string) {
    return this.s.reprocessar(id);
  }

  @Post(':id/certidoes/:chave')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  anexar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('chave') chave: string, @UploadedFile() arquivo: { buffer: Buffer } | undefined) {
    return this.s.anexarCertidao(id, chave, arquivo?.buffer, user);
  }

  @Get(':id/arquivos/:chave')
  async arquivo(@Param('id') id: string, @Param('chave') chave: string, @Query('ver') ver?: string) {
    const a = await this.s.arquivo(id, chave);
    return new StreamableFile(a.buffer, { type: 'application/pdf', disposition: disposicao(a.nome, ver === '1') });
  }

  @Get(':id/relatorio')
  async relatorio(@Param('id') id: string, @Query('ver') ver?: string) {
    const a = await this.s.relatorio(id);
    return new StreamableFile(a.buffer, { type: 'application/pdf', disposition: disposicao(a.nome, ver === '1') });
  }

  @Delete(':id')
  excluir(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.s.excluir(id, user);
  }
}
