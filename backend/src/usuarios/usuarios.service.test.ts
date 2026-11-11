import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { describe, expect, it } from 'vitest';
import { UsuariosService, senhaProvisoria, validarSenha } from './usuarios.service';

type U = { id: string; email: string; name: string | null; role: string; ativo: boolean; passwordHash: string; lastLoginAt: Date | null; createdAt: Date };

async function montar(extra: Partial<U>[] = []) {
  const hash = await argon2.hash('senha-antiga-123');
  const users: U[] = [
    { id: 'A1', email: 'admin@fal', name: 'Admin', role: 'admin', ativo: true, passwordHash: hash, lastLoginAt: null, createdAt: new Date() },
    { id: 'U1', email: 'maria@fal', name: 'Maria', role: 'user', ativo: true, passwordHash: hash, lastLoginAt: null, createdAt: new Date() },
    ...extra.map((e, i) => ({ id: `X${i}`, email: `x${i}@fal`, name: null, role: 'user', ativo: true, passwordHash: hash, lastLoginAt: null, createdAt: new Date(), ...e })),
  ];
  const vinculos: { user_id: string; empresa_id: string }[] = [];
  const empresas = ['E1', 'E2', 'E3'].map((id) => ({ id, id_empresa: id, razao_social: `Empresa ${id}`, cnpj_cpf: null, grupo: null }));
  const tokensRevogados: string[] = [];
  const casa = (u: U, w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => {
    if (v && typeof v === 'object' && 'not' in (v as object)) return (u as never)[k] !== (v as { not: unknown }).not;
    return (u as never)[k] === v;
  });
  const prisma = {
    user: {
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) => users.filter((u) => !where || casa(u, where)),
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => users.find((u) => u.id === where.id || u.email === where.email) ?? null,
      count: async ({ where }: { where: Record<string, unknown> }) => users.filter((u) => casa(u, where)).length,
      create: async ({ data }: { data: Partial<U> }) => { const u = { id: `N${users.length}`, ativo: true, name: null, lastLoginAt: null, createdAt: new Date(), ...data } as U; users.push(u); return u; },
      update: async ({ where, data }: { where: { id: string }; data: Partial<U> }) => { const u = users.find((x) => x.id === where.id)!; Object.assign(u, data); return u; },
    },
    refreshToken: { updateMany: async ({ where }: { where: { userId: string } }) => { tokensRevogados.push(where.userId); return { count: 1 }; } },
    vinculoColaborador: {
      groupBy: async () => [],
      findMany: async ({ where }: { where?: { user_id?: string } } = {}) => vinculos.filter((v) => !where?.user_id || v.user_id === where.user_id),
      createMany: async ({ data }: { data: { user_id: string; empresa_id: string }[] }) => { vinculos.push(...data); },
      deleteMany: async ({ where }: { where: { user_id: string; empresa_id: { in: string[] } } }) => {
        for (const id of where.empresa_id.in) { const i = vinculos.findIndex((v) => v.user_id === where.user_id && v.empresa_id === id); if (i >= 0) vinculos.splice(i, 1); }
      },
    },
    empresa: {
      findMany: async () => empresas,
      count: async ({ where }: { where: { id: { in: string[] } } }) => empresas.filter((e) => where.id.in.includes(e.id)).length,
    },
  };
  return { service: new UsuariosService(prisma as never), users, vinculos, tokensRevogados };
}

describe('senhas', () => {
  it('exige 10 caracteres e não aceita o e-mail como senha', () => {
    expect(() => validarSenha('curta')).toThrow(/pelo menos 10/);
    expect(() => validarSenha('maria@fal.com', 'maria@fal.com')).toThrow(/igual ao e-mail/);
    expect(validarSenha('uma-senha-boa')).toBe('uma-senha-boa');
  });
  it('a senha provisória tem 12 caracteres e muda a cada vez', () => {
    expect(senhaProvisoria()).toHaveLength(12);
    expect(senhaProvisoria()).not.toBe(senhaProvisoria());
  });
});

