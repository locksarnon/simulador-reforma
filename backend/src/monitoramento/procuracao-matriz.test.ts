import { describe, it, expect } from 'vitest';
import { interpretar } from './interpretar';

describe('procuração', () => {
  it('o próprio escritório não precisa de procuração', () => {
    expect(interpretar('PROCURACOES', 'OBTERPROCURACAO41', { proprio_escritorio: true }, [], '').nivel).toBe('OK');
  });
  it('sem procuração explica onde outorgar', () => {
    const r = interpretar('PROCURACOES', 'OBTERPROCURACAO41', [], [], '');
    expect(r.nivel).toBe('CRITICO');
    expect(r.titulo).toContain('CNPJ do escritório');
  });
});
