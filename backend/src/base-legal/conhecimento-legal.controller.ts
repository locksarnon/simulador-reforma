import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BaseLegalService } from './base-legal.service';
import { ConhecimentoLegalService, FiltroNovidades } from './conhecimento-legal.service';
import { RevisaoSemanalService } from './revisao-semanal.service';

/** Bases legais: novidades (alterações, revogações, atos novos, aplicações), a rotina de revisão semanal, as normas monitoradas e as regras estaduais. */
@Controller('base-legal')
export class ConhecimentoLegalController {
  constructor(private readonly conhecimento: ConhecimentoLegalService, private readonly semanal: RevisaoSemanalService, private readonly baseLegal: BaseLegalService) {}

  // ───── Normas monitoradas (Administração) e regras estaduais ─────

  @Get('monitoramento')
  async monitoradas() {
    await this.baseLegal.garantirNormas();
    return this.conhecimento.normasMonitoradas();
  }

  /** Corpo: { monitoradas: [chaves] }. As normas fora da lista deixam de ser conferidas pela revisão semanal. */
  @Post('monitoramento')
  definirMonitoradas(@CurrentUser() user: AuthUser, @Body() body: { monitoradas?: unknown }) {
    this.exigirAdmin(user);
    return this.conhecimento.definirMonitoradas(body?.monitoradas);
  }

  @Get('regras-estaduais')
  regrasEstaduais() {
    return this.conhecimento.regrasEstaduais();
  }

  private exigirAdmin(user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
  }

  @Get('novidades')
  novidades(@Query() q: FiltroNovidades & { pagina?: string; limite?: string }) {
    return this.conhecimento.listarNovidades({ ...q, pagina: Number(q.pagina) || undefined, limite: Number(q.limite) || undefined });
  }

  @Get('novidades/resumo')
  resumo() {
    return this.conhecimento.resumo();
  }

  /** Marcar como vista, confirmar uma novidade achada na web, descartar ou reabrir. */
  @Post('novidades/:id/:acao')
  atualizar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('acao') acao: string) {
    this.exigirAdmin(user);
    return this.conhecimento.atualizar(id, acao, user.email);
  }

  @Get('normas/:chave/novidades')
  novidadesDaNorma(@Param('chave') chave: string) {
    return this.conhecimento.novidadesDaNorma(chave);
  }

  // ───── Revisão semanal ─────

  @Get('revisao-semanal')
  async rodadas() {
    return { estado: this.semanal.estado(), rodadas: await this.semanal.listar(20) };
  }

  @Get('revisao-semanal/fontes')
  fontes() {
    return this.semanal.fontes();
  }

  @Get('revisao-semanal/:id')
  async rodada(@Param('id') id: string) {
    const r = await this.semanal.obter(id);
    if (!r) throw new NotFoundException('Rodada não encontrada');
    return r;
  }

  /** Dispara a revisão agora (leva alguns minutos; acompanhe pela lista de rodadas). */
  @Post('revisao-semanal/executar')
  executar(@CurrentUser() user: AuthUser, @Body() _body: unknown) {
    this.exigirAdmin(user);
    return this.semanal.iniciar(user.email);
  }
}
