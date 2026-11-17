import { Controller, Delete, ExecutionContext, ForbiddenException, Get, Post } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';
import { Public } from '../common/decorators/public.decorator';
import { Permissao } from './permissao.decorator';
import { PermissoesGuard, rotaDoEndpoint } from './permissoes.guard';
import { decidirAcesso, exigirFuncao, FUNCOES, NIVEIS, normalizarExcecoes, permissoesEfetivas, TELAS, telasDaRota } from './permissoes';

const conta = (nivel: string, excecoes?: unknown) => ({ role: 'user', nivel, permissoes: permissoesEfetivas({ role: 'user', nivel, excecoes }) });
const admin = { role: 'admin', nivel: 'ADMINISTRADOR' };

describe('catálogo: servidor e tela usam as mesmas listas', () => {
  it('telas, funções e níveis iguais aos de src/lib/permissoes.js', async () => {
    const caminho = pathToFileURL(join(__dirname, '..', '..', '..', 'src', 'lib', 'permissoes.js')).href;
    const tela = await import(/* @vite-ignore */ caminho);
    expect(tela.TELAS).toEqual(TELAS);
    expect(tela.FUNCOES).toEqual(FUNCOES);
    expect(tela.NIVEIS).toEqual(NIVEIS);
    expect(tela.permissoesEfetivas({ role: 'user', nivel: 'ASSISTENTE', excecoes: { telas: { usuarios: true }, funcoes: { excluir: true } } }))
      .toEqual(permissoesEfetivas({ role: 'user', nivel: 'ASSISTENTE', excecoes: { telas: { usuarios: true }, funcoes: { excluir: true } } }));
  });

  it('toda tela citada nas rotas existe', async () => {
    const { ROTAS_DAS_TELAS, ENTIDADES_DAS_TELAS } = await import('./permissoes');
    const ids = new Set(TELAS.map((t) => t.id));
    for (const r of ROTAS_DAS_TELAS) for (const t of r.telas) expect(ids.has(t), `${r.rota} → ${t}`).toBe(true);
    for (const lista of Object.values(ENTIDADES_DAS_TELAS)) for (const t of lista) expect(ids.has(t)).toBe(true);
  });
});

describe('permissoesEfetivas', () => {
  it('cada nível traz o sugerido', () => {
    const g = permissoesEfetivas({ role: 'user', nivel: 'GESTOR' });
    expect(g.telas).not.toContain('usuarios');
    expect(g.telas).not.toContain('custos');
    expect(g.telas).toContain('comunicacoes');
    expect(g.funcoes).toEqual(FUNCOES.map((f) => f.id));
    const c = permissoesEfetivas({ role: 'user', nivel: 'CONSULTOR' });
    expect(c.telas.some((t) => TELAS.find((x) => x.id === t)?.area === 'admin')).toBe(false);
    expect(c.funcoes).toEqual(['alterar', 'consultas_pagas', 'enviar_email', 'importar', 'excluir']);
    expect(permissoesEfetivas({ role: 'user', nivel: 'ASSISTENTE' }).funcoes).toEqual(['alterar', 'enviar_email', 'importar']);
    expect(permissoesEfetivas({ role: 'user', nivel: 'SOMENTE_LEITURA' }).funcoes).toEqual([]);
  });

  it('as exceções vencem o nível; o Administrador ignora exceções', () => {
    const p = permissoesEfetivas({ role: 'user', nivel: 'SOMENTE_LEITURA', excecoes: { telas: { custos: true, monitoramento: false }, funcoes: { alterar: true } } });
    expect(p.telas).toContain('custos');
    expect(p.telas).not.toContain('monitoramento');
    expect(p.funcoes).toEqual(['alterar']);
    const a = permissoesEfetivas({ role: 'admin', nivel: 'ADMINISTRADOR', excecoes: { telas: { usuarios: false }, funcoes: { excluir: false } } });
    expect(a.admin).toBe(true);
    expect(a.telas).toContain('usuarios');
    expect(a.funcoes).toContain('excluir');
  });

  it('nível desconhecido vira Consultor; papel admin é sempre Administrador; nível Administrador sem papel admin não vale', () => {
    expect(permissoesEfetivas({ role: 'user', nivel: 'QUALQUER' }).nivel).toBe('CONSULTOR');
    expect(permissoesEfetivas({ role: 'admin', nivel: 'CONSULTOR' }).nivel).toBe('ADMINISTRADOR');
    expect(permissoesEfetivas({ role: 'user', nivel: 'ADMINISTRADOR' }).nivel).toBe('CONSULTOR');
  });

  it('normalizarExcecoes guarda só o que difere do nível e ignora o desconhecido', () => {
    expect(normalizarExcecoes({ telas: { monitoramento: true, usuarios: true, inexistente: true }, funcoes: { alterar: true, excluir: 'sim' } }, 'CONSULTOR'))
      .toEqual({ telas: { usuarios: true }, funcoes: {} });
    expect(normalizarExcecoes(null, 'GESTOR')).toEqual({ telas: {}, funcoes: {} });
  });
});

