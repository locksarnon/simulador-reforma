/**
 * Peças de desenho compartilhadas pelos PDF dos documentos fiscais (DANFE, DACTE, DAMDFE, DANFE NFC-e e DANFSe):
 * caixas e campos com rótulo, texto que se ajusta à largura, código de barras Code 128C, QR Code, marca d'água e a
 * montagem do arquivo. Só as fontes padrão do PDF (Helvetica), que não precisam ser embutidas.
 */
import PDFDocument from 'pdfkit';
import { largurasCode128C } from './code128';
import { NivelQr, matrizQr } from './qr';

export type Alinhamento = 'left' | 'right' | 'center';
export interface OpcoesTexto { fonte?: string; tam?: number; alinhar?: Alinhamento; cor?: string; altura?: number }

export const A4 = { largura: 595.28, altura: 841.89 };
export const NORMAL = 'Helvetica';
export const NEGRITO = 'Helvetica-Bold';

/** Opções comuns a todos os PDF. */
export interface OpcoesPdf {
  /** O documento foi cancelado (evento de cancelamento): marca d'água "CANCELADA" em todas as páginas. */
  cancelada?: boolean;
  /** O documento foi denegado: marca d'água "DENEGADA". */
  denegada?: boolean;
  /** PDF sem compressão (só os testes usam, para ler o texto do arquivo). */
  semCompressao?: boolean;
}

export class Pintor {
  /** `mx` é a margem lateral e `largura` a largura útil da página (o padrão é o A4 em pé com 14 pt de margem). */
  constructor(readonly doc: PDFKit.PDFDocument, readonly mx = 14, readonly largura = A4.largura - 28) {}

  caixa(x: number, y: number, w: number, h: number) {
    this.doc.lineWidth(0.5).strokeColor('#000').rect(x, y, w, h).stroke();
  }

  linha(x1: number, y1: number, x2: number, y2: number) {
    this.doc.lineWidth(0.5).strokeColor('#000').moveTo(x1, y1).lineTo(x2, y2).stroke();
  }

  /** Corta o texto com reticências para caber na largura. */
  ajustar(txt: string, largura: number): string {
    if (this.doc.widthOfString(txt) <= largura) return txt;
    let ini = 0;
    let fim = txt.length;
    while (ini < fim) {
      const meio = Math.ceil((ini + fim) / 2);
      if (this.doc.widthOfString(`${txt.slice(0, meio)}…`) <= largura) ini = meio;
      else fim = meio - 1;
    }
    return `${txt.slice(0, ini)}…`;
  }

  /** Texto numa linha só (cortado se passar da largura) ou, com `altura`, em várias linhas dentro da altura. */
  texto(txt: string, x: number, y: number, largura: number, o: OpcoesTexto = {}) {
    const { fonte = NORMAL, tam = 7, alinhar = 'left', cor = '#000', altura } = o;
    if (!txt) return;
    this.doc.font(fonte).fontSize(tam).fillColor(cor);
    if (altura === undefined) {
      this.doc.text(this.ajustar(txt, largura), x, y, { width: largura + 1, align: alinhar, lineBreak: false });
    } else {
      this.doc.text(txt, x, y, { width: largura, height: altura, align: alinhar, ellipsis: true });
    }
  }

  /** Altura que o texto ocupa, quebrado na largura dada. */
  altura(txt: string, largura: number, tam: number, fonte = NORMAL): number {
    this.doc.font(fonte).fontSize(tam);
    return this.doc.heightOfString(txt, { width: largura });
  }

  /** Caixa com o rótulo pequeno em cima e o valor embaixo. */
  campo(x: number, y: number, w: number, h: number, rotulo: string, valor: string, o: { alinhar?: Alinhamento; negrito?: boolean; tam?: number; multilinha?: boolean } = {}) {
    this.caixa(x, y, w, h);
    this.texto(rotulo, x + 2, y + 1.6, w - 4, { tam: 4.8, cor: '#333' });
    if (!valor) return;
    const opcoes: OpcoesTexto = { fonte: o.negrito ? NEGRITO : NORMAL, tam: o.tam ?? 7.5, alinhar: o.alinhar ?? 'left' };
    if (o.multilinha) this.texto(valor, x + 2, y + 8, w - 4, { ...opcoes, altura: h - 9 });
    else this.texto(valor, x + 2, y + 8.4, w - 4, opcoes);
  }

  /** Título de bloco (acima das caixas); devolve o `y` onde as caixas começam. */
  titulo(txt: string, y: number): number {
    this.texto(txt, this.mx, y, this.largura, { fonte: NEGRITO, tam: 6.5 });
    return y + 8.5;
  }

