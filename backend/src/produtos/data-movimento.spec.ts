import { describe, expect, it } from 'vitest';
import { corteValido, lerDataMovimento } from './data-movimento';

const HOJE = new Date(Date.UTC(2026, 9, 16)); // 2026-10-16

describe('lerDataMovimento', () => {
  it.each([
    ['2025-03-07', '2025-03-07'],
    ['2025-03-07T14:30:00', '2025-03-07'],
    ['07/03/2025', '2025-03-07'],
    ['7/3/2025', '2025-03-07'],
    ['07-03-2025', '2025-03-07'],
    ['07.03.2025', '2025-03-07'],
    ['2025/03/07', '2025-03-07'],
    ['20250307', '2025-03-07'], // Protheus, tabela crua
    ['07032025', '2025-03-07'], // DDMMAAAA
    ['07/03/2025 10:15', '2025-03-07'],
  ])('lê %s', (entrada, esperado) => {
    expect(lerDataMovimento(entrada, HOJE)).toEqual({ data: esperado, invalida: false });
  });

  it.each(['', '   ', '00000000', '0000-00-00', '  /  /    ', '00/00/0000'])('trata %j como vazia (não inválida)', (entrada) => {
    expect(lerDataMovimento(entrada, HOJE)).toEqual({ data: null, invalida: false });
  });

  it.each([
    ['31/02/2025', 'dia que não existe'],
    ['2025-13-01', 'mês 13'],
    ['03/25/2025', 'formato americano com dia > 12: sinaliza, não adivinha'],
    ['07/03/25', 'ano de 2 dígitos não é aceito'],
    ['ontem', 'texto'],
    ['2031-01-01', 'data no futuro'],
    ['1985-01-01', 'antes de 1990'],
  ])('marca %s como inválida (%s)', (entrada) => {
    expect(lerDataMovimento(entrada, HOJE)).toEqual({ data: null, invalida: true });
  });

  it('aceita hoje e amanhã (fuso), recusa depois disso', () => {
    expect(lerDataMovimento('2026-10-16', HOJE).data).toBe('2026-10-16');
    expect(lerDataMovimento('2026-10-17', HOJE).data).toBe('2026-10-17');
    expect(lerDataMovimento('2026-10-18', HOJE).invalida).toBe(true);
  });
});

describe('corteValido', () => {
  it('só aceita AAAA-MM-DD real', () => {
    expect(corteValido('2025-10-16', HOJE)).toBe('2025-10-16');
    expect(corteValido('16/10/2025', HOJE)).toBeNull();
    expect(corteValido('2025-02-30', HOJE)).toBeNull();
    expect(corteValido(undefined, HOJE)).toBeNull();
  });
});
