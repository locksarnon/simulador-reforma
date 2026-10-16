import { PrismaService } from '../prisma/prisma.service';
import { lerOpcoes } from './opcoes-validacao';
import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ValidacoesService } from './validacoes.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { CAMPOS, Mapeamento, ProdutosService } from './produtos.service';

const MAX_SIZE = 25 * 1024 * 1024;

export function lerMapeamento(bruto?: string): Mapeamento | undefined {
  if (!bruto) return undefined;
  try {
    const m = JSON.parse(bruto);
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error();
    const out: Mapeamento = {};
    for (const [k, v] of Object.entries(m)) {
      if (!(CAMPOS as readonly string[]).includes(k)) throw new Error();
      const n = v === null || v === '' ? null : Number(v);
      if (n !== null && (!Number.isInteger(n) || n < 0 || n > 16383)) throw new Error();
      out[k as keyof Mapeamento] = n;
    }
    return out;
  } catch {
    throw new BadRequestException('Mapeamento de colunas inválido.');
  }
}

/** Validador de cadastro de produtos — versão completa, para usuários logados. */
@Controller('produtos')
export class ProdutosController {
  constructor(private readonly service: ProdutosService, private readonly validacoes: ValidacoesService, private readonly prisma: PrismaService) {}

  @Post('ler')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_SIZE } }))
  ler(@UploadedFile() file: Express.Multer.File) {
    return this.service.previa(file);
  }

  /** Autosave: a análise nasce como rascunho no upload (arquivo guardado), antes de qualquer processamento. */
  @Post('rascunhos')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_SIZE } }))
  async criarRascunho(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser, @Body('empresa_id') empresa_id?: string) {
    if (!empresa_id || !await this.prisma.empresa.findUnique({ where: { id: empresa_id } })) throw new BadRequestException('Escolha uma empresa válida para esta análise.');
    if (!file?.buffer?.length) throw new BadRequestException('Arquivo vazio ou não enviado.');
    return this.validacoes.criarRascunho(file, user.email, empresa_id);
  }

  /** Autosave de colunas, parâmetros e linhas marcadas para exclusão. */
  @Put('validacoes/:id/progresso')
  salvarProgresso(@Param('id') id: string, @Body() body: { mapeamento?: unknown; opcoes?: unknown; excluir?: unknown; empresa_id?: string }) {
    const excluir = body?.excluir;
    if (excluir !== undefined && (!Array.isArray(excluir) || excluir.length > 50000 || excluir.some((x) => !Number.isInteger(x)))) throw new BadRequestException('Seleção de duplicidades inválida.');
    return this.validacoes.salvarProgresso(id, {
      mapeamento: body?.mapeamento ? lerMapeamento(JSON.stringify(body.mapeamento)) : undefined,
      opcoes: body?.opcoes ? lerOpcoes(JSON.stringify(body.opcoes)) : undefined,
      excluir: excluir as number[] | undefined,
    }, body?.empresa_id);
  }

  @Post('validar')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_SIZE } }))
  async validar(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser, @Body('mapeamento') mapeamento?: string, @Body('empresa_id') empresa_id?: string, @Body('opcoes') bruto?: string) {
    if (!empresa_id || !await this.prisma.empresa.findUnique({ where: { id: empresa_id } })) throw new BadRequestException('Escolha uma empresa válida para esta análise.');
    const opcoes = lerOpcoes(bruto);
    const mapa = lerMapeamento(mapeamento);
    const resultado = await this.service.validar(file, mapa, undefined, opcoes);
    // Guarda o arquivo para reabrir depois (falha no armazenamento não impede o resultado).
    const validacao_id = await this.validacoes.salvar(file, mapa, resultado, user.email, empresa_id, opcoes);
    return { ...resultado, validacao_id };
  }

  /** Histórico (todos os usuários do tenant veem todas; excluir: quem enviou ou administrador). */
  @Get('validacoes')
  listarValidacoes(@Query('empresa_id') empresa_id?: string) {
    return this.validacoes.listar(empresa_id);
  }

  @Get('validacoes/:id')
  abrirValidacao(@Param('id') id: string, @Query('empresa_id') empresa_id?: string) {
    return this.validacoes.obter(id, empresa_id);
  }

  @Get('validacoes/:id/colunas')
  colunasValidacao(@Param('id') id: string, @Query('empresa_id') empresa_id?: string) {
    return this.validacoes.colunas(id, empresa_id);
  }

  /** Ajustar colunas/opções e refazer sobre o arquivo já guardado (atualiza a mesma validação do histórico). */
  @Post('validacoes/:id/refazer')
  refazerValidacao(@Param('id') id: string, @Body() body: { mapeamento?: unknown; opcoes?: unknown; empresa_id?: string }) {
    const mapa = body?.mapeamento ? lerMapeamento(JSON.stringify(body.mapeamento)) : undefined;
    return this.validacoes.refazer(id, mapa, lerOpcoes(JSON.stringify(body?.opcoes ?? {})), body?.empresa_id);
  }

  @Get('validacoes/:id/exportar')
  async exportarValidacao(@Param('id') id: string) {
    const { buf, nome } = await this.validacoes.exportar(id);
    return new StreamableFile(buf, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disposition: `attachment; filename="${nome}"` });
  }

  @Delete('validacoes/:id')
  excluirValidacao(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.validacoes.excluir(id, user);
  }

  @Post('exportar')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_SIZE } }))
  async exportar(@UploadedFile() file: Express.Multer.File, @Body('mapeamento') mapeamento?: string, @Body('opcoes') opcoes?: string, @Body('excluir') brutoExcluir?: string) {
    let excluir: number[] = [];
    try { excluir = brutoExcluir ? JSON.parse(brutoExcluir) : []; } catch { throw new BadRequestException('Seleção de duplicidades inválida.'); }
    if (!Array.isArray(excluir) || excluir.length > 50000 || excluir.some(x => !Number.isInteger(x))) throw new BadRequestException('Seleção de duplicidades inválida.');
    const buf = await this.service.exportarXlsx(file, lerMapeamento(mapeamento), lerOpcoes(opcoes), excluir);
    return new StreamableFile(buf, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="cadastro-validado-intax.xlsx"',
    });
  }
}
