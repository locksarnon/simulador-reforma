import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { criteriosDeEmpresas, TagsService } from './tags.service';

type Tag = { id: string; nome: string; cor: string };
type Filtro = { id: string; dono: string; nome: string; escopo: string; criterios: unknown; compartilhado: boolean };

function montar() {
  const tags: Tag[] = [];
  const ligacoes: { tag_id: string; empresa_id: string }[] = [];
  const filtros: Filtro[] = [];
  let seq = 0;
  const empresas = ['E1', 'E2', 'E3'];
  const pessoas = [{ id: 'U1', name: 'Maria', email: 'maria@fal' }, { id: 'U2', name: null, email: 'joao@fal' }];
  const igual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const prisma = {
    tag: {
      findMany: async () => tags.map((t) => ({ ...t, _count: { empresas: ligacoes.filter((l) => l.tag_id === t.id).length } })).sort((a, b) => a.nome.localeCompare(b.nome)),
      findUnique: async ({ where }: { where: { id: string } }) => tags.find((t) => t.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { nome: { equals: string }; id?: { not: string } } }) => tags.find((t) => igual(t.nome, where.nome.equals) && t.id !== where.id?.not) ?? null,
      count: async ({ where }: { where: { id: { in: string[] } } }) => tags.filter((t) => where.id.in.includes(t.id)).length,
      create: async ({ data }: { data: { nome: string; cor: string } }) => { const t = { id: `T${++seq}`, ...data }; tags.push(t); return t; },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Tag> }) => Object.assign(tags.find((t) => t.id === where.id)!, data),
      delete: async ({ where }: { where: { id: string } }) => {
        tags.splice(tags.findIndex((t) => t.id === where.id), 1);
        for (let i = ligacoes.length - 1; i >= 0; i--) if (ligacoes[i].tag_id === where.id) ligacoes.splice(i, 1); // cascata do banco
      },
    },
    empresaTag: {
      findMany: async ({ where }: { where?: { tag_id?: string; empresa_id?: string } } = {}) =>
        ligacoes.filter((l) => (!where?.tag_id || l.tag_id === where.tag_id) && (!where?.empresa_id || l.empresa_id === where.empresa_id)),
      createMany: async ({ data }: { data: { tag_id: string; empresa_id: string }[] }) => { ligacoes.push(...data); },
      deleteMany: async ({ where }: { where: { tag_id?: string; empresa_id?: string | { in: string[] } } & { tag_id?: string | { in: string[] } } }) => {
        const em = (v: unknown, x: string) => (v === undefined ? true : typeof v === 'string' ? v === x : (v as { in: string[] }).in.includes(x));
        for (let i = ligacoes.length - 1; i >= 0; i--) if (em(where.tag_id, ligacoes[i].tag_id) && em(where.empresa_id, ligacoes[i].empresa_id)) ligacoes.splice(i, 1);
      },
    },
    empresa: {
      count: async ({ where }: { where: { id: string | { in: string[] } } }) => empresas.filter((e) => (typeof where.id === 'string' ? e === where.id : where.id.in.includes(e))).length,
    },
    user: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => pessoas.filter((p) => where.id.in.includes(p.id)) },
    filtroSalvo: {
      findMany: async ({ where }: { where: { escopo: string; OR: { dono?: string; compartilhado?: boolean }[] } }) =>
        filtros.filter((f) => f.escopo === where.escopo && where.OR.some((c) => (c.dono !== undefined && f.dono === c.dono) || (c.compartilhado !== undefined && f.compartilhado === c.compartilhado)))
          .sort((a, b) => a.nome.localeCompare(b.nome)), // o serviço pede orderBy nome
      findFirst: async ({ where }: { where: { dono: string; escopo: string; nome: { equals: string } } }) => filtros.find((f) => f.dono === where.dono && f.escopo === where.escopo && igual(f.nome, where.nome.equals)) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) => filtros.find((f) => f.id === where.id) ?? null,
      create: async ({ data }: { data: Omit<Filtro, 'id'> }) => { const f = { id: `F${++seq}`, ...data }; filtros.push(f); return f; },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Filtro> }) => Object.assign(filtros.find((f) => f.id === where.id)!, data),
      delete: async ({ where }: { where: { id: string } }) => { filtros.splice(filtros.findIndex((f) => f.id === where.id), 1); },
    },
  };
  return { service: new TagsService(prisma as never), tags, ligacoes, filtros };
}

