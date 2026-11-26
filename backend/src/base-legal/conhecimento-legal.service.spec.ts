import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ConhecimentoLegalController } from './conhecimento-legal.controller';
import { ConhecimentoLegalService } from './conhecimento-legal.service';

function montar(extra: { novidade?: Record<string, unknown> | null } = {}) {
  const prisma = {
    novidadeLegal: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 7),
      groupBy: vi.fn(async () => [{ tipo: 'alteracao', _count: { _all: 3 } }, { tipo: 'nao_consolidada', _count: { _all: 2 } }]),
      findUnique: vi.fn(async () => (extra.novidade === undefined ? { id: 'n1', status: 'nova', confirmada: false } : extra.novidade)),
      update: vi.fn(async ({ data }: { data: unknown }) => data),
    },
    normaLegal: { count: vi.fn(async ({ where }: { where: { situacao: string } }) => (where.situacao === 'revogada' ? 2 : 5)) },
    revisaoSemanal: { findFirst: vi.fn(async () => ({ id: 'r1', semana: '2026-S48', status: 'concluida' })), findMany: vi.fn(async () => []) },
  };
  return { prisma, service: new ConhecimentoLegalService(prisma as any) };
}

describe('lista de novidades da base de conhecimento', () => {
  it('por padrão traz as abertas (novas e vistas), da mais recente para a mais antiga, com paginação', async () => {
    const { service, prisma } = montar();
    const r = await service.listarNovidades();
    expect(prisma.novidadeLegal.findMany.mock.calls[0][0]).toMatchObject({ where: { status: { in: ['nova', 'vista'] } }, orderBy: [{ detectada_em: 'desc' }, { id: 'desc' }], skip: 0, take: 50 });
    expect(r).toMatchObject({ total: 7, pagina: 1, limite: 50 });
  });

  it('filtros: tipos, norma, origem, confirmada, status e busca em título, resumo, ato e norma', async () => {
    const { service, prisma } = montar();
    await service.listarNovidades({ status: 'descartada', tipo: 'alteracao, revogacao', norma: 'lcp-214-2025', origem: 'busca_web', confirmada: 'nao', busca: 'split', pagina: 3, limite: 20 });
    const args = prisma.novidadeLegal.findMany.mock.calls[0][0] as Record<string, any>;
    expect(args.where).toMatchObject({ status: 'descartada', tipo: { in: ['alteracao', 'revogacao'] }, norma_chave: 'lcp-214-2025', origem: 'busca_web', confirmada: false });
    expect(args.where.OR).toHaveLength(4);
    expect(args).toMatchObject({ skip: 40, take: 20 });
    await service.listarNovidades({ status: 'todas', limite: 9999 });
    const todas = prisma.novidadeLegal.findMany.mock.calls[1][0] as Record<string, any>;
    expect(todas.where.status).toBeUndefined();
    expect(todas.take).toBe(200);
  });

  it('resumo para os selos: o que é novo, o que falta confirmar e a situação das normas', async () => {
    const { service } = montar();
    expect(await service.resumo()).toMatchObject({
      novas: 7, a_confirmar: 7, nao_consolidadas: 7, normas_revogadas: 2, normas_parcialmente_revogadas: 5,
      por_tipo: { alteracao: 3, nao_consolidada: 2 }, ultima_revisao: { semana: '2026-S48' },
    });
  });
});

