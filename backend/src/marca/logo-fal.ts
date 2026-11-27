/**
 * Logo da FAL no topo de tudo o que o sistema imprime, exporta ou manda por e-mail (regra da ferramenta inteira). Um só arquivo de logo
 * (backend/assets/logo-fal-agro.png, a mesma imagem de src/assets/marca/logo-fal.png do frontend) e um só jeito por tecnologia:
 *  - PDF (pdfkit): desenharLogoFal / logoFalNoTopoDasPaginas;
 *  - Excel (exceljs, pasta em memória): cabecalhoFalExcel em cada aba, antes da primeira linha (a logo ocupa a linha 1);
 *  - Excel em fluxo (WorkbookWriter, que não aceita imagem): reservarLinhaLogoFal em cada aba + logoFalNoXlsx no arquivo pronto;
 *  - e-mail: o MailService põe a logo (anexo embutido, cid) no topo de toda mensagem (comLogoFalNoEmail);
 *  - HTML gerado como documento: cabecalhoFalHtml (imagem embutida em base64).
 * Fora da regra: documentos fiscais de layout oficial (DANFE, DANFE NFC-e, DACTE, DAMDFE, DANFSe) e CSV (não leva imagem).
 * Um teste (src/marca/logo-fal.test.ts) falha se um arquivo novo gerar PDF ou Excel sem importar este módulo.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type ExcelJS from 'exceljs';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

const NOME_ARQUIVO = 'logo-fal-agro.png';
const CAMINHOS = [join(process.cwd(), 'assets', NOME_ARQUIVO), join(__dirname, '..', '..', 'assets', NOME_ARQUIVO)];
const caminho = CAMINHOS.find((c) => existsSync(c));

/** A logo (PNG 480 × 196). null só se o arquivo faltar: aí os documentos saem sem a imagem (nunca deixam de sair). */
export const LOGO_FAL: Buffer | null = caminho ? readFileSync(caminho) : null;
/** Largura / altura da imagem. */
export const LOGO_FAL_PROPORCAO = 480 / 196;

// ── PDF (pdfkit) ────────────────────────────────────────────────────────────

/** Desenha a logo em (x, y) com a altura dada (pontos). Devolve a largura usada (0 sem logo). */
export function desenharLogoFal(pdf: PDFKit.PDFDocument, x: number, y: number, altura: number): number {
  if (!LOGO_FAL) return 0;
  pdf.image(LOGO_FAL, x, y, { height: altura });
  return altura * LOGO_FAL_PROPORCAO;
}

/**
 * Logo no alto, à esquerda, de cada página já desenhada (documento com bufferPages: true; chamar antes do end()). `pular` = páginas (base 0)
 * que já têm a logo no próprio cabeçalho. A logo fica na margem de cima, sem mexer no conteúdo.
 */
export function logoFalNoTopoDasPaginas(pdf: PDFKit.PDFDocument, o: { x: number; y?: number; altura?: number; pular?: number[] }): number {
  if (!LOGO_FAL) return 0;
  const faixa = pdf.bufferedPageRange();
  let n = 0;
  for (let i = faixa.start; i < faixa.start + faixa.count; i++) {
    if (o.pular?.includes(i)) continue;
    pdf.switchToPage(i);
    const margem = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0; // desenhar fora da área útil não pode abrir página nova
    desenharLogoFal(pdf, o.x, o.y ?? 12, o.altura ?? 20);
    pdf.page.margins.bottom = margem;
    n++;
  }
  return n;
}

// ── Excel ───────────────────────────────────────────────────────────────────

/** Quantas linhas a logo ocupa no topo de cada aba (o conteúdo começa na linha LINHAS_LOGO_FAL + 1). */
export const LINHAS_LOGO_FAL = 1;
/** Altura da linha da logo, em pontos. */
export const ALTURA_LINHA_LOGO_FAL = 42;
const ALTURA_LOGO_PX = 46;
const LARGURA_LOGO_PX = Math.round(ALTURA_LOGO_PX * LOGO_FAL_PROPORCAO);

