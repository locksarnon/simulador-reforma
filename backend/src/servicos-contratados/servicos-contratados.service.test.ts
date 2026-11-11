import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ServicosContratadosService, normalizarEntrada } from './servicos-contratados.service';

type Linha = Record<string, unknown> & { id: string; empresa_id: string; tipo: string; situacao: string };

/** Prisma de mentira, em memória: empresas e serviços contratados. */
function montar(empresas: string[] = ['E1', 'E2', 'E3'], linhas: Linha[] = []) {
  let seq = 0;
  const casa = (l: Linha, w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => {
    if (v && typeof v === 'object' && 'in' in (v as object)) return ((v as { in: unknown[] }).in).includes(l[k]);
    return l[k] === v;
  });
  const sc = {
    findMany: async ({ where = {} }: { where?: Record<string, unknown> } = {}) => linhas.filter((l) => casa(l, where)),
    findFirst: async ({ where }: { where: Record<string, unknown> }) => linhas.find((l) => casa(l, where)) ?? null,
    findUnique: async ({ where }: { where: { id: string } }) => linhas.find((l) => l.id === where.id) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => { const l = { id: `S${++seq}`, ...data } as Linha; linhas.push(l); return l; },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { const l = linhas.find((x) => x.id === where.id)!; Object.assign(l, data); return l; },
  };
  const prisma = {
    empresa: {
      findUnique: async ({ where }: { where: { id: string } }) => (empresas.includes(where.id) ? { id: where.id } : null),
      findMany: async ({ where }: { where?: { id?: { in: string[] } } } = {}) => empresas.filter((id) => !where?.id || where.id.in.includes(id)).map((id) => ({ id })),
    },
    servicoContratado: sc,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ servicoContratado: sc }),
  };
  return { service: new ServicosContratadosService(prisma as never), linhas };
}

const hojeISO = () => new Date().toISOString().slice(0, 10);

describe('normalizarEntrada', () => {
  it('exige um tipo válido na criação e aceita só as situações conhecidas', () => {
    expect(() => normalizarEntrada({}, false)).toThrow(BadRequestException);
    expect(() => normalizarEntrada({ tipo: 'OUTRO' }, false)).toThrow(/Tipo de serviço inválido/);
    expect(() => normalizarEntrada({ tipo: 'BPO_FISCAL', situacao: 'TALVEZ' }, false)).toThrow(/Situação inválida/);
    expect(normalizarEntrada({ tipo: 'BPO_FISCAL', situacao: 'PAUSADO' }, false)).toMatchObject({ tipo: 'BPO_FISCAL', situacao: 'PAUSADO' });
  });

  it('confere datas, tamanho dos textos e módulos do BPO', () => {
    expect(() => normalizarEntrada({ tipo: 'BPO_FISCAL', inicio: 'ontem' }, false)).toThrow(/Data inválida/);
    expect(() => normalizarEntrada({ tipo: 'BPO_FISCAL', inicio: '2026-05-01', fim: '2026-04-01' }, false)).toThrow(/fim não pode ser anterior/);
    expect(() => normalizarEntrada({ tipo: 'BPO_FISCAL', responsavel: 'x'.repeat(121) }, false)).toThrow(/até 120/);
    expect(() => normalizarEntrada({ tipo: 'BPO_FISCAL', modulos: ['XML', 'MAGIA'] }, false)).toThrow(/Módulo inválido/);
    const ok = normalizarEntrada({ tipo: 'BPO_FISCAL', modulos: ['XML', 'XML', 'TAREFAS'], responsavel: '  Maria  ', observacao: '' }, false);
    expect(ok.modulos).toEqual(['XML', 'TAREFAS']);
    expect(ok.responsavel).toBe('Maria');
    expect(ok.observacao).toBeNull();
  });

  it('na atualização só leva o que foi enviado', () => {
    expect(normalizarEntrada({ situacao: 'PAUSADO' }, true)).toEqual({ situacao: 'PAUSADO' });
  });
});

