import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Post, Put, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ContratoIntegraService } from './contrato.service';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConfigRotina, MonitoramentoService } from './monitoramento.service';

const disposicao = (nome: string, inline = false) => `${inline ? 'inline' : 'attachment'}; filename="${nome.replace(/[^\w.\- ()]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
const exigirAdmin = (u: AuthUser) => { if (u?.role !== 'admin') throw new ForbiddenException('Só administradores.'); };

/** BPO Fiscal > Monitoramento fiscal: consultas ao Integra Contador (Serpro), histórico, PDF, lote, rotina e obrigações dispensadas. */
@Controller('monitoramento')
export class MonitoramentoController {
  constructor(private readonly m: MonitoramentoService, private readonly contrato: ContratoIntegraService) {}

  // ── Contrato do escritório (Administração > Integrações) ──────────────────
  @Get('contrato')
  verContrato(@CurrentUser() user: AuthUser) {
    exigirAdmin(user);
    return this.contrato.estado();
  }

  @Post('contrato')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 1024 * 1024, files: 1 } }))
  salvarContrato(
    @CurrentUser() user: AuthUser,
    @UploadedFile() arquivo: { buffer: Buffer } | undefined,
    @Body() body: { senha?: string; consumer_key?: string; consumer_secret?: string; cnd_key?: string; cnd_secret?: string; divida_key?: string; divida_secret?: string; remover?: string },
  ) {
    const rem = String(body?.remover ?? '').split(',');
    return this.contrato.salvar({
      pfx: arquivo?.buffer, senha: body?.senha, consumerKey: body?.consumer_key, consumerSecret: body?.consumer_secret,
      cnd: rem.includes('cnd') ? null : { key: body?.cnd_key, secret: body?.cnd_secret },
      dividaAtiva: rem.includes('divida') ? null : { key: body?.divida_key, secret: body?.divida_secret },
    }, user);
  }

  @Post('contrato/testar')
  testarContrato(@CurrentUser() user: AuthUser) {
    return this.contrato.testar(user);
  }

  @Delete('contrato')
  removerContrato(@CurrentUser() user: AuthUser) {
    return this.contrato.remover(user);
  }

  @Get('estado')
  estado() {
    return this.m.estado();
  }

  @Put('modo')
  modo(@CurrentUser() user: AuthUser, @Body() body: { modo?: string }) {
    return this.m.definirModo(String(body?.modo ?? ''), user);
  }

  @Get('painel')
  painel(@Query('empresa_ids') ids?: string) {
    return this.m.painel(ids ? ids.split(',').filter(Boolean) : undefined);
  }

  @Get('procuracoes')
  procuracoes() {
    return this.m.procuracoes();
  }

  @Get('empresas/:id')
  daEmpresa(@Param('id') id: string) {
    return this.m.daEmpresa({ empresaId: id });
  }

  @Get('empresas/:id/historico/:chave')
  historico(@Param('id') id: string, @Param('chave') chave: string) {
    return this.m.daEmpresa({ empresaId: id }, chave);
  }

  @Post('empresas/:id/consultar')
  consultar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { chave?: string; parametros?: Record<string, unknown> }) {
    return this.m.consultar({ empresaId: id }, String(body?.chave ?? ''), body?.parametros, user);
  }

  @Get('pessoas/:id')
  daPessoa(@Param('id') id: string) {
    return this.m.daEmpresa({ pessoaFisicaId: id });
  }

  @Post('pessoas/:id/consultar')
  consultarPessoa(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { chave?: string; parametros?: Record<string, unknown> }) {
    return this.m.consultar({ pessoaFisicaId: id }, String(body?.chave ?? ''), body?.parametros, user);
  }

  @Get('consultas/:id')
  consulta(@Param('id') id: string) {
    return this.m.consulta(id);
  }

  @Get('empresas/:id/situacao-fiscal')
  situacaoFiscal(@Param('id') id: string) {
    return this.m.leituraSitfis(id);
  }

  @Get('consultas/:id/relatorio')
  async relatorioDaConsulta(@Param('id') id: string, @Query('formato') formato?: string, @Query('ver') ver?: string) {
    const a = await this.m.relatorio(id, formato === 'xlsx' ? 'xlsx' : 'pdf');
    return new StreamableFile(a.buffer, { type: a.tipo, disposition: disposicao(a.nome, ver === '1' && formato !== 'xlsx') });
  }

  @Get('consultas/:id/arquivos/:indice')
  async arquivo(@Param('id') id: string, @Param('indice', ParseIntPipe) indice: number, @Query('ver') ver?: string) {
    const a = await this.m.arquivo(id, indice);
    return new StreamableFile(a.buffer, { type: 'application/pdf', disposition: disposicao(a.nome, ver === '1') });
  }

  @Post('lote')
  lote(@CurrentUser() user: AuthUser, @Body() body: { empresa_ids?: string[]; chaves?: string[] }) {
    return this.m.iniciarLote(body?.empresa_ids ?? [], body?.chaves, user);
  }

  @Get('lote/:id')
  estadoDoLote(@Param('id') id: string) {
    return this.m.lote(id);
  }

  @Get('rotina')
  rotina() {
    return this.m.configRotina();
  }

  @Put('rotina')
  salvarRotina(@CurrentUser() user: AuthUser, @Body() body: Partial<ConfigRotina>) {
    return this.m.salvarRotina(body ?? {}, user);
  }

  @Post('guias')
  guias(@CurrentUser() user: AuthUser, @Body() body: { empresa_ids?: string[]; enviar_email?: boolean }) {
    exigirAdmin(user);
    return this.m.enviarGuias(body?.empresa_ids ?? [], !!body?.enviar_email, user);
  }

  @Get('empresas/:id/pgfn')
  pgfn(@Param('id') id: string) {
    return this.m.pgfnDaEmpresa(id);
  }

  @Post('empresas/:id/pgfn')
  criarPgfn(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.m.salvarPgfn(id, null, body ?? {}, user);
  }

  @Put('empresas/:id/pgfn/:pid')
  editarPgfn(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('pid') pid: string, @Body() body: Record<string, unknown>) {
    return this.m.salvarPgfn(id, pid, body ?? {}, user);
  }

  @Delete('pgfn/:pid')
  excluirPgfn(@CurrentUser() user: AuthUser, @Param('pid') pid: string) {
    return this.m.excluirPgfn(pid, user);
  }

  @Post('empresas/:id/dispensas')
  dispensar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { obrigacao?: string; motivo?: string }) {
    return this.m.dispensar(id, String(body?.obrigacao ?? ''), body?.motivo, user);
  }

  @Delete('empresas/:id/dispensas/:obrigacao')
  voltar(@Param('id') id: string, @Param('obrigacao') obrigacao: string) {
    return this.m.voltarObrigacao(id, obrigacao);
  }
}
