import { Body, Controller, Delete, Get, Param, Post, Put, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PreAnaliseService } from './pre-analise.service';
import { CertidoesService } from './certidoes.service';
import { InfosimplesService } from '../infosimples/infosimples.service';

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
    return new StreamableFile(a.buffer, { type: a.tipo, disposition: disposicao(a.nome, ver === '1') });
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

/** BPO Fiscal > Monitoramento > Certidões do cliente: as já emitidas (PDF), a emissão da federal pela API e o anexo das demais. */
@Controller('certidoes')
export class CertidoesController {
  constructor(private readonly s: CertidoesService) {}

  @Get('empresas/:id')
  listar(@Param('id') id: string) {
    return this.s.listar(id);
  }

  @Post('empresas/:id/:tipo/emitir')
  emitir(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('tipo') tipo: string) {
    return this.s.emitir(id, tipo, user);
  }

  @Post('empresas/:id/:tipo/anexar')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  anexar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('tipo') tipo: string, @UploadedFile() arquivo: { buffer: Buffer } | undefined, @Body() body: { validade?: string }) {
    return this.s.anexar(id, tipo, arquivo?.buffer, body?.validade || undefined, user);
  }
}

/** Administração > Integrações: token da Infosimples (CNDT e CRF). */
@Controller('integracoes')
export class IntegracoesExternasController {
  constructor(private readonly infosimples: InfosimplesService) {}

  @Get('infosimples')
  infosimplesEstado() {
    return this.infosimples.estado();
  }

  @Put('infosimples')
  infosimplesSalvar(@CurrentUser() user: AuthUser, @Body() body: { token?: string }) {
    return this.infosimples.salvar(body?.token, user);
  }

  @Delete('infosimples')
  infosimplesRemover(@CurrentUser() user: AuthUser) {
    return this.infosimples.remover(user);
  }
}
