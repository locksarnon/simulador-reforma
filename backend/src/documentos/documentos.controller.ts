import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DocumentosService, LIMITE_ARQUIVO } from './documentos.service';

const disposicao = (nome: string) => `attachment; filename="${nome.replace(/[^\w.\- ()]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nome)}`;

/** Arquivos e documentos (BPO Fiscal) e "Meus downloads". Tipos de documento: só administrador muda. */
@Controller('documentos')
export class DocumentosController {
  constructor(private readonly docs: DocumentosService) {}

  @Get('tipos')
  tipos() {
    return this.docs.listarTipos();
  }

  @Post('tipos')
  criarTipo(@CurrentUser() user: AuthUser, @Body() body: { nome?: string; orgao?: string; alerta_dias?: number }) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores mudam os tipos de documento.');
    return this.docs.salvarTipo(null, body ?? {});
  }

  @Put('tipos/:id')
  atualizarTipo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { nome?: string; orgao?: string; alerta_dias?: number }) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores mudam os tipos de documento.');
    return this.docs.salvarTipo(id, body ?? {});
  }

  @Delete('tipos/:id')
  excluirTipo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores mudam os tipos de documento.');
    return this.docs.excluirTipo(id);
  }

  @Get('arquivos')
  arquivos(@Query() q: { empresa_id?: string; pessoa_fisica_id?: string; pasta?: string; recursivo?: string }) {
    return this.docs.listarArquivos({ ...q, recursivo: q.recursivo === '1' || q.recursivo === 'true' });
  }

  @Post('arquivos')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: LIMITE_ARQUIVO, files: 1 } }))
  enviar(@CurrentUser() user: AuthUser, @UploadedFile() arquivo: Express.Multer.File | undefined, @Body() body: { empresa_id?: string; pessoa_fisica_id?: string; pasta?: string }) {
    if (!arquivo) throw new BadRequestException('Escolha um arquivo.');
    return this.docs.enviar(user, body ?? {}, arquivo);
  }

  @Get('arquivos/:id/download')
  async baixar(@Param('id') id: string) {
    const a = await this.docs.baixar(id);
    return new StreamableFile(a.buffer, { type: a.tipo, disposition: disposicao(a.nome) });
  }

  @Put('arquivos/:id')
  mover(@Param('id') id: string, @Body() body: { nome?: string; pasta?: string }) {
    return this.docs.mover(id, body ?? {});
  }

  @Delete('arquivos/:id')
  excluirArquivo(@Param('id') id: string) {
    return this.docs.excluirArquivo(id);
  }

  @Get()
  documentos(@Query() q: { empresa_id?: string; pessoa_fisica_id?: string; situacao?: string }) {
    return this.docs.listarDocumentos(q);
  }

  @Post()
  criarDocumento(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.docs.criarDocumento(user, body ?? {});
  }

  @Put(':id')
  atualizarDocumento(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.docs.atualizarDocumento(id, body ?? {});
  }

  @Delete(':id')
  excluirDocumento(@Param('id') id: string) {
    return this.docs.excluirDocumento(id);
  }
}

/** Meus downloads: cada pessoa vê e baixa só os próprios ZIP. */
@Controller('downloads')
export class DownloadsController {
  constructor(private readonly docs: DocumentosService) {}

  @Get()
  listar(@CurrentUser() user: AuthUser) {
    return this.docs.listarLotes(user);
  }

  @Post()
  criar(@CurrentUser() user: AuthUser, @Body() body: { arquivo_ids?: string[]; nome?: string }) {
    return this.docs.criarLote(user, body ?? {});
  }

  @Get(':id/arquivo')
  async baixar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const l = await this.docs.baixarLote(user, id);
    return new StreamableFile(l.buffer, { type: 'application/zip', disposition: disposicao(l.nome) });
  }
}
