import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { PassThrough } from 'node:stream';
import { strFromU8, unzipSync } from 'fflate';
import { LINHAS_LOGO_FAL, LOGO_FAL, cabecalhoFalExcel, logoFalNoXlsx, reservarLinhaLogoFal } from './logo-fal';

const arquivos = (buf: Buffer) => unzipSync(new Uint8Array(buf));
const texto = (buf: Buffer, nome: string) => strFromU8(arquivos(buf)[nome]);
async function abrir(buf: Buffer) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as never); return wb; }

/** Pasta escrita em fluxo (o caminho do Excel de entregas): uma aba visível com a linha da logo reservada e uma oculta. */
async function pastaEmFluxo(): Promise<Buffer> {
  const saida = new PassThrough(); const partes: Buffer[] = [];
  saida.on('data', (c: Buffer) => partes.push(c));
  const fim = new Promise<void>((ok, erro) => { saida.on('end', ok); saida.on('error', erro); });
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: saida, useStyles: true, useSharedStrings: false });
  const ws = wb.addWorksheet('Dados', { views: [{ state: 'frozen', ySplit: 1 + LINHAS_LOGO_FAL }] });
  reservarLinhaLogoFal(ws);
  ws.addRow(['Código', 'Descrição']).commit();
  ws.addRow(['001', 'Milho']).commit();
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 3, column: 2 } } as never;
  ws.commit();
  const oculta = wb.addWorksheet('Controle', { state: 'veryHidden' });
  oculta.addRow(['projeto', 'P1']).commit();
  oculta.commit();
  await wb.commit();
  await fim;
  return Buffer.concat(partes);
}

describe('logo da FAL no Excel', () => {
  it('o arquivo da logo existe e é PNG pequeno (≤ 60 KB)', () => {
    expect(LOGO_FAL).not.toBeNull();
    expect(LOGO_FAL!.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(LOGO_FAL!.length).toBeLessThanOrEqual(60 * 1024);
  });

  it('pasta em memória: cabecalhoFalExcel põe a imagem na linha 1 (uma só imagem na pasta, reaproveitada nas abas)', async () => {
    const wb = new ExcelJS.Workbook();
    for (const nome of ['A', 'B']) {
      const ws = wb.addWorksheet(nome);
      expect(cabecalhoFalExcel(wb, ws)).toBe(LINHAS_LOGO_FAL);
      ws.addRow(['Título']);
    }
    const lido = await abrir(Buffer.from(await wb.xlsx.writeBuffer()));
    for (const ws of lido.worksheets) {
      expect(ws.getImages()).toHaveLength(1);
      expect(ws.getImages()[0].range.tl.nativeRow).toBe(0);
      expect(ws.getCell(2, 1).value).toBe('Título');
      expect(ws.getRow(1).cellCount).toBe(0);
    }
    expect(Object.keys(arquivos(Buffer.from(await wb.xlsx.writeBuffer()))).filter((f) => /^xl\/media\/.+/.test(f))).toHaveLength(1);
  });

  it('pasta em fluxo: logoFalNoXlsx põe o desenho na aba visível, deixa a oculta como está e o arquivo reabre no ExcelJS', async () => {
    const antes = await pastaEmFluxo();
    const depois = await logoFalNoXlsx(antes);
    const f = arquivos(depois);
    expect(Object.keys(f).filter((n) => /^xl\/media\/.+/.test(n))).toEqual(['xl/media/logofal.png']);
    expect(Object.keys(f).filter((n) => /^xl\/drawings\/[^/]+\.xml$/.test(n))).toHaveLength(1);
    expect(texto(depois, 'xl/worksheets/sheet1.xml')).toContain('<drawing r:id="rIdLogoFal"/>');
    expect(texto(depois, 'xl/worksheets/sheet2.xml')).not.toContain('<drawing');
    expect(texto(depois, '[Content_Types].xml')).toMatch(/Extension="png"/);
    // <drawing> antes de <tableParts>/<extLst> e depois de <autoFilter>/<pageMargins> (ordem do esquema: senão o Excel "repara" o arquivo).
    const xml = texto(depois, 'xl/worksheets/sheet1.xml');
    expect(xml.indexOf('<drawing ')).toBeGreaterThan(xml.indexOf('</sheetData>'));
    if (xml.includes('<pageMargins')) expect(xml.indexOf('<drawing ')).toBeGreaterThan(xml.indexOf('<pageMargins'));
    const wb = await abrir(depois);
    const ws = wb.getWorksheet('Dados')!;
    expect(ws.getImages()).toHaveLength(1);
    expect(ws.getImages()[0].range.tl.nativeRow).toBe(0);
    expect(ws.getRow(1).height).toBe(42);
    expect(ws.getCell(2, 1).value).toBe('Código');
    expect(ws.getCell(3, 2).value).toBe('Milho');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 2 });
    expect(wb.getWorksheet('Controle')!.getImages()).toHaveLength(0);
  });

  it('aba que já tem desenho fica como está (não duplica a logo ao passar duas vezes)', async () => {
    const uma = await logoFalNoXlsx(await pastaEmFluxo());
    const duas = await logoFalNoXlsx(uma);
    expect(texto(duas, 'xl/worksheets/sheet1.xml').match(/<drawing /g)).toHaveLength(1);
    expect((await abrir(duas)).getWorksheet('Dados')!.getImages()).toHaveLength(1);
  });

  it('aba com relações próprias (link) mantém as relações e ganha a do desenho', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Links');
    ws.getCell('A2').value = { text: 'site', hyperlink: 'https://example.com' };
    const comLink = await logoFalNoXlsx(Buffer.from(await wb.xlsx.writeBuffer()));
    const rels = texto(comLink, 'xl/worksheets/_rels/sheet1.xml.rels');
    expect(rels).toContain('hyperlink');
    expect(rels).toContain('rIdLogoFal');
    const lido = await abrir(comLink);
    expect(lido.getWorksheet('Links')!.getImages()).toHaveLength(1);
    expect((lido.getWorksheet('Links')!.getCell('A2').value as { hyperlink?: string }).hyperlink).toBe('https://example.com');
  });
});
