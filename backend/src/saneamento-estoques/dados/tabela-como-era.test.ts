import { describe, expect, it } from 'vitest';
import { SanImportacaoService } from './importacao.service';
import { ImportadorPlanilha } from './importador.provider';
import { CAMPOS_PAREADOS, lerExtras, SanItensService } from './itens.service';
import { criarPrismaFalso } from './prisma-falso';
import { SanProjetoService } from './projeto.service';

const USER = { email: 'consultor@fal.test' };
const CSV = [
  'Código;Descrição;Unidade;NCM;Grupo;Saldo;Cor;Peso bruto',
  'A1;ADUBO NPK;SC;31051000;Adubos;10;Azul;50',
  'A2;ADUBO UREIA;SC;31021000;Adubos;5;;25',
].join('\n');

async function pronto() {
  const { prisma, db } = criarPrismaFalso({
    projetoDiagnostico: [{ id: 'D1', servico_consultoria: 'saneamento-estoques', empresa_ids: ['E1'], periodo_inicio: new Date('2026-12-31T00:00:00Z') }],
    empresa: [{ id: 'E1', cnae_principal: '4683400', cnaes_secundarios: [] }],
  });
  const projetos = new SanProjetoService(prisma as never);
  const importacao = new SanImportacaoService(prisma as never, projetos, new ImportadorPlanilha());
  const itens = new SanItensService(prisma as never);
  const p = await projetos.criar('D1', USER);
  await importacao.confirmar(p.id, { buffer: Buffer.from(CSV), nome: 'cad.csv' }, undefined, [], USER);
  return { db, itens, projetoId: p.id };
}

describe('Tabela: como era × como ficou', () => {
  it('a lista devolve o par original × atual dos campos fundamentais com valor, sem o JSON inteiro do item', async () => {
    const c = await pronto();
    // Decisão aplicada: a unidade de A1 mudou na base de trabalho; o original não muda.
    const a1 = c.db.sanItem.find((i) => i.codigo === 'A1')!;
    a1.trabalho = { ...(a1.trabalho as object), unidade: 'KG' };
    const l = await c.itens.listar(c.projetoId, { limite: 10 });
    const item = l.itens.find((i) => i.codigo === 'A1')! as Record<string, unknown>;
    expect(item.como).toMatchObject({ unidade: ['SC', 'KG'], ncm: ['31051000', '31051000'], grupo: ['Adubos', 'Adubos'], saldo: [10, 10], descricao: ['ADUBO NPK', 'ADUBO NPK'] });
    // Campo sem valor em nenhum dos dois não vem (resposta compacta).
    expect(item.como).not.toHaveProperty('fabricante');
    expect(item).not.toHaveProperty('original');
    expect(item).not.toHaveProperty('trabalho');
    // Sem extras pedidos, nenhum extra vem.
    expect(item).not.toHaveProperty('extras');
  });

  it('só devolve as colunas extras pedidas', async () => {
    const c = await pronto();
    const l = await c.itens.listar(c.projetoId, { limite: 10, extras: JSON.stringify(['Cor']) });
    const por = Object.fromEntries(l.itens.map((i) => [i.codigo, (i as Record<string, unknown>).extras]));
    expect(por.A1).toEqual({ Cor: ['Azul', 'Azul'] });
    expect(por.A2).toEqual({}); // sem valor de Cor; Peso bruto não foi pedido
  });

  it('recusa extras fora do formato', () => {
    expect(() => lerExtras('não é json')).toThrow();
    expect(() => lerExtras(JSON.stringify([1, 2]))).toThrow();
    expect(() => lerExtras(JSON.stringify(['__proto__']))).toThrow();
    expect(lerExtras(undefined)).toEqual([]);
    expect(lerExtras(JSON.stringify(['Cor', 'Cor']))).toEqual(['Cor']);
  });

  it('colunas: fundamentais importados na ordem do catálogo e os extras do ERP para escolher', async () => {
    const c = await pronto();
    const r = await c.itens.colunas(c.projetoId);
    expect(r.fundamentais.map((f) => f.campo)).toEqual(['descricao', 'unidade', 'ncm', 'grupo', 'saldo']);
    expect(r.fundamentais.find((f) => f.campo === 'ncm')!.rotulo).toBe('NCM');
    expect(r.extras).toEqual(['Cor', 'Peso bruto']);
    // O catálogo da importação define os pares (código e estabelecimento ficam de fora: são a chave do item).
    expect(CAMPOS_PAREADOS).not.toContain('codigo');
    expect(CAMPOS_PAREADOS).toContain('ultimaMovimentacao');
    expect(CAMPOS_PAREADOS).toContain('subgrupo');
  });
});
