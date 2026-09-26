import { BadRequestException, Body, Controller, Delete, Get, Param, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ValidacoesService } from './validacoes.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Mapeamento, ProdutosService } from './produtos.service';

const MAX_SIZE = 25 * 1024 * 1024;

export function lerMapeamento(bruto?: string): Mapeamento | undefined {
  if (!bruto) return undefined;
  try {
    const m = JSON.parse(bruto);
    const out: Mapeamento = {};
    for (const [k, v] of Object.entries(m)) out[k as keyof Mapeamento] = v === null || v === '' ? null : Number(v);
    return out;
  } catch {
    throw new BadRequestException('Mapeamento de colunas inválido.');
  }
}

/** Validador de cadastro de produtos — versão completa, para usuários logados. */
@Controller('produtos')
export class ProdutosController {
  constructor(private readonly service: ProdutosService, private readonly validacoes: ValidacoesService) {}

  @Post('ler')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_SIZE } }))
  ler(@UploadedFile() file: Express.Multer.File) {
    return this.service.previa(file);
  }

  @Post('validar')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_SIZE } }))
  async validar(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser, @Body('mapeamento') mapeamento?: string) {
    const mapa = lerMapeamento(mapeamento);
    const resultado = await this.service.validar(file, mapa);
    // Guarda o arquivo para reabrir depois (falha no armazenamento não impede o resultado).
    const validacao_id = await this.validacoes.salvar(file, mapa, resultado, user.email);
    return { ...resultado, validacao_id };
  }

  /** Histórico (todos os usuários do tenant veem todas; excluir: quem enviou ou administrador). */
  @Get('validacoes')
  listarValidacoes() {
    return this.validacoes.listar();
  }

  @Get('validacoes/:id')
  abrirValidacao(@Param('id') id: string) {
    return this.validacoes.obter(id);
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
  async exportar(@UploadedFile() file: Express.Multer.File, @Body('mapeamento') mapeamento?: string) {
    const buf = await this.service.exportarXlsx(file, lerMapeamento(mapeamento));
    return new StreamableFile(buf, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="cadastro-validado-intax.xlsx"',
    });
  }
}
