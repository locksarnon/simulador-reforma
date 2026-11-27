/** Utilidades de texto da política: só caracteres que a fonte padrão do PDF (WinAnsi) desenha, listas em português, datas. */
import { dataBr as dataBrEntrega } from '../formato';

/** Caracteres de 0x80–0x9F do WinAnsi (os demais vão de 0x20–0x7E e 0xA0–0xFF). */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const TROCAS: Record<string, string> = {
  '→': '->', '←': '<-', '⇒': '=>', '≥': '>=', '≤': '<=', '≠': '<>', '✓': '', '✔': '', '✗': 'x', '−': '-', '‑': '-', '‐': '-',
  ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '\t': ' ',
};

/** Normaliza (NFC) e troca o que a fonte não desenha; nada vira "?" no PDF. */
export function limpar(s: unknown): string {
  const t = String(s ?? '').normalize('NFC');
  let r = '';
  for (const c of t) {
    if (c in TROCAS) { r += TROCAS[c]; continue; }
    const cp = c.codePointAt(0)!;
    if (c === '\n' || (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WIN_ANSI_EXTRA.has(c)) r += c;
  }
  return r;
}

/** "A", "A e B", "A, B e C". */
export function juntar(lista: string[]): string {
  const l = lista.filter((x) => x && x.trim());
  if (l.length <= 1) return l[0] ?? '';
  return `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`;
}

export const ordenarPt = (l: string[]) => [...l].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true }));

/** Primeira letra maiúscula, sem mexer no resto. */
export const maiuscula = (s: string) => (s ? s[0].toLocaleUpperCase('pt-BR') + s.slice(1) : s);

/** dd/mm/aaaa no fuso de São Paulo (a mesma regra de data dos demais entregáveis, formato.ts); inválido = null. */
export function dataBr(v: string | Date | null | undefined): string | null {
  return dataBrEntrega(v) || null;
}

/** Número em português (vírgula decimal, ponto de milhar). */
export const numeroBr = (n: number, casas = 6) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
