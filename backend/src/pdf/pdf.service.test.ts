import { describe, expect, it } from 'vitest';
import PDFDocument from 'pdfkit';
import { PdfService, desenharTabela, type DocumentoPdf } from './pdf.service';

type Item = { str?: string; transform?: number[] };
async function paginas(pdf: Buffer): Promise<string[][]> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs' as string)) as unknown as { getDocument: (o: unknown) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Item[] }> }> }> } };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  const r: string[][] = [];
  for (let i = 1; i <= doc.numPages; i++) r.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => (x.str ?? '').trim()).filter(Boolean));
  return r;
}

/** Seção de enchimento com `k` linhas, para empurrar a tabela a cada posição possível da página. */
const documento = (k: number, linhasTabela: number): DocumentoPdf => ({
  titulo: 'Teste de tabela',
  secoes: [
    { titulo: 'Enchimento', paragrafos: [Array.from({ length: k }, (_, i) => `linha ${i}`).join('\n')] },
    {
      titulo: 'Particularidades do ERP Teste',
      paragrafos: ['Restrições do ERP do cliente para os ajustes aprovados.'],
      tabela: {
        cabecalho: ['Ajuste', 'Restrição', 'Grau', 'Fonte'], larguras: [0.2, 0.5, 0.12, 0.18],
        linhas: Array.from({ length: linhasTabela }, (_, i) => [`AJ${i}`, `Texto da restrição ${i} com algumas palavras a mais para quebrar a linha da célula`, 'Confirmado', 'https://exemplo.test/doc']),
      },
    },
  ],
});

describe('PDF: tabela sem cabeçalho órfão', () => {
  it('em qualquer posição da página, o cabeçalho sai na mesma página da 1ª linha', async () => {
    const svc = new PdfService();
    let quebrou = 0;
    for (let k = 20; k <= 60; k += 1) {
      const ps = await paginas(await svc.gerar(documento(k, 1)));
      const pCab = ps.findIndex((p) => p.includes('Restrição'));
      const pLinha = ps.findIndex((p) => p.includes('AJ0'));
      expect(pCab, `k=${k}`).toBeGreaterThanOrEqual(0);
      expect(pCab, `k=${k}`).toBe(pLinha);
      if (pCab > 0) quebrou++;
    }
    expect(quebrou).toBeGreaterThan(0); // a varredura chegou a empurrar a tabela para outra página
  }, 60000);

  it('tabela que continua na página seguinte repete o cabeçalho no topo', async () => {
    const ps = await paginas(await new PdfService().gerar(documento(0, 60)));
    const comLinhas = ps.filter((p) => p.some((s) => /^AJ\d+$/.test(s)));
    expect(comLinhas.length).toBeGreaterThan(1);
    for (const p of comLinhas) {
      const cab = p.indexOf('Restrição');
      expect(cab).toBeGreaterThanOrEqual(0);
      expect(cab).toBeLessThan(p.findIndex((s) => /^AJ\d+$/.test(s)));
    }
  }, 60000);
});

describe('PDF: desenharTabela (primitiva reaproveitada)', () => {
  it('sem limite de linhas, repete o cabeçalho em cada página e não perde linha', async () => {
    const buf = await new Promise<Buffer>((resolve) => {
      const pdf = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
      const chunks: Buffer[] = [];
      pdf.on('data', (c: Buffer) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      desenharTabela(pdf, { cabecalho: ['Grupo', 'Regra'], linhas: Array.from({ length: 450 }, (_, i) => [`G${String(i).padStart(3, '0')}`, 'N01']), larguras: [0.7, 0.3] },
        { x: 48, largura: pdf.page.width - 96, limiteInferior: pdf.page.height - 56 });
      pdf.end();
    });
    const ps = await paginas(buf);
    expect(ps.length).toBeGreaterThan(5);
    for (const p of ps) {
      expect(p.indexOf('Grupo')).toBeGreaterThanOrEqual(0);
      expect(p.indexOf('Grupo')).toBeLessThan(p.findIndex((s) => /^G\d{3}$/.test(s)));
    }
    expect(ps.flat().filter((s) => /^G\d{3}$/.test(s)).length).toBe(450);
  }, 60000);
});
