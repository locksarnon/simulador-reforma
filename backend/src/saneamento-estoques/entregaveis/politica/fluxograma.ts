/**
 * Fluxograma vertical de um procedimento: Início -> passos (caixas, com responsável) e decisões (losangos; o ramo de `segue` (padrão "Sim") continua para baixo,
 * o outro sai à direita para a caixa do desvio) -> Fim. Nenhuma forma é cortada entre páginas: se a próxima não couber, a página termina
 * com "Continua na próxima página" e o fluxo segue no topo da seguinte, com a indicação da continuação.
 */
import type { Procedimento } from '../../diretrizes/tipos';
import { AMBAR, AMBAR_FUNDO, BRANCO, CINZA, FUNDO_CARD, TEXTO, VERDE, VERDE_ESCURO } from './estilo';
import { limpar } from './texto';

type Etapa = Procedimento['fluxo'][number];
export type TipoNo = 'inicio' | 'passo' | 'decisao' | 'desvio' | 'fim';
/** Posição de cada forma desenhada (página começa em 0), para conferência. */
export type GeometriaNo = { pagina: number; tipo: TipoNo; numero: number | null; x: number; y: number; w: number; h: number; texto: string };

const TAM_TEXTO = 9;
const TAM_RESP = 7.5;
const TAM_ROTULO = 8;
const H_TERMINAL = 22;
const W_TERMINAL = 84;
const SETA = 22;
/** Espaço guardado no pé da página para a indicação de continuação. */
const RESERVA_CONTINUA = 18;
const MAX_TEXTO = 400;

type Medidas = { x0: number; w: number; cx: number; xDesvio: number; wDesvio: number };
const medidas = (x: number, largura: number): Medidas => {
  const x0 = x + 24;
  const w = Math.min(262, largura * 0.53);
  const xDesvio = x0 + w + 42;
  return { x0, w, cx: x0 + w / 2, xDesvio, wDesvio: x + largura - xDesvio };
};

const textoPasso = (e: Etapa) => limpar(e.tipo === 'passo' ? e.texto : e.pergunta).slice(0, MAX_TEXTO);

