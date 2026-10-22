import { describe, expect, it } from 'vitest';
import { validarEstado } from './saneamento.service';

describe('estado do projeto de saneamento', () => {
  it('aceita objeto e rejeita o resto', () => {
    expect(JSON.parse(validarEstado({ a: 1 }))).toEqual({ a: 1 });
    for (const ruim of [null, [], 'x', 3, undefined]) expect(() => validarEstado(ruim)).toThrow();
  });
  it('rejeita estado gigante', () => {
    expect(() => validarEstado({ x: 'a'.repeat(9 * 1024 * 1024) })).toThrow('limite');
  });
});
