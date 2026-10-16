import { describe, expect, it } from 'vitest';
import { chavePlano, montarPlanoContas } from './plano-contas';

describe('montarPlanoContas', () => {
  it('lê de-para por cClassTrib e por grupo sugerido, com nome da conta', () => {
    const p = montarPlanoContas('plano.csv', ['cClassTrib', 'Conta contábil', 'Nome da conta'], [
      ['200003', '3.1.01', 'Receita alimentos (alíquota zero)'], ['000001', '3.1.02', 'Receita tributada'], ['Tributação integral', '3.1.09', ''],
    ]);
    expect(p.regras['200003']).toBe('3.1.01 — Receita alimentos (alíquota zero)');
    expect(p.regras['000001']).toBe('3.1.02 — Receita tributada');
    expect(p.regras[chavePlano('Tributação integral')]).toBe('3.1.09');
    expect(p.linhas).toBe(3);
  });
  it('recusa plano sem as colunas esperadas, linha incompleta e chave com contas diferentes', () => {
    expect(() => montarPlanoContas('x', ['A', 'B'], [['1', '2']])).toThrow('colunas do de-para');
    expect(() => montarPlanoContas('x', ['cClassTrib', 'Conta'], [['200003', '']])).toThrow('incompleta');
    expect(() => montarPlanoContas('x', ['cClassTrib', 'Conta'], [['200003', '1'], ['200003', '2']])).toThrow('conta diferente');
    expect(() => montarPlanoContas('x', ['cClassTrib', 'Conta'], [])).toThrow('nenhuma regra');
  });
  it('ignora linhas totalmente vazias', () => {
    expect(montarPlanoContas('x', ['cClassTrib', 'Conta'], [['', ''], ['000001', '1.1']]).linhas).toBe(1);
  });
});
