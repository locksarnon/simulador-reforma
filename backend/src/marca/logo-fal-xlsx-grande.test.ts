/**
 * logoFalNoXlsx em fluxo com o tamanho das entregas do Saneamento (30 mil itens × 45 colunas): o arquivo não é descomprimido inteiro, o laço
 * de eventos não fica travado (cede a vez a cada fatia) e o resultado reabre no ExcelJS com a logo e as linhas intactas.
 * Também a posição do <drawing> na ordem do esquema (CT_Worksheet), só entre os filhos diretos de <worksheet>.
 */
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { PassThrough } from 'node:stream';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { strFromU8, unzipSync } from 'fflate';
import { LINHAS_LOGO_FAL, logoFalNoXlsx, posicaoDoDrawing, reservarLinhaLogoFal } from './logo-fal';

const ITENS = 30_000;
const COLUNAS = 45;
const MB = (b: number) => Math.round(b / 1048576);
setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;

async function pastaGrande(): Promise<Buffer> {
  const saida = new PassThrough(); const partes: Buffer[] = [];
  saida.on('data', (c: Buffer) => partes.push(c));
  const fim = new Promise<void>((ok, erro) => { saida.on('end', ok); saida.on('error', erro); });
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: saida, useStyles: true, useSharedStrings: false, zip: { zlib: { level: 1 } } });
  const ws = wb.addWorksheet('Cadastro', { views: [{ state: 'frozen', ySplit: 1 + LINHAS_LOGO_FAL }] });
  reservarLinhaLogoFal(ws);
  ws.addRow(Array.from({ length: COLUNAS }, (_, c) => `Coluna ${c + 1}`)).commit();
  for (let k = 0; k < ITENS; k++) {
    ws.addRow(Array.from({ length: COLUNAS }, (_, c) => (c === 0 ? String(k).padStart(8, '0') : c % 3 ? `PRODUTO AGRÍCOLA ${k} C${c}` : k * c))).commit();
  }
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: ITENS + 2, column: COLUNAS } } as never;
  ws.commit();
  const resumo = wb.addWorksheet('Resumo');
  reservarLinhaLogoFal(resumo);
  resumo.addRow(['Itens', ITENS]).commit();
  resumo.commit();
  await wb.commit();
  await fim;
  return Buffer.concat(partes);
}

describe('logoFalNoXlsx em fluxo (arquivo grande)', () => {
  it(`${ITENS} itens × ${COLUNAS} colunas: sem travar o laço de eventos, sem descomprimir o arquivo inteiro, reabre com a logo e os dados`, async () => {
    const antes = await pastaGrande();
    const abaDescomprimida = new DataView(antes.buffer, antes.byteOffset).getUint32(antes.lastIndexOf(Buffer.from('xl/worksheets/sheet1.xml')) - 46 + 24, true);
    gc();
    const base = process.memoryUsage();
    let pico = 0; let maiorPausa = 0; let ultimo = performance.now(); let rodando = true;
    const medir = () => {
      const agora = performance.now();
      maiorPausa = Math.max(maiorPausa, agora - ultimo); ultimo = agora;
      const m = process.memoryUsage();
      pico = Math.max(pico, m.heapUsed + m.arrayBuffers - base.heapUsed - base.arrayBuffers);
      if (rodando) setImmediate(medir);
    };
    setImmediate(medir);
    const t0 = performance.now();
    const depois = await logoFalNoXlsx(antes);
    const tempo = performance.now() - t0;
    rodando = false;
    // eslint-disable-next-line no-console
    console.log(`[logo em fluxo] ${ITENS}×${COLUNAS}: entrada ${MB(antes.length)} MB, saída ${MB(depois.length)} MB, ${tempo.toFixed(0)} ms, maior pausa do laço ${maiorPausa.toFixed(1)} ms, aba descomprimida ${MB(abaDescomprimida)} MB, pico de memória (heap + buffers) acima da base ${MB(pico)} MB`);

    // O caminho em fluxo segura só o arquivo de saída (comprimido) e fatias: bem menos que a aba descomprimida (que unzipSync seguraria inteira).
    expect(abaDescomprimida).toBeGreaterThan(50 * 1048576);
    expect(pico).toBeLessThan(abaDescomprimida / 2);
    expect(readFileSync(join(__dirname, 'logo-fal.ts'), 'utf8')).not.toMatch(/(unzipSync|zipSync)/);
    expect(maiorPausa).toBeLessThan(100); // meta ~50 ms; folga para máquina de CI carregada

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(depois as never);
    const ws = wb.getWorksheet('Cadastro')!;
    expect(ws.getImages()).toHaveLength(1);
    expect(ws.getImages()[0].range.tl.nativeRow).toBe(0);
    expect(ws.getRow(1).cellCount).toBe(0);
    expect(ws.getCell(2, 1).value).toBe('Coluna 1');
    expect(ws.rowCount).toBe(ITENS + 2);
    for (const k of [0, 1, 12_345, ITENS - 1]) {
      expect(ws.getCell(k + 3, 1).value).toBe(String(k).padStart(8, '0'));
      expect(ws.getCell(k + 3, 2).value).toBe(`PRODUTO AGRÍCOLA ${k} C1`);
      expect(ws.getCell(k + 3, 43).value).toBe(k * 42);
    }
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 2 });
    expect(wb.getWorksheet('Resumo')!.getImages()).toHaveLength(1);
  }, 180_000);
});

