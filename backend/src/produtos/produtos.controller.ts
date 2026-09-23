import { BadRequestException, Body, Controller, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
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
  constructor(private readonly service: ProdutosService) {}

  @Post('ler')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_SIZE } }))
  ler(@UploadedFile() file: Express.Multer.File) {
    return this.service.previa(file);
  }

  @Post('validar')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_SIZE } }))
  validar(@UploadedFile() file: Express.Multer.File, @Body('mapeamento') mapeamento?: string) {
    return this.service.validar(file, lerMapeamento(mapeamento));
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
