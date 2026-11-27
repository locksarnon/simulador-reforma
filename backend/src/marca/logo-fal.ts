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
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import type ExcelJS from 'exceljs';
import { Zip, ZipDeflate, inflateSync, strFromU8, strToU8, type ZipInputFile } from 'fflate';

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
/**
 * Filhos de <worksheet> que vêm DEPOIS de <drawing> (ordem do esquema CT_Worksheet). Os que vêm antes (… headerFooter, rowBreaks, colBreaks,
 * customProperties, cellWatches, ignoredErrors, smartTags) ficam antes da logo; sem nenhum destes, a logo entra antes de </worksheet>.
 */
const DEPOIS_DO_DRAWING = new Set(['legacyDrawing', 'legacyDrawingHF', 'drawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst']);

const desenhoDaLogo = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>${6 * EMU_POR_PX}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${6 * EMU_POR_PX}</xdr:rowOff></xdr:from><xdr:ext cx="${LARGURA_LOGO_PX * EMU_POR_PX}" cy="${ALTURA_LOGO_PX * EMU_POR_PX}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo FAL"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${NS_R}" r:embed="rIdLogoFal"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${LARGURA_LOGO_PX * EMU_POR_PX}" cy="${ALTURA_LOGO_PX * EMU_POR_PX}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;