const idsPorPasta = new WeakMap<object, number>();
/**
 * Põe a logo na linha 1 da aba (canto superior esquerdo) e devolve quantas linhas ela ocupa: o conteúdo começa na linha seguinte (somar esse
 * número ao congelamento de painéis, ao filtro e às fórmulas). Chamar ANTES de escrever a primeira linha. A linha da logo fica sem valor
 * nenhum: quem lê a planilha de volta pulando linha em branco não a enxerga.
 */
export function cabecalhoFalExcel(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet): number {
  ws.getRow(1).height = ALTURA_LINHA_LOGO_FAL;
  if (LOGO_FAL) {
    let id = idsPorPasta.get(wb);
    if (id === undefined) {
      id = wb.addImage({ buffer: LOGO_FAL as unknown as ExcelJS.Buffer, extension: 'png' });
      idsPorPasta.set(wb, id);
    }
    ws.addImage(id, { tl: { col: 0.1, row: 0.12 } as ExcelJS.Anchor, ext: { width: LARGURA_LOGO_PX, height: ALTURA_LOGO_PX }, editAs: 'oneCell' });
  }
  return LINHAS_LOGO_FAL;
}

/** Aba em fluxo (WorkbookWriter): escreve a linha vazia e alta da logo. A imagem entra depois, no arquivo pronto (logoFalNoXlsx). */
export function reservarLinhaLogoFal(ws: ExcelJS.Worksheet): number {
  const r = ws.addRow([]);
  r.height = ALTURA_LINHA_LOGO_FAL;
  r.commit();
  return LINHAS_LOGO_FAL;
}

