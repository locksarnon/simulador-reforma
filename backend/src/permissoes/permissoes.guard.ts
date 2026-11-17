import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { AuthUser } from '../auth/auth.types';
import { PERMISSAO_KEY } from './permissao.decorator';
import { decidirAcesso, FuncaoId } from './permissoes';

const caminho = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : typeof v === 'string' ? v : '');

/** Padrão da rota do endpoint (controller + método), sem o prefixo global: "monitoramento/empresas/:id/consultar". */
export function rotaDoEndpoint(controller: object, handler: object) {
  return [caminho(Reflect.getMetadata(PATH_METADATA, controller)), caminho(Reflect.getMetadata(PATH_METADATA, handler))]
    .join('/').split('/').filter(Boolean).join('/');
}

/**
 * Guarda global depois do login (JwtAuthGuard): confere a tela da rota, "Alterar dados" nas escritas, "Excluir registros" no DELETE e as
 * funções marcadas com @Permissao. Administrador passa sempre. Recusa com 403 e a explicação em português.
 */
@Injectable()
export class PermissoesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const alvos = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, alvos)) return true;
    const req = context.switchToHttp().getRequest<{ user?: AuthUser; method: string; params?: Record<string, unknown> }>();
    if (!req.user) return true;
    const funcoes = this.reflector.getAllAndOverride<FuncaoId[]>(PERMISSAO_KEY, alvos) ?? [];
    const decisao = decidirAcesso(req.user, { metodo: req.method, rota: rotaDoEndpoint(context.getClass(), context.getHandler()), parametros: req.params ?? {}, funcoes });
    if (!decisao.ok) throw new ForbiddenException(decisao.motivo);
    return true;
  }
}
