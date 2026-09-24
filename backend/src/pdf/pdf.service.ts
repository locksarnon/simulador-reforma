import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';

/** Logo FAL Agro (backend/assets). Se o arquivo faltar, o cabeçalho cai no texto "FAL Agro". */
const LOGO_PATH = join(process.cwd(), 'assets', 'logo-fal-agro.png');
const LOGO: Buffer | null = existsSync(LOGO_PATH) ? readFileSync(LOGO_PATH) : null;

export type SecaoPdf = {
  titulo: string;
  paragrafos?: string[];
  itens?: string[];
  tabela?: { cabecalho: string[]; linhas: string[][] };
  /** Comparativo com texto longo (quebra de linha): tema, como era, como fica, base legal. */
  blocos?: { tema: string; era: string; fica: string; base?: string; confirmar?: string }[];
};

export type DocumentoPdf = {
  titulo: string;
  subtitulo?: string;
  secoes: SecaoPdf[];
  aviso?: string;
};

const VERDE = '#1f3a2e';
const CINZA = '#5b6b63';

const cortar = (s: unknown, n: number) => String(s ?? '').slice(0, n);

/**
 * PDF genérico de relatório (calculadora, validador). Quem chama monta o
 * conteúdo; aqui só cuidamos da aparência. Limites de tamanho por campo
 * evitam que uma requisição pública gere documentos gigantes.
 */
@Injectable()
export class PdfService {
  gerar(doc: DocumentoPdf): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pdf = new PDFDocument({ size: 'A4', margin: 48, info: { Title: cortar(doc.titulo, 120), Author: 'InTAX — FAL Agro' } });
      const chunks: Buffer[] = [];
      pdf.on('data', (c: Buffer) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      const largura = pdf.page.width - 96;

      pdf.rect(0, 0, pdf.page.width, 64).fill(VERDE);
      pdf.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('InTAX', 48, 22, { lineBreak: false });
      const xInTax = 48 + pdf.widthOfString('InTAX');
      pdf.font('Helvetica').fontSize(10).text('por', xInTax + 8, 33, { lineBreak: false });
      const xLogo = xInTax + 8 + pdf.widthOfString('por') + 6;
      if (LOGO) {
        // Base branca: o logo tem fundo claro e o cabeçalho é verde-escuro.
        pdf.roundedRect(xLogo, 19, 72, 26, 4).fill('#ffffff');
        pdf.image(LOGO, xLogo + 5, 22, { height: 20 });
      } else {
        pdf.text('FAL Agro', xLogo, 33, { lineBreak: false });
      }
      pdf.fillColor('#000000');

      pdf.y = 90;
      pdf.font('Helvetica-Bold').fontSize(17).fillColor(VERDE).text(cortar(doc.titulo, 140), 48, pdf.y, { width: largura });
      if (doc.subtitulo) pdf.moveDown(0.3).font('Helvetica').fontSize(10).fillColor(CINZA).text(cortar(doc.subtitulo, 240), 48, pdf.y, { width: largura });
      pdf.moveDown(0.8);

      for (const s of doc.secoes.slice(0, 20)) {
        if (pdf.y > pdf.page.height - 140) pdf.addPage();
        pdf.font('Helvetica-Bold').fontSize(12).fillColor(VERDE).text(cortar(s.titulo, 100), 48, pdf.y, { width: largura });
        pdf.moveDown(0.25).font('Helvetica').fontSize(10).fillColor('#1c2b24');
        (s.paragrafos || []).slice(0, 12).forEach((p) => pdf.text(cortar(p, 900), 48, pdf.y, { width: largura }).moveDown(0.3));
        (s.itens || []).slice(0, 15).forEach((i) => pdf.text(`•  ${cortar(i, 500)}`, 52, pdf.y, { width: largura - 4 }).moveDown(0.15));

        if (s.blocos) {
          const colW = (largura - 10) / 2;
          s.blocos.slice(0, 12).forEach((b) => {
            pdf.font('Helvetica').fontSize(9);
            const hEra = pdf.heightOfString(cortar(b.era, 400), { width: colW });
            const hFica = pdf.heightOfString(cortar(b.fica, 400), { width: colW });
            const h = Math.max(hEra, hFica) + 30;
            if (pdf.y + h > pdf.page.height - 70) pdf.addPage();
            const y0 = pdf.y;
            pdf.rect(48, y0, largura, 14).fill('#e8efe9');
            pdf.fillColor(VERDE).font('Helvetica-Bold').fontSize(9).text(cortar(b.tema, 80) + (b.base ? `  (${cortar(b.base, 60)})` : ''), 52, y0 + 3, { width: largura - 8, lineBreak: false });
            pdf.fillColor(CINZA).font('Helvetica-Bold').fontSize(8).text('COMO ERA', 52, y0 + 18, { width: colW, lineBreak: false });
            pdf.text('COMO FICA', 52 + colW + 10, y0 + 18, { width: colW, lineBreak: false });
            pdf.fillColor('#1c2b24').font('Helvetica').fontSize(9);
            pdf.text(cortar(b.era, 400), 52, y0 + 29, { width: colW - 4 });
            pdf.text(cortar(b.fica, 400), 52 + colW + 10, y0 + 29, { width: colW - 4 });
            let fim = y0 + 29 + Math.max(hEra, hFica);
            if (b.confirmar) {
              pdf.font('Helvetica-Oblique').fontSize(8).fillColor(CINZA).text(`A confirmar: ${cortar(b.confirmar, 200)}`, 52, fim + 2, { width: largura - 8 });
              fim = pdf.y;
            }
            pdf.x = 48;
            pdf.y = fim + 8;
          });
        }

        if (s.tabela) {
          const cab = s.tabela.cabecalho.slice(0, 8);
          const w = largura / cab.length;
          const linha = (cels: string[], negrito: boolean, fundo?: string) => {
            const y = pdf.y;
            const h = 18;
            if (y + h > pdf.page.height - 70) { pdf.addPage(); }
            const yy = pdf.y;
            if (fundo) pdf.rect(48, yy, largura, h).fill(fundo);
            pdf.fillColor(negrito ? '#ffffff' : '#1c2b24').font(negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
            cels.slice(0, cab.length).forEach((c, i) => pdf.text(cortar(c, 40), 52 + i * w, yy + 5, { width: w - 6, lineBreak: false }));
            pdf.x = 48;
            pdf.y = yy + h;
          };
          pdf.moveDown(0.2);
          linha(cab, true, VERDE);
          s.tabela.linhas.slice(0, 40).forEach((l, i) => linha(l, false, i % 2 ? '#f3f5f2' : undefined));
        }
        pdf.moveDown(0.8);
      }

      const aviso = doc.aviso ||
        'Estimativa orientativa, baseada em premissas simplificadas e na legislação vigente na data de emissão. Não constitui parecer tributário; valide com um especialista antes de decidir.';
      if (pdf.y > pdf.page.height - 110) pdf.addPage();
      pdf.moveDown(0.5).font('Helvetica-Oblique').fontSize(8).fillColor(CINZA).text(cortar(aviso, 600), 48, pdf.y, { width: largura });
      pdf.end();
    });
  }
}
