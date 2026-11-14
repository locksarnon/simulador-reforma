import { describe, expect, it, vi } from 'vitest';
import { ConsultoriaService } from './consultoria.service';
import { ProjetosDiagnosticoService } from './projetos.service';
import { PrismaService } from '../prisma/prisma.service';

function ambiente() {
  const registros = new Map<string, object>();
  const db = {
    empresa: {
      findFirst: vi.fn(async ({ where }) => where.id === 'PJ1' ? { cnpj_cpf: '12.345.678/0001-00' } : null),
      findMany: vi.fn(async () => [{ id: 'PJ1' }]),
      count: vi.fn(async () => 1),
    },
    pessoaFisica: { findUnique: vi.fn(async ({ where }) => where.id === 'PF1' ? { id: 'PF1' } : null) },
    vinculoConsultoria: {
      upsert: vi.fn(async ({ create }) => {
        const k = JSON.stringify([create.publico, create.cliente_id, create.servico]);
        if (!registros.has(k)) registros.set(k, create);
        return registros.get(k);
      }),
      count: vi.fn(async () => registros.size),
    },
    projetoDiagnostico: { create: vi.fn(async ({ data }) => data) },
    servicoContratado: { create: vi.fn() },
  };
  const prisma = db as unknown as PrismaService;
  return { db, registros, carteira: new ConsultoriaService(prisma), projetos: new ProjetosDiagnosticoService(prisma) };
}

describe('Consultoria Tributária', () => {
  it('o vínculo repetido converge sem duplicar o cliente ou gravar contrato BPO', async () => {
    const { carteira, registros, db } = ambiente();
    const entrada = { cliente_id: 'PJ1', servico: 'pis-cofins' };
    expect(await carteira.vincular(entrada)).toEqual(await carteira.vincular(entrada));
    expect(registros.size).toBe(1);
    expect(db.servicoContratado.create).not.toHaveBeenCalled();
  });

  it('impede trocar PF e PJ e vincular uma empresa ausente ou arquivada', async () => {
    const { carteira, registros } = ambiente();
    await expect(carteira.vincular({ cliente_id: 'PF1', servico: 'pj-homologacao' })).rejects.toThrow();
    await expect(carteira.vincular({ cliente_id: 'PJ1', servico: 'pf-homologacao' })).rejects.toThrow();
    await expect(carteira.vincular({ cliente_id: 'ARQUIVADO', servico: 'pis-cofins' })).rejects.toThrow();
    await carteira.vincular({ cliente_id: 'PF1', servico: 'pf-homologacao' });
    expect(registros.size).toBe(1);
  });

  it('só abre o projeto disponível com período e vínculo, sem ativar diagnóstico legado', async () => {
    const { projetos, carteira, db } = ambiente();
    const entrada = { nome: 'Análise', empresa_ids: ['PJ1'], periodo_inicio: '2026-01-01', periodo_fim: '2026-06-30' };
    await expect(projetos.criar({ ...entrada, servico_consultoria: 'pis-cofins' })).rejects.toThrow(/disponível/);
    await expect(projetos.criar({ ...entrada, servico_consultoria: 'simulador-reforma' })).rejects.toThrow(/Vincule/);
    await carteira.vincular({ cliente_id: 'PJ1', servico: 'simulador-reforma' });
    await expect(projetos.criar({ ...entrada, periodo_fim: '2025-12-31', servico_consultoria: 'simulador-reforma' })).rejects.toThrow(/período/);
    await expect(projetos.criar({ ...entrada, servico_consultoria: 'simulador-reforma' })).resolves.toMatchObject({
      empresa_ids: ['PJ1'], servico_consultoria: 'simulador-reforma', periodo_inicio: new Date('2026-01-01'),
    });
    expect(db.servicoContratado.create).not.toHaveBeenCalled();
  });
});
