import { Body, Controller, Delete, Get, Param, Post, Put, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CustosService } from './custos.service';
import { ContratosService } from './contratos.service';

const disposicao = (nome: string, inline = false) => `${inline ? 'inline' : 'attachment'}; filename="${nome.replace(/[^\w.\- ()]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nome)}`;

/** Custos das ferramentas externas: o do usuário logado (barra lateral), o painel do administrador e os contratos anexados. */
@Controller('custos')
export class CustosController {
  constructor(private readonly custos: CustosService, private readonly contratos: ContratosService) {}

  @Get('meu')
  meu(@CurrentUser() user: AuthUser, @Query('mes') mes?: string) {
    return this.custos.meu(user?.email, mes);
  }

  @Get()
  geral(@CurrentUser() user: AuthUser, @Query('mes') mes?: string) {
    return this.custos.geral(mes, user);
  }

  @Put('precos')
  salvar(@CurrentUser() user: AuthUser, @Body() body: { precos?: Record<string, number>; fixos?: { rotulo: string; valor: number }[] }) {
    return this.custos.salvarPrecos(body ?? {}, user);
  }

  @Get('contratos')
  listarContratos(@CurrentUser() user: AuthUser) {
    return this.contratos.listar(user);
  }

  @Post('contratos')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  enviarContrato(@CurrentUser() user: AuthUser, @UploadedFile() arquivo: { buffer: Buffer; originalname?: string } | undefined, @Body() body: { integracao?: string }) {
    return this.contratos.enviar(arquivo, body?.integracao, user);
  }

  @Get('contratos/:id/arquivo')
  async arquivoContrato(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('ver') ver?: string) {
    const a = await this.contratos.arquivo(id, user);
    return new StreamableFile(a.buffer, { type: 'application/pdf', disposition: disposicao(a.nome, ver === '1') });
  }

  @Delete('contratos/:id')
  removerContrato(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.contratos.remover(id, user);
  }
}
