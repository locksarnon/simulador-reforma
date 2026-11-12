import { Body, Controller, ForbiddenException, Get, Param, Post, Put } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsuariosService } from './usuarios.service';

function exigirAdmin(user: AuthUser) {
  if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
}

/** Usuários e acessos (administradores), o perfil de cada pessoa e a carteira por colaborador. */
@Controller()
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  // ── Administração de usuários ─────────────────────────────────────
  @Get('usuarios')
  listar(@CurrentUser() user: AuthUser) {
    exigirAdmin(user);
    return this.usuarios.listar();
  }

  @Post('usuarios')
  criar(@CurrentUser() user: AuthUser, @Body() body: { email?: string; name?: string; role?: string; senha?: string; convite?: boolean }) {
    exigirAdmin(user);
    return this.usuarios.criar(body ?? {}, user);
  }

  @Post('usuarios/:id/reenviar-convite')
  reenviarConvite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    exigirAdmin(user);
    return this.usuarios.reenviarConvite(id, user);
  }

  @Post('usuarios/:id/enviar-redefinicao')
  enviarRedefinicao(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    exigirAdmin(user);
    return this.usuarios.enviarRedefinicao(id, user);
  }

  @Put('usuarios/:id')
  atualizar(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { name?: string | null; role?: string; ativo?: boolean }) {
    exigirAdmin(user);
    return this.usuarios.atualizar(id, body ?? {}, user);
  }

  @Post('usuarios/:id/redefinir-senha')
  redefinirSenha(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { senha?: string }) {
    exigirAdmin(user);
    return this.usuarios.redefinirSenha(id, body?.senha);
  }

  // ── Perfil de quem está logado ────────────────────────────────────
  @Get('perfil')
  perfil(@CurrentUser() user: AuthUser) {
    return this.usuarios.perfil(user.id);
  }

  @Put('perfil')
  atualizarPerfil(@CurrentUser() user: AuthUser, @Body() body: { name?: string | null }) {
    return this.usuarios.atualizarPerfil(user.id, body ?? {});
  }

  @Post('perfil/senha')
  trocarSenha(@CurrentUser() user: AuthUser, @Body() body: { atual?: string; nova?: string }) {
    return this.usuarios.trocarSenha(user.id, body ?? {});
  }

  // ── Carteira por colaborador ──────────────────────────────────────
  @Get('carteira/colaboradores')
  carteira() {
    return this.usuarios.carteira();
  }

  @Get('carteira/sem-colaborador')
  semColaborador() {
    return this.usuarios.semColaborador();
  }

  @Post('carteira/vinculos')
  vincular(@CurrentUser() user: AuthUser, @Body() body: { user_id?: string; empresa_ids?: string[]; modo?: string }) {
    exigirAdmin(user);
    return this.usuarios.vincular(body ?? {});
  }
}