describe('curadoria das novidades', () => {
  it('marcar como vista só muda o que estava novo; confirmar não apaga da lista; descartar e reabrir guardam quem fez', async () => {
    const { service, prisma } = montar();
    expect(await service.atualizar('n1', 'visto', 'adm@fal.test')).toEqual({ status: 'vista' });
    expect(await service.atualizar('n1', 'confirmar', 'adm@fal.test')).toMatchObject({ confirmada: true, status: 'vista', resolvida_por: 'adm@fal.test' });
    expect(await service.atualizar('n1', 'descartar', 'adm@fal.test')).toMatchObject({ status: 'descartada', resolvida_por: 'adm@fal.test' });
    expect(await service.atualizar('n1', 'reabrir', 'adm@fal.test')).toEqual({ status: 'nova', resolvida_por: null, resolvida_em: null });
    expect(prisma.novidadeLegal.update).toHaveBeenCalledTimes(4);
  });

  it('já vista continua vista ao ser marcada de novo; ação inválida e novidade inexistente dão erro claro', async () => {
    const vista = montar({ novidade: { id: 'n1', status: 'resolvida', confirmada: true } });
    expect(await vista.service.atualizar('n1', 'visto', 'x')).toEqual({ status: 'resolvida' });
    await expect(montar().service.atualizar('n1', 'apagar', 'x')).rejects.toThrow('Ação inválida');
    await expect(montar({ novidade: null }).service.atualizar('nx', 'visto', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('avisos que o assistente leva junto do dispositivo', () => {
  it('o aviso vale para os artigos da pendência (ou para a norma toda quando o ato revoga tudo) e só para a norma certa', async () => {
    const { service, prisma } = montar();
    prisma.novidadeLegal.findMany.mockResolvedValue([
      { norma_chave: 'lcp-214-2025', ato: 'LC 239/2026', detalhes: [{ rotulo: 'Art. 12', caminho: 'art-12' }] },
      { norma_chave: 'lei-7678-1988', ato: 'LC 240/2026', detalhes: [] },
    ] as never);
    const m = await service.avisosDosDispositivos([
      { chave: 'lcp-214-2025', caminho: 'art-12' }, { chave: 'lcp-214-2025', caminho: 'art-13' },
      { chave: 'lei-7678-1988', caminho: 'art-1' }, { chave: 'lcp-227-2026', caminho: 'art-12' },
    ]);
    expect(m.get('lcp-214-2025/art-12')).toEqual(['o LC 239/2026 altera este dispositivo e o texto compilado ainda não traz a mudança']);
    expect(m.has('lcp-214-2025/art-13')).toBe(false);
    expect(m.get('lei-7678-1988/art-1')).toHaveLength(1);
    expect(m.has('lcp-227-2026/art-12')).toBe(false);
    expect(await service.avisosDosDispositivos([])).toEqual(new Map());
  });
});

describe('quem pode mexer', () => {
  const admin = { email: 'adm@fal.test', role: 'admin' } as never;
  const comum = { email: 'x@fal.test', role: 'user' } as never;

  it('só administrador cura as novidades e dispara a revisão; todos leem', async () => {
    const conhecimento = { atualizar: vi.fn(async () => ({ ok: true })), listarNovidades: vi.fn(async () => ({ itens: [] })), resumo: vi.fn(), novidadesDaNorma: vi.fn() };
    const semanal = { iniciar: vi.fn(async () => ({ id: 'r1', status: 'executando', ja_em_andamento: false })), estado: vi.fn(() => ({ ligada: true })), listar: vi.fn(async () => []), obter: vi.fn(async () => null), fontes: vi.fn() };
    const c = new ConhecimentoLegalController(conhecimento as any, semanal as any);
    expect(() => c.atualizar(comum, 'n1', 'visto')).toThrow(ForbiddenException);
    expect(() => c.executar(comum, {})).toThrow(ForbiddenException);
    await c.atualizar(admin, 'n1', 'visto');
    expect(conhecimento.atualizar).toHaveBeenCalledWith('n1', 'visto', 'adm@fal.test');
    expect(await c.executar(admin, {})).toMatchObject({ status: 'executando' });
    expect(semanal.iniciar).toHaveBeenCalledWith('adm@fal.test');
    await c.novidades({ tipo: 'alteracao', pagina: '2' as never, limite: '10' as never });
    expect(conhecimento.listarNovidades).toHaveBeenCalledWith({ tipo: 'alteracao', pagina: 2, limite: 10 });
    expect(await c.rodadas()).toEqual({ estado: { ligada: true }, rodadas: [] });
    await expect(c.rodada('nao-existe')).rejects.toBeInstanceOf(NotFoundException);
  });
});
