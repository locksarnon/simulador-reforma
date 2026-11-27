import { Body, Controller, Get, Param, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SanPlanilhaDecisaoService } from './planilha-decisao.service';

/** Mesmo teto das importações do módulo. */
const MAX_ARQUIVO = 60 * 1024 * 1024;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Planilha de decisão por camada (mesmo prefixo e mesma tela de permissão do controller de dados): baixar é leitura; a prévia só lê
 * (POST_DE_LEITURA); aplicar grava as decisões ("Alterar dados").
 */
@Controller('saneamento-estoques')
export class SanPlanilhaDecisaoController {
  constructor(private readonly planilha: SanPlanilhaDecisaoService) {}

  @Get('projetos/:id/camadas/:camada/planilha')
  async baixar(@Param('id') id: string, @Param('camada') camada: string) {
    const { buffer, nome } = await this.planilha.baixar(id, camada);
    return new StreamableFile(buffer, { type: XLSX, disposition: `attachment; filename="${nome}"` });
  }

  @Post('projetos/:id/camadas/:camada/planilha/previa')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_ARQUIVO } }))
  previa(@Param('id') id: string, @Param('camada') camada: string, @UploadedFile() f: Express.Multer.File) {
    return this.planilha.previa(id, camada, { buffer: f?.buffer, nome: f?.originalname ?? 'arquivo' });
  }

  @Post('projetos/:id/camadas/:camada/planilha/aplicar')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_ARQUIVO } }))
  aplicar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('camada') camada: string, @UploadedFile() f: Express.Multer.File, @Body() b: { confirmar?: string; orcamentoMs?: string }) {
    return this.planilha.aplicar(id, camada, { buffer: f?.buffer, nome: f?.originalname ?? 'arquivo' }, user, { confirmar: b?.confirmar, orcamentoMs: b?.orcamentoMs });
  }
}
