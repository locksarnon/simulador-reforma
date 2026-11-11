import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { largurasCode128C, modulosCode128C } from './code128';

// Os resultados de referência vêm da biblioteca jsbarcode 3.11.6 (formato CODE128C), usada só para gerar estes números.
const CHAVE = '51261112345678000195550010000001231000000010';
const MODULOS_CURTO = '110100111001100110110011101101110110100011101100011101011';
const MODULOS_CHAVE =
  '1101001110011011101000111001001101100010010010110011100100010110001110001011011000010100110110011001100110110010111101000111010001101101100110011001000100110110011001101100110011001101100111011011101100100010011011001100110110011001101100110011001000100110110001101100011101011';
const TODOS_OS_PARES = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0')).join('');

describe('Code 128C', () => {
  it('gera os mesmos módulos da biblioteca de referência, para um valor curto e para uma chave de acesso de 44 dígitos', () => {
    expect(modulosCode128C('0123')).toBe(MODULOS_CURTO);
    expect(modulosCode128C(CHAVE)).toBe(MODULOS_CHAVE);
  });

  it('cobre os 100 pares de dígitos (00 a 99) sem diferença para a referência', () => {
    const modulos = modulosCode128C(TODOS_OS_PARES);
    expect(modulos).toHaveLength(1135);
    expect(createHash('sha256').update(modulos).digest('hex')).toBe('3acc38907c6c8ff4483affa4fd3ade936ce6203fd57986931ef82d6b820c7e6f');
  });

  it('a chave de 44 dígitos ocupa 277 módulos: início, 22 pares, dígito verificador (11 cada) e parada (13)', () => {
    const larguras = largurasCode128C(CHAVE);
    expect(larguras.reduce((a, b) => a + b, 0)).toBe(11 * 24 + 13);
    expect(larguras).toHaveLength(6 * 24 + 7);
    expect(modulosCode128C(CHAVE)).toHaveLength(277);
  });

  it('recusa o que não é número ou vem em quantidade ímpar', () => {
    expect(() => largurasCode128C('123')).toThrow(/quantidade par/);
    expect(() => largurasCode128C('12a4')).toThrow(/só dígitos/);
    expect(() => largurasCode128C('')).toThrow();
  });
});
