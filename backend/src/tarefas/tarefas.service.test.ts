import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TarefasService } from './tarefas.service';

type T = { id: string; titulo: string; status: string; empresa_id: string | null; responsavel: string | null; prazo: Date | null; modelo_id: string | null; criado_por: string | null; concluida_em: Date | null; prioridade: string };

function montar() {
  const tarefas: T[] = [];
  let seq = 0;
  const consultas: unknown[] = [];
  const prisma = {
    tarefa: {
      findMany: vi.fn(async (args: unknown) => { consultas.push(args); return tarefas; }),
      findUnique: async ({ where }: { where: { id: string } }) => tarefas.find((t) => t.id === where.id) ?? null,
      count: vi.fn(async () => 3),
      create: async ({ data }: { data: Partial<T> }) => { const t = { id: `T${++seq}`, status: 'ABERTA', prioridade: 'NORMAL', concluida_em: null, modelo_id: null, ...data } as T; tarefas.push(t); return t; },
      update: async ({ where, data }: { where: { id: string }; data: Partial<T> }) => Object.assign(tarefas.find((t) => t.id === where.id)!, data),
      delete: async ({ where }: { where: { id: string } }) => { tarefas.splice(tarefas.findIndex((t) => t.id === where.id), 1); },
    },
    user: { findUnique: async ({ where }: { where: { id: string } }) => ({ U1: { id: 'U1', ativo: true }, U2: { id: 'U2', ativo: false } } as Record<string, { id: string; ativo: boolean }>)[where.id] ?? null },
    empresa: { count: async ({ where }: { where: { id: string } }) => (where.id === 'E1' ? 1 : 0) },
  };
  return { service: new TarefasService(prisma as never), tarefas, prisma, consultas };
}

const maria = { id: 'U1', role: 'user' };
const admin = { id: 'A1', role: 'admin' };