describe('posição do <drawing> na aba (ordem do esquema)', () => {
  const aba = (cauda: string) => `<?xml version="1.0"?><worksheet xmlns="x"><sheetData><row r="1"/></sheetData>${cauda}</worksheet>`;
  const comLogo = async (xml: string) => {
    const wb = new ExcelJS.Workbook(); wb.addWorksheet('A').getCell('A2').value = 'x';
    const f = unzipSync(new Uint8Array(await wb.xlsx.writeBuffer()));
    f['xl/worksheets/sheet1.xml'] = new TextEncoder().encode(xml);
    const { zipSync } = await import('fflate');
    return strFromU8(unzipSync(new Uint8Array(await logoFalNoXlsx(Buffer.from(zipSync(f)))))['xl/worksheets/sheet1.xml']);
  };

  it('depois de headerFooter/rowBreaks/ignoredErrors e antes de legacyDrawing/tableParts/extLst', async () => {
    const xml = await comLogo(aba('<pageMargins left="1"/><headerFooter><oddHeader>a</oddHeader></headerFooter><rowBreaks/><ignoredErrors/><legacyDrawing r:id="r9"/><tableParts count="0"/><extLst><ext uri="u"/></extLst>'));
    expect(xml).toContain('<ignoredErrors/><drawing r:id="rIdLogoFal"/><legacyDrawing ');
    expect(xml).toMatch(/^<\?xml version="1.0"\?><worksheet xmlns:r="http:\/\/schemas.openxmlformats.org\/officeDocument\/2006\/relationships" xmlns="x">/);
  });

  it('sem elemento posterior: antes de </worksheet> (o último), nunca depois do documento', async () => {
    const xml = await comLogo(aba('<pageMargins left="1"/>'));
    expect(xml.endsWith('<pageMargins left="1"/><drawing r:id="rIdLogoFal"/></worksheet>')).toBe(true);
  });

  it('só filhos diretos de <worksheet>: <picture>/<tableParts> dentro de <extLst> não contam, mas o próprio <extLst> sim', () => {
    const cauda = '<pageMargins/><extLst><ext uri="u"><x14:picture/><tableParts/></ext></extLst></worksheet>';
    expect(posicaoDoDrawing(cauda)).toBe(cauda.indexOf('<extLst>'));
    const nested = '<headerFooter><oddHeader>&lt;picture&gt;</oddHeader></headerFooter><!-- <tableParts/> --></worksheet>';
    expect(posicaoDoDrawing(nested)).toBe(nested.lastIndexOf('</worksheet>'));
  });

  it('aba que já tem <drawing> devolve -1; sem </worksheet> é erro explícito', () => {
    expect(posicaoDoDrawing('<pageMargins/><drawing r:id="r1"/></worksheet>')).toBe(-1);
    expect(() => posicaoDoDrawing('<pageMargins/><tableParts')).toThrow(/<\/worksheet> não encontrado/);
    expect(() => posicaoDoDrawing('<pageMargins/>')).toThrow(/<\/worksheet> não encontrado/);
  });

  it('XML da aba sem </worksheet>: logoFalNoXlsx falha (não grava arquivo inválido)', async () => {
    await expect(comLogo('<worksheet><sheetData/><pageMargins/>')).rejects.toThrow(/<\/worksheet> não encontrado/);
  });
});
