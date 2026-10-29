import { BadRequestException, Body, Controller, Get, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OperacoesPlanilhaService } from './operacoes-planilha.service';

const MAX_SIZE = 60 * 1024 * 1024; // igual ao validador de cadastro: exportações de ERP passam de 25 MB

/** Importação de operações por planilha (XLSX ou CSV), para quem não tem o XML ou tem os lançamentos num sistema de gestão. */
@Controller('operacoes-planilha')
export class OperacoesPlanilhaController {
  constructor(private readonly service: OperacoesPlanilhaService) {}

  /** Modelo de planilha (.xlsx) com os títulos de coluna reconhecidos e a explicação de cada um. */
  @Get('modelo')
  async modelo() {
    const buf = await this.service.modelo();
    return new StreamableFile(buf, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', disposition: 'attachment; filename="modelo-operacoes-intax.xlsx"' });
  }

  /** 1) Cabeçalho, amostra e sugestão de colunas. */
  @Post('ler')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_SIZE } }))
  ler(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('Arquivo vazio ou não enviado.');
    return this.service.previa(file);
  }

  /** 2) Confere tudo sem gravar: resumo, erros e avisos por linha. */
  @Post('validar')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_SIZE } }))
  validar(@UploadedFile() file: Express.Multer.File, @Body('mapeamento') mapeamento?: string, @Body('opcoes') opcoes?: string) {
    if (!file?.buffer?.length) throw new BadRequestException('Arquivo vazio ou não enviado.');
    return this.service.validar(file, mapeamento, opcoes);
  }

  /** 3) Grava as linhas válidas que ainda não existem. */
  @Post('importar')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_SIZE } }))
  importar(@UploadedFile() file: Express.Multer.File, @Body('mapeamento') mapeamento?: string, @Body('opcoes') opcoes?: string) {
    if (!file?.buffer?.length) throw new BadRequestException('Arquivo vazio ou não enviado.');
    return this.service.importar(file, mapeamento, opcoes);
  }
}
