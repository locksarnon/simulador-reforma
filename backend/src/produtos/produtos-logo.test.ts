import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { ProdutosService } from './produtos.service';
import { lerPrevia } from './leitura-planilha';

const service = new ProdutosService({ ncm: { findMany: async () => [] } } as never, { base: async () => ({ lista: [], classes: new Map() }) } as never);

async function abrir(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  return wb;
}

describe('logo da FAL nas planilhas do validador de cadastro', () => {
  it('modelo: logo na linha 1 de cada aba, títulos na linha 2, e o modelo volta pelo leitor com os mesmos títulos', async () => {
    const buf = await service.modeloXlsx();
    const wb = await abrir(buf);
    for (const ws of wb.worksheets) {
      expect(ws.getImages().length, ws.name).toBeGreaterThanOrEqual(1);
      expect(ws.getImages()[0].range.tl.nativeRow, ws.name).toBe(0);
      expect(ws.getRow(1).cellCount, ws.name).toBe(0);
    }
    const p = wb.getWorksheet('Produtos')!;
    expect(p.getRow(2).values).toEqual([undefined, 'Codigo', 'Descricao', 'NCM', 'Unidade', 'Origem', 'cClassTrib']);
    expect(p.getCell('A3').value).toBe('RAC-001');
    expect(p.views[0]).toMatchObject({ state: 'frozen', ySplit: 2 });
  });

  // O leitor em fluxo do ExcelJS não abre XLSX no Windows (falha conhecida do ambiente local); no Linux (VPS/CI) roda.
  it.skipIf(process.platform === 'win32')('modelo volta pelo leitor de importação: a linha da logo (em branco) é pulada e os títulos são os da linha 2', async () => {
    const previa = await lerPrevia({ buffer: await service.modeloXlsx(), originalname: 'modelo.xlsx' } as Express.Multer.File);
    expect(previa.cabecalho).toEqual(['Codigo', 'Descricao', 'NCM', 'Unidade', 'Origem', 'cClassTrib']);
    expect(previa.total).toBe(2);
  });

  it('resultado exportado: logo no topo de cada aba e títulos abaixo dela', async () => {
    const salvo = {
      resumo: { periodo: null, total: 0, ok: 0, alerta: 0, erro: 0, com_sugestao: 0, tributacao_padrao: 0 },
      opcoes: { grupos: false, gruposContabeis: false }, itens: [], fora_periodo: [],
    };
    const wb = await abrir(await service.exportarXlsx({} as Express.Multer.File, undefined, undefined, [], salvo as never));
    for (const ws of wb.worksheets) expect(ws.getImages().length, ws.name).toBeGreaterThanOrEqual(1);
    const r = wb.getWorksheet('Resultado')!;
    expect(r.getCell('A2').value).toBe('Linha');
    expect(String(r.autoFilter)).toMatch(/^A2:/);
    expect(wb.getWorksheet('Resumo')!.getCell('A2').value).toBe('Resumo da validação de cadastro');
  });
});
