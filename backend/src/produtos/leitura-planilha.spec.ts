import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { formatoEhPercentual, lerPlanilha, lerPrevia, MAX_LINHAS, textoCelula } from './leitura-planilha';

const arquivo = (buffer: Buffer, originalname: string) => ({ buffer, originalname });
async function xlsx(montar: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); montar(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('leitura de planilhas em fluxo', () => {
  it('lê XLSX com linha em branco antes, coluna A vazia, números, datas, fórmulas e texto formatado', async () => {
    const buf = await xlsx((wb) => {
      const ws = wb.addWorksheet('Itens');
      ws.getRow(2).values = [undefined, undefined, 'Codigo', 'Descricao', 'NCM', 'Data'];
      ws.getRow(3).values = [undefined, undefined, '000123', 'Parafuso', 31031100, new Date(Date.UTC(2026, 0, 15))];
      ws.getRow(4).values = [undefined, undefined, 'B2', { richText: [{ text: 'Porca ' }, { text: 'M10' }] }, { formula: 'A1', result: '22030000' } as ExcelJS.CellFormulaValue, ''];
      wb.addWorksheet('Outra').addRow(['ignorada', 'x']);
    });
    const p = await lerPlanilha(arquivo(buf, 'a.xlsx'));
    expect(p.formato).toBe('xlsx');
    expect(p.cabecalho).toEqual(['Coluna 1', 'Coluna 2', 'Codigo', 'Descricao', 'NCM', 'Data']);
    expect(p.linhas).toHaveLength(2);
    expect(p.linhas[0]).toEqual(['', '', '000123', 'Parafuso', '31031100', '2026-01-15']);
    expect(p.linhas[1].slice(2)).toEqual(['B2', 'Porca M10', '22030000', '']);
    expect(p.ncmNumerico[4]).toBe(true); // coluna do NCM tem número de verdade (perde o zero à esquerda)
    expect(p.ncmNumerico[2]).toBe(false);
  });

  it('com colunas pedidas, guarda só elas (mesmos índices) e o cabeçalho vem inteiro', async () => {
    const buf = await xlsx((wb) => {
      const ws = wb.addWorksheet('Itens');
      ws.addRow(['A', 'B', 'C', 'D']); ws.addRow(['a1', 'b1', 'c1', 'd1']); ws.addRow(['a2', 'b2', 'c2', 'd2']);
    });
    const p = await lerPlanilha(arquivo(buf, 'a.xlsx'), [0, 2]);
    expect(p.cabecalho).toEqual(['A', 'B', 'C', 'D']);
    expect(p.linhas.map((l) => [l[0], l[1] ?? '', l[2], l[3] ?? ''])).toEqual([['a1', '', 'c1', ''], ['a2', '', 'c2', '']]);
  });

  it('prévia: total, primeiro valor de cada coluna e 10 primeiras linhas, sem guardar o resto', async () => {
    const buf = await xlsx((wb) => {
      const ws = wb.addWorksheet('Itens'); ws.addRow(['Codigo', 'Descricao', 'Obs']);
      for (let i = 1; i <= 25; i++) ws.addRow([`C${i}`, `Item ${i}`, i === 7 ? 'só aqui' : '']);
    });
    const v = await lerPrevia(arquivo(buf, 'a.xlsx'));
    expect(v.total).toBe(25);
    expect(v.exemplos).toEqual(['C1', 'Item 1', 'só aqui']);
    expect(v.amostra).toHaveLength(10);
    expect(v.amostra[0]).toEqual(['C1', 'Item 1', '']);
  });

  it('arquivo corrompido, truncado ou vazio vira erro de usuário (nunca derruba o servidor)', async () => {
    const bom = await xlsx((wb) => { const ws = wb.addWorksheet('Itens'); ws.addRow(['A']); for (let i = 0; i < 300; i++) ws.addRow([`linha ${i} ${'x'.repeat(50)}`]); });
    await expect(lerPlanilha(arquivo(Buffer.from('isto não é um zip'), 'a.xlsx'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(lerPlanilha(arquivo(bom.subarray(0, Math.floor(bom.length / 2)), 'a.xlsx'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(lerPlanilha(arquivo(Buffer.alloc(0), 'a.xlsx'))).rejects.toThrow('vazio');
    await expect(lerPlanilha(arquivo(Buffer.from('x'), 'a.xls'))).rejects.toThrow('.xls');
    await expect(lerPlanilha(arquivo(Buffer.from('x'), 'a.pdf'))).rejects.toThrow('Formato não reconhecido');
  });

  it('planilha só com cabeçalho ou sem nada é recusada com mensagem clara', async () => {
    const soCab = await xlsx((wb) => { wb.addWorksheet('Itens').addRow(['Codigo', 'Descricao']); });
    await expect(lerPlanilha(arquivo(soCab, 'a.xlsx'))).rejects.toThrow('ao menos uma linha');
    const vazia = await xlsx((wb) => { wb.addWorksheet('Itens'); });
    await expect(lerPlanilha(arquivo(vazia, 'a.xlsx'))).rejects.toThrow('vazia');
  });

  it('CSV: detecta o separador, lê Latin-1 e respeita o limite de linhas sem guardar o excedente', async () => {
    const latin1 = Buffer.from('Codigo;Descrição;NCM\n1;Ração bovinos;23099010\n', 'latin1');
    const p = await lerPlanilha(arquivo(latin1, 'a.csv'));
    expect(p.cabecalho).toEqual(['Codigo', 'Descrição', 'NCM']);
    expect(p.linhas[0]).toEqual(['1', 'Ração bovinos', '23099010']);
    const grande = Buffer.from('Codigo;Descricao\n' + Array.from({ length: MAX_LINHAS + 1 }, (_, i) => `${i};item ${i}`).join('\n'));
    await expect(lerPlanilha(arquivo(grande, 'a.csv'))).rejects.toThrow('limite por envio');
  });

  it('texto de célula: fórmula sem resultado, erro e data', () => {
    expect(textoCelula({ formula: '--Outros' })).toBe('--Outros');
    expect(textoCelula({ error: '#N/A' })).toBe('#N/A');
    expect(textoCelula(new Date(Date.UTC(2026, 9, 22)))).toBe('2026-10-22');
    expect(textoCelula(null)).toBe('');
    expect(textoCelula(12.5)).toBe('12.5');
  });
});

describe('formatoEhPercentual: só o "%" que multiplica por 100 conta', () => {
  it('percentual de verdade', () => {
    for (const f of ['0%', '0.00%', '0,00%', '#,##0.0%', '[Red]0.00%']) expect(formatoEhPercentual(f), f).toBe(true);
  });
  it('"%" como texto (entre aspas, depois de barra invertida) e formatos sem % não contam', () => {
    for (const f of ['0.00"%"', '0.00 "%"', '0.00\\%', '#,##0.00', 'General', '0.00"%" ;[Red]-0.00"%"']) expect(formatoEhPercentual(f), f).toBe(false);
    expect(formatoEhPercentual(undefined)).toBe(false);
    expect(formatoEhPercentual('')).toBe(false);
  });
  it('a célula numérica entrega o texto brasileiro: percentual real vira 1,65%; "%" literal fica 0,65', () => {
    expect(textoCelula(0.0165, '0.00%', { numerosBR: true })).toBe('1,65%');
    expect(textoCelula(0.65, '0.00"%"', { numerosBR: true })).toBe('0,65');
    expect(textoCelula(12500.5, undefined, { numerosBR: true })).toBe('12500,5');
    expect(textoCelula(12.5)).toBe('12.5'); // sem a opção, como sempre
  });
});
