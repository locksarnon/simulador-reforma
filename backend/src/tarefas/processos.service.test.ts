import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ProcessosService } from './processos.service';

type M = { id: string; nome: string; descricao: string | null; recorrencia: string; dia: number; mes: number | null; escopo: string; responsavel: string | null; prioridade: string; ativo: boolean };
type Tar = { titulo: string; empresa_id: string | null; responsavel: string | null; prazo: Date; modelo_id: string; competencia: string; criado_por: string; prioridade: string; descricao: string | null };

function montar() {
  const modelos: M[] = [];
  const tarefas: Tar[] = [];
  let seq = 0;
  const bpo = ['E1', 'E2', 'E3'];
  const vinculos = [{ user_id: 'U1', empresa_id: 'E1' }, { user_id: 'U1', empresa_id: 'E2' }, { user_id: 'U3', empresa_id: 'E2' }, { user_id: 'U9', empresa_id: 'E3' }];
  const usuarios = [{ id: 'U1', ativo: true }, { id: 'U3', ativo: true }, { id: 'U9', ativo: false }];
  const prisma = {
    processoModelo: {
      findMany: async ({ where }: { where?: { ativo?: boolean; id?: string } } = {}) => modelos.filter((m) => (where?.ativo === undefined || m.ativo === where.ativo) && (!where?.id || m.id === where.id)),
      findUnique: async ({ where }: { where: { id: string } }) => modelos.find((m) => m.id === where.id) ?? null,
      create: async ({ data }: { data: Partial<M> }) => { const m = { id: `M${++seq}`, descricao: null, mes: null, responsavel: null, prioridade: 'NORMAL', ativo: true, recorrencia: 'MENSAL', dia: 10, escopo: 'POR_EMPRESA_BPO', ...data } as M; modelos.push(m); return m; },
      update: async ({ where, data }: { where: { id: string }; data: Partial<M> }) => Object.assign(modelos.find((m) => m.id === where.id)!, data),
      delete: async ({ where }: { where: { id: string } }) => { modelos.splice(modelos.findIndex((m) => m.id === where.id), 1); },
    },
    tarefa: {
      findMany: async ({ where }: { where: { modelo_id: string; competencia: string } }) => tarefas.filter((t) => t.modelo_id === where.modelo_id && t.competencia === where.competencia),
      createMany: async ({ data }: { data: Tar[] }) => { tarefas.push(...data); },
    },
    servicoContratado: { findMany: async () => bpo.map((empresa_id) => ({ empresa_id })) },
    vinculoColaborador: { findMany: async ({ where }: { where: { empresa_id: { in: string[] } } }) => vinculos.filter((v) => where.empresa_id.in.includes(v.empresa_id)) },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => usuarios.find((u) => u.id === where.id) ?? null,
      findMany: async () => usuarios.filter((u) => u.ativo),
    },
  };
  return { service: new ProcessosService(prisma as never), modelos, tarefas };
}