describe('decidirAcesso (a regra do guarda)', () => {
  it('Administrador passa sempre', () => {
    expect(decidirAcesso(admin, { metodo: 'DELETE', rota: 'usuarios/:id' }).ok).toBe(true);
    expect(decidirAcesso(admin, { metodo: 'POST', rota: 'monitoramento/lote', funcoes: ['autorizar_lotes'] }).ok).toBe(true);
  });

  it('Somente leitura: lê, mas não grava nem exclui', () => {
    const u = conta('SOMENTE_LEITURA');
    expect(decidirAcesso(u, { metodo: 'GET', rota: 'tarefas' }).ok).toBe(true);
    const r = decidirAcesso(u, { metodo: 'POST', rota: 'tarefas' });
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/somente para ver/) });
    expect(decidirAcesso(u, { metodo: 'PUT', rota: 'entities/:model/:id', parametros: { model: 'Empresa' } }).ok).toBe(false);
    // A própria conta, a sessão e os avisos lidos continuam livres; POST que só lê também.
    expect(decidirAcesso(u, { metodo: 'POST', rota: 'perfil/senha' }).ok).toBe(true);
    expect(decidirAcesso(u, { metodo: 'POST', rota: 'notificacoes/:id/lida' }).ok).toBe(true);
    expect(decidirAcesso(u, { metodo: 'POST', rota: 'auth/logout' }).ok).toBe(true);
    expect(decidirAcesso(u, { metodo: 'POST', rota: 'entities/:model/query', parametros: { model: 'Empresa' } }).ok).toBe(true);
  });

  it('Assistente: altera e envia e-mail, mas não faz consulta paga nem exclui', () => {
    const u = conta('ASSISTENTE');
    expect(decidirAcesso(u, { metodo: 'POST', rota: 'tarefas' }).ok).toBe(true);
    expect(decidirAcesso(u, { metodo: 'POST', rota: 'monitoramento/empresas/:id/documentos/email', funcoes: ['enviar_email'] }).ok).toBe(true);
    const paga = decidirAcesso(u, { metodo: 'POST', rota: 'monitoramento/empresas/:id/consultar', funcoes: ['consultas_pagas'] });
    expect(paga).toEqual({ ok: false, motivo: expect.stringMatching(/fazer consultas pagas/) });
    expect(decidirAcesso(u, { metodo: 'POST', rota: 'pre-analises', funcoes: ['consultas_pagas'] }).ok).toBe(false);
    expect(decidirAcesso(u, { metodo: 'DELETE', rota: 'tarefas/:id' })).toEqual({ ok: false, motivo: expect.stringMatching(/excluir registros/) });
  });

  it('Consultor: sem lote nem arquivamento; sem as telas da Administração', () => {
    const u = conta('CONSULTOR');
    expect(decidirAcesso(u, { metodo: 'POST', rota: 'monitoramento/empresas/:id/consultar', funcoes: ['consultas_pagas'] }).ok).toBe(true);
    expect(decidirAcesso(u, { metodo: 'POST', rota: 'monitoramento/lote', funcoes: ['consultas_pagas', 'autorizar_lotes'] }).ok).toBe(false);
    expect(decidirAcesso(u, { metodo: 'POST', rota: 'clientes/:id/arquivar', funcoes: ['arquivar_clientes'] }).ok).toBe(false);
    expect(decidirAcesso(u, { metodo: 'GET', rota: 'comunicacoes/envios' })).toEqual({ ok: false, motivo: 'Sem acesso à tela Comunicações e envios. Peça ao administrador.' });
    expect(decidirAcesso(u, { metodo: 'GET', rota: 'custos/meu' }).ok).toBe(true);
  });

  it('Gestor: lote, arquivamento e certificados liberados; usuários, acessos, integrações e custos bloqueados', () => {
    const u = conta('GESTOR');
    expect(decidirAcesso(u, { metodo: 'POST', rota: 'monitoramento/lote', funcoes: ['consultas_pagas', 'autorizar_lotes'] }).ok).toBe(true);
    expect(decidirAcesso(u, { metodo: 'POST', rota: 'clientes/:id/arquivar', funcoes: ['arquivar_clientes'] }).ok).toBe(true);
    expect(decidirAcesso(u, { metodo: 'POST', rota: 'repositorio-xml/empresas/:empresaId/certificado', funcoes: ['certificados'] }).ok).toBe(true);
    expect(decidirAcesso(u, { metodo: 'GET', rota: 'comunicacoes/envios' }).ok).toBe(true);
    for (const rota of ['usuarios', 'acessos/log', 'integracoes', 'custos', 'monitoramento/contrato']) expect(decidirAcesso(u, { metodo: 'GET', rota }).ok, rota).toBe(false);
  });

  it('tela tirada por exceção bloqueia as rotas dela; rota compartilhada vale para quem tem qualquer uma das telas', () => {
    const semPre = conta('CONSULTOR', { telas: { 'pre-analise': false } });
    expect(decidirAcesso(semPre, { metodo: 'GET', rota: 'pre-analises' }).ok).toBe(false);
    const soProcuracoes = conta('CONSULTOR', { telas: { monitoramento: false, 'analise-risco': false, arquivos: false } });
    expect(decidirAcesso(soProcuracoes, { metodo: 'GET', rota: 'monitoramento/estado' }).ok).toBe(true);
    const semLeads = conta('CONSULTOR', { telas: { leads: false } });
    expect(decidirAcesso(semLeads, { metodo: 'GET', rota: 'entities/:model', parametros: { model: 'Lead' } }).ok).toBe(false);
    expect(decidirAcesso(semLeads, { metodo: 'GET', rota: 'entities/:model', parametros: { model: 'Empresa' } }).ok).toBe(true);
    expect(telasDaRota('repositorio-xml/empresas/:empresaId/certificado')).toContain('grupos-empresas');
    expect(telasDaRota('repositorio-xml/empresas/:empresaId/documentos')).toEqual(['captura-xml']);
  });

  it('exceção de função liberada vale mesmo para o nível mais baixo', () => {
    const u = conta('SOMENTE_LEITURA', { funcoes: { enviar_email: true } });
    expect(decidirAcesso(u, { metodo: 'POST', rota: 'comunicados/:id/enviar', funcoes: ['enviar_email'] }).ok).toBe(true);
    expect(() => exigirFuncao(u, 'transmitir')).toThrow(ForbiddenException);
    expect(() => exigirFuncao(admin, 'transmitir')).not.toThrow();
  });
});

