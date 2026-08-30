import { describe, it, expect } from 'vitest';
import { normalizeCnpj, parsePercentage, parseDecimal, originalValue, validateAccessKey, validateCnpj, sha256 } from './xml-utils';

// Chave real, gerada e validada manualmente na simulação de uso de
// 2026-08-29 (mesma chave do XML de teste que passou pelo pipeline completo
// de importação: upload → parse → confirmação → Operação criada).
const CHAVE_VALIDA = '35260111222333000181550010000000011123456781';

describe('normalizeCnpj', () => {
  it('remove formatação e preenche com zeros à esquerda', () => {
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizeCnpj('123')).toBe('00000000000123');
  });

  it('retorna string vazia para valor ausente', () => {
    expect(normalizeCnpj(null)).toBe('');
    expect(normalizeCnpj(undefined)).toBe('');
  });
});

describe('validateCnpj', () => {
  it('aceita CNPJ com dígito verificador correto, formatado ou não', () => {
    expect(validateCnpj('11.222.333/0001-81').valido).toBe(true);
    expect(validateCnpj('11222333000181').valido).toBe(true);
    // CNPJ real usado no teste de importação de XML em massa (2026-08-30) —
    // achado real: a raiz 36940852 aparece com duas filiais (000297/000106).
    expect(validateCnpj('36940852000297').valido).toBe(true);
  });

  it('rejeita dígito verificador incorreto — achado real do teste de importação de 2026-08-30', () => {
    // Mesma base do CNPJ válido acima, só trocando o último dígito.
    const r = validateCnpj('11222333000180');
    expect(r.valido).toBe(false);
    expect(r.codigo).toBe('DOC_CNPJ_DV_INVALIDO');
  });

  it('rejeita CNPJ com todos os dígitos iguais', () => {
    expect(validateCnpj('11111111111111').valido).toBe(false);
    expect(validateCnpj('00000000000000').valido).toBe(false);
  });

  it('rejeita formato com número errado de dígitos', () => {
    const r = validateCnpj('123');
    expect(r.valido).toBe(false);
    // normalizeCnpj preenche com zeros à esquerda até 14 dígitos — vira
    // "00000000000123", que cai na regra de "todos iguais" só se for zero;
    // aqui o DV é que falha.
    expect(r.codigo).toBe('DOC_CNPJ_DV_INVALIDO');
  });

  it('rejeita CNPJ ausente', () => {
    const r = validateCnpj('');
    expect(r.valido).toBe(false);
    expect(r.codigo).toBe('DOC_CNPJ_AUSENTE');
  });
});

describe('parsePercentage', () => {
  it('converte percentual nominal do XML para fração decimal', () => {
    expect(parsePercentage('19.0000')).toBeCloseTo(0.19);
    expect(parsePercentage('1,65')).toBeCloseTo(0.0165); // vírgula decimal (pt-BR)
    expect(parsePercentage('7.6')).toBeCloseTo(0.076);
  });

  it('rejeita valores fora do intervalo [0,1] após a divisão por 100', () => {
    // 150% > 100% não é uma alíquota válida — contrato explícito do motor.
    expect(parsePercentage('150')).toBeNull();
    expect(parsePercentage('-5')).toBeNull();
  });

  it('retorna null para entradas vazias ou não numéricas', () => {
    expect(parsePercentage('')).toBeNull();
    expect(parsePercentage(null)).toBeNull();
    expect(parsePercentage('abc')).toBeNull();
  });
});

describe('parseDecimal', () => {
  it('NÃO divide por 100 — usado para overrides já normalizados', () => {
    expect(parseDecimal('0.19')).toBeCloseTo(0.19);
  });

  it('rejeita fora de [0,1]', () => {
    expect(parseDecimal('1.5')).toBeNull();
  });
});

describe('originalValue', () => {
  it('preserva o valor original como string, mesmo "0"', () => {
    expect(originalValue(0)).toBe('0');
    expect(originalValue('19.0000')).toBe('19.0000');
    expect(originalValue(null)).toBe('');
    expect(originalValue(undefined)).toBe('');
  });
});

describe('validateAccessKey', () => {
  it('aceita uma chave de 44 dígitos com dígito verificador (módulo 11) correto', () => {
    const r = validateAccessKey(CHAVE_VALIDA);
    expect(r.valido).toBe(true);
    expect(r.partes?.uf).toBe('35');
    expect(r.partes?.cnpj).toBe('11222333000181');
  });

  it('rejeita chave com dígito verificador incorreto', () => {
    const chaveComDvErrado = CHAVE_VALIDA.slice(0, 43) + '0';
    const r = validateAccessKey(chaveComDvErrado);
    expect(r.valido).toBe(false);
    expect(r.codigo).toBe('DOC_CHAVE_DV_INVALIDO');
  });

  it('rejeita chave com tamanho diferente de 44 dígitos', () => {
    expect(validateAccessKey('123').valido).toBe(false);
    expect(validateAccessKey('123').codigo).toBe('DOC_CHAVE_FORMATO_INVALIDO');
  });

  it('rejeita chave ausente', () => {
    expect(validateAccessKey('').valido).toBe(false);
    expect(validateAccessKey(undefined as unknown as string).valido).toBe(false);
  });

  it('detecta CNPJ do XML divergente do embutido na própria chave', () => {
    const r = validateAccessKey(CHAVE_VALIDA, { cnpjEmitente: '99999999000199' });
    expect(r.valido).toBe(false);
    expect(r.codigo).toBe('DOC_CHAVE_DIVERGENTE_XML');
  });

  it('aceita quando o CNPJ do XML bate com o da chave', () => {
    const r = validateAccessKey(CHAVE_VALIDA, { cnpjEmitente: '11222333000181' });
    expect(r.valido).toBe(true);
  });
});

describe('sha256', () => {
  it('é determinístico — o mesmo conteúdo sempre gera o mesmo hash (base da dedup por arquivo)', () => {
    const a = sha256('<nfe>conteudo</nfe>');
    const b = sha256('<nfe>conteudo</nfe>');
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // hex de SHA-256
  });

  it('conteúdos diferentes geram hashes diferentes', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});
