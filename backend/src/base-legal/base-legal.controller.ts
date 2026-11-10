import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BaseLegalService } from './base-legal.service';
import { CartoesService, DadosCartao } from './cartoes.service';
import { TipoRevisao } from './revisao-legal.regras';
import { RevisaoLegalService, TIPOS_REVISAO } from './revisao-legal.service';

@Controller('base-legal')
export class BaseLegalController {
  constructor(private readonly service: BaseLegalService, private readonly cartoes: CartoesService, private readonly revisao: RevisaoLegalService) {}

  @Get('normas')
  normas() {
    return this.service.listar();
  }

  @Get('normas/:chave')
  estrutura(@Param('chave') chave: string) {
    return this.service.estrutura(chave);
  }

  @Get('normas/:chave/dispositivos/:caminho')
  dispositivo(@Param('chave') chave: string, @Param('caminho') caminho: string) {
    return this.service.dispositivo(chave, caminho);
  }

  @Get('busca')
  busca(@Query('q') q: string, @Query('norma') norma?: string) {
    return this.service.buscar(q, norma || undefined);
  }

  // ───── Perguntas frequentes revisadas ─────

  @Get('cartoes')
  listarCartoes(@CurrentUser() user: AuthUser) {
    return this.cartoes.listar(user.role === 'admin');
  }

  @Get('cartoes/busca')
  buscarCartoes(@CurrentUser() user: AuthUser, @Query('q') q: string) {
    return this.cartoes.buscar(q ?? '', user.role === 'admin');
  }

  @Post('cartoes')
  criarCartao(@CurrentUser() user: AuthUser, @Body() body: DadosCartao) {
    this.exigirAdmin(user);
    return this.cartoes.criar(body, user.email);
  }

  @Post('cartoes/semear')
  semearCartoes(@CurrentUser() user: AuthUser) {
    this.exigirAdmin(user);
    return this.cartoes.semear();
  }

  @Put('cartoes/:id')
  atualizarCartao(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: DadosCartao) {
    this.exigirAdmin(user);
    return this.cartoes.atualizar(id, body);
  }

  @Post('cartoes/:id/revisar')
  revisarCartao(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.exigirAdmin(user);
    return this.cartoes.definirStatus(id, 'revisado', user.email);
  }

  @Post('cartoes/:id/despublicar')
  despublicarCartao(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.exigirAdmin(user);
    return this.cartoes.definirStatus(id, 'rascunho', user.email);
  }

  @Delete('cartoes/:id')
  removerCartao(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.exigirAdmin(user);
    return this.cartoes.remover(id);
  }

  // ───── Itens que voltaram para revisão porque o texto da lei mudou ─────

  /** Fila de revisão pela lei. O administrador vê tudo; os demais veem só as notas do cálculo e os marcos da agenda. */
  @Get('revisoes')
  revisoes(@CurrentUser() user: AuthUser, @Query('tipo') tipo?: string) {
    const permitidos: TipoRevisao[] = user.role === 'admin' ? TIPOS_REVISAO : ['fundamento', 'marco'];
    if (!tipo) return this.revisao.listarPendentes(permitidos);
    const pedido = TIPOS_REVISAO.find((t) => t === tipo);
    if (!pedido) throw new BadRequestException('Tipo de revisão inválido');
    return permitidos.includes(pedido) ? this.revisao.listarPendentes([pedido]) : [];
  }

  /** O administrador conferiu a nota do cálculo ou o marco da agenda depois da mudança no texto da lei. */
  @Post('revisoes/:tipo/:alvo/conferir')
  conferirRevisao(@CurrentUser() user: AuthUser, @Param('tipo') tipo: string, @Param('alvo') alvo: string) {
    this.exigirAdmin(user);
    if (tipo === 'cartao') throw new BadRequestException('Para o cartão, use Revisar e publicar.');
    if (tipo !== 'fundamento' && tipo !== 'marco') throw new BadRequestException('Tipo de revisão inválido');
    return this.revisao.resolver(tipo, alvo, user.email);
  }

  /** Pergunta livre ao assistente (responde só com o texto das normas carregadas). */
  @Post('perguntar')
  perguntar(@CurrentUser() user: AuthUser, @Body() body: { pergunta?: string }) {
    return this.service.perguntar(user.email, body?.pergunta ?? '');
  }

  @Put('perguntas/:id/feedback')
  feedback(@Param('id') id: string, @Body() body: { util?: boolean }) {
    return this.service.feedback(id, body?.util === true);
  }

  /** Perguntas recentes (para achar lacunas na base). Só administradores. */
  @Get('perguntas')
  perguntas(@CurrentUser() user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
    return this.service.listarPerguntas();
  }

  /** Avisos de texto oficial alterado / norma nova citada pelo Radar. Só administradores. */
  @Get('alertas')
  alertas(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    this.exigirAdmin(user);
    return this.service.listarAlertas(status === 'todos' ? 'todos' : 'pendente');
  }

  @Post('alertas/verificar')
  verificar(@CurrentUser() user: AuthUser) {
    this.exigirAdmin(user);
    return this.service.verificarAtualizacoes('manual');
  }

  @Post('alertas/:id/aprovar')
  aprovar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { url?: string }) {
    this.exigirAdmin(user);
    return this.service.resolverAlerta(id, 'aprovar', user.email, body?.url);
  }

  @Post('alertas/:id/descartar')
  descartar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.exigirAdmin(user);
    return this.service.resolverAlerta(id, 'descartar', user.email);
  }

  private exigirAdmin(user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
  }

  /** Captura/atualiza do texto oficial. Só administradores. */
  @Post('importar')
  importar(@CurrentUser() user: AuthUser, @Body() body: { chave?: string; forcar?: boolean }) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
    return body?.chave ? this.service.importar(body.chave, { forcar: body.forcar }) : this.service.importarTodas();
  }
}
