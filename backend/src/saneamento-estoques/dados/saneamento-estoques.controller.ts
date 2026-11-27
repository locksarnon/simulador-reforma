import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissao } from '../../permissoes/permissao.decorator';
import type { ResultadoCamada } from '../tipos';
import { SanCasosService, type EntradaAprovar, type EntradaLote, type EntradaLoteDecisao, type FiltroCasos, type FiltroCasosAgrupados } from './casos.service';
import { SanImportacaoService, exigirTratamentoSemData, type EscolhaIncorporar } from './importacao.service';
import { SanImpactosService, type EntradaImpacto, type EntradaVinculo, type FiltroImpactos } from './impactos.service';
import { SanItensService, type FiltroItens } from './itens.service';
import { SanOrquestracaoService } from './orquestracao.service';
import { SanProjetoService, type EntradaConfiguracao } from './projeto.service';
import { SanRestauracaoService } from './restauracao.service';
import { SanVersoesService } from './versoes.service';

const MAX_ARQUIVO = 60 * 1024 * 1024;

function json<T>(bruto: unknown, padrao: T): T {
  if (bruto == null || bruto === '') return padrao;
  if (typeof bruto !== 'string') return bruto as T;
  try { return JSON.parse(bruto) as T; } catch { throw new BadRequestException('Um dos campos enviados não é um JSON válido.'); }
}

/** Saneamento de Estoques e Cadastro de Produtos (contrato em docs/saneamento-estoques-contrato.md). Tela das permissões: a de Consultoria. */
@Controller('saneamento-estoques')
export class SaneamentoEstoquesController {
  constructor(
    private readonly projetos: SanProjetoService,
    private readonly importacao: SanImportacaoService,
    private readonly itens: SanItensService,
    private readonly casos: SanCasosService,
    private readonly versoes: SanVersoesService,
    private readonly impactos: SanImpactosService,
    private readonly orquestracao: SanOrquestracaoService,
    private readonly restauracao: SanRestauracaoService,
  ) {}

  // ── Projeto e atividades ───────────────────────────────────────────────────
  @Post('projetos')
  criar(@CurrentUser() user: AuthUser, @Body() b: { diagnostico_id?: string }) {
    if (!b?.diagnostico_id) throw new BadRequestException('Informe o projeto de consultoria (diagnostico_id).');
    return this.projetos.criar(b.diagnostico_id, user);
  }
  @Get('projetos/por-diagnostico/:diagnosticoId')
  porDiagnostico(@Param('diagnosticoId') id: string) { return this.projetos.obterPorDiagnostico(id); }
  @Get('projetos/:id')
  obter(@Param('id') id: string) { return this.projetos.obter(id); }
  @Put('projetos/:id')
  async configurar(@Param('id') id: string, @Body() b: EntradaConfiguracao, @CurrentUser() user?: AuthUser) {
    const antes = ((await this.projetos.obter(id)).parametros as { competenciaEntregue?: unknown } | null)?.competenciaEntregue ?? null;
    const p = await this.projetos.configurar(id, b ?? {}, user);
    // Mudou a última competência entregue: as linhas de impacto no SPED são reclassificadas (escrituração já entregue ou não).
    if (((p.parametros as { competenciaEntregue?: unknown } | null)?.competenciaEntregue ?? null) !== antes) await this.casos.sincronizarTodosImpactos(id);
    return p;
  }

  /** Fases do projeto (camadas, versão liberada e o que trava a Fase 2). Só lê. */
  @Get('projetos/:id/fases')
  fases(@Param('id') id: string) { return this.projetos.fases(id); }

  @Get('projetos/:id/atividades')
  atividades(@Param('id') id: string) { return this.projetos.listarAtividades(id); }
  @Post('projetos/:id/atividades')
  adicionarAtividade(@Param('id') id: string, @Body() b: { codigo?: string; descricao?: string }) { return this.projetos.adicionarAtividade(id, b ?? {}); }
  /** Consulta o CNPJ agora, atualiza os dados públicos do cliente e acrescenta os CNAEs que faltam (sem apagar nada). PF: 400. */
  @Post('projetos/:id/atividades/buscar-cnpj')
  buscarAtividadesPeloCnpj(@Param('id') id: string, @Body() b: { versao?: number }) { return this.projetos.buscarAtividadesPeloCnpj(id, b?.versao); }
  @Post('projetos/:id/atividades/confirmar')
  confirmarAtividades(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: { versao?: number }) { return this.projetos.confirmarAtividades(id, b?.versao, user); }
  @Post('projetos/:id/atividades/reabrir')
  reabrirAtividades(@Param('id') id: string, @Body() b: { versao?: number }) { return this.projetos.reabrirAtividades(id, b?.versao); }
  @Put('projetos/:id/atividades/:atividadeId')
  alterarAtividade(@Param('id') id: string, @Param('atividadeId') a: string, @Body() b: { mantida?: boolean }) { return this.projetos.alterarAtividade(id, a, b ?? {}); }