  /** Linha de campos lado a lado; a última célula completa a largura da página. */
  linhaDeCampos(y: number, h: number, celulas: { w: number; rotulo: string; valor: string; alinhar?: Alinhamento; negrito?: boolean; multilinha?: boolean }[]): number {
    let x = this.mx;
    const fixa = celulas.slice(0, -1).reduce((acc, c) => acc + c.w, 0);
    celulas.forEach((c, i) => {
      const w = i === celulas.length - 1 ? this.largura - fixa : c.w;
      this.campo(x, y, w, h, c.rotulo, c.valor, { alinhar: c.alinhar, negrito: c.negrito, multilinha: c.multilinha });
      x += w;
    });
    return y + h;
  }

  /** Código de barras Code 128 (conjunto C) de uma sequência de dígitos de quantidade par, na largura e altura dadas. */
  codigoDeBarras(x: number, y: number, largura: number, altura: number, digitos: string) {
    const larguras = largurasCode128C(digitos);
    const modulo = largura / larguras.reduce((a, b) => a + b, 0);
    let cx = x;
    larguras.forEach((l, i) => {
      if (i % 2 === 0) this.doc.rect(cx, y, l * modulo, altura).fill('#000');
      cx += l * modulo;
    });
  }

  /**
   * QR Code do texto num quadrado de `tamanho` pt, só com os módulos (a margem de silêncio é por conta de quem chama:
   * deixe em branco pelo menos 4 módulos em volta). Os módulos vão num caminho só, sem fresta entre vizinhos.
   */
  qrCode(x: number, y: number, tamanho: number, texto: string, nivel: NivelQr = 'M') {
    const matriz = matrizQr(texto, nivel);
    const n = matriz.length;
    const modulo = tamanho / n;
    for (let linha = 0; linha < n; linha += 1) {
      let coluna = 0;
      while (coluna < n) {
        if (!matriz[linha][coluna]) { coluna += 1; continue; }
        let fim = coluna;
        while (fim < n && matriz[linha][fim]) fim += 1;
        this.doc.rect(x + coluna * modulo, y + linha * modulo, (fim - coluna) * modulo, modulo);
        coluna = fim;
      }
    }
    this.doc.fill('#000');
  }
}

/** Maior começo do texto que cabe na altura dada, cortando de preferência entre palavras. */
export function prefixoQueCabe(p: Pintor, texto: string, largura: number, altura: number, tam: number): number {
  let ini = 0;
  let fim = texto.length;
  while (ini < fim) {
    const meio = Math.ceil((ini + fim) / 2);
    if (p.altura(texto.slice(0, meio), largura, tam) <= altura) ini = meio;
    else fim = meio - 1;
  }
  if (ini >= texto.length) return ini;
  const espaco = Math.max(texto.lastIndexOf(' ', ini), texto.lastIndexOf('\n', ini));
  return espaco > ini * 0.6 ? espaco : ini;
}

/**
 * Marca d'água na diagonal da página atual (CANCELADA, DENEGADA, SEM VALOR FISCAL...). A letra tem o maior tamanho que deixa
 * a marca numa linha só ao longo de `comprimento` pt, e a marca fica no centro da página.
 */
export function marcaDagua(doc: PDFKit.PDFDocument, texto: string, cor: string, pagina: { largura: number; altura: number } = A4, comprimento = 760) {
  doc.save();
  doc.rotate(-45, { origin: [pagina.largura / 2, pagina.altura / 2] });
  doc.font(NEGRITO).fontSize(100);
  const tam = Math.min(96, (comprimento * 100) / doc.widthOfString(texto));
  doc.fontSize(tam).fillColor(cor).fillOpacity(0.14);
  doc.text(texto, (pagina.largura - 900) / 2, pagina.altura / 2 - tam / 2, { width: 900, align: 'center', lineBreak: false });
  doc.restore();
}

export interface OpcoesDocumento {
  titulo: string;
  assunto: string;
  /** Tamanho da página em pt (largura, altura); o padrão é o A4 em pé. */
  tamanho?: [number, number];
  semCompressao?: boolean;
}

/**
 * Cria o PDF, deixa `desenho` pintar (as páginas ficam em memória até o fim, então dá para voltar a elas com `switchToPage`
 * e escrever "FOLHA n/N" e as marcas d'água) e devolve o arquivo pronto. Erros do desenho rejeitam a promessa.
 */
export function montarPdf(opcoes: OpcoesDocumento, desenho: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: opcoes.tamanho ?? 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      bufferPages: true,
      compress: !opcoes.semCompressao,
      info: { Title: opcoes.titulo, Author: 'InTAX', Subject: opcoes.assunto, Creator: 'InTAX' },
    });
    const partes: Buffer[] = [];
    doc.on('data', (c: Buffer) => partes.push(c));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    try {
      desenho(doc);
      doc.flushPages();
      doc.end();
    } catch (e) {
      doc.end();
      reject(e);
    }
  });
}
