import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { calcularHonorarioMensal, TABELA_EXEMPLO, validarTabela } from './honorarios';
import { normalizarItens, PropostasService, totais } from './propostas.service';

function montar() {
  const propostas: Record<string, unknown>[] = [];
  const servicos: Record<string, unknown>[] = [];
  const parametros = new Map<string, { chave: string; valor: string }>();
  let seq = 0;
  const prisma = {
    parametroSistema: {
      findUnique: async ({ where }: { where: { chave: string } }) => parametros.get(where.chave) ?? null,
      upsert: async ({ where, create, update }: { where: { chave: string }; create: { chave: string; valor: string }; update: { valor: string } }) => { parametros.set(where.chave, parametros.has(where.chave) ? { ...parametros.get(where.chave)!, ...update } : create); },
    },
    empresa: { count: async ({ where }: { where: { id: string } }) => (where.id === 'E1' ? 1 : 0) },
    proposta: {
      create: async ({ data }: { data: Record<string, unknown> }) => { const p = { id: `P${++seq}`, numero: seq, status: 'RASCUNHO', createdAt: new Date(), updatedAt: new Date(), calculo: null, ...data }; propostas.push(p); return p; },
      findUnique: async ({ where }: { where: { id: string } }) => propostas.find((p) => p.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(propostas.find((p) => p.id === where.id)!, data),
      delete: async ({ where }: { where: { id: string } }) => { propostas.splice(propostas.findIndex((p) => p.id === where.id), 1); },
      findMany: async () => propostas,
    },
    servicoContratado: {
      findFirst: async ({ where }: { where: { empresa_id: string; tipo: string } }) => servicos.find((s) => s.empresa_id === where.empresa_id && s.tipo === where.tipo) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(servicos.find((s) => s.id === where.id)!, data),
      create: async ({ data }: { data: Record<string, unknown> }) => { const s = { id: `S${++seq}`, ...data }; servicos.push(s); return s; },
    },
  };
  return { service: new PropostasService(prisma as never), propostas, servicos };
}

const maria = { id: 'U1', email: 'maria@fal', role: 'user' };
const itensBpo = [{ descricao: 'BPO fiscal mensal', quantidade: 1, valor_unitario: 2500, recorrente: true }, { descricao: 'Implantação', quantidade: 1, valor_unitario: 3000 }];

describe('honorários', () => {
  it('soma base do regime, notas acima da franquia, estabelecimentos e módulos, e aplica a complexidade', () => {
    const r = calcularHonorarioMensal(TABELA_EXEMPLO, { regime: 'Lucro Presumido', notas_mes: 500, estabelecimentos: 3, modulos: ['XML', 'OBRIGACOES'], complexidade: 'ALTA' });
    // 1800 + 200 × 1,5 + 2 × 400 + 250 + 300 = 3450 × 1,35 = 4657,50
    expect(r.total).toBe(4657.5);
    expect(r.parcelas.map((p) => p.valor)).toEqual([1800, 300, 800, 550]);
    expect(calcularHonorarioMensal(TABELA_EXEMPLO, { regime: 'Simples Nacional', notas_mes: 100 }).total).toBe(900);
  });
  it('a tabela salva é limpa: números negativos viram zero e complexidade zerada volta a 1', () => {
    const t = validarTabela({ base: { 'Lucro Real': -10, 'Simples Nacional': 700 }, por_nota: 'x', complexidade: { ALTA: 0 }, extra: 1 });
    expect(t.base['Lucro Real']).toBe(0);
    expect(t.base['Simples Nacional']).toBe(700);
    expect(t.por_nota).toBe(0);
    expect(t.complexidade.ALTA).toBe(1);
    expect(t).not.toHaveProperty('extra');
  });
  it('itens e totais: mensal (recorrente) e valor único', () => {
    expect(totais(normalizarItens(itensBpo))).toEqual({ mensal: 2500, unico: 3000 });
    expect(() => normalizarItens([{ descricao: '', quantidade: 1, valor_unitario: 1 }])).toThrow(/sem descrição/);
    expect(() => normalizarItens([{ descricao: 'X', quantidade: 0, valor_unitario: 1 }])).toThrow(/Quantidade/);
    expect(() => normalizarItens('x')).toThrow(BadRequestException);
  });
});

describe('PropostasService', () => {
  it('tabela: sem nada salvo usa o exemplo (marcado); salvo, usa a do escritório', async () => {
    const t = montar();
    expect((await t.service.tabela()).exemplo).toBe(true);
    await t.service.salvarTabela({ ...TABELA_EXEMPLO, base: { ...TABELA_EXEMPLO.base, 'Lucro Real': 5000 } });
    const salva = await t.service.tabela();
    expect(salva.exemplo).toBe(false);
    expect(salva.base['Lucro Real']).toBe(5000);
  });

  it('cria com cliente, serviço e itens; recusa serviço inválido, e-mail inválido e proposta sem itens', async () => {
    const t = montar();
    const p = await t.service.criar(maria, { cliente_nome: 'EXTRA AGRO LTDA', empresa_id: 'E1', servico: 'BPO_FISCAL', itens: itensBpo, cliente_email: 'fiscal@extra.agro' });
    expect(p).toMatchObject({ honorario_mensal: 2500, valor_total: 3000, criado_por: 'U1' });
    await expect(t.service.criar(maria, { cliente_nome: 'X', servico: 'CONTABIL', itens: itensBpo })).rejects.toThrow(/Serviço inválido/);
    await expect(t.service.criar(maria, { cliente_nome: 'X', servico: 'OUTRO', itens: itensBpo, cliente_email: 'sem-arroba' })).rejects.toThrow(/E-mail/);
    await expect(t.service.criar(maria, { cliente_nome: 'X', servico: 'OUTRO', itens: [] })).rejects.toThrow(/pelo menos um item/);
  });

  it('aceitar liga o serviço contratado da empresa; aceita não muda nem se exclui; duplicar volta a rascunho', async () => {
    const t = montar();
    const p = await t.service.criar(maria, { cliente_nome: 'EXTRA AGRO LTDA', empresa_id: 'E1', servico: 'BPO_FISCAL', itens: itensBpo });
    const r = await t.service.mudarStatus(maria, p.id as string, 'ACEITA');
    expect(r.servico_ativado).toBe('BPO_FISCAL');
    expect(t.servicos).toEqual([expect.objectContaining({ empresa_id: 'E1', tipo: 'BPO_FISCAL', situacao: 'ATIVO' })]);
    await expect(t.service.atualizar(p.id as string, { observacoes: 'x' })).rejects.toBeInstanceOf(ConflictException);
    await expect(t.service.excluir({ id: 'A1', role: 'admin' }, p.id as string)).rejects.toBeInstanceOf(ConflictException);
    const copia = await t.service.duplicar(maria, p.id as string);
    expect(copia).toMatchObject({ status: 'RASCUNHO', cliente_nome: 'EXTRA AGRO LTDA' });
    await expect(t.service.mudarStatus(maria, p.id as string, 'PERDIDA')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('excluir: quem criou ou administrador', async () => {
    const t = montar();
    const p = await t.service.criar(maria, { cliente_nome: 'X', servico: 'OUTRO', itens: itensBpo });
    await expect(t.service.excluir({ id: 'U2', role: 'user' }, p.id as string)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(t.service.excluir(maria, p.id as string)).resolves.toEqual({ excluida: true });
  });
});