  // ── Importação ─────────────────────────────────────────────────────────────
  /** Só lê (POST_DE_LEITURA): mostra o que seria aceito, novo, alterado e protegido. Não grava. */
  @Post('projetos/:id/importacoes/previa')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_ARQUIVO } }))
  previa(@Param('id') id: string, @UploadedFile() f: Express.Multer.File, @Body() b: { mapeamento?: string; pagina?: string; limite?: string; filtro?: string; escalaSaldo?: string }) {
    return this.importacao.previa(id, { buffer: f?.buffer, nome: f?.originalname ?? 'arquivo' }, json(b?.mapeamento, undefined), { pagina: b?.pagina, limite: b?.limite, filtro: b?.filtro, escalaSaldo: b?.escalaSaldo });
  }
  @Post('projetos/:id/importacoes')
  @Permissao('importar')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_ARQUIVO } }))
  importar(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() f: Express.Multer.File, @Body('mapeamento') mapeamento?: string, @Body('incorporar') incorporar?: string, @Body('escalaSaldo') escalaSaldo?: string, @Body('semDataMovimentacao') semData?: string) {
    // Tratamento dos itens sem data de última movimentação: obrigatório em toda importação (400 sem ele, antes de ler o arquivo).
    const tratamento = exigirTratamentoSemData(semData);
    return this.importacao.confirmar(id, { buffer: f?.buffer, nome: f?.originalname ?? 'arquivo' }, json(mapeamento, undefined), json<EscolhaIncorporar>(incorporar, []), user, escalaSaldo, tratamento);
  }
  @Get('projetos/:id/importacoes')
  importacoes(@Param('id') id: string) { return this.importacao.listar(id); }

  // ── Itens, células, visão geral ────────────────────────────────────────────
  @Get('projetos/:id/itens')
  listarItens(@Param('id') id: string, @Query() q: FiltroItens & { revisar?: string }) {
    return this.itens.listar(id, { ...q, revisar: q.revisar === 'true' || q.revisar === '1' });
  }
  @Get('projetos/:id/itens-colunas')
  colunasDosItens(@Param('id') id: string) { return this.itens.colunas(id); }
  @Get('projetos/:id/visao-geral')
  visaoGeral(@Param('id') id: string) { return this.itens.visaoGeral(id); }
  @Get('itens/:itemId')
  item(@Param('itemId') id: string) { return this.itens.obter(id); }
  @Get('itens/:itemId/historico')
  historico(@Param('itemId') id: string, @Query('campo') campo?: string) { return this.casos.historico(id, campo); }

  // ── Camadas e casos ────────────────────────────────────────────────────────
  @Get('camadas-disponiveis')
  camadasDisponiveis() { return this.orquestracao.camadasDisponiveis(); }
  @Post('projetos/:id/camadas/:camada/executar')
  executar(@Param('id') id: string, @Param('camada') camada: string) { return this.orquestracao.executarCamada(id, camada); }
  /** Análise em segundo plano: roda as camadas na ordem no servidor; a tela acompanha pelo GET e pode ser fechada. */
  @Post('projetos/:id/analises')
  iniciarAnalises(@Param('id') id: string, @Body() corpo: { camadas?: unknown }) { return this.orquestracao.iniciarExecucao(id, corpo?.camadas).then((execucao) => ({ execucao })); }
  @Get('projetos/:id/analises')
  analises(@Param('id') id: string) { return { execucao: this.orquestracao.execucao(id) }; }
  /** Só lê: casos em aberto, aguardando e aprovados por camada, última análise completa, camada desatualizada e o que os aprovados fazem. */
  @Get('projetos/:id/estado-camadas')
  estadoCamadas(@Param('id') id: string) { return this.orquestracao.estadoDasCamadas(id); }
  /** Cria casos em lote a partir de um ResultadoCamada (o mesmo caminho do executar). */
  @Post('projetos/:id/casos')
  registrar(@Param('id') id: string, @Body() r: ResultadoCamada) { return this.casos.registrarResultado(id, r); }
  @Get('projetos/:id/casos')
  listarCasos(@Param('id') id: string, @Query() q: FiltroCasos) { return this.casos.listar(id, q); }
  /** Casos iguais agrupados (camada, tipo, grupo do item, proposta); com `chave`, o grupo com todos os ids e as linhas dos casos. */
  @Get('projetos/:id/casos/agrupados')
  casosAgrupados(@Param('id') id: string, @Query() q: FiltroCasosAgrupados) { return this.casos.agrupados(id, q); }
  @Post('projetos/:id/casos/lote/previa')
  lotePrevia(@Param('id') id: string, @Body() b: EntradaLote) { return this.casos.lotePrevia(id, b ?? {}); }
  @Post('projetos/:id/casos/lote/aprovar')
  loteAprovar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: EntradaLote) { return this.casos.loteAprovar(id, b ?? {}, user); }
  @Post('projetos/:id/casos/lote/rejeitar')
  loteRejeitar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: EntradaLoteDecisao) { return this.casos.loteDecidir(id, 'rejeitar', b ?? {}, user); }
  @Post('projetos/:id/casos/lote/pedir-informacao')
  lotePedirInformacao(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: EntradaLoteDecisao) { return this.casos.loteDecidir(id, 'pedir', b ?? {}, user); }
  @Get('casos/:casoId')
  caso(@Param('casoId') id: string) { return this.casos.obter(id); }
  @Get('casos/:casoId/grupos')
  gruposDoCaso(@Param('casoId') id: string) { return this.itens.gruposDoCaso(id); }
  @Put('casos/:casoId/rascunho')
  rascunho(@CurrentUser() user: AuthUser, @Param('casoId') id: string, @Body() b: Record<string, never>) { return this.casos.salvarRascunho(id, b ?? {}, user); }
  @Post('casos/:casoId/aprovar')
  aprovar(@CurrentUser() user: AuthUser, @Param('casoId') id: string, @Body() b: EntradaAprovar) { return this.casos.aprovar(id, b ?? {}, user); }
  @Post('casos/:casoId/rejeitar')
  rejeitar(@CurrentUser() user: AuthUser, @Param('casoId') id: string, @Body() b: { versao?: number; justificativa?: string }) { return this.casos.rejeitar(id, b ?? {}, user); }
  @Post('casos/:casoId/pedir-informacao')
  pedirInformacao(@Param('casoId') id: string, @Body() b: { versao?: number; motivo?: string }) { return this.casos.pedirInformacao(id, b ?? {}); }
  @Post('casos/:casoId/reabrir')
  reabrir(@CurrentUser() user: AuthUser, @Param('casoId') id: string, @Body() b: { versao?: number }) { return this.casos.reabrir(id, b ?? {}, user); }

  // ── Versões ────────────────────────────────────────────────────────────────
  @Post('projetos/:id/versoes')
  criarVersao(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: { rotulo?: string; fase?: string }) { return this.versoes.criar(id, b ?? {}, user); }
  @Get('projetos/:id/versoes')
  listarVersoes(@Param('id') id: string) { return this.versoes.listar(id); }
  @Get('projetos/:id/versoes/comparar')
  comparar(@Param('id') id: string, @Query('a') a: string, @Query('b') b: string) { return this.versoes.comparar(id, a, b); }
  // Continuar a partir de uma versão liberada: prévia (GET, só lê), restauração com justificativa e desfazer (mesma permissão de liberar versão).
  @Get('projetos/:id/versoes/:versaoId/continuar')
  previaContinuar(@Param('id') id: string, @Param('versaoId') versaoId: string) { return this.restauracao.previa(id, versaoId); }
  @Post('projetos/:id/versoes/:versaoId/continuar')
  continuar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('versaoId') versaoId: string, @Body() b: { versao?: number; previa?: string; justificativa?: string }) {
    return this.restauracao.continuar(id, versaoId, b ?? {}, user);
  }
  @Post('projetos/:id/versoes/:versaoId/restauracoes/:restauracaoId/desfazer')
  desfazerRestauracao(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('versaoId') versaoId: string, @Param('restauracaoId') rid: string, @Body() b: { versao?: number }) {
    return this.restauracao.desfazer(id, versaoId, rid, b ?? {}, user);
  }
  // As exportações (Excel e relatório) saem pelo módulo de entregáveis; os dados brutos são só métodos de serviço (SanVersoesService.exportar/exportarAtual).

  // ── Impacto no SPED e vínculos de código ───────────────────────────────────
  @Get('projetos/:id/impactos-sped')
  impactosSped(@Param('id') id: string, @Query() q: FiltroImpactos) { return this.impactos.listarImpactos(id, q ?? {}); }
  @Post('projetos/:id/impactos-sped')
  registrarImpactos(@Param('id') id: string, @Body() b: { linhas?: EntradaImpacto[] }) { return this.impactos.registrarImpactos(id, b?.linhas ?? []); }
  @Get('projetos/:id/vinculos-codigo')
  vinculos(@Param('id') id: string) { return this.impactos.listarVinculos(id); }
  @Post('projetos/:id/vinculos-codigo')
  criarVinculo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() b: EntradaVinculo) { return this.impactos.criarVinculo(id, b ?? ({} as EntradaVinculo), user); }
}