describe('TarefasService: criar e atualizar', () => {
  it('cria tarefa com título, prazo, empresa e responsável, e guarda quem criou', async () => {
    const t = montar();
    const nova = await t.service.criar(maria, { titulo: '  Conferir CT-e  ', prazo: '2026-11-20', empresa_id: 'E1', responsavel: 'U1', prioridade: 'ALTA' });
    expect(nova).toMatchObject({ titulo: 'Conferir CT-e', empresa_id: 'E1', responsavel: 'U1', prioridade: 'ALTA', criado_por: 'U1' });
    expect((nova.prazo as Date).toISOString()).toBe('2026-11-20T00:00:00.000Z');
  });

  it('recusa título vazio ou longo, prazo impossível, prioridade e situação desconhecidas, empresa inexistente e responsável desativado', async () => {
    const t = montar();
    await expect(t.service.criar(maria, { titulo: '  ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.criar(maria, { titulo: 'x'.repeat(201) })).rejects.toThrow(/até 200/);
    await expect(t.service.criar(maria, { titulo: 'A', prazo: '2026-02-30' })).rejects.toThrow(/Prazo inválido/);
    await expect(t.service.criar(maria, { titulo: 'A', prioridade: 'MAXIMA' })).rejects.toThrow(/Prioridade inválida/);
    await expect(t.service.criar(maria, { titulo: 'A', status: 'FEITA' })).rejects.toThrow(/Situação inválida/);
    await expect(t.service.criar(maria, { titulo: 'A', empresa_id: 'ZZ' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.criar(maria, { titulo: 'A', responsavel: 'U2' })).rejects.toThrow(/desativado/);
    await expect(t.service.criar(maria, { titulo: 'A', responsavel: 'ZZ' })).rejects.toThrow(/não existe/);
  });

  it('concluir carimba a data e reabrir tira o carimbo', async () => {
    const t = montar();
    const a = await t.service.criar(maria, { titulo: 'A' });
    const feita = await t.service.atualizar(a.id, { status: 'CONCLUIDA' });
    expect(feita.concluida_em).toBeInstanceOf(Date);
    const reaberta = await t.service.atualizar(a.id, { status: 'EM_ANDAMENTO' });
    expect(reaberta.concluida_em).toBeNull();
    await expect(t.service.atualizar('zz', { titulo: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('atualização parcial não apaga o que não foi enviado', async () => {
    const t = montar();
    const a = await t.service.criar(maria, { titulo: 'A', responsavel: 'U1', prazo: '2026-11-20' });
    const b = await t.service.atualizar(a.id, { prioridade: 'URGENTE' });
    expect(b).toMatchObject({ titulo: 'A', responsavel: 'U1', prioridade: 'URGENTE' });
    const c = await t.service.atualizar(a.id, { responsavel: null, prazo: null });
    expect(c).toMatchObject({ responsavel: null, prazo: null });
  });
});

describe('TarefasService: excluir', () => {
  it('quem criou ou o administrador exclui; os outros não', async () => {
    const t = montar();
    const a = await t.service.criar(maria, { titulo: 'A' });
    await expect(t.service.excluir({ id: 'U9', role: 'user' }, a.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(t.service.excluir(maria, a.id)).resolves.toEqual({ excluida: true });
    const b = await t.service.criar(maria, { titulo: 'B' });
    await expect(t.service.excluir(admin, b.id)).resolves.toEqual({ excluida: true });
    await expect(t.service.excluir(admin, b.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tarefa gerada por processo não se exclui (se cancela), para não ser criada de novo', async () => {
    const t = montar();
    t.tarefas.push({ id: 'G1', titulo: 'Gerada', status: 'ABERTA', empresa_id: null, responsavel: null, prazo: null, modelo_id: 'M1', criado_por: 'processo', concluida_em: null, prioridade: 'NORMAL' });
    await expect(t.service.excluir(admin, 'G1')).rejects.toBeInstanceOf(ConflictException);
    await expect(t.service.atualizar('G1', { status: 'CANCELADA' })).resolves.toMatchObject({ status: 'CANCELADA' });
  });
});

describe('TarefasService: listar', () => {
  const ultimo = (t: ReturnType<typeof montar>) => t.consultas[t.consultas.length - 1] as { where: Record<string, unknown>; take: number; orderBy: unknown[] };

  it('por padrão traz só as em aberto, ordenadas por prazo (sem prazo por último)', async () => {
    const t = montar();
    await t.service.listar(maria);
    expect(ultimo(t).where).toEqual({ status: { in: ['ABERTA', 'EM_ANDAMENTO'] } });
    expect(ultimo(t).orderBy[0]).toEqual({ prazo: { sort: 'asc', nulls: 'last' } });
    expect(ultimo(t).take).toBe(500);
  });

  it('monta os filtros: eu, sem responsável, empresa, busca, intervalo de prazo e situação', async () => {
    const t = montar();
    await t.service.listar(maria, { status: 'todas', responsavel: 'eu', empresa_id: 'E1', busca: ' apuração ', de: '2026-11-01', ate: '2026-11-30' });
    const w = ultimo(t).where as Record<string, unknown>;
    expect(w).toMatchObject({ responsavel: 'U1', empresa_id: 'E1', titulo: { contains: 'apuração', mode: 'insensitive' } });
    expect(w.status).toBeUndefined();
    expect((w.prazo as { gte: Date; lte: Date }).gte.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    await t.service.listar(maria, { responsavel: 'sem', status: 'CONCLUIDA' });
    expect(ultimo(t).where).toMatchObject({ responsavel: null, status: 'CONCLUIDA' });
    expect(ultimo(t).orderBy).toEqual([{ updatedAt: 'desc' }]); // as concluídas: a mais recente primeiro
    await t.service.listar(maria, { atrasadas: '1' });
    expect(ultimo(t).where).toMatchObject({ status: { in: ['ABERTA', 'EM_ANDAMENTO'] }, prazo: { lt: expect.any(Date) } });
  });

  it('recusa situação ou data inválida e limita o tamanho da lista', async () => {
    const t = montar();
    await expect(t.service.listar(maria, { status: 'FEITA' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.listar(maria, { de: 'ontem' })).rejects.toThrow(/Data inicial inválida/);
    await expect(t.service.listar(maria, { ate: '31/12/2026' })).rejects.toThrow(/Data final inválida/);
    await t.service.listar(maria, { limite: 99999 });
    expect(ultimo(t).take).toBe(2000);
  });

  it('o resumo faz uma contagem para cada cartão', async () => {
    const t = montar();
    const r = await t.service.resumo(maria);
    expect(Object.keys(r)).toEqual(['abertas', 'atrasadas', 'hoje', 'semana', 'sem_responsavel', 'minhas', 'minhas_atrasadas', 'concluidas_no_mes']);
    expect(t.prisma.tarefa.count).toHaveBeenCalledTimes(8);
  });
});
