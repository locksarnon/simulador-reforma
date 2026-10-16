/**
 * Leitura de datas vindas de exportações de ERP (coluna "última movimentação").
 * Aceita o que os ERPs brasileiros costumam gerar: AAAA-MM-DD (e com hora),
 * DD/MM/AAAA (também com - ou .), AAAA/MM/DD e AAAAMMDD (tabela crua do
 * Protheus). Sempre dia primeiro quando o ano vem no fim — não existe como
 * distinguir MM/DD de DD/MM em "03/04/2024"; datas em formato americano com
 * dia > 12 na 2ª posição viram "inválida" e são sinalizadas, nunca adivinhadas.
 */
export type DataLida = { data: string | null; invalida: boolean };

const VAZIA = /^[\s/.\-0]*$/; // "", "00000000", "0000-00-00", "  /  /    " (data vazia dos ERPs)

function calendario(y: number, m: number, d: number, hoje: Date): string | null {
  if (y < 1990 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // ex.: 31/02
  const limite = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()) + 24 * 3600 * 1000;
  if (dt.getTime() > limite) return null; // data no futuro não é movimentação
  return dt.toISOString().slice(0, 10);
}

export function lerDataMovimento(bruto: string, hoje: Date = new Date()): DataLida {
  const t = String(bruto ?? '').trim();
  if (VAZIA.test(t)) return { data: null, invalida: false };

  let m: RegExpMatchArray | null;
  let iso: string | null = null;
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/))) iso = calendario(+m[1], +m[2], +m[3], hoje);
  else if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s.*)?$/))) iso = calendario(+m[3], +m[2], +m[1], hoje);
  else if ((m = t.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/))) iso = calendario(+m[1], +m[2], +m[3], hoje);
  else if ((m = t.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    iso = calendario(+m[1], +m[2], +m[3], hoje) ?? calendario(+t.slice(4), +t.slice(2, 4), +t.slice(0, 2), hoje); // AAAAMMDD, senão DDMMAAAA
  }
  return iso ? { data: iso, invalida: false } : { data: null, invalida: true };
}

/** Aceita só AAAA-MM-DD real; qualquer outra coisa vira null (sem corte). */
export function corteValido(s: unknown, hoje: Date = new Date()): string | null {
  const t = String(s ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return calendario(+t.slice(0, 4), +t.slice(5, 7), +t.slice(8, 10), hoje);
}
