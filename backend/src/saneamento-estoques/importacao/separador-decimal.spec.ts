/** Separador decimal detectado por coluna (texto/CSV): a coluna toda é lida do mesmo jeito; só "x.yyy" fica milhar com aviso. */
import { describe, expect, it } from 'vitest';
import { conferirBase, importarArquivo } from './index';
import { detectarSeparadorDecimal, lerNumero } from './normalizacao';
import { lerFator } from '../motor/unidades';

const csv = (linhas: string[][]) => ({ buffer: Buffer.from(linhas.map((l) => l.join(';')).join('\n'), 'utf8'), originalname: 'estoque.csv' });
const MAP = { mapeamento: { codigo: 0, descricao: 1, saldo: 2 }, colunasExtras: 'nenhuma' as const };
const base = (saldos: string[]) => [['Codigo', 'Descricao', 'Saldo'], ...saldos.map((s, i) => [`C${i}`, `Item ${i}`, s])];
const saldos = async (s: string[]) => {
  const r = await importarArquivo(csv(base(s)), MAP);
  return { valores: r.itens.map((i) => i.saldo), avisos: r.relatorio.avisos };
};

describe('detectarSeparadorDecimal', () => {
  it('BR com vírgula decimal ou "1.234,56"; PONTO com 1, 2 ou 4+ casas, zero antes do ponto, "1,234.56" ou pontos que não formam milhar; AMBIGUO só "x.yyy"', () => {
    expect(detectarSeparadorDecimal(['1.250', '12,5'])).toBe('BR');
    expect(detectarSeparadorDecimal(['1.234,56'])).toBe('BR');
    expect(detectarSeparadorDecimal(['1.234.567', '7'])).toBe('BR');
    expect(detectarSeparadorDecimal(['1.250', '12.5'])).toBe('PONTO');
    expect(detectarSeparadorDecimal(['3.14159'])).toBe('PONTO');
    expect(detectarSeparadorDecimal(['0.500', '1.250'])).toBe('PONTO');
    expect(detectarSeparadorDecimal(['1,234.56'])).toBe('PONTO');
    expect(detectarSeparadorDecimal(['1.2.3'])).toBe('PONTO');
    expect(detectarSeparadorDecimal(['1.250', '2.500', '-3.000'])).toBe('AMBIGUO');
    expect(detectarSeparadorDecimal(['10', '', 'abc'])).toBeNull();
  });
  it('lerNumero com o separador da coluna; sem ele, a regra de sempre (valor digitado, BR)', () => {
    expect(lerNumero('1.250', false, 'PONTO')).toBe(1.25);
    expect(lerNumero('1,250', false, 'PONTO')).toBe(1250);
    expect(lerNumero('1,234.5', false, 'PONTO')).toBe(1234.5);
    expect(lerNumero('1.250', false, 'BR')).toBe(1250);
    expect(lerNumero('1.250,5', false, 'BR')).toBe(1250.5);
    // lerFator (valor digitado) continua BR; número fica como está.
    expect(lerFator('1.000')).toBe(1000);
    expect(lerFator('0,5')).toBe(0.5);
    expect(lerFator(0.001)).toBe(0.001);
  });
});

describe('importação: separador decimal por coluna', () => {
  it('coluna BR: "1.250" é mil duzentos e cinquenta e "12,5" doze e meio, sem aviso', async () => {
    const r = await saldos(['1.250', '12,5', '0']);
    expect(r.valores).toEqual([1250, 12.5, 0]);
    expect(r.avisos.join(' ')).not.toMatch(/separador decimal/i);
  });
  it('coluna US: com "12.5" na coluna, "1.250" vale 1,25 e "0.500" 0,5 (antes, 1250 e 0,5 na mesma coluna)', async () => {
    const r = await saldos(['1.250', '12.5', '0.500', '1,000.75']);
    expect(r.valores).toEqual([1.25, 12.5, 0.5, 1000.75]);
    expect(r.avisos.join(' ')).toMatch(/A coluna "Saldo" usa ponto como separador decimal/);
  });
  it('coluna ambígua (só "x.yyy"): lida como milhar, com o aviso no relatório', async () => {
    const r = await saldos(['1.250', '2.500']);
    expect(r.valores).toEqual([1250, 2500]);
    expect(r.avisos).toContain('Separador decimal ambíguo na coluna "Saldo": lido como milhar; confira (ex.: "1.250" foi lido como mil duzentos e cinquenta).');
  });
  it('XLSX numérico (a leitura entrega texto BR, vírgula decimal e sem milhar): não muda', () => {
    // Como lerPlanilha({numerosBR: true}) entrega células numéricas: 1250 → "1250", 0,5 → "0,5", 1,25 → "1,25".
    const r = conferirBase({ cabecalho: ['Codigo', 'Descricao', 'Saldo'], linhas: [['A', 'x', '1250'], ['B', 'y', '0,5'], ['C', 'z', '1,25']], ncmNumerico: [false, false, true] }, MAP, { nome: 'a.xlsx', buffer: Buffer.from('x'), formato: 'xlsx' });
    expect(r.itens.map((i) => i.saldo)).toEqual([1250, 0.5, 1.25]);
    expect(r.relatorio.avisos.join(' ')).not.toMatch(/separador decimal/i);
    const inteiros = conferirBase({ cabecalho: ['Codigo', 'Descricao', 'Saldo'], linhas: [['A', 'x', '1250'], ['B', 'y', '3']], ncmNumerico: [false, false, true] }, MAP, { nome: 'a.xlsx', buffer: Buffer.from('x'), formato: 'xlsx' });
    expect(inteiros.itens.map((i) => i.saldo)).toEqual([1250, 3]);
  });
});
