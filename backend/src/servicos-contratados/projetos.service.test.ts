import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ProjetosDiagnosticoService } from './projetos.service';

function montar() {
  const db = {
    empresas: ['A', 'B', 'C'],
    projetos: [] as Record<string, unknown>[],
    servicos: [{ id: 'S1', empresa_id: 'B', tipo: 'DIAGNOSTICO_PONTUAL', situacao: 'PAUSADO' }] as Record<string, unknown>[],
  };
  let seq = 0;
  const prisma = {
    empresa: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => db.empresas.filter((id) => where.id.in.includes(id)).map((id) => ({ id })) },
    projetoDiagnostico: {
      create: async ({ data }: { data: Record<string, unknown> }) => { const p = { id: `P${++seq}`, ...data }; db.projetos.push(p); return p; },
      findUnique: async ({ where }: { where: { id: string } }) => db.projetos.find((p) => p.id === where.id) ?? null,
      findMany: async () => db.projetos,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(db.projetos.find((p) => p.id === where.id)!, data),
      updateMany: async ({ where, data }: { where: { id: string; exclusao_solicitada_em: unknown }; data: Record<string, unknown> }) => {
        const projeto = db.projetos.find((p) => p.id === where.id && Boolean(p.exclusao_solicitada_em) === Boolean(where.exclusao_solicitada_em));
        if (!projeto) return { count: 0 };
        Object.assign(projeto, data);
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: { id: string } }) => {
        const antes = db.projetos.length;
        db.projetos = db.projetos.filter((p) => p.id !== where.id || !p.exclusao_solicitada_em);
        return { count: antes - db.projetos.length };
      },
      delete: async ({ where }: { where: { id: string } }) => { db.projetos = db.projetos.filter((p) => p.id !== where.id); },
    },
    servicoContratado: {
      findFirst: async ({ where }: { where: { empresa_id: string; tipo: string } }) => db.servicos.find((s) => s.empresa_id === where.empresa_id && s.tipo === where.tipo && ['PROPOSTA', 'ATIVO', 'PAUSADO'].includes(String(s.situacao))) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => { db.servicos.push({ id: `S${db.servicos.length + 1}`, ...data }); },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(db.servicos.find((s) => s.id === where.id)!, data),
    },
  };
  return { service: new ProjetosDiagnosticoService(prisma as never), db };
}

describe('Projetos de diagnóstico', () => {
  it('cria com parte de um grupo e liga o diagnóstico pontual de quem não tinha (o pausado volta a ativo)', async () => {
    const { service, db } = montar();
    const p = await service.criar({ nome: 'Diagnóstico Extra 2026', grupo_numero: '#001', empresa_ids: ['A', 'B'], escopo: 'Crédito de estoque' }, { email: 'a@fal' });
    expect(p).toMatchObject({ nome: 'Diagnóstico Extra 2026', empresa_ids: ['A', 'B'], situacao: 'EM_ANDAMENTO', criado_por: 'a@fal' });
    expect(db.servicos.find((s) => s.empresa_id === 'A')).toMatchObject({ tipo: 'DIAGNOSTICO_PONTUAL', situacao: 'ATIVO' });
    expect(db.servicos.find((s) => s.empresa_id === 'B')?.situacao).toBe('ATIVO');
    expect(db.servicos).toHaveLength(2);
  });

  it('acrescentar empresa liga o diagnóstico dela; tirar não apaga nada', async () => {
    const { service, db } = montar();
    const p = await service.criar({ nome: 'X', empresa_ids: ['A'] });
    await service.atualizar(p.id as string, { empresa_ids: ['A', 'C'] });
    expect(db.servicos.some((s) => s.empresa_id === 'C' && s.situacao === 'ATIVO')).toBe(true);
    await service.atualizar(p.id as string, { empresa_ids: ['C'] });
    expect(db.servicos.some((s) => s.empresa_id === 'A')).toBe(true);
  });

  it('recusa sem nome, sem empresa, empresa que não existe e situação inválida', async () => {
    const { service } = montar();
    await expect(service.criar({ nome: ' ', empresa_ids: ['A'] })).rejects.toThrow(/nome/);
    await expect(service.criar({ nome: 'X', empresa_ids: [] })).rejects.toThrow(BadRequestException);
    await expect(service.criar({ nome: 'X', empresa_ids: ['Z'] })).rejects.toThrow(/não existe/);
    const p = await service.criar({ nome: 'X', empresa_ids: ['A'] });
    await expect(service.atualizar(p.id as string, { situacao: 'TALVEZ' })).rejects.toThrow(/Situação/);
  });

  it('mantém o projeto até a decisão do administrador', async () => {
    const { service, db } = montar();
    const { id } = await service.criar({ nome: 'X', empresa_ids: ['A'] });
    const admin = { role: 'admin' };
    const usuario = { role: 'user', email: 'solicitante@exemplo.test' };
    await expect(service.excluir(id, usuario)).resolves.toMatchObject({ pendente: true });
    await service.excluir(id, { ...usuario, email: 'outro@exemplo.test' });
    expect(db.projetos[0]).toMatchObject({ situacao: 'EM_ANDAMENTO', exclusao_solicitada_por: usuario.email });
    await expect(service.aprovarExclusao(id, usuario)).rejects.toThrow(ForbiddenException);
    await expect(service.recusarExclusao(id, usuario)).rejects.toThrow(ForbiddenException);
    await service.recusarExclusao(id, admin);
    expect(db.projetos[0].exclusao_solicitada_em).toBeNull();
    await expect(service.aprovarExclusao(id, admin)).rejects.toThrow(/já foi resolvida/);
    await service.excluir(id, usuario);
    await service.aprovarExclusao(id, admin);
    expect(db.projetos).toHaveLength(0);
    expect(db.servicos.some((s) => s.empresa_id === 'A')).toBe(true);
  });

  it('só administrador exclui diretamente o projeto', async () => {
    const { service, db } = montar();
    const p = await service.criar({ nome: 'X', empresa_ids: ['A'] });
    await expect(service.excluir(p.id as string, { role: 'user' })).rejects.toThrow(ForbiddenException);
    await service.excluir(p.id as string, { role: 'admin' });
    expect(db.projetos).toHaveLength(0);
  });
});