function alturaTexto(pdf: PDFKit.PDFDocument, t: string, largura: number, tam: number, negrito = false) {
  pdf.font(negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(tam);
  return pdf.heightOfString(t, { width: largura, align: 'center' });
}

type Bloco = { h: number; hForma: number; hDesvio: number };
function bloco(pdf: PDFKit.PDFDocument, e: Etapa, m: Medidas): Bloco {
  if (e.tipo === 'passo') {
    const resp = e.responsavel ? alturaTexto(pdf, limpar(e.responsavel), m.w - 20, TAM_RESP, true) + 3 : 0;
    const h = Math.max(32, 16 + resp + alturaTexto(pdf, textoPasso(e), m.w - 20, TAM_TEXTO));
    return { h, hForma: h, hDesvio: 0 };
  }
  // Losango: o texto ocupa a metade central da largura; a altura dobra a do texto para caber dentro das diagonais.
  const hForma = Math.max(58, 2 * alturaTexto(pdf, textoPasso(e), m.w * 0.52, TAM_TEXTO, true) + 20);
  const hDesvio = Math.max(30, alturaTexto(pdf, limpar(ramos(e).desvioTxt).slice(0, MAX_TEXTO), m.wDesvio - 16, TAM_ROTULO + 0.5) + 16);
  return { h: Math.max(hForma, hDesvio), hForma, hDesvio };
}

/** Ramo que continua o fluxo (seta para baixo) e ramo de desvio (caixa à direita), conforme `segue` (padrão SIM). */
const ramos = (e: Extract<Etapa, { tipo: 'decisao' }>) => (e.segue === 'NAO' ? { segueRot: 'Não', segueTxt: e.nao, desvioRot: 'Sim', desvioTxt: e.sim } : { segueRot: 'Sim', segueTxt: e.sim, desvioRot: 'Não', desvioTxt: e.nao });

/** Altura do rótulo do ramo que continua, que acompanha a seta que sai de uma decisão. */
function alturaSim(pdf: PDFKit.PDFDocument, e: Etapa | null, m: Medidas) {
  if (!e || e.tipo !== 'decisao') return 0;
  return alturaTexto(pdf, `${ramos(e).segueRot}: ${limpar(ramos(e).segueTxt)}`.slice(0, MAX_TEXTO), m.w / 2 - 10, TAM_ROTULO);
}
const vao = (pdf: PDFKit.PDFDocument, anterior: Etapa | null, m: Medidas) => Math.max(SETA, alturaSim(pdf, anterior, m) + 10);

/**
 * Altura que o fluxograma ocupa: Início + as primeiras `etapas` (todas, por padrão) + Fim quando todas couberem, + a folga final.
 * Usada para decidir onde começar o fluxo (inteiro numa página quando possível; senão, com um trecho legível antes de continuar).
 */
export function alturaFluxo(pdf: PDFKit.PDFDocument, fluxo: Procedimento['fluxo'], x: number, largura: number, etapas = fluxo.length): number {
  const m = medidas(x, largura);
  let h = H_TERMINAL;
  let anterior: Etapa | null = null;
  for (const e of fluxo.slice(0, etapas)) { h += vao(pdf, anterior, m) + bloco(pdf, e, m).h; anterior = e; }
  return etapas >= fluxo.length ? h + vao(pdf, anterior, m) + H_TERMINAL + 10 : h + RESERVA_CONTINUA;
}
/** Altura mínima para começar o fluxograma na página: Início + 1ª forma. */
export const alturaInicialFluxo = (pdf: PDFKit.PDFDocument, fluxo: Procedimento['fluxo'], x: number, largura: number) => alturaFluxo(pdf, fluxo, x, largura, Math.min(1, fluxo.length));

function setaBaixo(pdf: PDFKit.PDFDocument, cx: number, y1: number, y2: number) {
  pdf.save().lineWidth(1).strokeColor(CINZA).moveTo(cx, y1).lineTo(cx, y2 - 5).stroke();
  pdf.polygon([cx - 4, y2 - 6], [cx + 4, y2 - 6], [cx, y2]).fill(CINZA).restore();
}
function setaDireita(pdf: PDFKit.PDFDocument, x1: number, x2: number, y: number) {
  pdf.save().lineWidth(1).strokeColor(CINZA).moveTo(x1, y).lineTo(x2 - 5, y).stroke();
  pdf.polygon([x2 - 6, y - 4], [x2 - 6, y + 4], [x2, y]).fill(CINZA).restore();
}

export function desenharFluxograma(
  pdf: PDFKit.PDFDocument, fluxo: Procedimento['fluxo'],
  o: { x: number; largura: number; limiteInferior: number; titulo: string },
): GeometriaNo[] {
  const m = medidas(o.x, o.largura);
  const geo: GeometriaNo[] = [];
  const pagina = () => pdf.bufferedPageRange().start + pdf.bufferedPageRange().count - 1;
  const limite = o.limiteInferior - RESERVA_CONTINUA;
  const reg = (tipo: TipoNo, numero: number | null, x: number, y: number, w: number, h: number, texto: string) => geo.push({ pagina: pagina(), tipo, numero, x, y, w, h, texto });

  const terminal = (y: number, rotulo: string, tipo: 'inicio' | 'fim') => {
    const x = m.cx - W_TERMINAL / 2;
    pdf.roundedRect(x, y, W_TERMINAL, H_TERMINAL, H_TERMINAL / 2).fill(VERDE_ESCURO);
    pdf.fillColor(BRANCO).font('Helvetica-Bold').fontSize(8.5).text(rotulo, x, y + 7, { width: W_TERMINAL, align: 'center', lineBreak: false });
    reg(tipo, null, x, y, W_TERMINAL, H_TERMINAL, rotulo);
  };
  const numeroNo = (n: number, cy: number) => {
    pdf.circle(o.x + 9, cy, 8).fill(VERDE);
    pdf.fillColor(BRANCO).font('Helvetica-Bold').fontSize(7.5).text(String(n), o.x + 1, cy - 3.2, { width: 16, align: 'center', lineBreak: false });
  };

  let y = pdf.y;
  if (y + alturaInicialFluxo(pdf, fluxo, o.x, o.largura) > o.limiteInferior) { pdf.addPage(); y = pdf.y; }
  terminal(y, 'Início', 'inicio');
  /** Ponto de onde sai a próxima seta e a etapa anterior (para o rótulo "Sim"). */
  let saida = y + H_TERMINAL;
  let anterior: Etapa | null = null;

  const desenharSetaEntrada = (de: number, ate: number) => {
    setaBaixo(pdf, m.cx, de, ate);
    if (anterior?.tipo === 'decisao') {
      pdf.fillColor(VERDE).font('Helvetica-Bold').fontSize(TAM_ROTULO).text(`${ramos(anterior).segueRot}: `, m.cx + 6, de + 4, { width: m.w / 2 - 10, continued: true })
        .fillColor(TEXTO).font('Helvetica').text(limpar(ramos(anterior).segueTxt).slice(0, MAX_TEXTO));
    }
  };
  /** Garante espaço para a seta + forma; se não couber, fecha a página com a indicação e continua no topo da seguinte. */
  const reservar = (hForma: number, numero: number | null) => {
    const v = vao(pdf, anterior, m);
    if (saida + v + hForma <= limite) return saida + v;
    setaBaixo(pdf, m.cx, saida, saida + 8);
    pdf.fillColor(CINZA).font('Helvetica-Oblique').fontSize(7.5)
      .text('Continua na próxima página', m.cx + 8, saida + 1, { width: m.w / 2 + 60, lineBreak: false });
    pdf.addPage();
    const topo = pdf.y;
    pdf.fillColor(CINZA).font('Helvetica-Oblique').fontSize(7.5)
      .text(`Continuação do fluxograma: ${limpar(o.titulo)}${numero ? ` (etapa ${numero})` : ''}`, o.x, topo, { width: o.largura, lineBreak: false });
    saida = topo + 14;
    return saida + v;
  };

  fluxo.forEach((e, i) => {
    const n = i + 1;
    const b = bloco(pdf, e, m);
    const topo = reservar(b.h, n);
    if (e.tipo === 'passo') {
      desenharSetaEntrada(saida, topo);
      pdf.roundedRect(m.x0, topo, m.w, b.h, 5).fillAndStroke(FUNDO_CARD, VERDE);
      let yy = topo + 8;
      if (e.responsavel) {
        pdf.fillColor(VERDE).font('Helvetica-Bold').fontSize(TAM_RESP).text(limpar(e.responsavel).toLocaleUpperCase('pt-BR'), m.x0 + 10, yy, { width: m.w - 20, align: 'center' });
        yy = pdf.y + 3;
      }
      const t = textoPasso(e);
      const ht = alturaTexto(pdf, t, m.w - 20, TAM_TEXTO);
      // centraliza o texto no espaço que sobra (caixa de altura mínima)
      const livre = topo + b.h - 8 - yy;
      pdf.fillColor(TEXTO).font('Helvetica').fontSize(TAM_TEXTO).text(t, m.x0 + 10, yy + Math.max(0, (livre - ht) / 2), { width: m.w - 20, align: 'center' });
      numeroNo(n, topo + b.h / 2);
      reg('passo', n, m.x0, topo, m.w, b.h, t);
      saida = topo + b.h;
    } else {
      const yd = topo + (b.h - b.hForma) / 2;
      desenharSetaEntrada(saida, yd);
      const cy = yd + b.hForma / 2;
      pdf.polygon([m.cx, yd], [m.x0 + m.w, cy], [m.cx, yd + b.hForma], [m.x0, cy]).fillAndStroke(AMBAR_FUNDO, AMBAR);
      const t = textoPasso(e);
      const wt = m.w * 0.52;
      const ht = alturaTexto(pdf, t, wt, TAM_TEXTO, true);
      pdf.fillColor(VERDE_ESCURO).font('Helvetica-Bold').fontSize(TAM_TEXTO).text(t, m.cx - wt / 2, cy - ht / 2, { width: wt, align: 'center' });
      numeroNo(n, cy);
      reg('decisao', n, m.x0, yd, m.w, b.hForma, t);
      // ramo de desvio: seta para a direita até a caixa do desvio
      setaDireita(pdf, m.x0 + m.w, m.xDesvio, cy);
      pdf.fillColor(AMBAR).font('Helvetica-Bold').fontSize(TAM_ROTULO).text(ramos(e).desvioRot, m.x0 + m.w + 4, cy - 11, { width: m.xDesvio - m.x0 - m.w - 8, align: 'center', lineBreak: false });
      const yDes = topo + (b.h - b.hDesvio) / 2;
      const nao = limpar(ramos(e).desvioTxt).slice(0, MAX_TEXTO);
      pdf.roundedRect(m.xDesvio, yDes, m.wDesvio, b.hDesvio, 5).lineWidth(1).fillAndStroke(BRANCO, AMBAR);
      const hn = alturaTexto(pdf, nao, m.wDesvio - 16, TAM_ROTULO + 0.5);
      pdf.fillColor(TEXTO).font('Helvetica').fontSize(TAM_ROTULO + 0.5).text(nao, m.xDesvio + 8, yDes + (b.hDesvio - hn) / 2, { width: m.wDesvio - 16, align: 'center' });
      reg('desvio', n, m.xDesvio, yDes, m.wDesvio, b.hDesvio, nao);
      saida = yd + b.hForma;
    }
    anterior = e;
  });

  const topoFim = reservar(H_TERMINAL, null);
  desenharSetaEntrada(saida, topoFim);
  terminal(topoFim, 'Fim', 'fim');
  pdf.x = o.x;
  pdf.y = topoFim + H_TERMINAL + 10;
  return geo;
}
