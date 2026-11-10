import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Header, Param, Post, Put, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CertificadosService } from './certificados.service';

const LIMITE_PFX = 1024 * 1024;

/** Certificado A1 do cliente (cofre) e termo de autorização. Leitura para qualquer usuário; mudanças só para administradores. */
@Controller('repositorio-xml/empresas/:empresaId')
export class CertificadosController {
  constructor(private readonly service: CertificadosService) {}

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
  enviar(
    @CurrentUser() user: AuthUser,
    @Param('empresaId') empresaId: string,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
    @Body('senha') senha: unknown,
  ) {
    this.exigirAdmin(user);
    if (!arquivo?.buffer?.length) throw new BadRequestException('Envie o arquivo do certificado (.pfx ou .p12).');
    if (typeof senha !== 'string' || senha.length === 0 || senha.length > 256) throw new BadRequestException('Informe a senha do certificado.');
    return this.service.enviar(empresaId, arquivo.buffer, senha, user.email);
  }

  @Delete('certificado')
  revogar(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string) {
    this.exigirAdmin(user);
    return this.service.revogar(empresaId, user.email);
  }

  @Put('consentimento')
  consentir(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string, @Body() body: { referencia?: string }) {
    this.exigirAdmin(user);
    return this.service.registrarConsentimento(empresaId, body?.referencia ?? '', user.email);
  }

  @Delete('consentimento')
  revogarConsentimento(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string) {
    this.exigirAdmin(user);
    return this.service.revogarConsentimento(empresaId, user.email);
  }

  @Get('auditoria-certificado')
  @Header('Cache-Control', 'no-store')
  auditoria(@CurrentUser() user: AuthUser, @Param('empresaId') empresaId: string, @Query('limite') limite?: string) {
    this.exigirAdmin(user);
    return this.service.auditoria(empresaId, Number(limite) || 100);
  }
}
