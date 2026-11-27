import { Body, Controller, Delete, Get, Param, Post, Query, StreamableFile } from '@nestjs/common';
import { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissao } from '../../permissoes/permissao.decorator';
import { EntregaveisService, PDF, XLSX, faseDoFiltro, type FiltroUnificacoes } from './entregaveis.service';

/**
 * Downloads do Saneamento de Estoques. Mesmo prefixo e mesma tela de permissão do controller de dados (rota `saneamento-estoques`);
 * são leituras (GET), então valem as regras de visualização da Consultoria. A marca "Executado no ERP" do mapa é escrita ("Alterar dados").
 */
@Controller('saneamento-estoques')
export class EntregaveisController {
  constructor(private readonly entregaveis: EntregaveisService) {}

  /**
   * Sem `versaoId` = exportação para revisão (base atual, com o proposto marcado); `fase=FASE1` deixa de fora a parte tributária.
   * Com `versaoId` = entrega liberada daquela versão (a fase é a gravada na versão).
   */
  @Get('projetos/:id/entregas/excel')
  async excel(@Param('id') id: string, @Query('versaoId') versaoId?: string, @Query('fase') fase?: string) {
    const { buffer, nome } = await this.entregaveis.excel(id, versaoId || undefined, versaoId ? null : faseDoFiltro(fase));
    return new StreamableFile(buffer, { type: XLSX, disposition: `attachment; filename="${nome}"` });
  }

  /** Mapa de unificações e inativações da base atual (consulta da tela, paginada): situacao, tipo, busca, pagina, limite. */
  @Get('projetos/:id/unificacoes')
  unificacoes(@Param('id') id: string, @Query() q: FiltroUnificacoes) {
    return this.entregaveis.unificacoes(id, q ?? {});
  }

  /** O mesmo mapa (com o filtro da tela) em Excel, para mandar a quem faz os ajustes no ERP. */
  @Get('projetos/:id/unificacoes/excel')
  async unificacoesExcel(@Param('id') id: string, @Query() q: FiltroUnificacoes) {
    const { buffer, nome } = await this.entregaveis.excelUnificacoes(id, q ?? {});
    return new StreamableFile(buffer, { type: XLSX, disposition: `attachment; filename="${nome}"` });
  }

  /** Marca a linha do mapa (`chave` da linha) como "Executado no ERP": quem e quando. Só ação aprovada (ou troca de código registrada). */
  @Post('projetos/:id/unificacoes/executadas')
  marcarExecutada(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: { chave?: string }) {
    return this.entregaveis.marcarExecutada(id, b?.chave, user);
  }

  /** Desmarca a linha (`?chave=`). Não apaga registro do cliente: exige "Alterar dados", não "Excluir registros". */
  @Delete('projetos/:id/unificacoes/executadas')
  @Permissao('alterar')
  desmarcarExecutada(@Param('id') id: string, @Query('chave') chave?: string) {
    return this.entregaveis.desmarcarExecutada(id, chave);
  }

  /** Relatório de fechamento: exige versão liberada (sem `versaoId`, a mais recente). */
  @Get('projetos/:id/entregas/relatorio')
  async relatorio(@Param('id') id: string, @Query('versaoId') versaoId?: string) {
    const { buffer, nome } = await this.entregaveis.relatorio(id, versaoId || undefined);
    return new StreamableFile(buffer, { type: PDF, disposition: `attachment; filename="${nome}"` });
  }
}
