import { describe, it, expect } from 'vitest';
import { estaVigente, escolherVigente, agruparPorCodigo } from './vigencia';

describe('estaVigente', () => {
  it('sem vigencia_inicio nem vigencia_fim, é sempre vigente', () => {
    expect(estaVigente({}, new Date('2026-01-01'))).toBe(true);
  });

  it('data antes do início não é vigente', () => {
    const row = { vigencia_inicio: '2027-01-01' };
    expect(estaVigente(row, new Date('2026-06-01'))).toBe(false);
  });

  it('data depois do fim não é vigente', () => {
    const row = { vigencia_fim: '2026-12-31' };
    expect(estaVigente(row, new Date('2027-01-01'))).toBe(false);
  });

  it('data dentro do intervalo é vigente', () => {
    const row = { vigencia_inicio: '2026-01-01', vigencia_fim: '2026-12-31' };
    expect(estaVigente(row, new Date('2026-06-15'))).toBe(true);
  });

  it('vigencia_fim nulo = vigente até hoje sem previsão de fim', () => {
    const row = { vigencia_inicio: '2026-01-01', vigencia_fim: null };
    expect(estaVigente(row, new Date('2030-01-01'))).toBe(true);
  });
});

describe('escolherVigente', () => {
  it('quando há duas versões do mesmo código, escolhe a vigente na data (não a primeira que existir)', () => {
    const antiga = { codigo: 'X', vigencia_inicio: '2026-01-01', vigencia_fim: '2026-12-31', versao: 'antiga' };
    const nova = { codigo: 'X', vigencia_inicio: '2027-01-01', vigencia_fim: null, versao: 'nova' };
    const emVigor2026 = escolherVigente([antiga, nova], new Date('2026-06-01'));
    const emVigor2027 = escolherVigente([antiga, nova], new Date('2027-06-01'));
    expect(emVigor2026?.versao).toBe('antiga');
    expect(emVigor2027?.versao).toBe('nova');
  });

  it('retorna undefined quando nenhuma versão estava vigente na data (ex: regra revogada antes, nova ainda não começou)', () => {
    const antiga = { vigencia_fim: '2025-12-31' };
    const nova = { vigencia_inicio: '2027-01-01' };
    expect(escolherVigente([antiga, nova], new Date('2026-06-01'))).toBeUndefined();
  });

  it('entre duas vigentes na mesma data, prefere a de vigencia_inicio mais recente', () => {
    const geral = { vigencia_inicio: '2020-01-01', versao: 'geral' };
    const excecaoRecente = { vigencia_inicio: '2026-01-01', versao: 'excecao' };
    const r = escolherVigente([geral, excecaoRecente], new Date('2026-06-01'));
    expect(r?.versao).toBe('excecao');
  });

  it('lista vazia retorna undefined', () => {
    expect(escolherVigente([], new Date())).toBeUndefined();
  });
});

describe('agruparPorCodigo', () => {
  it('agrupa múltiplas linhas com o mesmo código na mesma chave', () => {
    const rows = [{ c: 'A', v: 1 }, { c: 'B', v: 2 }, { c: 'A', v: 3 }];
    const grouped = agruparPorCodigo(rows, (r) => r.c);
    expect(grouped.get('A')).toHaveLength(2);
    expect(grouped.get('B')).toHaveLength(1);
  });
});
