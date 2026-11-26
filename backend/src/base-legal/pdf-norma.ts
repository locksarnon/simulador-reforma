/**
 * Texto de norma publicada em PDF (regulamento do IBS, resoluções do CGIBS, atos conjuntos...). Usa o pdfjs-dist que o backend já
 * tem (o mesmo que lê as certidões), sem rodar scripts do PDF. Só serve a PDF com camada de texto; PDF escaneado precisa de OCR.
 */

/** O pdfjs-dist é módulo ES: em produção o import() vira require(), que o Node 22 aceita para módulos ES sem await no topo. */
const PDFJS = 'pdfjs-dist/legacy/build/pdf.mjs';

export type ItemTexto = { str?: string; hasEOL?: boolean; width?: number; transform?: number[] };
type PdfJs = {
  getDocument: (o: Record<string, unknown>) => {
    promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: ItemTexto[] }> }>; destroy: () => Promise<void> }>;
  };
};

/** Quanto o PDF pode ter: o Regulamento do IBS tem ~300 páginas. */
export const MAX_PAGINAS_PDF = 3000;

/**
 * Junta os pedaços de texto de uma página em linhas: pedaços com a mesma altura (y) formam uma linha, da esquerda para a direita.
 * Sem coordenadas (PDF atípico), usa as quebras de linha que o próprio pdfjs informa.
 */
export function linhasDaPagina(itens: ItemTexto[]): string[] {
  const comPosicao = itens.filter((i) => i.str && Array.isArray(i.transform) && i.transform.length >= 6);
  if (comPosicao.length < itens.filter((i) => i.str?.trim()).length / 2) {
    return itens.map((i) => `${i.str ?? ''}${i.hasEOL ? '\n' : ' '}`).join('').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }
  const ordenados = [...comPosicao].sort((a, b) => (b.transform![5] - a.transform![5]) || (a.transform![4] - b.transform![4]));
  const linhas: { y: number; itens: ItemTexto[] }[] = [];
  for (const it of ordenados) {
    const y = it.transform![5];
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(ultima.y - y) <= 3) ultima.itens.push(it);
    else linhas.push({ y, itens: [it] });
  }
  return linhas
    .map((l) => {
      const por_x = [...l.itens].sort((a, b) => a.transform![4] - b.transform![4]);
      let texto = '';
      let fim = -Infinity;
      for (const it of por_x) {
        const x = it.transform![4];
        if (texto && x - fim > 1.2 && !texto.endsWith(' ') && !String(it.str).startsWith(' ')) texto += ' ';
        texto += it.str;
        fim = x + (it.width ?? 0);
      }
      return texto.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

const RE_ESTRUTURA = /^(Art\.|§|Parágrafo|ANEXO|LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|[IVXLC]+\s*[-–]|[a-z]\))/;

/** Tira número de página e cabeçalho ou rodapé que se repete em boa parte das páginas. */
export function limparCabecalhos(paginas: string[][]): string[][] {
  const contagem = new Map<string, number>();
  for (const p of paginas) for (const l of new Set(p)) contagem.set(l, (contagem.get(l) ?? 0) + 1);
  const minimo = Math.max(5, Math.ceil(paginas.length * 0.4));
  return paginas.map((p) => p.filter((l) => {
    if (/^\d{1,4}$/.test(l)) return false;
    if (/^(P[áa]gina|P[áa]g\.)\s*\d+(\s*(de|\/)\s*\d+)?$/i.test(l)) return false;
    if (paginas.length >= 5 && l.length <= 120 && !RE_ESTRUTURA.test(l) && (contagem.get(l) ?? 0) >= minimo) return false;
    return true;
  }));
}

/** Texto do PDF em linhas, no formato que `extrairDispositivos` lê (uma linha por linha impressa). */
export async function pdfParaTexto(pdf: Buffer, maxPaginas = MAX_PAGINAS_PDF): Promise<string> {
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('O arquivo não é um PDF.');
  const pdfjs = (await import(PDFJS)) as PdfJs;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  try {
    const paginas: string[][] = [];
    for (let i = 1; i <= Math.min(doc.numPages, maxPaginas); i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      paginas.push(linhasDaPagina(c.items));
    }
    const texto = limparCabecalhos(paginas).map((p) => p.join('\n')).join('\n');
    if (texto.replace(/\s+/g, '').length < 200) throw new Error('O PDF não tem texto selecionável (pode ser imagem escaneada): precisa de OCR.');
    return texto;
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}
