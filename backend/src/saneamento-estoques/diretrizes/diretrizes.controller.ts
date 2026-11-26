import { Body, Controller, Get, NotImplementedException, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SanBibliotecaDiretrizesService } from './biblioteca.service';
import { SanDiretrizesService } from './diretrizes.service';

/**
 * Diretrizes do Saneamento (docs/saneamento-diretrizes.md, seção 11). Prefixo /api/v1/saneamento-estoques. Permissões (permissoes.ts):
 * as rotas do projeto são da tela da Consultoria (carteira-diagnostico; gravar exige "Alterar dados"); a biblioteca é leitura para quem
 * está logado e escrita só do administrador (conferido no serviço).
 */
@Controller('saneamento-estoques')
export class SanDiretrizesController {
  constructor(private readonly diretrizes: SanDiretrizesService, private readonly biblioteca: SanBibliotecaDiretrizesService) {}

  // ── Diretrizes do projeto ──────────────────────────────────────────────────
  @Get('projetos/:id/diretrizes')
  obter(@Param('id') id: string) { return this.diretrizes.obter(id); }
  @Put('projetos/:id/diretrizes')
  cabecalho(@Param('id') id: string, @Body() b: unknown) { return this.diretrizes.atualizarCabecalho(id, b); }
  @Post('projetos/:id/diretrizes/aplicar-modelo')
  aplicarModelo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: unknown) { return this.diretrizes.aplicarModelo(id, b, user); }
  @Post('projetos/:id/diretrizes/regras')
  criarRegra(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: unknown) { return this.diretrizes.criarRegra(id, b, user); }
  @Post('projetos/:id/diretrizes/transformar')
  transformar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: unknown) { return this.diretrizes.transformar(id, b, user); }

  @Put('diretrizes/regras/:regraId')
  atualizarRegra(@CurrentUser() user: AuthUser, @Param('regraId') id: string, @Body() b: unknown) { return this.diretrizes.atualizarRegra(id, b, user); }
  /** Só lê: grupos e itens afetados, sobreposições e camadas. */
  @Get('diretrizes/regras/:regraId/previa')
  previa(@Param('regraId') id: string) { return this.diretrizes.previa(id); }
  /** Só lê: itens reais do grupo com a descrição atual e como ficaria. */
  @Get('diretrizes/regras/:regraId/exemplos')
  exemplos(@Param('regraId') id: string) { return this.diretrizes.exemplos(id); }
  @Post('diretrizes/regras/:regraId/aplicar')
  aplicar(@CurrentUser() user: AuthUser, @Param('regraId') id: string, @Body() b: unknown) { return this.diretrizes.aplicar(id, b, user); }
  @Post('diretrizes/regras/:regraId/aprovar')
  aprovar(@CurrentUser() user: AuthUser, @Param('regraId') id: string, @Body() b: unknown) { return this.diretrizes.aprovar(id, b, user); }
  @Get('diretrizes/regras/:regraId/historico')
  historico(@Param('regraId') id: string) { return this.diretrizes.historico(id); }
  @Post('diretrizes/regras/:regraId/adotar-versao')
  adotarVersao(@CurrentUser() user: AuthUser, @Param('regraId') id: string, @Body() b: unknown) { return this.diretrizes.adotarVersao(id, b, user); }

  // ── Biblioteca (rotas fixas antes de :id) ──────────────────────────────────
  @Get('biblioteca')
  listarBiblioteca(@Query('aspecto') aspecto?: string, @Query('ativas') ativas?: string) { return this.biblioteca.listar({ aspecto, ativas }); }
  @Get('biblioteca/procedimentos')
  procedimentos() { return this.biblioteca.procedimentos(); }
  @Get('biblioteca/modelos')
  modelos() { return this.biblioteca.modelos(); }
  @Get('biblioteca/:id')
  obterBiblioteca(@Param('id') id: string) { return this.biblioteca.obter(id); }
  @Get('biblioteca/:id/historico')
  historicoBiblioteca(@Param('id') id: string) { return this.biblioteca.historico(id); }
  @Post('biblioteca')
  criarBiblioteca(@CurrentUser() user: AuthUser, @Body() b: Record<string, unknown>) { return this.biblioteca.criar(b ?? {}, user); }
  @Put('biblioteca/:id')
  atualizarBiblioteca(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: Record<string, unknown>) { return this.biblioteca.atualizar(id, b ?? {}, user); }

  // ── Política (PDF) ─────────────────────────────────────────────────────────
  /**
   * TODO(integrador): entregaveis/politica não existe neste worktree. Depois do merge, trocar o 501 por:
   *   `const pdf = await gerarPdfPolitica(await this.diretrizes.dadosPdfPolitica(id, versaoId || null));` e devolver com
   *   `@Res()`/`StreamableFile` (application/pdf). `dadosPdfPolitica` já devolve o formato `DadosPolitica` (versão liberada = foto).
   */
  @Get('projetos/:id/politica/pdf')
  async politicaPdf(@Param('id') id: string, @Query('versaoId') versaoId?: string) {
    await this.diretrizes.dadosPdfPolitica(id, versaoId || null);
    throw new NotImplementedException('O PDF da política ainda não está conectado neste servidor.');
  }
}
