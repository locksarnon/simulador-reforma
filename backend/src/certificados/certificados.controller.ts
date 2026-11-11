import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Header, Param, Post, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CertificadosService } from './certificados.service';
import { PinCertificadoService } from './pin.service';

const LIMITE_PFX = 1024 * 1024;

/** Certificado A1 do cliente (cofre). Leitura para qualquer usuário; mudanças só para administradores. */
@Controller('repositorio-xml/empresas/:empresaId')
export class CertificadosController {
  constructor(
    private readonly service: CertificadosService,
    private readonly pin: PinCertificadoService,
  ) {}

  private exigirAdmin(user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Apenas administradores gerenciam certificados digitais.');
  }

  @Get('certificado')
  @Header('Cache-Control', 'no-store')
  obter(@Param('empresaId') empresaId: string) {
    return this.service.obter(empresaId);
  }

  @Post('certificado')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: LIMITE_PFX, files: 1 } }))
  async enviar(
    @CurrentUser() user: AuthUser,
    @Param('empresaId') empresaId: string,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @Body('senha') senha: unknown,
    @Body('pin') pin: unknown,
  ) {
    this.exigirAdmin(user);
    await this.pin.conferir(pin);
    if (!arquivo?.buffer?.length) throw new BadRequestException('Envie o arquivo do certificado (.pfx ou .p12).');
    if (typeof senha !== 'string' || senha.length === 0 || senha.length > 256) throw new BadRequestException('Informe a senha do certificado.');
    return this.service.enviar(empresaId, arquivo.buffer, senha, user.email);
  }

  @Delete('certificado')
  async revogar(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string) {
    this.exigirAdmin(user);
    await this.pin.conferir(undefined); // com PIN ligado, a remoção é pelo POST abaixo (o PIN não vai na URL)
    return this.service.revogar(empresaId, user.email);
  }

  /** Remover o certificado informando o PIN do cofre no corpo do pedido. */
  @Post('certificado/remover')
  async remover(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string, @Body('pin') pin: unknown) {
    this.exigirAdmin(user);
    await this.pin.conferir(pin);
    return this.service.revogar(empresaId, user.email);
  }

  @Get('auditoria-certificado')
  @Header('Cache-Control', 'no-store')
  auditoria(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string, @Query('limite') limite?: string) {
    this.exigirAdmin(user);
    return this.service.auditoria(empresaId, Number(limite) || 100);
  }
}
