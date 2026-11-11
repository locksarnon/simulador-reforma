/** Ajudantes dos testes de PDF (gerado com `semCompressao: true`). */

/** Número de páginas do PDF. */
export const paginas = (pdf: Buffer): number => (pdf.toString('latin1').match(/\/Type \/Page(?![a-z])/g) ?? []).length;

/** Texto desenhado no PDF: junta as strings hexadecimais de cada operador TJ, uma linha por operador. */
export function textoDoPdf(pdf: Buffer): string {
  const linhas: string[] = [];
  for (const m of pdf.toString('latin1').matchAll(/\[((?:<[0-9a-fA-F]*>|\s|-?[0-9.]+)+)\]\s*TJ/g)) {
    linhas.push([...m[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => Buffer.from(h[1], 'hex').toString('latin1')).join(''));
  }
  return linhas.join('\n');
}

/** Quantidade de retângulos preenchidos ou traçados no PDF (operador `re`), útil para conferir código de barras e QR Code. */
export const retangulos = (pdf: Buffer): number => (pdf.toString('latin1').match(/ re\n/g) ?? []).length;
