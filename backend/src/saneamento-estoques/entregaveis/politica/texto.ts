/** Utilidades de texto da política: só caracteres que a fonte padrão do PDF (WinAnsi) desenha, listas em português, datas. */

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

/** dd/mm/aaaa. Aceita AAAA-MM-DD (sem fuso), ISO completo ou Date; inválido = null. */
export function dataBr(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  // Data de calendário no fuso de Brasília (UTC-3, sem horário de verão desde 2019), independente do fuso do servidor.
  const b = new Date(d.getTime() - 3 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(b.getUTCDate())}/${p(b.getUTCMonth() + 1)}/${b.getUTCFullYear()}`;
}

/** Número em português (vírgula decimal, ponto de milhar). */
export const numeroBr = (n: number, casas = 6) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
