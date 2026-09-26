import { describe, expect, it } from 'vitest';
import { CFOP_PADRAO, tratamentoEfetivo, tratamentoPadrao } from './cfop.regras';

describe('CFOPs que geram receita', () => {
  it('vendas entram; remessas para depósito, bonificação, outras saídas e transferência não', () => {
    expect(tratamentoPadrao('5102', 'Saida')).toBe('RECEITA');
    expect(tratamentoPadrao('6101', 'Saida')).toBe('RECEITA');
    expect(tratamentoPadrao('7101', 'Saida')).toBe('RECEITA');
    expect(tratamentoPadrao('5905', 'Saida')).toBe('NAO_RECEITA'); // caso do tester: remessa para depósito
    expect(tratamentoPadrao('5910', 'Saida')).toBe('NAO_RECEITA'); // bonificação
    expect(tratamentoPadrao('5949', 'Saida')).toBe('NAO_RECEITA'); // outras saídas
    expect(tratamentoPadrao('5152', 'Saida')).toBe('NAO_RECEITA'); // transferência
    expect(tratamentoPadrao('6202', 'Saida')).toBe('NAO_RECEITA'); // devolução de compra
  });

  it('devolução de venda (entrada) reverte receita; demais entradas são compra', () => {
    expect(tratamentoPadrao('1202', 'Entrada')).toBe('DEVOLUCAO_VENDA');
    expect(tratamentoPadrao('2201', 'Entrada')).toBe('DEVOLUCAO_VENDA');
    expect(tratamentoPadrao('1102', 'Entrada')).toBe('COMPRA');
    expect(tratamentoPadrao('2556', 'Entrada')).toBe('COMPRA');
  });

  it('saída fora da lista fica "não classificado" (usuário decide)', () => {
    expect(tratamentoPadrao('5999', 'Saida')).toBe('NAO_CLASSIFICADO');
  });

  it('o ajuste da empresa vale mais que o padrão; valor inválido é ignorado', () => {
    expect(tratamentoEfetivo('5905', 'Saida', { '5905': 'RECEITA' })).toBe('RECEITA');
    expect(tratamentoEfetivo('5905', 'Saida', { '5905': 'LIXO' })).toBe('NAO_RECEITA');
    expect(tratamentoEfetivo('5.905', 'Saida', null)).toBe('NAO_RECEITA');
  });

  it('sem CFOP duplicado na lista-padrão', () => {
    const codigos = CFOP_PADRAO.map((r) => r.cfop);
    expect(new Set(codigos).size).toBe(codigos.length);
  });
});
