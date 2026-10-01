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
  /** Números-chave em destaque, lado a lado (até 3) — mesmo papel dos cartões de métrica da tela. */
  destaques?: { rotulo: string; valor: string; detalhe?: string }[];
  /** Dois cenários lado a lado (ex.: "hoje" x "simulado") — espelha os cartões de comparação da tela. */
  comparativo?: {
    tituloA: string; selosA?: string; linhasA: { rotulo: string; valor: string }[];
    tituloB: string; selosB?: string; linhasB: { rotulo: string; valor: string }[];
    destacarB?: boolean;
  };
};

export type DocumentoPdf = {
  titulo: string;
  subtitulo?: string;
  secoes: SecaoPdf[];
  aviso?: string;
  /** Chamada final para a ação comercial — bloco forte, com link clicável de WhatsApp/e-mail. */
  cta?: { titulo: string; texto: string; whatsapp?: string; whatsappTexto?: string; email?: string };
};

const VERDE = '#197148';
const VERDE_ESCURO = '#123424';
const TEXTO = '#1c2b24';
const CINZA = '#5b6b63';
const AMBAR = '#b8861f';
const AMBAR_FUNDO = '#fbf0da';
const BORDA = '#dce5e0';
const FUNDO_CARD = '#eef3f0';
const BRANCO = '#ffffff';

const MARGEM = 48;
const SITE = 'simulador.clarityib.com.br';

const cortar = (s: unknown, n: number) => String(s ?? '').slice(0, n);

/**
 * PDF genérico de relatório (calculadora, Simples x Híbrido, validador). Quem
 * chama monta o conteúdo (DocumentoPdf); aqui só cuidamos da aparência — um
 * único visual, usado pelos dois relatórios públicos, pra manter os dois
 * padronizados.
 */
