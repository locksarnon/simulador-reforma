import { describe, expect, it } from 'vitest';
import { chaveReconciliacao, lerAtivo, lerData, lerFinalidade, lerNumero, normalizarCodigo, normalizarNcm } from './normalizacao';

const HOJE = new Date(Date.UTC(2026, 10, 25));

describe('códigos e NCM como texto', () => {
  it('preserva zeros à esquerda e letras do código', () => {
    expect(normalizarCodigo('00123').valor).toBe('00123');
    expect(normalizarCodigo(' AB-0099 ').valor).toBe('AB-0099');
  });
  it('tira o ".0" de inteiros lidos como decimal, sem perder zeros', () => {
    expect(normalizarCodigo('123.0').valor).toBe('123');
    expect(normalizarCodigo('00123.00').valor).toBe('00123');
  });
  it('"1E5" continua texto; notação científica do Excel (com ponto) é sinalizada', () => {
    expect(normalizarCodigo('1E5')).toEqual({ valor: '1E5' });
    expect(normalizarCodigo('1.23457E+11').problema).toBe('CIENTIFICA');
  });
  it('NCM: 8 dígitos com zero, pontuação, 7 dígitos de coluna numérica, inválidos', () => {
    expect(normalizarNcm('01012100')).toEqual({ valor: '01012100' });
    expect(normalizarNcm('0101.21.00')).toEqual({ valor: '01012100' });
    expect(normalizarNcm('1012100', true)).toEqual({ valor: '01012100' });
    expect(normalizarNcm('1012100', false).problema).toBe('INVALIDO');
    expect(normalizarNcm('1E5').problema).toBe('INVALIDO');
    expect(normalizarNcm('1.01E+07').problema).toBe('INVALIDO');
    expect(normalizarNcm('').problema).toBe('AUSENTE');
    expect(normalizarNcm('00000000').problema).toBe('AUSENTE');
    expect(normalizarNcm('31031100.0')).toEqual({ valor: '31031100' });
  });
});

describe('números, datas, booleanos', () => {
  it('números brasileiros e americanos', () => {
    expect(lerNumero('1.234,56')).toBe(1234.56);
    expect(lerNumero('1,234.56')).toBe(1234.56);
    expect(lerNumero('1234,5')).toBe(1234.5);
    expect(lerNumero('1234.5')).toBe(1234.5);
    expect(lerNumero('1.234.567')).toBe(1234567);
    expect(lerNumero('1,234,567')).toBe(1234567);
    expect(lerNumero('1.234')).toBe(1234);
    expect(lerNumero('1.234', true)).toBe(1.234);
    expect(lerNumero('12-')).toBe(-12);
    expect(lerNumero('(7,5)')).toBe(-7.5);
    expect(lerNumero('0')).toBe(0);
    expect(lerNumero('abc')).toBeNull();
    expect(lerNumero('')).toBeNull();
    expect(lerNumero('1,2,3')).toBeNull();
  });
  it('datas em vários formatos e serial do Excel', () => {
    expect(lerData('2024-03-15', HOJE).data).toBe('2024-03-15');
    expect(lerData('2024-03-15 00:00:00.000', HOJE).data).toBe('2024-03-15');
    expect(lerData('15/03/2024', HOJE).data).toBe('2024-03-15');
    expect(lerData('15/03/24', HOJE).data).toBe('2024-03-15');
    expect(lerData('20240315', HOJE).data).toBe('2024-03-15');
    expect(lerData('45366', HOJE).data).toBe('2024-03-15');
    expect(lerData('45366,5', HOJE).data).toBe('2024-03-15');
    expect(lerData('', HOJE)).toEqual({ data: null, invalida: false });
    expect(lerData('00/00/0000', HOJE)).toEqual({ data: null, invalida: false });
    expect(lerData('31/02/2024', HOJE).invalida).toBe(true);
    expect(lerData('amanhã', HOJE).invalida).toBe(true);
    expect(lerData('15/03/2099', HOJE).invalida).toBe(true);
  });
  it('ativo: S/N, Y/N, tYES/tNO, palavras e coluna de bloqueio', () => {
    expect(lerAtivo('S')).toBe(true);
    expect(lerAtivo('não')).toBe(false);
    expect(lerAtivo('tYES')).toBe(true);
    expect(lerAtivo('tNO')).toBe(false);
    expect(lerAtivo('Y')).toBe(true);
    expect(lerAtivo('Inativo')).toBe(false);
    expect(lerAtivo('ativo')).toBe(true);
    expect(lerAtivo('Y', 'BLOQUEADO')).toBe(false); // frozenFor = Y -> bloqueado
    expect(lerAtivo('N', 'BLOQUEADO')).toBe(true);
    expect(lerAtivo('1', 'BLOQUEADO')).toBe(false); // B1_MSBLQL = 1
    expect(lerAtivo('bloqueado', 'BLOQUEADO')).toBe(false);
    expect(lerAtivo('')).toBeNull();
    expect(lerAtivo('talvez')).toBeNull();
  });
  it('finalidade pela lista fechada e sinônimos', () => {
    expect(lerFinalidade('Matéria-prima')).toBe('MATERIA_PRIMA');
    expect(lerFinalidade('USO_CONSUMO')).toBe('USO_CONSUMO');
    expect(lerFinalidade('uso e consumo')).toBe('USO_CONSUMO');
    expect(lerFinalidade('qualquer')).toBeNull();
  });
});

describe('chave de reconciliação', () => {
  it('é estável, ignora caixa/acento/espaços e preserva zeros', () => {
    expect(chaveReconciliacao(null, '00123')).toBe('0:|00123');
    expect(chaveReconciliacao('  fil 01 ', ' ab 1 ')).toBe(chaveReconciliacao('FIL  01', 'AB 1'));
    expect(chaveReconciliacao(null, '00123')).not.toBe(chaveReconciliacao(null, '123'));
    expect(chaveReconciliacao('A', '1')).not.toBe(chaveReconciliacao('B', '1'));
    expect(chaveReconciliacao('A|B', 'C')).not.toBe(chaveReconciliacao('A', 'B|C'));
  });
});
