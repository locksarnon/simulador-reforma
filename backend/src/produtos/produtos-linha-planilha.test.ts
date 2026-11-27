/**
 * A "Linha" mostrada ao usuário é a linha de verdade no arquivo (a que o Excel mostra), também no modelo do InTAX, que tem a logo da FAL na
 * linha 1. A chave interna `linha` (posição na leitura + 2) não muda: ela liga duplicidade, mestre e exclusões.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { ProdutosService } from './produtos.service';
import { montarPlanoContas } from './plano-contas';

const service = new ProdutosService({ ncm: { findMany: async () => [] } } as never, { base: async () => ({ lista: [], classes: new Map(), referencias: [] }) } as never);
const csv = (texto: string, nome = 'base.csv') => ({ buffer: Buffer.from(texto, 'utf8'), originalname: nome }) as Express.Multer.File;
const CORPO = 'Codigo;Descricao;NCM\nA1;PARAFUSO;73181500\nA2;PORCA;73181600\n';

describe('linha da planilha mostrada ao usuário (validador de cadastro)', () => {
  it('arquivo comum (títulos na linha 1): a linha mostrada é a do arquivo e igual à chave', async () => {
    const r = await service.validar(csv(CORPO));
    expect(r.itens.map((i) => [i.codigo, i.linha, i.linha_planilha])).toEqual([['A1', 2, 2], ['A2', 3, 3]]);
  });
  it('arquivo com uma linha em branco no topo (como a linha da logo do modelo): a linha mostrada é a real; a chave não muda', async () => {
    const r = await service.validar(csv('\n' + CORPO));
    expect(r.itens.map((i) => [i.codigo, i.linha, i.linha_planilha])).toEqual([['A1', 2, 3], ['A2', 3, 4]]);
  });

  // O leitor em fluxo do ExcelJS não abre XLSX no Windows (falha conhecida do ambiente local); no Linux (VPS/CI) roda.
  it.skipIf(process.platform === 'win32')('modelo do InTAX (logo na linha 1) preenchido e devolvido: a linha mostrada é a do Excel', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await service.modeloXlsx()) as never);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const r = await service.validar({ buffer: buf, originalname: 'modelo.xlsx' } as Express.Multer.File);
    // modelo: logo na linha 1, títulos na 2, exemplos a partir da 3
    expect(r.itens[0].linha_planilha).toBe(3);
    expect(r.itens[0].linha).toBe(2);
  });

  it('Excel do resultado: coluna Linha, mestre, candidatos e exclusões trazem a linha real', async () => {
    const r = await service.validar(csv('\n' + CORPO));
    const salvo = { ...r, itens: r.itens.map((i, k) => ({ ...i, candidatos_duplicidade: [r.itens[1 - k].linha], duplicidade: { nivel: 'EXATA', score: 1, grupo: 0, mestre: r.itens[0].linha, candidatos: [] } })) };
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await service.exportarXlsx(csv('\n' + CORPO), undefined, undefined, [], salvo as never)) as never);
    const ws = wb.getWorksheet('Resultado')!;
    const cab = (ws.getRow(2).values as unknown[]).map(String);
    const col = (t: string) => cab.indexOf(t);
    expect(ws.getRow(3).getCell(col('Linha')).value).toBe(3);
    expect(ws.getRow(4).getCell(col('Linha')).value).toBe(4);
    expect(ws.getRow(4).getCell(col('Cadastro mestre sugerido (linha)')).value).toBe(3);
  });

  it('de-para contábil: o erro aponta a linha real do arquivo', () => {
    expect(() => montarPlanoContas('x', ['cClassTrib', 'Conta'], [['200003', '']], [5])).toThrow('Linha 5 do de-para');
    expect(() => montarPlanoContas('x', ['cClassTrib', 'Conta'], [['200003', '']])).toThrow('Linha 2 do de-para');
  });
});
