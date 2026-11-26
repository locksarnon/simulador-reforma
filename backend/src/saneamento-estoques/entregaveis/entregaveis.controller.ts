import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { EntregaveisService, PDF, XLSX, type FiltroUnificacoes } from './entregaveis.service';

/**
 * Downloads do Saneamento de Estoques. Mesmo prefixo e mesma tela de permissão do controller de dados (rota `saneamento-estoques`);
 * são leituras (GET), então valem as regras de visualização da Consultoria.
 */
@Controller('saneamento-estoques')
export class EntregaveisController {
  constructor(private readonly entregaveis: EntregaveisService) {}

  /** Sem `versaoId` = exportação para revisão (base atual, com o proposto marcado). Com ele = entrega liberada daquela versão. */
  @Get('projetos/:id/entregas/excel')
  async excel(@Param('id') id: string, @Query('versaoId') versaoId?: string) {
    const { buffer, nome } = await this.entregaveis.excel(id, versaoId || undefined);
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

  /** Relatório de fechamento: exige versão liberada (sem `versaoId`, a mais recente). */
  @Get('projetos/:id/entregas/relatorio')
  async relatorio(@Param('id') id: string, @Query('versaoId') versaoId?: string) {
    const { buffer, nome } = await this.entregaveis.relatorio(id, versaoId || undefined);
    return new StreamableFile(buffer, { type: PDF, disposition: `attachment; filename="${nome}"` });
  }
}
