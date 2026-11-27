/**
 * Regra da ferramenta: tudo o que o sistema imprime, exporta ou manda por e-mail sai com a logo da FAL no topo.
 * Aqui: PDF (cada página tem a imagem), e-mail (HTML com a logo e o anexo embutido), HTML de documento e a trava estática que reprova um
 * gerador novo de PDF/Excel/HTML que não use src/marca/logo-fal.ts. O Excel está em logo-fal-xlsx.test.ts.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';
import { PdfService } from '../pdf/pdf.service';
import { renderizarPolitica } from '../saneamento-estoques/entregaveis/politica/pdf';
import { dadosCrestani } from '../saneamento-estoques/entregaveis/politica/__fixtures__/crestani';
import { comLogoFal, emailLayout } from '../mail/mail.service';
import { comprovanteDosDados } from '../infosimples/infosimples.service';
import { CID_LOGO_FAL, LOGO_FAL, comLogoFalNoEmail } from './logo-fal';

type PaginaPdf = { getOperatorList: () => Promise<{ fnArray: number[] }> };
/** Quantas imagens cada página do PDF pinta. */
async function imagensPorPagina(pdf: Buffer): Promise<number[]> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs' as string)) as unknown as {
    OPS: Record<string, number>;
    getDocument: (o: unknown) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<PaginaPdf> }> };
  };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  const pinta = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageXObjectRepeat].filter((x) => x !== undefined));
  const r: number[] = [];
  for (let i = 1; i <= doc.numPages; i++) r.push((await (await doc.getPage(i)).getOperatorList()).fnArray.filter((op) => pinta.has(op)).length);
  return r;
}

describe('Logo da FAL: o arquivo', () => {
  it('existe, é PNG e tem no máximo 60 KB', () => {
    expect(LOGO_FAL).not.toBeNull();
    expect(LOGO_FAL!.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(LOGO_FAL!.length).toBeLessThanOrEqual(60 * 1024);
  });
  it('é a mesma imagem do frontend (um só arquivo de logo)', () => {
    const front = readFileSync(join(__dirname, '..', '..', '..', 'src', 'assets', 'marca', 'logo-fal.png'));
    expect(front.equals(LOGO_FAL!)).toBe(true);
  });
});

describe('Logo da FAL: PDF', () => {
  it('relatório padrão (PdfService): a logo em todas as páginas', async () => {
    const pdf = await new PdfService().gerar({
      titulo: 'Relatório longo',
      secoes: Array.from({ length: 8 }, (_, i) => ({ titulo: `Seção ${i + 1}`, paragrafos: Array.from({ length: 10 }, (_, k) => `Parágrafo ${k} ${'texto '.repeat(40)}`) })),
    });
    const imgs = await imagensPorPagina(pdf);
    expect(imgs.length).toBeGreaterThan(2);
    imgs.forEach((n, i) => expect(n, `página ${i + 1}`).toBeGreaterThanOrEqual(1));
  });
  it('política de estoques: a logo em todas as páginas', async () => {
    const { pdf } = await renderizarPolitica(dadosCrestani());
    const imgs = await imagensPorPagina(pdf);
    expect(imgs.length).toBeGreaterThan(2);
    imgs.forEach((n, i) => expect(n, `página ${i + 1}`).toBeGreaterThanOrEqual(1));
  }, 60000);
});

describe('Logo da FAL: e-mail e HTML', () => {
  it('a moldura padrão abre com a logo (imagem embutida)', () => {
    const html = emailLayout('Título', '<p>corpo</p>');
    expect(html).toContain(`src="cid:${CID_LOGO_FAL}"`);
    expect(html.indexOf(`cid:${CID_LOGO_FAL}`)).toBeLessThan(html.indexOf('Título'));
  });
  it('todo envio leva a logo: HTML sem moldura ganha o bloco no topo e a imagem vai como anexo embutido', () => {
    const r = comLogoFal({ html: '<p>Aviso</p>', attachments: [{ filename: 'a.pdf', content: Buffer.from('x') }] });
    expect(r.html.startsWith('<div')).toBe(true);
    expect(r.html).toContain(`cid:${CID_LOGO_FAL}`);
    expect(r.attachments.map((a) => a.filename)).toEqual(['a.pdf', 'logo-fal.png']);
    expect(r.attachments[1]).toMatchObject({ cid: CID_LOGO_FAL, contentType: 'image/png' });
    const comCorpo = comLogoFalNoEmail('<html><body style="x"><p>oi</p></body></html>');
    expect(comCorpo.indexOf(`cid:${CID_LOGO_FAL}`)).toBeGreaterThan(comCorpo.indexOf('<body'));
    expect(comCorpo.indexOf(`cid:${CID_LOGO_FAL}`)).toBeLessThan(comCorpo.indexOf('<p>oi'));
    // não duplica quando o HTML já tem a logo
    const ja = emailLayout('T', '');
    expect(comLogoFalNoEmail(ja)).toBe(ja);
  });
  it('comprovante de certidão em HTML abre com a logo embutida', () => {
    const c = comprovanteDosDados('pgfn', '00000000000191', { situacao: 'Negativa', detalhes: [{ rotulo: 'Código', valor: '1' }] } as never);
    const html = c.buffer.toString('utf8');
    expect(html).toMatch(/<body[^>]*><div[^>]*><img src="data:image\/png;base64,/);
  });
});

// ── Trava estática ─────────────────────────────────────────────────────────

const RAIZ = join(__dirname, '..');
/** Documentos fiscais de layout oficial: a logo da FAL não entra (o leiaute é o do Manual/NT de cada documento). */
const LAYOUT_OFICIAL: Record<string, string> = {
  'repositorio-xml/pdf/pintor.ts': 'base dos DANFE, DANFE NFC-e, DACTE, DAMDFE e DANFSe (layout oficial)',
};
/** HTML que é página web de resposta (abre no navegador), não documento impresso ou enviado. */
const PAGINAS_WEB: Record<string, string> = {
  'comunicados/comunicados.controller.ts': 'página "descadastro feito" do link do comunicado',
  'publico/publico.controller.ts': 'página de confirmação do link público',
};

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__fixtures__' || n === 'node_modules' ? [] : arquivos(p);
    return /\.ts$/.test(n) && !/\.(test|spec)\.ts$/.test(n) ? [p] : [];
  });
}

