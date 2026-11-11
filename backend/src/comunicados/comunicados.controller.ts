import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Header, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { ComunicadosService } from './comunicados.service';

function exigirAdmin(user: AuthUser) {
  if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Comercial > Comunicados (e-mail para grupos de clientes). Enviar é do administrador. */
@Controller('comunicados')
export class ComunicadosController {
  constructor(private readonly comunicados: ComunicadosService) {}

  @Get()
  listar() {
    return this.comunicados.listar();
  }

  @Post('destinatarios')
  destinatarios(@Body() body: { filtro?: unknown }) {
    return this.comunicados.destinatarios(body?.filtro);
  }

  @Post()
  criar(@CurrentUser() user: AuthUser, @Body() body: { assunto?: string; corpo?: string; filtro?: unknown }) {
    return this.comunicados.criar(user, body ?? {});
  }

  @Put(':id')
  atualizar(@Param('id') id: string, @Body() body: { assunto?: string; corpo?: string; filtro?: unknown }) {
    return this.comunicados.atualizar(id, body ?? {});
  }

  @Delete(':id')
  excluir(@Param('id') id: string) {
    return this.comunicados.excluir(id);
  }

  @Post(':id/anexos')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  anexar(@Param('id') id: string, @UploadedFile() arquivo: Express.Multer.File | undefined) {
    if (!arquivo) throw new BadRequestException('Escolha um arquivo.');
    return this.comunicados.anexar(id, arquivo);
  }

  @Delete(':id/anexos/:indice')
  tirarAnexo(@Param('id') id: string, @Param('indice') indice: string) {
    return this.comunicados.tirarAnexo(id, Number(indice));
  }

  @Post(':id/duplicar')
  duplicar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.comunicados.duplicar(user, id);
  }

  @Post(':id/enviar')
  enviar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    exigirAdmin(user);
    return this.comunicados.enviar(user, id);
  }
}

/** Administração > Comunicações e envios: e-mails enviados, lista de bloqueio e destinatários dos avisos. Só administradores. */
@Controller('comunicacoes')
export class ComunicacoesController {
  constructor(
    private readonly comunicados: ComunicadosService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  @Get('envios')
  envios(@CurrentUser() user: AuthUser, @Query() q: { empresa_id?: string; status?: string; origem?: string; de?: string; ate?: string }) {
    exigirAdmin(user);
    return this.comunicados.listarEnvios(q);
  }

  @Get('bloqueios')
  bloqueios(@CurrentUser() user: AuthUser) {
    exigirAdmin(user);
    return this.comunicados.listarBloqueios();
  }

  @Post('bloqueios')
  bloquear(@CurrentUser() user: AuthUser, @Body() body: { email?: string; motivo?: string }) {
    exigirAdmin(user);
    return this.comunicados.bloquear(user, body ?? {});
  }

  @Delete('bloqueios/:id')
  desbloquear(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    exigirAdmin(user);
    return this.comunicados.desbloquear(id);
  }

  @Get('avisos-email')
  avisos(@CurrentUser() user: AuthUser) {
    exigirAdmin(user);
    return this.notificacoes.configAvisosEmail();
  }

  @Put('avisos-email')
  salvarAvisos(@CurrentUser() user: AuthUser, @Body() body: { ativo?: boolean; destinatarios?: string[]; categorias?: string[] }) {
    exigirAdmin(user);
    return this.notificacoes.salvarAvisosEmail(body ?? {});
  }
}

/** Link público de saída que vai em cada comunicado. */
@Controller('public/comunicados')
export class ComunicadosPublicoController {
  constructor(private readonly comunicados: ComunicadosService) {}

  @Public()
  @Get('sair')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async sair(@Query('e') e: string, @Query('t') t: string) {
    const ok = await this.comunicados.sair(e, t);
    const msg = ok ? 'Pronto. Você não vai mais receber comunicados da FAL Agro por e-mail.' : 'Link inválido.';
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>InTAX</title></head><body style="font-family:Arial,sans-serif;background:#f3f5f2;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="background:#fff;padding:32px;border-radius:8px;max-width:420px;text-align:center"><h2 style="color:#1f3a2e;margin-top:0">InTAX</h2><p>${esc(msg)}</p></div></body></html>`;
  }
}