describe('TagsService: etiquetas', () => {
  it('cria etiqueta com cor padrão, recusa nome repetido (sem diferenciar maiúsculas), vazio, longo e cor inválida', async () => {
    const t = montar();
    const a = await t.service.criar({ nome: '  Agro   Grande ' });
    expect(a).toMatchObject({ nome: 'Agro Grande', cor: '#1E764D', empresas: 0 });
    await expect(t.service.criar({ nome: 'agro grande' })).rejects.toBeInstanceOf(ConflictException);
    await expect(t.service.criar({ nome: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.criar({ nome: 'x'.repeat(41) })).rejects.toThrow(/até 40/);
    await expect(t.service.criar({ nome: 'Cor ruim', cor: 'verde' })).rejects.toThrow(/#RRGGBB/);
    expect((await t.service.criar({ nome: 'Azul', cor: '#2563eb' })).cor).toBe('#2563EB');
  });

  it('renomeia e muda a cor, mas não deixa dois com o mesmo nome', async () => {
    const t = montar();
    const a = await t.service.criar({ nome: 'A' });
    const b = await t.service.criar({ nome: 'B' });
    await expect(t.service.atualizar(b.id, { nome: 'a' })).rejects.toBeInstanceOf(ConflictException);
    await expect(t.service.atualizar(a.id, { nome: 'A' })).resolves.toMatchObject({ nome: 'A' }); // o próprio nome não conflita
    await expect(t.service.atualizar(b.id, { nome: 'Beta', cor: '#BE123C' })).resolves.toMatchObject({ nome: 'Beta', cor: '#BE123C' });
    await expect(t.service.atualizar('zz', { nome: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adicionar, remover e definir mexem só no que devem, sem duplicar', async () => {
    const t = montar();
    const a = await t.service.criar({ nome: 'A' });
    expect(await t.service.aplicar({ tag_id: a.id, empresa_ids: ['E1', 'E2'] })).toEqual({ adicionadas: 2, removidas: 0, total: 2 });
    expect(await t.service.aplicar({ tag_id: a.id, empresa_ids: ['E2', 'E3'], modo: 'adicionar' })).toEqual({ adicionadas: 1, removidas: 0, total: 3 });
    expect(await t.service.aplicar({ tag_id: a.id, empresa_ids: ['E1'], modo: 'remover' })).toEqual({ adicionadas: 0, removidas: 1, total: 2 });
    expect(await t.service.aplicar({ tag_id: a.id, empresa_ids: ['E1'], modo: 'definir' })).toEqual({ adicionadas: 1, removidas: 2, total: 1 });
    expect(t.ligacoes).toEqual([{ tag_id: a.id, empresa_id: 'E1' }]);
    expect(await t.service.aplicar({ tag_id: a.id, empresa_ids: [], modo: 'definir' })).toMatchObject({ removidas: 1, total: 0 }); // definir vazio limpa
  });

  it('recusa modo inválido, lista vazia no adicionar, etiqueta ou empresa que não existe', async () => {
    const t = montar();
    const a = await t.service.criar({ nome: 'A' });
    await expect(t.service.aplicar({ tag_id: a.id, empresa_ids: ['E1'], modo: 'trocar' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.aplicar({ tag_id: a.id, empresa_ids: [] })).rejects.toThrow(/pelo menos uma empresa/);
    await expect(t.service.aplicar({ tag_id: 'zz', empresa_ids: ['E1'] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.aplicar({ tag_id: a.id, empresa_ids: ['E1', 'ZZ'] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deixa uma empresa com exatamente as etiquetas escolhidas', async () => {
    const t = montar();
    const a = await t.service.criar({ nome: 'A' });
    const b = await t.service.criar({ nome: 'B' });
    await t.service.definirDaEmpresa('E1', [a.id, b.id]);
    expect(await t.service.porEmpresa()).toEqual({ E1: [a.id, b.id] });
    await t.service.definirDaEmpresa('E1', [b.id]);
    expect(await t.service.porEmpresa()).toEqual({ E1: [b.id] });
    await expect(t.service.definirDaEmpresa('E1', ['zz'])).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.service.definirDaEmpresa('ZZ', [])).rejects.toBeInstanceOf(NotFoundException);
  });

  it('excluir a etiqueta tira ela das empresas e a listagem conta quantas empresas usam cada uma', async () => {
    const t = montar();
    const a = await t.service.criar({ nome: 'A' });
    await t.service.aplicar({ tag_id: a.id, empresa_ids: ['E1', 'E3'] });
    expect((await t.service.listar())[0]).toMatchObject({ nome: 'A', empresas: 2 });
    await t.service.excluir(a.id);
    expect(t.ligacoes).toEqual([]);
    await expect(t.service.excluir(a.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TagsService: listas salvas', () => {
  const maria = { id: 'U1', role: 'user' };
  const joao = { id: 'U2', role: 'user' };
  const admin = { id: 'A1', role: 'admin' };

  it('guarda só os critérios que a lista conhece e limpa valores inválidos', () => {
    expect(criteriosDeEmpresas({ busca: ' agro ', carteira: 'bpo', situacao: 'LIXO', tags: ['T1', 'T1', ''], tagModo: 'todas', extra: 'x', grupo: '090' }))
      .toEqual({ busca: 'agro', grupo: '090', carteira: 'bpo', situacao: '', tags: ['T1'], tagModo: 'todas', colaborador: '' });
    expect(criteriosDeEmpresas('lixo')).toEqual({ busca: '', grupo: '', carteira: '', situacao: '', tags: [], tagModo: 'qualquer', colaborador: '' });
    expect(criteriosDeEmpresas({ tags: Array.from({ length: 50 }, (_, i) => `T${i}`) }).tags).toHaveLength(30);
  });

  it('salvar com o mesmo nome atualiza a lista da pessoa em vez de duplicar', async () => {
    const t = montar();
    const um = await t.service.salvarFiltro(maria, { nome: 'Agro do BPO', criterios: { carteira: 'bpo' } });
    expect(um.substituida).toBe(false);
    const dois = await t.service.salvarFiltro(maria, { nome: 'agro do bpo', criterios: { carteira: 'ambas' } });
    expect(dois).toMatchObject({ id: um.id, substituida: true });
    expect(t.filtros).toHaveLength(1);
    expect(t.filtros[0].criterios).toMatchObject({ carteira: 'ambas' });
    await expect(t.service.salvarFiltro(maria, { nome: '' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.salvarFiltro(maria, { nome: 'x', escopo: 'tarefas' })).rejects.toThrow(/Escopo inválido/);
  });

  it('cada pessoa vê as suas listas e as compartilhadas, com o nome de quem criou', async () => {
    const t = montar();
    await t.service.salvarFiltro(maria, { nome: 'Minha' });
    await t.service.salvarFiltro(maria, { nome: 'Da equipe', compartilhado: true });
    await t.service.salvarFiltro(joao, { nome: 'Do João' });
    const dela = await t.service.listarFiltros(maria);
    expect(dela.map((f) => f.nome)).toEqual(['Da equipe', 'Minha']);
    const dele = await t.service.listarFiltros(joao);
    expect(dele.map((f) => f.nome)).toEqual(['Da equipe', 'Do João']);
    expect(dele.find((f) => f.nome === 'Da equipe')).toMatchObject({ meu: false, criado_por: 'Maria' });
    expect(dele.find((f) => f.nome === 'Do João')).toMatchObject({ meu: true, criado_por: 'joao@fal' });
  });

  it('só o dono ou um administrador muda e apaga uma lista', async () => {
    const t = montar();
    const f = await t.service.salvarFiltro(maria, { nome: 'Da equipe', compartilhado: true });
    await expect(t.service.excluirFiltro(joao, f.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(t.service.atualizarFiltro(joao, f.id, { nome: 'X' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(t.service.atualizarFiltro(maria, f.id, { compartilhado: false })).resolves.toMatchObject({ compartilhado: false });
    await expect(t.service.excluirFiltro(admin, f.id)).resolves.toEqual({ excluida: true });
    await expect(t.service.excluirFiltro(maria, f.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