@Controller('monitoramento')
class Exemplo {
  @Get('estado') estado() { return 1; }
  @Post('empresas/:id/consultar') @Permissao('consultas_pagas') consultar() { return 1; }
  @Delete('pgfn/:pid') excluir() { return 1; }
  @Public() @Post('aberto') aberto() { return 1; }
}

function contexto(handler: keyof Exemplo, user: unknown, method: string): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => Exemplo.prototype[handler],
    getClass: () => Exemplo,
    switchToHttp: () => ({ getRequest: () => ({ user, method, params: {} }) }),
  } as unknown as ExecutionContext;
}

describe('PermissoesGuard', () => {
  const guarda = new PermissoesGuard(new Reflector());

  it('monta a rota pelo controller e pelo método', () => {
    expect(rotaDoEndpoint(Exemplo, Exemplo.prototype.consultar)).toBe('monitoramento/empresas/:id/consultar');
  });

  it('recusa com 403 e a explicação; deixa passar o que pode', () => {
    expect(guarda.canActivate(contexto('estado', conta('SOMENTE_LEITURA'), 'GET'))).toBe(true);
    expect(() => guarda.canActivate(contexto('consultar', conta('ASSISTENTE'), 'POST'))).toThrow(/consultas pagas/);
    expect(() => guarda.canActivate(contexto('excluir', conta('ASSISTENTE'), 'DELETE'))).toThrow(ForbiddenException);
    expect(guarda.canActivate(contexto('consultar', conta('CONSULTOR'), 'POST'))).toBe(true);
    expect(guarda.canActivate(contexto('excluir', admin, 'DELETE'))).toBe(true);
    expect(() => guarda.canActivate(contexto('estado', conta('CONSULTOR', { telas: { monitoramento: false, procuracoes: false, 'analise-risco': false, arquivos: false } }), 'GET'))).toThrow(/Sem acesso à tela Monitoramento fiscal/);
  });

  it('rota pública e pedido sem usuário ficam com o guarda do login', () => {
    expect(guarda.canActivate(contexto('aberto', undefined, 'POST'))).toBe(true);
    expect(guarda.canActivate(contexto('estado', undefined, 'GET'))).toBe(true);
  });
});