describe('UsuariosService: administração', () => {
  it('cria conta com senha provisória devolvida uma vez, e recusa e-mail repetido ou inválido', async () => {
    const t = await montar();
    const r = await t.service.criar({ email: ' NOVO@Fal.com ', name: 'Novo', role: 'user' });
    expect(r.usuario.email).toBe('novo@fal.com');
    expect(r.senha_provisoria).toHaveLength(12);
    expect(await argon2.verify(t.users.find((u) => u.email === 'novo@fal.com')!.passwordHash, r.senha_provisoria!)).toBe(true);
    await expect(t.service.criar({ email: 'novo@fal.com' })).rejects.toBeInstanceOf(ConflictException);
    await expect(t.service.criar({ email: 'sem-arroba' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.criar({ email: 'x@fal.com', role: 'dono' })).rejects.toThrow(/Papel inválido/);
    const com = await t.service.criar({ email: 'c@fal.com', senha: 'senha-escolhida-1' });
    expect(com.senha_provisoria).toBeNull();
  });

  it('muda papel e situação, mas não deixa o sistema sem administrador nem o admin se desativar', async () => {
    const t = await montar();
    await expect(t.service.atualizar('A1', { ativo: false }, { id: 'A1', email: 'admin@fal' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(t.service.atualizar('A1', { role: 'user' }, { id: 'A1', email: 'admin@fal' })).rejects.toBeInstanceOf(ForbiddenException);
    // com um segundo administrador, o primeiro pode ser rebaixado por ele
    await t.service.atualizar('U1', { role: 'admin' }, { id: 'A1', email: 'admin@fal' });
    await expect(t.service.atualizar('A1', { role: 'user' }, { id: 'U1', email: 'maria@fal' })).resolves.toMatchObject({ role: 'user' });
    // agora U1 é o único administrador: ninguém o rebaixa
    await expect(t.service.atualizar('U1', { role: 'user' }, { id: 'A1', email: 'admin@fal' })).rejects.toThrow(/pelo menos um administrador ativo/);
    await expect(t.service.atualizar('nada', { ativo: false }, { id: 'A1', email: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desativar uma conta derruba as sessões dela', async () => {
    const t = await montar();
    await t.service.atualizar('U1', { ativo: false }, { id: 'A1', email: 'admin@fal' });
    expect(t.users.find((u) => u.id === 'U1')!.ativo).toBe(false);
    expect(t.tokensRevogados).toContain('U1');
  });

  it('redefinir a senha troca o hash e derruba as sessões', async () => {
    const t = await montar();
    const r = await t.service.redefinirSenha('U1');
    expect(await argon2.verify(t.users.find((u) => u.id === 'U1')!.passwordHash, r.senha_provisoria!)).toBe(true);
    expect(t.tokensRevogados).toContain('U1');
    await expect(t.service.redefinirSenha('U1', 'curta')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('UsuariosService: perfil', () => {
  it('troca a própria senha só com a atual certa, e a nova precisa ser boa e diferente', async () => {
    const t = await montar();
    await expect(t.service.trocarSenha('U1', { atual: 'errada-errada', nova: 'nova-senha-longa' })).rejects.toThrow(/senha atual não confere/);
    await expect(t.service.trocarSenha('U1', { atual: 'senha-antiga-123', nova: 'curta' })).rejects.toThrow(/pelo menos 10/);
    await expect(t.service.trocarSenha('U1', { atual: 'senha-antiga-123', nova: 'senha-antiga-123' })).rejects.toThrow(/diferente da atual/);
    await expect(t.service.trocarSenha('U1', { atual: 'senha-antiga-123', nova: 'nova-senha-longa' })).resolves.toEqual({ trocada: true });
    expect(await argon2.verify(t.users.find((u) => u.id === 'U1')!.passwordHash, 'nova-senha-longa')).toBe(true);
    expect(t.tokensRevogados).toContain('U1');
  });

  it('atualiza o nome do perfil', async () => {
    const t = await montar();
    await expect(t.service.atualizarPerfil('U1', { name: '  Maria S.  ' })).resolves.toMatchObject({ name: 'Maria S.' });
  });
});

describe('UsuariosService: carteira por colaborador', () => {
  it('adicionar, remover e definir mexem só no que devem, sem duplicar', async () => {
    const t = await montar();
    expect(await t.service.vincular({ user_id: 'U1', empresa_ids: ['E1', 'E2'], modo: 'adicionar' })).toEqual({ adicionadas: 2, removidas: 0, total: 2 });
    expect(await t.service.vincular({ user_id: 'U1', empresa_ids: ['E2', 'E3'], modo: 'adicionar' })).toEqual({ adicionadas: 1, removidas: 0, total: 3 });
    expect(await t.service.vincular({ user_id: 'U1', empresa_ids: ['E1'], modo: 'remover' })).toEqual({ adicionadas: 0, removidas: 1, total: 2 });
    expect(await t.service.vincular({ user_id: 'U1', empresa_ids: ['E1'], modo: 'definir' })).toEqual({ adicionadas: 1, removidas: 2, total: 1 });
    expect(t.vinculos).toEqual([{ user_id: 'U1', empresa_id: 'E1' }]);
  });

  it('recusa modo inválido, colaborador ou empresa que não existe', async () => {
    const t = await montar();
    await expect(t.service.vincular({ user_id: 'U1', empresa_ids: ['E1'], modo: 'trocar' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.vincular({ user_id: 'zz', empresa_ids: ['E1'] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.vincular({ user_id: 'U1', empresa_ids: ['E1', 'ZZ'] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lista as empresas sem colaborador e a carteira de cada colaborador ativo', async () => {
    const t = await montar();
    await t.service.vincular({ user_id: 'U1', empresa_ids: ['E1'] });
    expect((await t.service.semColaborador()).map((e) => e.id)).toEqual(['E2', 'E3']);
    const carteira = await t.service.carteira();
    expect(carteira.find((c) => c.id === 'U1')!.empresa_ids).toEqual(['E1']);
    expect(carteira.find((c) => c.id === 'A1')!.empresa_ids).toEqual([]);
  });
});