describe('Logo da FAL: trava para gerador novo', () => {
  const fontes = arquivos(RAIZ).map((p) => ({ nome: relative(RAIZ, p).replace(/\\/g, '/'), texto: readFileSync(p, 'utf8') }));
  const usaMarca = (t: string) => /from '(\.\.?\/)+marca\/logo-fal'|from '\.\/logo-fal'/.test(t);

  it('todo arquivo que cria PDF (pdfkit) ou escreve Excel (exceljs) usa src/marca/logo-fal.ts', () => {
    const geradores = fontes.filter((f) => f.nome !== 'marca/logo-fal.ts' && /new PDFDocument\(|\.addWorksheet\(/.test(f.texto));
    expect(geradores.length).toBeGreaterThan(5);
    const sem = geradores.filter((f) => !LAYOUT_OFICIAL[f.nome] && !usaMarca(f.texto)).map((f) => f.nome);
    expect(sem, 'gerador sem a logo da FAL: use cabecalhoFalExcel / reservarLinhaLogoFal+logoFalNoXlsx / desenharLogoFal de src/marca/logo-fal.ts').toEqual([]);
  });
  it('o desenho dos documentos fiscais oficiais segue isolado em pintor.ts (allow-list)', () => {
    for (const nome of Object.keys(LAYOUT_OFICIAL)) expect(fontes.some((f) => f.nome === nome), nome).toBe(true);
    const pdfkitFora = fontes.filter((f) => /new PDFDocument\(/.test(f.texto) && !LAYOUT_OFICIAL[f.nome] && !usaMarca(f.texto));
    expect(pdfkitFora).toEqual([]);
  });
  it('HTML gerado como documento usa a logo; só páginas web de resposta ficam de fora', () => {
    const html = fontes.filter((f) => /<!doctype html/i.test(f.texto) && !['mail/mail.service.ts', 'marca/logo-fal.ts'].includes(f.nome));
    const sem = html.filter((f) => !PAGINAS_WEB[f.nome] && !usaMarca(f.texto)).map((f) => f.nome);
    expect(sem).toEqual([]);
  });
  it('e-mail só sai pelo MailService, que põe a logo em toda mensagem', () => {
    const envia = fontes.filter((f) => /\.sendMail\(|createTransport\(/.test(f.texto)).map((f) => f.nome);
    expect(envia).toEqual(['mail/mail.service.ts']);
    const mail = fontes.find((f) => f.nome === 'mail/mail.service.ts')!.texto;
    expect(mail).toMatch(/\.\.\.comLogoFal\(msg\)/);
  });
});