describe('ServicosContratadosService', () => {
  it('cria o serviço, preenche o início ao ativar e guarda quem fez', async () => {
    const t = montar();
    const s = await t.service.criar('E1', { tipo: 'BPO_FISCAL', modulos: ['XML'] }, { email: 'maria@fal' });
    expect(s).toMatchObject({ empresa_id: 'E1', tipo: 'BPO_FISCAL', situacao: 'ATIVO', modulos: ['XML'], atualizado_por: 'maria@fal' });
    expect((s.inicio as Date).toISOString().slice(0, 10)).toBe(hojeISO());
  });

  it('empresa que não existe é recusada, e não há dois serviços em aberto do mesmo tipo', async () => {
    const t = montar();
    await expect(t.service.criar('X', { tipo: 'BPO_FISCAL' })).rejects.toBeInstanceOf(NotFoundException);
    await t.service.criar('E1', { tipo: 'BPO_FISCAL' });
    await expect(t.service.criar('E1', { tipo: 'BPO_FISCAL' })).rejects.toThrow(/já tem um serviço desse tipo em aberto/);
    // outro tipo na mesma empresa é permitido: a empresa pode ser dos dois mundos
    await expect(t.service.criar('E1', { tipo: 'DIAGNOSTICO_PONTUAL' })).resolves.toBeTruthy();
  });

  it('depois de encerrado, dá para contratar de novo (histórico fica)', async () => {
    const t = montar();
    const primeiro = await t.service.criar('E1', { tipo: 'DIAGNOSTICO_PONTUAL', nome: 'Diagnóstico 2025' });
    const encerrado = await t.service.atualizar(primeiro.id, { situacao: 'ENCERRADO' });
    expect((encerrado.fim as Date).toISOString().slice(0, 10)).toBe(hojeISO()); // fim preenchido ao encerrar
    await t.service.criar('E1', { tipo: 'DIAGNOSTICO_PONTUAL', nome: 'Diagnóstico 2026' });
    expect(t.linhas).toHaveLength(2);
  });

  it('o tipo de um serviço não muda; módulos só valem no BPO fiscal', async () => {
    const t = montar();
    const d = await t.service.criar('E1', { tipo: 'DIAGNOSTICO_PONTUAL', modulos: ['XML'] });
    expect(d.modulos).toEqual([]);
    await expect(t.service.atualizar(d.id, { tipo: 'BPO_FISCAL' })).rejects.toThrow(/tipo do serviço não muda/);
    await expect(t.service.atualizar('nada', { situacao: 'PAUSADO' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('em lote: atualiza quem já tem serviço em aberto e cria para os outros', async () => {
    const t = montar();
    await t.service.criar('E1', { tipo: 'BPO_FISCAL', situacao: 'PROPOSTA' });
    const r = await t.service.definirEmLote({ empresa_ids: ['E1', 'E2', 'E3', 'E3'], tipo: 'BPO_FISCAL', responsavel: 'Ana' }, { email: 'admin@fal' });
    expect(r).toEqual({ criados: 2, atualizados: 1 });
    expect(t.linhas.filter((l) => l.tipo === 'BPO_FISCAL' && l.situacao === 'ATIVO')).toHaveLength(3);
    expect(t.linhas.every((l) => l.responsavel === 'Ana')).toBe(true);
  });

  it('em lote: recusa lista vazia, lista grande demais e empresa inexistente', async () => {
    const t = montar();
    await expect(t.service.definirEmLote({ empresa_ids: [], tipo: 'BPO_FISCAL' })).rejects.toThrow(/pelo menos uma empresa/);
    await expect(t.service.definirEmLote({ empresa_ids: Array.from({ length: 501 }, (_, i) => `E${i}`), tipo: 'BPO_FISCAL' })).rejects.toThrow(/até 500/);
    await expect(t.service.definirEmLote({ empresa_ids: ['E1', 'ZZ'], tipo: 'BPO_FISCAL' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resumo: conta as carteiras (ativo e pausado), as empresas nas duas e as que não estão em nenhuma', async () => {
    const t = montar(['E1', 'E2', 'E3', 'E4']);
    await t.service.criar('E1', { tipo: 'BPO_FISCAL' });
    await t.service.criar('E1', { tipo: 'DIAGNOSTICO_PONTUAL' });
    await t.service.criar('E2', { tipo: 'BPO_FISCAL', situacao: 'PAUSADO' });
    await t.service.criar('E3', { tipo: 'DIAGNOSTICO_PONTUAL', situacao: 'ENCERRADO' });
    const r = await t.service.resumo();
    expect(r.empresas).toBe(4);
    expect(r.em_carteira).toEqual({ BPO_FISCAL: 2, DIAGNOSTICO_PONTUAL: 1, ambas: 1 });
    expect(r.sem_carteira).toBe(2); // E3 (encerrado) e E4
    expect(r.por_tipo.BPO_FISCAL).toEqual({ ATIVO: 1, PAUSADO: 1 });
  });

  it('lista e filtra por tipo e situação, e recusa filtro inválido', async () => {
    const t = montar();
    await t.service.criar('E1', { tipo: 'BPO_FISCAL' });
    await t.service.criar('E2', { tipo: 'DIAGNOSTICO_PONTUAL' });
    expect(await t.service.listar({ tipo: 'BPO_FISCAL' })).toHaveLength(1);
    expect(await t.service.daEmpresa('E2')).toHaveLength(1);
    await expect(t.service.listar({ tipo: 'XYZ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.daEmpresa('nada')).rejects.toBeInstanceOf(NotFoundException);
  });
});