@Injectable()
export class PdfService {
  gerar(doc: DocumentoPdf): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pdf = new PDFDocument({ size: 'A4', margin: MARGEM, bufferPages: true, info: { Title: cortar(doc.titulo, 120), Author: 'InTAX — FAL Agro' } });
      const chunks: Buffer[] = [];
      pdf.on('data', (c: Buffer) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      const largura = pdf.page.width - MARGEM * 2;
      const limiteInferior = pdf.page.height - 56;
      const novaPaginaSeNecessario = (alturaNecessaria: number) => {
        if (pdf.y + alturaNecessaria > limiteInferior) pdf.addPage();
      };

      // ---- Cabeçalho (só na 1ª página — o rodapé de marca se repete em todas) ----
      pdf.rect(0, 0, pdf.page.width, 64).fill(VERDE);
      pdf.fillColor(BRANCO).font('Helvetica-Bold').fontSize(20).text('InTAX', MARGEM, 22, { lineBreak: false });
      const xInTax = MARGEM + pdf.widthOfString('InTAX');
      pdf.font('Helvetica').fontSize(10).text('por', xInTax + 8, 33, { lineBreak: false });
      const xLogo = xInTax + 8 + pdf.widthOfString('por') + 6;
      if (LOGO) {
        pdf.roundedRect(xLogo, 19, 72, 26, 4).fill(BRANCO);
        pdf.image(LOGO, xLogo + 5, 22, { height: 20 });
      } else {
        pdf.text('FAL Agro', xLogo, 33, { lineBreak: false });
      }
      pdf.font('Helvetica').fontSize(9).fillColor('#cfe3d6')
        .text('Simulador da Reforma Tributária', MARGEM, 22, { width: largura, align: 'right', lineBreak: false });

      pdf.y = 92;
      pdf.font('Helvetica-Bold').fontSize(18).fillColor(VERDE_ESCURO).text(cortar(doc.titulo, 140), MARGEM, pdf.y, { width: largura });
      pdf.rect(MARGEM, pdf.y + 4, 36, 3).fill(VERDE);
      pdf.moveDown(0.6);
      if (doc.subtitulo) pdf.font('Helvetica').fontSize(10.5).fillColor(CINZA).text(cortar(doc.subtitulo, 240), MARGEM, pdf.y, { width: largura });
      pdf.moveDown(1);

      for (const s of doc.secoes.slice(0, 20)) {
        novaPaginaSeNecessario(60);
        pdf.font('Helvetica-Bold').fontSize(12.5).fillColor(VERDE_ESCURO).text(cortar(s.titulo, 100), MARGEM, pdf.y, { width: largura });
        pdf.moveDown(0.35).font('Helvetica').fontSize(10).fillColor(TEXTO);
        (s.paragrafos || []).slice(0, 12).forEach((p) => pdf.text(cortar(p, 900), MARGEM, pdf.y, { width: largura, lineGap: 1.5 }).moveDown(0.35));
        (s.itens || []).slice(0, 15).forEach((i) => {
          novaPaginaSeNecessario(16);
          const y = pdf.y;
          pdf.fillColor(VERDE).font('Helvetica-Bold').text('›', MARGEM, y, { width: 12, lineBreak: false });
          pdf.fillColor(TEXTO).font('Helvetica').text(cortar(i, 500), MARGEM + 14, y, { width: largura - 14 });
          pdf.moveDown(0.18);
        });

        // ---- Números em destaque (cartões de métrica, até 3 lado a lado) ----
        if (s.destaques?.length) {
          const cartoes = s.destaques.slice(0, 3);
          const gap = 10;
          const w = (largura - gap * (cartoes.length - 1)) / cartoes.length;
          const h = 58;
          novaPaginaSeNecessario(h + 10);
          const y0 = pdf.y;
          cartoes.forEach((d, i) => {
            const x = MARGEM + i * (w + gap);
            pdf.roundedRect(x, y0, w, h, 6).fillAndStroke(FUNDO_CARD, BORDA);
            pdf.fillColor(CINZA).font('Helvetica-Bold').fontSize(7.5).text(cortar(d.rotulo, 60).toUpperCase(), x + 10, y0 + 10, { width: w - 20 });
            pdf.fillColor(VERDE_ESCURO).font('Helvetica-Bold').fontSize(17).text(cortar(d.valor, 24), x + 10, y0 + 23, { width: w - 20, lineBreak: false });
            if (d.detalhe) pdf.fillColor(CINZA).font('Helvetica').fontSize(7).text(cortar(d.detalhe, 70), x + 10, y0 + 44, { width: w - 20, lineBreak: false });
          });
          pdf.x = MARGEM;
          pdf.y = y0 + h + 14;
        }

        // ---- Comparativo de dois cenários (cartões "hoje" x "simulado") ----
        if (s.comparativo) {
          const c = s.comparativo;
          const gap = 12;
          const colW = (largura - gap) / 2;
          pdf.font('Helvetica').fontSize(9);
          const linhasH = (linhas: { rotulo: string; valor: string }[]) => 14 + linhas.length * 28;
          const h = Math.max(linhasH(c.linhasA), linhasH(c.linhasB)) + 16;
          novaPaginaSeNecessario(h + 14);
          const y0 = pdf.y;

          const cartao = (x: number, titulo: string, selo: string | undefined, linhas: { rotulo: string; valor: string }[], destacado: boolean) => {
            if (destacado) {
              pdf.roundedRect(x, y0, colW, h, 6).fillAndStroke(FUNDO_CARD, VERDE);
            } else {
              pdf.roundedRect(x, y0, colW, h, 6).fillAndStroke(BRANCO, BORDA);
            }
            pdf.fillColor(VERDE_ESCURO).font('Helvetica-Bold').fontSize(10.5).text(cortar(titulo, 40), x + 12, y0 + 12, { width: colW - 80, lineBreak: false });
            if (selo) {
              const wSelo = pdf.widthOfString(selo.toUpperCase()) + 14;
              pdf.roundedRect(x + colW - wSelo - 12, y0 + 10, wSelo, 16, 8).fill(destacado ? VERDE : '#e4e9e5');
              pdf.fillColor(destacado ? BRANCO : CINZA).font('Helvetica-Bold').fontSize(7).text(selo.toUpperCase(), x + colW - wSelo - 12, y0 + 15, { width: wSelo, align: 'center' });
            }
            let yy = y0 + 34;
            linhas.forEach((l) => {
              pdf.fillColor(CINZA).font('Helvetica').fontSize(7.5).text(cortar(l.rotulo, 60).toUpperCase(), x + 12, yy, { width: colW - 24 });
              pdf.fillColor(destacado ? VERDE : TEXTO).font('Helvetica-Bold').fontSize(13).text(cortar(l.valor, 30), x + 12, yy + 10, { width: colW - 24, lineBreak: false });
              yy += 28;
            });
          };
          cartao(MARGEM, c.tituloA, c.selosA, c.linhasA, false);
          cartao(MARGEM + colW + gap, c.tituloB, c.selosB, c.linhasB, Boolean(c.destacarB));
          pdf.x = MARGEM;
          pdf.y = y0 + h + 14;
        }

        if (s.blocos) {
          const colW = (largura - 10) / 2;
          s.blocos.slice(0, 12).forEach((b) => {
            pdf.font('Helvetica').fontSize(9);
            const hEra = pdf.heightOfString(cortar(b.era, 400), { width: colW });
            const hFica = pdf.heightOfString(cortar(b.fica, 400), { width: colW });
            const h = Math.max(hEra, hFica) + 30;
            novaPaginaSeNecessario(h);
            const y0 = pdf.y;
            pdf.rect(MARGEM, y0, largura, 14).fill(FUNDO_CARD);
            pdf.fillColor(VERDE_ESCURO).font('Helvetica-Bold').fontSize(9).text(cortar(b.tema, 80) + (b.base ? `  (${cortar(b.base, 60)})` : ''), MARGEM + 4, y0 + 3, { width: largura - 8, lineBreak: false });
            pdf.fillColor(CINZA).font('Helvetica-Bold').fontSize(8).text('COMO ERA', MARGEM + 4, y0 + 18, { width: colW, lineBreak: false });
            pdf.text('COMO FICA', MARGEM + 4 + colW + 10, y0 + 18, { width: colW, lineBreak: false });
            pdf.fillColor(TEXTO).font('Helvetica').fontSize(9);
            pdf.text(cortar(b.era, 400), MARGEM + 4, y0 + 29, { width: colW - 4 });
            pdf.text(cortar(b.fica, 400), MARGEM + 4 + colW + 10, y0 + 29, { width: colW - 4 });
            let fim = y0 + 29 + Math.max(hEra, hFica);
            if (b.confirmar) {
              pdf.font('Helvetica-Oblique').fontSize(8).fillColor(CINZA).text(`A confirmar: ${cortar(b.confirmar, 200)}`, MARGEM + 4, fim + 2, { width: largura - 8 });
              fim = pdf.y;
            }
            pdf.x = MARGEM;
            pdf.y = fim + 8;
          });
        }

        if (s.tabela) {
          const cab = s.tabela.cabecalho.slice(0, 8);
          const w = largura / cab.length;
          const linha = (cels: string[], negrito: boolean, fundo?: string) => {
            const h = 20;
            novaPaginaSeNecessario(h);
            const yy = pdf.y;
            if (fundo) pdf.rect(MARGEM, yy, largura, h).fill(fundo);
            pdf.fillColor(negrito ? BRANCO : TEXTO).font(negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
            cels.slice(0, cab.length).forEach((c, i) => pdf.text(cortar(c, 40), MARGEM + 6 + i * w, yy + 6, { width: w - 10, lineBreak: false }));
            pdf.x = MARGEM;
            pdf.y = yy + h;
          };
          pdf.moveDown(0.25);
          linha(cab, true, VERDE);
          s.tabela.linhas.slice(0, 40).forEach((l, i) => linha(l, false, i % 2 ? FUNDO_CARD : undefined));
        }
        pdf.moveDown(0.9);
      }

      // ---- Chamada final para ação (CTA forte, com link clicável) ----
      if (doc.cta) {
        const { titulo, texto, whatsapp, whatsappTexto, email } = doc.cta;
        pdf.font('Helvetica').fontSize(9.5);
        const alturaTexto = pdf.heightOfString(cortar(texto, 500), { width: largura - 24 });
        const h = 46 + alturaTexto + (whatsapp || email ? 30 : 0);
        novaPaginaSeNecessario(h + 10);
        const y0 = pdf.y;
        pdf.roundedRect(MARGEM, y0, largura, h, 8).fill(VERDE_ESCURO);
        pdf.fillColor(BRANCO).font('Helvetica-Bold').fontSize(13).text(cortar(titulo, 100), MARGEM + 16, y0 + 14, { width: largura - 32 });
        pdf.font('Helvetica').fontSize(9.5).fillColor('#dbe8e0').text(cortar(texto, 500), MARGEM + 16, pdf.y + 4, { width: largura - 32, lineGap: 1.5 });

        if (whatsapp) {
          const rotulo = 'Falar no WhatsApp »';
          pdf.font('Helvetica-Bold').fontSize(10);
          const wBotao = pdf.widthOfString(rotulo) + 28;
          const yBotao = y0 + h - 30;
          pdf.roundedRect(MARGEM + 16, yBotao, wBotao, 24, 12).fill(AMBAR_FUNDO);
          pdf.fillColor(VERDE_ESCURO).text(rotulo, MARGEM + 16, yBotao + 7, { width: wBotao, align: 'center', lineBreak: false });
          const url = whatsappTexto ? `${whatsapp}?text=${encodeURIComponent(whatsappTexto)}` : whatsapp;
          pdf.link(MARGEM + 16, yBotao, wBotao, 24, url);
          if (email) {
            pdf.font('Helvetica').fontSize(9).fillColor('#dbe8e0').text(email, MARGEM + 16 + wBotao + 16, yBotao + 7, { lineBreak: false });
            const wEmail = pdf.widthOfString(email);
            pdf.link(MARGEM + 16 + wBotao + 16, yBotao + 2, wEmail, 16, `mailto:${email}`);
          }
        }
        pdf.x = MARGEM;
        pdf.y = y0 + h + 16;
      }

      const aviso = doc.aviso ||
        'Estimativa orientativa, baseada em premissas simplificadas e na legislação vigente na data de emissão. Não constitui parecer tributário; valide com um especialista antes de decidir.';
      novaPaginaSeNecessario(40);
      pdf.font('Helvetica-Oblique').fontSize(8).fillColor(CINZA).text(cortar(aviso, 600), MARGEM, pdf.y, { width: largura, lineGap: 1 });

      // ---- Rodapé de marca + numeração, repetido em todas as páginas ----
      // Desenhar DENTRO da margem inferior faria o PDFKit entender que o texto
      // não cabe e "continuar" pra uma página nova sozinho (continueOnNewPage)
      // — por isso zeramos a margem inferior só durante o desenho do rodapé.
      const paginas = pdf.bufferedPageRange();
      for (let i = paginas.start; i < paginas.start + paginas.count; i++) {
        pdf.switchToPage(i);
        const margemInferiorOriginal = pdf.page.margins.bottom;
        pdf.page.margins.bottom = 0;
        const yRodape = pdf.page.height - 38;
        pdf.rect(MARGEM, yRodape, largura, 0.75).fill(BORDA);
        pdf.font('Helvetica').fontSize(8).fillColor(CINZA)
          .text(`InTAX por FAL Agro  ·  ${SITE}`, MARGEM, yRodape + 8, { width: largura - 80, lineBreak: false });
        pdf.text(`${i + 1} / ${paginas.count}`, MARGEM, yRodape + 8, { width: largura, align: 'right', lineBreak: false });
        pdf.link(MARGEM, yRodape + 6, pdf.widthOfString('InTAX por FAL Agro  ·  ' + SITE) + 4, 12, `https://${SITE}`);
        pdf.page.margins.bottom = margemInferiorOriginal;
      }

      pdf.end();
    });
  }
}
