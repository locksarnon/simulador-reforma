/** QA com 30 mil itens: exigeFator só informativo (BAIXO 5) e grupos dos itens de um caso de conjunto (BAIXO 6). */
import { describe, expect, it } from 'vitest';
import { AnalisadorNomesUnidades } from '../motor/nomes-unidades';
import type { ItemTrabalho } from '../tipos';
import { CHAVES_INFORMATIVAS, propostaAplicavel } from './constantes';
import { SanItensService } from './itens.service';
import { criarPrismaFalso } from './prisma-falso';

const trab = (id: string, unidade: string): ItemTrabalho => ({
  id, codigo: id, estabelecimento: null, descricao: `Produto ${id}`, unidade, ncm: null, grupo: null, ativo: true, saldo: null, ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos: {},
});

describe('BAIXO 5: exigeFator não vai para o item', () => {
  it('é chave informativa: a proposta aplicável da conversão não a traz', () => {
    expect(CHAVES_INFORMATIVAS).toContain('exigeFator');
    const r = new AnalisadorNomesUnidades().analisar([trab('a', 'TONELADA'), trab('b', 'TONELADA')], { dataBase: '2026-12-31', atividades: [], erp: null, corteMovimentacao: null });
    const conv = r.casos.find((c) => c.tipo === 'UNIDADE_CONVERSAO')!;
    expect(conv.proposta).toHaveProperty('exigeFator');
    const aplicavel = propostaAplicavel(conv.camada, conv.proposta);
    expect(aplicavel).not.toHaveProperty('exigeFator');
    expect(aplicavel).not.toHaveProperty('fatorSituacao');
    expect(aplicavel).toMatchObject({ fatorConversao: 1000 });
  });
});

describe('BAIXO 6: grupos dos itens de um caso', () => {
  it('conta por grupo (sem grupo incluído), maior primeiro', async () => {
    const { prisma } = criarPrismaFalso({
      sanCaso: [{ id: 'k1', projeto_id: 'P1', itens: ['a', 'b', 'c', 'd'] }],
      sanItem: [
        { id: 'a', projeto_id: 'P1', grupo: 'FERTILIZANTES' }, { id: 'b', projeto_id: 'P1', grupo: 'INSUMOS' }, { id: 'c', projeto_id: 'P1', grupo: 'INSUMOS' },
        { id: 'd', projeto_id: 'P1', grupo: null }, { id: 'e', projeto_id: 'P1', grupo: 'FERTILIZANTES' },
      ],
    });
    const r = await new SanItensService(prisma as never).gruposDoCaso('k1');
    expect(r).toEqual({ total: 4, grupos: [{ grupo: 'INSUMOS', itens: 2 }, { grupo: '(sem grupo)', itens: 1 }, { grupo: 'FERTILIZANTES', itens: 1 }] });
    await expect(new SanItensService(prisma as never).gruposDoCaso('nao')).rejects.toMatchObject({ status: 404 });
  });
});