const relsVazio = (corpo: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${corpo}</Relationships>`;

/** Uma entrada do diretório central do ZIP (o que basta para copiar os bytes comprimidos sem descomprimir). */
interface EntradaZip { nome: string; metodo: number; crc: number; tamComp: number; tam: number; inicioDados: number }

/** Lê o diretório central do .xlsx. ZIP64 (arquivo ou entrada ≥ 4 GB) não é suportado: erro explícito. */
function diretorioDoZip(zip: Buffer): EntradaZip[] {
  const minimo = Math.max(0, zip.length - 65557);
  let fim = -1;
  for (let i = zip.length - 22; i >= minimo; i--) if (zip.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error('logoFalNoXlsx: arquivo não é um ZIP (.xlsx) válido — fim do diretório central não encontrado');
  const total = zip.readUInt16LE(fim + 10);
  let p = zip.readUInt32LE(fim + 16);
  if (total === 0xffff || p === 0xffffffff) throw new Error('logoFalNoXlsx: ZIP64 não suportado');
  const entradas: EntradaZip[] = [];
  for (let k = 0; k < total; k++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('logoFalNoXlsx: diretório central do ZIP corrompido');
    const tamNome = zip.readUInt16LE(p + 28), tamExtra = zip.readUInt16LE(p + 30), tamComent = zip.readUInt16LE(p + 32);
    const tamComp = zip.readUInt32LE(p + 20), tam = zip.readUInt32LE(p + 24), local = zip.readUInt32LE(p + 42);
    if (tamComp === 0xffffffff || tam === 0xffffffff || local === 0xffffffff) throw new Error('logoFalNoXlsx: ZIP64 não suportado');
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error('logoFalNoXlsx: cabeçalho local do ZIP corrompido');
    entradas.push({
      nome: zip.toString('utf8', p + 46, p + 46 + tamNome),
      metodo: zip.readUInt16LE(p + 10),
      crc: zip.readUInt32LE(p + 16),
      tamComp,
      tam,
      inicioDados: local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28),
    });
    p += 46 + tamNome + tamExtra + tamComent;
  }
  return entradas;
}

const bytesDe = (zip: Buffer, e: EntradaZip) => zip.subarray(e.inicioDados, e.inicioDados + e.tamComp);
/** Conteúdo de uma entrada PEQUENA (workbook, rels, content types), descomprimida inteira. */
function textoDe(zip: Buffer, e: EntradaZip | undefined): string {
  if (!e) return '';
  const b = bytesDe(zip, e);
  if (e.metodo === 0) return strFromU8(b);
  if (e.metodo === 8) return strFromU8(inflateSync(b, { out: new Uint8Array(e.tam) }));
  throw new Error(`logoFalNoXlsx: método de compressão ${e.metodo} não suportado (${e.nome})`);
}

/** Cede a vez ao laço de eventos (o processamento de um arquivo grande não trava as outras requisições). */
const ceder = () => new Promise<void>((ok) => setImmediate(ok));
const FATIA = 64 * 1024;

/** Entrada copiada como está (bytes comprimidos, CRC e tamanhos do diretório central): sem descomprimir nem recomprimir. */
async function copiarBruto(zip: Zip, z: Buffer, e: EntradaZip): Promise<void> {
  const f: ZipInputFile = { filename: e.nome, crc: e.crc, size: e.tam, compression: e.metodo };
  zip.add(f);
  const dados = bytesDe(z, e);
  if (!dados.length) { f.ondata!(null, new Uint8Array(0), true); return; }
  for (let i = 0; i < dados.length; i += 8 * 1024 * 1024) {
    const fim = Math.min(dados.length, i + 8 * 1024 * 1024);
    f.ondata!(null, dados.subarray(i, fim) as Uint8Array<ArrayBuffer>, fim === dados.length); // subarray: sem cópia
  }
}

function adicionarTexto(zip: Zip, nome: string, conteudo: string | Uint8Array, nivel: 0 | 1 = 1): void {
  const f = new ZipDeflate(nome, { level: nivel });
  zip.add(f);
  f.push(typeof conteudo === 'string' ? strToU8(conteudo) : conteudo, true);
}

/**
 * Posição (no texto que começa logo depois de </sheetData>) onde <drawing> deve entrar: antes do primeiro filho de <worksheet> que o esquema
 * põe depois do desenho; sem nenhum, antes de </worksheet>. Só olha os filhos diretos de <worksheet> (um <picture> dentro de <extLst> não conta).
 * -1 se a aba já tem <drawing>. Erro se não achar o fechamento de <worksheet> (nunca escreve depois do documento).
 */
export function posicaoDoDrawing(cauda: string): number {
  const tag = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let nivel = 0;
  for (let m = tag.exec(cauda); m; m = tag.exec(cauda)) {
    if (!m[2]) continue; // comentário, CDATA, instrução de processamento
    const local = m[2].slice(m[2].indexOf(':') + 1);
    if (m[1]) {
      if (nivel === 0) {
        if (local !== 'worksheet') throw new Error(`logoFalNoXlsx: XML da aba malformado (</${m[2]}> fora de lugar)`);
        return m.index;
      }
      nivel--;
      continue;
    }
    if (nivel === 0) {
      if (local === 'drawing') return -1;
      if (DEPOIS_DO_DRAWING.has(local)) return m.index;
    }
    if (!m[4]) nivel++;
  }
  throw new Error('logoFalNoXlsx: </worksheet> não encontrado no XML da aba — posição do <drawing> indefinida');
}

const FIM_SHEETDATA = ['</sheetData>', '<sheetData/>'];
const SOBRA = 16; // maior marcador - 1, com folga: o marcador pode vir partido entre dois pedaços

/**
 * Remenda o XML de uma aba em fluxo: o começo (xmlns:r em <worksheet>, se faltar) e o fim (<drawing> no lugar do esquema). O meio — as linhas,
 * que são quase tudo — passa direto; só o trecho depois de </sheetData> (filtros, margens, mesclagens) fica na memória.
 */
class RemendoDaAba {
  private fase: 'cabeca' | 'corpo' | 'cauda' = 'cabeca';
  private pend: Buffer = Buffer.alloc(0);
  private cauda: Buffer[] = [];
  constructor(private readonly nome: string, private readonly saida: (b: Uint8Array, final: boolean) => void) {}

  empurrar(pedaco: Uint8Array): void {
    let buf = this.pend.length ? Buffer.concat([this.pend, pedaco]) : Buffer.from(pedaco.buffer, pedaco.byteOffset, pedaco.byteLength);
    this.pend = Buffer.alloc(0);
    if (this.fase === 'cabeca') {
      const ini = buf.indexOf('<worksheet');
      const fecha = ini >= 0 ? buf.indexOf('>', ini) : -1;
      if (fecha < 0) {
        if (buf.length > 1024 * 1024) throw new Error(`logoFalNoXlsx: <worksheet> não encontrado em ${this.nome}`);
        this.pend = Buffer.from(buf);
        return;
      }
      let abertura = buf.toString('utf8', ini, fecha + 1);
      if (!/\sxmlns:r=/.test(abertura)) abertura = abertura.replace(/^<worksheet\b/, `<worksheet xmlns:r="${NS_R}"`);
      this.saida(Buffer.concat([buf.subarray(0, ini), Buffer.from(abertura, 'utf8')]), false);
      buf = buf.subarray(fecha + 1);
      this.fase = 'corpo';
    }
    if (this.fase === 'corpo') {
      let fim = -1;
      for (const marca of FIM_SHEETDATA) {
        const i = buf.indexOf(marca);
        if (i >= 0 && (fim < 0 || i + marca.length < fim)) fim = i + marca.length;
      }
      if (fim < 0) {
        const corte = Math.max(0, buf.length - SOBRA);
        if (corte) this.saida(buf.subarray(0, corte), false);
        this.pend = Buffer.from(buf.subarray(corte));
        return;
      }
      this.saida(buf.subarray(0, fim), false);
      buf = buf.subarray(fim);
      this.fase = 'cauda';
    }
    this.cauda.push(Buffer.from(buf)); // cópia: o pedaço pode ser reaproveitado por quem descomprime
  }

  /** Fecha a aba: põe <drawing> no lugar do esquema e manda o fim. Erro se a aba já tiver <drawing> (sem a relação de desenho: inconsistente). */
  terminar(): void {
    if (this.fase !== 'cauda') throw new Error(`logoFalNoXlsx: </sheetData> não encontrado em ${this.nome}`);
    const cauda = Buffer.concat(this.cauda).toString('utf8');
    const pos = posicaoDoDrawing(cauda);
    if (pos < 0) throw new Error(`logoFalNoXlsx: ${this.nome} tem <drawing> sem a relação de desenho`);
    this.saida(Buffer.from(`${cauda.slice(0, pos)}<drawing r:id="rIdLogoFal"/>${cauda.slice(pos)}`, 'utf8'), true);
  }
}

/** CRC-32 (o do ZIP). zlib.crc32 existe no Node ≥ 20.15 / 22.2; a tabela é só a reserva. */
let tabelaCrc: Uint32Array | null = null;
function crc32(dados: Uint8Array, crc: number): number {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(dados, crc);
  if (!tabelaCrc) {
    tabelaCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tabelaCrc[n] = c >>> 0; }
  }
  let c = ~crc >>> 0;
  for (let i = 0; i < dados.length; i++) c = tabelaCrc[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/**
 * Descomprime a aba em fluxo, remenda o começo e o fim e recomprime. A descompressão e a compressão são do zlib do Node (rodam fora da thread
 * principal); aqui só passam pedaços de ~16 KB, então o laço de eventos nunca fica preso.
 */
async function remendarAba(zip: Zip, z: Buffer, e: EntradaZip): Promise<void> {
  if (e.metodo !== 0 && e.metodo !== 8) throw new Error(`logoFalNoXlsx: método de compressão ${e.metodo} não suportado (${e.nome})`);
  const f: ZipInputFile = { filename: e.nome, crc: 0, size: 0, compression: 8 };
  zip.add(f);
  const dados = bytesDe(z, e);
  const remendar = new Transform({
    transform(pedaco: Buffer, _cod, pronto) {
      try { remendo.empurrar(pedaco); pronto(); } catch (err) { pronto(err as Error); }
    },
    flush(pronto) {
      try { remendo.terminar(); pronto(); } catch (err) { pronto(err as Error); }
    },
  });
  const remendo = new RemendoDaAba(e.nome, (b) => {
    f.crc = crc32(b, f.crc);
    f.size += b.length;
    remendar.push(b);
  });
  const etapas: NodeJS.ReadWriteStream[] = e.metodo === 8 ? [zlib.createInflateRaw(), remendar] : [remendar];
  await pipeline(
    Readable.from((function* () { for (let i = 0; i < dados.length; i += FATIA) yield dados.subarray(i, i + FATIA); })()),
    ...(etapas as [NodeJS.ReadWriteStream]),
    zlib.createDeflateRaw({ level: 1 }),
    new Writable({
      write(pedaco: Buffer, _cod, pronto) { f.ondata!(null, new Uint8Array(pedaco.buffer, pedaco.byteOffset, pedaco.byteLength) as Uint8Array<ArrayBuffer>, false); pronto(); },
      final(pronto) { f.ondata!(null, new Uint8Array(0), true); pronto(); },
    }),
  );
}

/**
 * Põe a logo (canto superior esquerdo, linha 1) em cada aba visível de um .xlsx pronto que ainda não tenha desenho — o caminho do Excel
 * escrito em fluxo, cujo gravador não aceita imagem. Abas ocultas ficam como estão. Devolve o arquivo novo.
 *
 * Em fluxo, sem descomprimir o arquivo inteiro: as entradas que não mudam são copiadas comprimidas como estão; cada aba é descomprimida em
 * fluxo (zlib do Node, fora da thread principal) e só o começo (<worksheet>) e o fim (depois de </sheetData>) são remendados. Na memória
 * fica o .xlsx de entrada e o de saída (comprimidos), nunca o XML das abas inteiro.
 */
export async function logoFalNoXlsx(xlsx: Buffer): Promise<Buffer> {
  if (!LOGO_FAL) return xlsx;
  const entradas = diretorioDoZip(xlsx);
  const porNome = new Map(entradas.map((e) => [e.nome, e]));
  const livro = textoDe(xlsx, porNome.get('xl/workbook.xml'));
  const relsLivro = textoDe(xlsx, porNome.get('xl/_rels/workbook.xml.rels'));
  const ocultas = new Set<string>();
  for (const m of livro.matchAll(/<sheet\b[^>]*>/g)) {
    if (!/state="(hidden|veryHidden)"/.test(m[0])) continue;
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    const alvo = rid ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*>`).exec(relsLivro)?.[0] : null;
    const t = alvo ? /Target="([^"]+)"/.exec(alvo)?.[1] : null;
    if (t) ocultas.add('xl/' + t.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }
  const relsDaAba = (aba: string) => aba.replace(/^xl\/worksheets\//, 'xl/worksheets/_rels/') + '.rels';
  // Quem recebe a logo é decidido antes, pelas partes pequenas: aba visível cuja relação ainda não tem desenho.
  const abas = entradas.map((e) => e.nome).filter((f) => /^xl\/worksheets\/[^/]+\.xml$/.test(f) && !ocultas.has(f)).sort();
  const alvo = new Map<string, number>(); // aba → número do desenho
  for (const aba of abas) {
    if (textoDe(xlsx, porNome.get(relsDaAba(aba))).includes(REL_DRAWING)) continue;
    alvo.set(aba, alvo.size + 1);
  }
  if (!alvo.size) return xlsx;
  // Nome só com letras e números: o leitor do ExcelJS ignora mídia com hífen no nome (a logo sumiria ao reabrir o arquivo).
  let media = 'xl/media/logofal.png';
  for (let k = 2; porNome.has(media); k++) media = `xl/media/logofal${k}.png`;
  const relDoDesenho = (n: number) => `<Relationship Id="rIdLogoFal" Type="${REL_DRAWING}" Target="../drawings/drawingLogoFal${n}.xml"/>`;

  const partes: Uint8Array[] = [];
  const falha: { erro?: Error } = {};
  const zip = new Zip((e, pedaco) => { if (e) falha.erro = e; else if (pedaco?.length) partes.push(pedaco); });
  const relsPorAba = new Map([...alvo].map(([aba, n]) => [relsDaAba(aba), n]));
  for (const e of entradas) {
    if (e.nome === '[Content_Types].xml') {
      let tipos = textoDe(xlsx, e);
      if (!/Extension="png"/i.test(tipos)) tipos = tipos.replace('<Default ', '<Default Extension="png" ContentType="image/png"/><Default ');
      const overrides = [...alvo.values()].map((n) => `<Override PartName="/xl/drawings/drawingLogoFal${n}.xml" ContentType="${CT_DRAWING}"/>`).join('');
      adicionarTexto(zip, e.nome, tipos.replace('</Types>', `${overrides}</Types>`));
    } else if (relsPorAba.has(e.nome)) {
      adicionarTexto(zip, e.nome, textoDe(xlsx, e).replace('</Relationships>', `${relDoDesenho(relsPorAba.get(e.nome)!)}</Relationships>`));
    } else if (alvo.has(e.nome)) {
      await remendarAba(zip, xlsx, e);
    } else {
      await copiarBruto(zip, xlsx, e);
    }
    if (falha.erro) throw falha.erro;
    await ceder();
  }
  for (const [aba, n] of alvo) {
    if (!porNome.has(relsDaAba(aba))) adicionarTexto(zip, relsDaAba(aba), relsVazio(relDoDesenho(n)));
    adicionarTexto(zip, `xl/drawings/drawingLogoFal${n}.xml`, desenhoDaLogo());
    adicionarTexto(zip, `xl/drawings/_rels/drawingLogoFal${n}.xml.rels`, relsVazio(`<Relationship Id="rIdLogoFal" Type="${REL_IMAGE}" Target="../media/${media.split('/').pop()}"/>`));
  }
  adicionarTexto(zip, media, new Uint8Array(LOGO_FAL), 0);
  zip.end();
  if (falha.erro) throw falha.erro;
  return Buffer.concat(partes);
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