const EMU_POR_PX = 9525;
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL_DRAWING = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';
const REL_IMAGE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const CT_DRAWING = 'application/vnd.openxmlformats-officedocument.drawing+xml';
/** Elementos que vêm DEPOIS de <drawing> no XML da aba (ordem do esquema). */
const DEPOIS_DO_DRAWING = ['<legacyDrawing ', '<legacyDrawingHF', '<drawingHF', '<picture ', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>'];

const desenhoDaLogo = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>${6 * EMU_POR_PX}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${6 * EMU_POR_PX}</xdr:rowOff></xdr:from><xdr:ext cx="${LARGURA_LOGO_PX * EMU_POR_PX}" cy="${ALTURA_LOGO_PX * EMU_POR_PX}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo FAL"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${NS_R}" r:embed="rIdLogoFal"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${LARGURA_LOGO_PX * EMU_POR_PX}" cy="${ALTURA_LOGO_PX * EMU_POR_PX}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;

/**
 * Põe a logo (canto superior esquerdo, linha 1) em cada aba visível de um .xlsx pronto que ainda não tenha desenho — o caminho do Excel
 * escrito em fluxo, cujo gravador não aceita imagem. Abas ocultas ficam como estão. Devolve o arquivo novo.
 */
export function logoFalNoXlsx(xlsx: Buffer): Buffer {
  if (!LOGO_FAL) return xlsx;
  const arq = unzipSync(new Uint8Array(xlsx.buffer, xlsx.byteOffset, xlsx.byteLength));
  const ler = (n: string) => (arq[n] ? strFromU8(arq[n]) : '');
  const livro = ler('xl/workbook.xml');
  const relsLivro = ler('xl/_rels/workbook.xml.rels');
  const ocultas = new Set<string>();
  for (const m of livro.matchAll(/<sheet\b[^>]*>/g)) {
    if (!/state="(hidden|veryHidden)"/.test(m[0])) continue;
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    const alvo = rid ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*>`).exec(relsLivro)?.[0] : null;
    const t = alvo ? /Target="([^"]+)"/.exec(alvo)?.[1] : null;
    if (t) ocultas.add('xl/' + t.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }
  let tipos = ler('[Content_Types].xml');
  if (!/Extension="png"/i.test(tipos)) tipos = tipos.replace('<Default ', '<Default Extension="png" ContentType="image/png"/><Default ');
  // Nome só com letras e números: o leitor do ExcelJS ignora mídia com hífen no nome (a logo sumiria ao reabrir o arquivo).
  let media = 'xl/media/logofal.png';
  for (let k = 2; arq[media]; k++) media = `xl/media/logofal${k}.png`;
  arq[media] = new Uint8Array(LOGO_FAL);
  let n = 0;
  const abas = Object.keys(arq).filter((f) => /^xl\/worksheets\/[^/]+\.xml$/.test(f)).sort();
  for (const aba of abas) {
    let xml = ler(aba);
    if (ocultas.has(aba) || xml.includes('<drawing ')) continue;
    n++;
    const desenho = `xl/drawings/drawingLogoFal${n}.xml`;
    arq[desenho] = strToU8(desenhoDaLogo());
    arq[`xl/drawings/_rels/drawingLogoFal${n}.xml.rels`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogoFal" Type="${REL_IMAGE}" Target="../media/${media.split('/').pop()}"/></Relationships>`);
    const nomeRels = aba.replace(/^xl\/worksheets\//, 'xl/worksheets/_rels/') + '.rels';
    const rel = `<Relationship Id="rIdLogoFal" Type="${REL_DRAWING}" Target="../drawings/drawingLogoFal${n}.xml"/>`;
    arq[nomeRels] = strToU8(arq[nomeRels]
      ? ler(nomeRels).replace('</Relationships>', `${rel}</Relationships>`)
      : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`);
    if (!/<worksheet\b[^>]*xmlns:r=/.test(xml)) xml = xml.replace(/<worksheet\b/, `<worksheet xmlns:r="${NS_R}"`);
    const pos = Math.min(...DEPOIS_DO_DRAWING.map((t) => xml.indexOf(t)).filter((i) => i >= 0));
    xml = `${xml.slice(0, pos)}<drawing r:id="rIdLogoFal"/>${xml.slice(pos)}`;
    arq[aba] = strToU8(xml);
    tipos = tipos.replace('</Types>', `<Override PartName="/${desenho}" ContentType="${CT_DRAWING}"/></Types>`);
  }
  arq['[Content_Types].xml'] = strToU8(tipos);
  const saida: Zippable = {};
  for (const [nome, dados] of Object.entries(arq)) saida[nome] = [dados, { level: nome.endsWith('.png') ? 0 : 1 }];
  return Buffer.from(zipSync(saida));
}

// ── E-mail e HTML ───────────────────────────────────────────────────────────

/** Identificador da logo embutida no e-mail (src="cid:..."). */
export const CID_LOGO_FAL = 'logo-fal@intax';
const ALT = 'FAL Agro';

/** Bloco da logo no topo do e-mail (imagem embutida pelo cid; o anexo vem de anexoLogoFal). */
export const blocoLogoFalEmail = () =>
  `<div style="padding:16px 24px 12px;background:#ffffff"><img src="cid:${CID_LOGO_FAL}" alt="${ALT}" width="118" height="48" style="display:block;border:0;height:48px;width:auto"></div>`;

/** Anexo embutido (não aparece como arquivo anexo) que o cid do bloco da logo aponta. */
export const anexoLogoFal = () =>
  LOGO_FAL ? { filename: 'logo-fal.png', content: LOGO_FAL, contentType: 'image/png', cid: CID_LOGO_FAL, contentDisposition: 'inline' as const } : null;

/** Garante a logo no topo do HTML do e-mail: se o HTML ainda não a usa, o bloco entra logo depois de <body> (ou no começo). */
export function comLogoFalNoEmail(html: string): string {
  if (html.includes(`cid:${CID_LOGO_FAL}`)) return html;
  const corpo = /<body\b[^>]*>/i.exec(html);
  if (!corpo) return blocoLogoFalEmail() + html;
  const fim = corpo.index + corpo[0].length;
  return html.slice(0, fim) + blocoLogoFalEmail() + html.slice(fim);
}

/** Logo embutida em base64 para HTML gravado como documento (abre sem internet). */
export const cabecalhoFalHtml = () =>
  LOGO_FAL ? `<div style="margin:0 0 16px"><img src="data:image/png;base64,${LOGO_FAL.toString('base64')}" alt="${ALT}" style="height:48px;width:auto"></div>` : '';
