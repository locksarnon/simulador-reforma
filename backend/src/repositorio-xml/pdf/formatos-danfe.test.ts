import { describe, expect, it } from 'vitest';
import {
  fmtCep, fmtChave, fmtData, fmtDocumento, fmtFone, fmtHora, fmtNumero, fmtNumeroNota, fmtNumeroSeHouver, limparTexto,
} from './formatos-danfe';

describe('formatos do DANFE', () => {
  it('CNPJ (inclusive alfanumérico), CPF e outros documentos', () => {
    expect(fmtDocumento('12345678000195')).toBe('12.345.678/0001-95');
    expect(fmtDocumento('12abc34501de35')).toBe('12.ABC.345/01DE-35');
    expect(fmtDocumento('12345678909')).toBe('123.456.789-09');
    expect(fmtDocumento('EX-123')).toBe('EX-123');
    expect(fmtDocumento('')).toBe('');
  });

  it('números em pt-BR com o mínimo e o máximo de casas; vazio quando não há valor', () => {
    expect(fmtNumero('15250.9')).toBe('15.250,90');
    expect(fmtNumero('10.5000', 2, 4)).toBe('10,50');
    expect(fmtNumero('107.1234567890', 2, 4)).toBe('107,1235');
    expect(fmtNumero('0')).toBe('0,00');
    expect(fmtNumero('')).toBe('');
    expect(fmtNumero(undefined)).toBe('');
    expect(fmtNumero('abc')).toBe('abc');
    expect(fmtNumeroSeHouver('0.00')).toBe('');
    expect(fmtNumeroSeHouver('12.5')).toBe('12,50');
  });

  it('data e hora como estão no XML, sem converter o fuso', () => {
    expect(fmtData('2026-11-05T23:50:00-03:00')).toBe('05/11/2026');
    expect(fmtHora('2026-11-05T23:50:00-03:00')).toBe('23:50:00');
    expect(fmtData('2026-12-06')).toBe('06/12/2026');
    expect(fmtHora('2026-12-06')).toBe('');
    expect(fmtHora('2026-11-05T09:05')).toBe('09:05:00');
    expect(fmtData('')).toBe('');
  });

  it('chave, número da nota, CEP e telefone', () => {
    expect(fmtChave('51261112345678000195550010000001231000000010')).toBe('5126 1112 3456 7800 0195 5500 1000 0001 2310 0000 0010');
    expect(fmtNumeroNota('123')).toBe('000.000.123');
    expect(fmtNumeroNota('123456789')).toBe('123.456.789');
    expect(fmtCep('78000000')).toBe('78000-000');
    expect(fmtFone('6532224444')).toBe('(65) 3222-4444');
    expect(fmtFone('65992224444')).toBe('(65) 99222-4444');
    expect(fmtFone('3222')).toBe('3222');
  });

  it('limparTexto mantém só o que a fonte do PDF desenha e, se pedido, as quebras de linha', () => {
    expect(limparTexto('  AÇÃO   Nº 1\n2 ')).toBe('AÇÃO Nº 1 2');
    expect(limparTexto('a\r\nb   c', true)).toBe('a\nb c');
    expect(limparTexto('OŐ✓')).toBe('O??');
    expect(limparTexto(undefined)).toBe('');
    expect(limparTexto('“aspas” – traço …')).toBe('“aspas” – traço …');
  });
});
