import { describe, expect, it } from 'vitest';
import { chaveDe, normasCitadas, referenciaDe, urlOficialValida } from './base-legal.deteccao';

describe('detecção de normas e URLs', () => {
  it('reconhece citações em formatos diferentes e normaliza', () => {
    const t = 'A Lei Complementar nº 235/2026 e o Decreto 12.955/2026 mudam a LC 214/2025; veja a Resolução CGIBS nº 13/2026 e o Ato Conjunto RFB/CGIBS nº 6/2026.';
    expect(normasCitadas(t).map((n) => n.referencia)).toEqual(['lc 235/2026', 'decreto 12955/2026', 'lc 214/2025', 'resolução cgibs 13/2026', 'ato conjunto rfb/cgibs 6/2026']);
  });

  it('não confunde números soltos', () => {
    expect(normasCitadas('o percentual de 20/2026 do total e 3/4 da receita')).toEqual([]);
  });

  it('a referência cadastrada bate com a citada', () => {
    expect(referenciaDe('Decreto 12.955/2026')).toBe('decreto 12955/2026');
    expect(referenciaDe('LC 227/2026')).toBe('lc 227/2026');
  });

  it('gera chave segura', () => {
    expect(chaveDe('resolução cgibs 13/2026')).toBe('resolucao-cgibs-13-2026');
  });

  it('só aceita https em sites oficiais', () => {
    expect(urlOficialValida('https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp235.htm')).toBe(true);
    expect(urlOficialValida('https://www.cgibs.gov.br/resolucoes')).toBe(true);
    expect(urlOficialValida('http://www.planalto.gov.br/x')).toBe(false);
    expect(urlOficialValida('https://evil.com/planalto.gov.br')).toBe(false);
    expect(urlOficialValida('https://planalto.gov.br.evil.com/x')).toBe(false);
    expect(urlOficialValida('https://user:pw@www.planalto.gov.br/x')).toBe(false);
    expect(urlOficialValida('https://169.254.169.254/latest')).toBe(false);
    expect(urlOficialValida('https://localhost:3003/')).toBe(false);
  });
});