describe('ProcessosService: cadastro', () => {
  it('cria o processo, recusa nome vazio, recorrência, dia e escopo inválidos e exige o mês no anual', async () => {
    const t = montar();
    const m = await t.service.criar({ email: 'admin@fal' }, { nome: '  Conferir   apuração ', recorrencia: 'MENSAL', dia: 20 });
    expect(m).toMatchObject({ nome: 'Conferir apuração', dia: 20 });
    await expect(t.service.criar({}, { nome: '' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.criar({}, { nome: 'X', recorrencia: 'DIARIA' })).rejects.toThrow(/Recorrência inválida/);
    await expect(t.service.criar({}, { nome: 'X', dia: 32 })).rejects.toThrow(/1 a 31/);
    await expect(t.service.criar({}, { nome: 'X', escopo: 'TUDO' })).rejects.toThrow(/Escopo inválido/);
    await expect(t.service.criar({}, { nome: 'X', recorrencia: 'ANUAL' })).rejects.toThrow(/precisa do mês/);
    await expect(t.service.criar({}, { nome: 'X', responsavel: 'U9' })).rejects.toThrow(/desativado/);
    await expect(t.service.criar({}, { nome: 'X', recorrencia: 'ANUAL', mes: 3 })).resolves.toMatchObject({ mes: 3 });
  });

  it('atualiza, desativa e apaga; processo inexistente dá 404', async () => {
    const t = montar();
    const m = await t.service.criar({}, { nome: 'A', recorrencia: 'MENSAL', dia: 5 });
    await expect(t.service.atualizar(m.id, { ativo: false })).resolves.toMatchObject({ ativo: false });
    await expect(t.service.atualizar(m.id, { recorrencia: 'ANUAL' })).rejects.toThrow(/precisa do mês/);
    await expect(t.service.atualizar('zz', { nome: 'B' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.excluir(m.id)).resolves.toEqual({ excluido: true });
    await expect(t.service.excluir(m.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProcessosService: gerar tarefas', () => {
  it('gera uma tarefa por empresa do BPO, com título, prazo e competência, e não repete na segunda vez', async () => {
    const t = montar();
    const m = await t.service.criar({}, { nome: 'Conferir apuração', recorrencia: 'MENSAL', dia: 20, prioridade: 'ALTA' });
    const r1 = await t.service.gerar({ competencia: '2026-11' });
    expect(r1).toEqual({ criadas: 3, existentes: 0 });
    expect(t.tarefas).toHaveLength(3);
    expect(t.tarefas[0]).toMatchObject({ titulo: 'Conferir apuração — 11/2026', competencia: '2026-11', modelo_id: m.id, prioridade: 'ALTA', criado_por: 'processo' });
    expect(t.tarefas[0].prazo.toISOString()).toBe('2026-11-20T00:00:00.000Z');
    const r2 = await t.service.gerar({ competencia: '2026-11' });
    expect(r2).toEqual({ criadas: 0, existentes: 3 });
    expect(t.tarefas).toHaveLength(3);
    expect(await t.service.gerar({ competencia: '2026-12' })).toEqual({ criadas: 3, existentes: 0 }); // outro mês, outras tarefas
  });

  it('o responsável é o do processo; senão, o único colaborador ativo da empresa; senão, ninguém', async () => {
    const t = montar();
    await t.service.criar({}, { nome: 'Sem responsável fixo', dia: 10 });
    await t.service.gerar({ competencia: '2026-11' });
    const porEmpresa = Object.fromEntries(t.tarefas.map((x) => [x.empresa_id, x.responsavel]));
    expect(porEmpresa).toEqual({ E1: 'U1', E2: null, E3: null }); // E2 tem dois colaboradores; E3 só um desativado
    const t2 = montar();
    await t2.service.criar({}, { nome: 'Com responsável', dia: 10, responsavel: 'U3' });
    await t2.service.gerar({ competencia: '2026-11' });
    expect(new Set(t2.tarefas.map((x) => x.responsavel))).toEqual(new Set(['U3']));
  });

  it('processo geral cria uma tarefa só, sem empresa', async () => {
    const t = montar();
    await t.service.criar({}, { nome: 'Fechar caixa do escritório', escopo: 'GERAL', dia: 28 });
    expect(await t.service.gerar({ competencia: '2026-11' })).toEqual({ criadas: 1, existentes: 0 });
    expect(t.tarefas[0].empresa_id).toBeNull();
  });

  it('processo desativado não gera; trimestral e anual respeitam o mês; simular só conta', async () => {
    const t = montar();
    const a = await t.service.criar({}, { nome: 'Trimestral', recorrencia: 'TRIMESTRAL', dia: 15, escopo: 'GERAL' });
    await t.service.criar({}, { nome: 'Anual', recorrencia: 'ANUAL', mes: 3, dia: 31, escopo: 'GERAL' });
    expect(await t.service.gerar({ competencia: '2026-11', simular: true })).toEqual({ criadas: 0, existentes: 0 });
    expect(await t.service.gerar({ competencia: '2026-10', simular: true })).toEqual({ criadas: 1, existentes: 0 });
    expect(t.tarefas).toHaveLength(0); // simular não grava
    expect(await t.service.gerar({ competencia: '2027-03' })).toEqual({ criadas: 1, existentes: 0 });
    expect(t.tarefas[0].prazo.toISOString().slice(0, 10)).toBe('2027-03-31');
    await t.service.atualizar(a.id, { ativo: false });
    expect(await t.service.gerar({ competencia: '2027-01' })).toEqual({ criadas: 0, existentes: 0 });
  });

  it('exige competência válida e processo existente', async () => {
    const t = montar();
    await expect(t.service.gerar({ competencia: '11/2026' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.gerar({ competencia: '2026-11', modelo_id: 'zz' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProcessosService: rodada automática', () => {
  it('só cria tarefa dentro dos 10 dias antes do prazo e nunca já atrasada', async () => {
    const t = montar();
    await t.service.criar({}, { nome: 'Conferir apuração', dia: 20, escopo: 'GERAL' });
    // 5 dias antes do prazo de novembro: cria. O prazo de dezembro (20/12) ainda está longe.
    expect(await t.service.rodadaAutomatica(new Date('2026-11-15T09:00:00Z'))).toEqual({ criadas: 1, existentes: 0 });
    expect(t.tarefas.map((x) => x.competencia)).toEqual(['2026-11']);
    // no dia seguinte não repete
    expect(await t.service.rodadaAutomatica(new Date('2026-11-16T09:00:00Z'))).toEqual({ criadas: 0, existentes: 1 });
    // depois do prazo (21/11) não cria atrasada; dezembro só em 10/12
    expect(await t.service.rodadaAutomatica(new Date('2026-11-25T09:00:00Z'))).toEqual({ criadas: 0, existentes: 0 });
    expect(await t.service.rodadaAutomatica(new Date('2026-12-10T09:00:00Z'))).toEqual({ criadas: 1, existentes: 0 });
    expect(t.tarefas.map((x) => x.competencia)).toEqual(['2026-11', '2026-12']);
  });

  it('o processo recém-criado depois do prazo do mês não gera tarefa atrasada sozinho', async () => {
    const t = montar();
    await t.service.criar({}, { nome: 'Novo', dia: 5, escopo: 'GERAL' });
    expect(await t.service.rodadaAutomatica(new Date('2026-11-20T09:00:00Z'))).toEqual({ criadas: 0, existentes: 0 });
  });

  it('TAREFAS_AGENDADOR=off desliga a rodada', async () => {
    const t = montar();
    await t.service.criar({}, { nome: 'Conferir', dia: 20, escopo: 'GERAL' });
    process.env.TAREFAS_AGENDADOR = 'off';
    try {
      expect(await t.service.rodadaAutomatica(new Date('2026-11-15T09:00:00Z'))).toEqual({ criadas: 0, existentes: 0 });
      expect(t.tarefas).toHaveLength(0);
    } finally {
      delete process.env.TAREFAS_AGENDADOR;
    }
  });
});
