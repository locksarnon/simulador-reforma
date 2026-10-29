import { describe, it, expect } from 'vitest';
import { normalizeCnpj, parsePercentage, parseDecimal, originalValue, validateAccessKey, validateCnpj, validateCpf, validateDocumento, sha256, anoNoBrasil, icmsEfetivoNfe, parseDataEmissao } from './xml-utils';

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

describe('validateCpf / validateDocumento (produtor rural pessoa física)', () => {
  it('aceita CPF válido, com ou sem formatação', () => {
    expect(validateCpf('529.982.247-25').valido).toBe(true);
    expect(validateCpf('52998224725').valido).toBe(true);
  });

  it('rejeita CPF com dígito errado ou repetido', () => {
    expect(validateCpf('52998224726').codigo).toBe('DOC_CPF_DV_INVALIDO');
    expect(validateCpf('11111111111').valido).toBe(false);
  });

  it('CPF NÃO é validado como CNPJ (bug: vendas a PF ficavam bloqueadas)', () => {
    expect(validateCnpj('52998224725').valido).toBe(false);
    const r = validateDocumento('52998224725');
    expect(r.valido).toBe(true);
    expect(r.tipo).toBe('CPF');
  });

  it('CNPJ continua sendo validado como CNPJ', () => {
    expect(validateDocumento('11222333000181')).toMatchObject({ valido: true, tipo: 'CNPJ' });
    expect(validateDocumento('11222333000180')).toMatchObject({ valido: false, codigo: 'DOC_CNPJ_DV_INVALIDO' });
  });
});

describe('anoNoBrasil', () => {
  it('31/12 às 22h30 em Brasília (01h30 de 1º/1 em UTC) ainda é o ano que termina', () => {
    expect(anoNoBrasil(new Date('2026-12-31T22:30:00-03:00'))).toBe(2026);
    expect(anoNoBrasil(new Date('2027-01-01T01:30:00Z'))).toBe(2026);
  });

  it('a partir da meia-noite de Brasília já é o ano novo', () => {
    expect(anoNoBrasil(new Date('2027-01-01T00:00:00-03:00'))).toBe(2027);
    expect(anoNoBrasil(new Date('2027-01-01T03:00:00Z'))).toBe(2027);
  });

  it('data comum não muda', () => {
    expect(anoNoBrasil(new Date('2027-06-15T12:00:00Z'))).toBe(2027);
  });
});

describe('icmsEfetivoNfe', () => {
  it('base cheia: vICMS ÷ valor da linha é a própria alíquota (17% de R$ 1.000 = R$ 170)', () => {
    expect(icmsEfetivoNfe('17.0000', '170.00', '', 1000)).toBeCloseTo(0.17, 10);
  });

  it('redução de base (CST 20): pICMS 17% sobre 40% da base dá 6,8%, não 17%', () => {
    // vBC = 1000 × (1 − 60%) = 400; vICMS = 400 × 17% = 68
    expect(icmsEfetivoNfe('17.0000', '68.00', '60.0000', 1000)).toBeCloseTo(0.068, 10);
  });

  it('sem vICMS no XML, aplica a redução de base à alíquota nominal', () => {
    expect(icmsEfetivoNfe('17.0000', '', '60.0000', 1000)).toBeCloseTo(0.068, 10);
    expect(icmsEfetivoNfe('18', undefined, '', 1000)).toBeCloseTo(0.18, 10);
  });

  it('diferimento total (CST 51): vICMS zero é ICMS zero', () => {
    expect(icmsEfetivoNfe('18.0000', '0.00', '', 1000)).toBe(0);
  });

  it('sem pICMS (isento, Simples, ST anterior) não há o que calcular', () => {
    expect(icmsEfetivoNfe('', '0.00', '', 1000)).toBeNull();
    expect(icmsEfetivoNfe(null, null, null, 1000)).toBeNull();
  });

  it('valor da linha zero ou vICMS impossível volta para a alíquota nominal com a redução', () => {
    expect(icmsEfetivoNfe('18.0000', '50.00', '', 0)).toBeCloseTo(0.18, 10);
    expect(icmsEfetivoNfe('18.0000', '5000.00', '', 1000)).toBeCloseTo(0.18, 10); // maior que o valor da linha
  });
});

describe('parseDataEmissao', () => {
  it('com fuso, o instante é o do documento', () => {
    expect(parseDataEmissao('2026-12-31T22:30:00-03:00')?.toISOString()).toBe('2027-01-01T01:30:00.000Z');
    expect(parseDataEmissao('2027-01-15T10:00:00Z')?.toISOString()).toBe('2027-01-15T10:00:00.000Z');
  });

  it('a data sozinha (leiaute antigo) é a meia-noite de Brasília: 01/01/2027 é de 2027, não de 2026 como em UTC', () => {
    expect(parseDataEmissao('2027-01-01')?.toISOString()).toBe('2027-01-01T03:00:00.000Z');
    expect(anoNoBrasil(parseDataEmissao('2027-01-01') as Date)).toBe(2027);
    expect(anoNoBrasil(parseDataEmissao('2026-12-31') as Date)).toBe(2026);
  });

  it('data e hora sem fuso valem a hora de Brasília', () => {
    expect(anoNoBrasil(parseDataEmissao('2027-01-01T00:30:00') as Date)).toBe(2027);
    expect(anoNoBrasil(parseDataEmissao('2026-12-31T23:59:59') as Date)).toBe(2026);
    expect(parseDataEmissao('2027-03-10T08:00:00.500')?.toISOString()).toBe('2027-03-10T11:00:00.500Z');
  });

  it('vazio, nulo ou texto sem data devolve null', () => {
    expect(parseDataEmissao('')).toBeNull();
    expect(parseDataEmissao(null)).toBeNull();
    expect(parseDataEmissao('ontem')).toBeNull();
    expect(parseDataEmissao('2027-13-45')).toBeNull();
  });
});

describe('icmsEfetivoNfe: arredondamento em centavos e FCP', () => {
  it('linha pequena: vICMS arredondado em centavos não vira 18,18% (R$ 0,99 com ICMS de R$ 0,18 é 18%)', () => {
    expect(icmsEfetivoNfe('18.0000', '0.18', '', 0.99)).toBeCloseTo(0.18, 10);
    expect(icmsEfetivoNfe('18.0000', '0.01', '', 0.03)).toBeCloseTo(0.18, 10);
  });

  it('diferimento ou base diferente continuam valendo mesmo em valor pequeno', () => {
    expect(icmsEfetivoNfe('18.0000', '0.00', '', 100)).toBe(0); // diferido
    expect(icmsEfetivoNfe('18.0000', '12.00', '', 100)).toBeCloseTo(0.12, 10); // vICMS 12 sobre R$ 100: base e alíquota combinam diferente
  });

  it('o FCP segue a mesma regra do ICMS: pFCP 2% com redução de base de 60% e vFCP de R$ 8 sobre R$ 1.000 é 0,8%', () => {
    expect(icmsEfetivoNfe('2.0000', '8.00', '60.0000', 1000)).toBeCloseTo(0.008, 10);
    expect(icmsEfetivoNfe('2.0000', '', '60.0000', 1000)).toBeCloseTo(0.008, 10);
    expect(icmsEfetivoNfe('', '8.00', '60.0000', 1000)).toBeNull();
  });
});
