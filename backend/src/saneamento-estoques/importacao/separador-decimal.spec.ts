/** Separador decimal detectado por coluna (texto/CSV): a coluna toda é lida do mesmo jeito; só "x.yyy" fica milhar com aviso. */
import { describe, expect, it } from 'vitest';
import { conferirBase, importarArquivo } from './index';
import { analisarSeparadorDecimal, detectarSeparadorDecimal, lerNumero, provaDeSeparador } from './normalizacao';
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
  it('"x,yyy" é ambíguo como "x.yyy"; provas de cada lado; a coluna inteira é varrida (antes "1,234" decidia BR na hora)', () => {
    expect(provaDeSeparador('1,234')).toBe('AMBIGUO');
    expect(provaDeSeparador('1.234')).toBe('AMBIGUO');
    expect(provaDeSeparador('12,5')).toBe('BR');
    expect(provaDeSeparador('1,2345')).toBe('BR');
    expect(provaDeSeparador('0,500')).toBe('BR');
    expect(provaDeSeparador('1.234,56')).toBe('BR');
    expect(provaDeSeparador('12.5')).toBe('PONTO');
    expect(provaDeSeparador('0.5')).toBe('PONTO');
    expect(provaDeSeparador('1,234.56')).toBe('PONTO');
    expect(provaDeSeparador('1234,567')).toBe('BR'); // 4 dígitos antes: não é milhar
    expect(provaDeSeparador('1,234', true)).toBe('BR'); // número do XLSX: vírgula decimal
    expect(detectarSeparadorDecimal(['1,234.56', '1,234', '12'])).toBe('PONTO');
    expect(detectarSeparadorDecimal(['12.5', '1,234'])).toBe('PONTO');
    expect(detectarSeparadorDecimal(['1,234', '2,500'])).toBe('AMBIGUO');
    const misturada = analisarSeparadorDecimal(['12.5', '1.250', '1,5']);
    expect(misturada).toEqual({ separador: 'BR', misturado: true, provas: { BR: 1, PONTO: 1 }, contrarias: [0], totalContrarias: 1 }); // empate: BR
    const maioria = analisarSeparadorDecimal(['1.5', '2.5', '3,5', '4.25']);
    expect(maioria).toMatchObject({ separador: 'PONTO', misturado: true, contrarias: [2], totalContrarias: 1 });
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
  it('"1,234.56", "1,234" e "12": coluna com ponto decimal, "1,234" = mil duzentos e trinta e quatro', async () => {
    const r = await saldos(['1,234.56', '1,234', '12']);
    expect(r.valores).toEqual([1234.56, 1234, 12]);
    expect(r.avisos.join(' ')).not.toMatch(/misturados/);
    expect((await saldos(['12.5', '1,234'])).valores).toEqual([12.5, 1234]);
  });
  it('provas dos dois lados: leitura única pela maioria e aviso com as linhas do outro lado', async () => {
    const r = await saldos(['12.5', '1.250', '1,5']);
    expect(r.valores).toEqual([12.5, 1250, 1.5]); // empate: BR para a coluna inteira
    expect(r.avisos).toContain('Coluna "Saldo" com separadores decimais misturados: lida como BR; confira a linha 2.');
    const p = await saldos(['1.5', '2.5', '3.5', '4,5', '5.5']);
    expect(p.valores.slice(0, 3)).toEqual([1.5, 2.5, 3.5]);
    expect(p.avisos).toContain('Coluna "Saldo" com separadores decimais misturados: lida como ponto; confira a linha 5.');
    // Mais de 5 linhas do outro lado: cita 5 e conta o resto.
    const muitas = await saldos([...Array(10).fill('1.5'), ...Array(7).fill('2,5')]);
    expect(muitas.avisos).toContain('Coluna "Saldo" com separadores decimais misturados: lida como ponto; confira as linhas 12, 13, 14, 15, 16 (e mais 2).');
  });
  it('XLSX numérico (a leitura entrega texto BR, vírgula decimal e sem milhar): não muda', () => {
    // Como lerPlanilha({numerosBR: true}) entrega células numéricas: 1250 → "1250", 0,5 → "0,5", 1,25 → "1,25".
    const r = conferirBase({ cabecalho: ['Codigo', 'Descricao', 'Saldo'], linhas: [['A', 'x', '1250'], ['B', 'y', '0,5'], ['C', 'z', '1,25']], ncmNumerico: [false, false, true] }, MAP, { nome: 'a.xlsx', buffer: Buffer.from('x'), formato: 'xlsx' });
    expect(r.itens.map((i) => i.saldo)).toEqual([1250, 0.5, 1.25]);
    expect(r.relatorio.avisos.join(' ')).not.toMatch(/separador decimal/i);
    const inteiros = conferirBase({ cabecalho: ['Codigo', 'Descricao', 'Saldo'], linhas: [['A', 'x', '1250'], ['B', 'y', '3']], ncmNumerico: [false, false, true] }, MAP, { nome: 'a.xlsx', buffer: Buffer.from('x'), formato: 'xlsx' });
    expect(inteiros.itens.map((i) => i.saldo)).toEqual([1250, 3]);
    // 1,234 kg gravado como número: a leitura entrega "1,234" (vírgula decimal), sem aviso de ambiguidade.
    const tres = conferirBase({ cabecalho: ['Codigo', 'Descricao', 'Saldo'], linhas: [['A', 'x', '1,234'], ['B', 'y', '2']], ncmNumerico: [false, false, true] }, MAP, { nome: 'a.xlsx', buffer: Buffer.from('x'), formato: 'xlsx' });
    expect(tres.itens.map((i) => i.saldo)).toEqual([1.234, 2]);
    expect(tres.relatorio.avisos.join(' ')).not.toMatch(/separador decimal/i);
  });
});
