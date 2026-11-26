/** O contrato (docs/saneamento-estoques-contrato.md) diz o que o código devolve: `atual` das unidades por conjunto e `inexistentes` da prévia do lote. */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ContextoAnalise, ItemTrabalho } from '../tipos';
import { AnalisadorNomesUnidades } from './index';

const doc = fs.readFileSync(path.resolve(__dirname, '../../../../docs/saneamento-estoques-contrato.md'), 'utf8').replace(/\r\n/g, '\n');
const ctx: ContextoAnalise = { dataBase: '2026-12-31', atividades: [], erp: null, corteMovimentacao: null };
const item = (id: string, unidade: string, campos: Record<string, unknown> = {}): ItemTrabalho => ({
  id, codigo: id, estabelecimento: null, descricao: `SEMENTE MILHO ${id}`, unidade, ncm: null, grupo: null, ativo: true, saldo: null, ultimaMovimentacao: null, fabricante: null, referencia: null, finalidade: null, campos,
});

describe('contrato: atual das unidades por conjunto e inexistentes do lote', () => {
  it('UNIDADE_CONVERSAO em conjunto: atual traz unidade, unidadeCompra e fatorConversao (comum ou "varia por item"), sem código; o contrato diz isso', () => {
    const r = new AnalisadorNomesUnidades().analisar([item('a', 'SACA', { unidadeCompra: 'SC', fatorConversao: 60 }), item('b', 'SACA', { unidadeCompra: 'SC', fatorConversao: 50 })], ctx);
    const conv = r.casos.find((c) => c.tipo === 'UNIDADE_CONVERSAO')!;
    expect(conv.itens).toHaveLength(2);
    expect(conv.atual).toEqual({ unidade: 'SACA', unidadeCompra: 'SC', fatorConversao: 'varia por item' });
    expect(doc).toMatch(/`"varia por item"` quando difere/);
    expect(doc).toMatch(/em `UNIDADE_CONVERSAO`, `atual` traz ainda `unidadeCompra` e `fatorConversao`/);
    expect(doc).not.toMatch(/`atual` traz só `unidade`/);
  });
  it('prévia do lote: o contrato diz que `inexistentes` é número e os ids vão em `excecoes`', () => {
    expect(doc).toMatch(/`inexistentes` é a CONTAGEM \(número\) e os ids estão em `excecoes`/);
  });
});
