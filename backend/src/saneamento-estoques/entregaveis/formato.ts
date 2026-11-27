/**
 * Datas dos entregáveis (Excel, relatório, política e nomes de arquivo): uma regra só, no fuso America/Sao_Paulo e no formato dd/mm/aaaa.
 *
 * Data de calendário (data-base, vigência, início): "AAAA-MM-DD" ou meia-noite UTC exata (o que o banco grava num campo só de data) é o
 * próprio dia, sem fuso. Momento (liberação, decisão, emissão): o relógio de São Paulo — uma decisão às 23h50 de 26/11 é 26/11, nunca 27/11.
 */
const FUSO = 'America/Sao_Paulo';
const FMT = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const p2 = (n: number) => String(n).padStart(2, '0');

type Partes = { dia: number; mes: number; ano: number; hora: number; minuto: number; segundo: number; calendario: boolean };

function lerData(v: unknown): { d: Date; calendario: boolean } | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (m) return { d: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), calendario: true };
  }
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(+d)) return null;
  return { d, calendario: d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0 };
}

function partes(v: unknown): Partes | null {
  const x = lerData(v);
  if (!x) return null;
  if (x.calendario) return { dia: x.d.getUTCDate(), mes: x.d.getUTCMonth() + 1, ano: x.d.getUTCFullYear(), hora: 0, minuto: 0, segundo: 0, calendario: true };
  const o: Record<string, number> = {};
  for (const p of FMT.formatToParts(x.d)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { dia: o.day, mes: o.month, ano: o.year, hora: o.hour, minuto: o.minute, segundo: o.second, calendario: false };
}

/** "26/11/2026"; com `hora`, "26/11/2026 23:50" (só para momento; data de calendário nunca leva hora). Inválido ou vazio = ''. */
export function dataBr(v: unknown, o: { hora?: boolean } = {}): string {
  const p = partes(v);
  if (!p) return '';
  const dia = `${p2(p.dia)}/${p2(p.mes)}/${p.ano}`;
  return o.hora && !p.calendario ? `${dia} ${p2(p.hora)}:${p2(p.minuto)}` : dia;
}

/** "26-11-2026" para nome de arquivo (a barra não é aceita em nome de arquivo); padrão: hoje em São Paulo. */
export const dataDoArquivo = (v: unknown = new Date()) => dataBr(v).replace(/\//g, '-');

/**
 * Valor de data para a célula do Excel: o Excel mostra o relógio gravado, sem fuso, então o momento vira o relógio de São Paulo e a data
 * de calendário fica no próprio dia. Inválido = null.
 */
export function dataExcel(v: unknown): Date | null {
  const p = partes(v);
  if (!p) return null;
  return new Date(Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo));
}

/** A data de calendário (sem hora) de São Paulo, como Date à meia-noite UTC: para comparar dias. */
export function diaLocal(v: unknown): Date | null {
  const p = partes(v);
  return p ? new Date(Date.UTC(p.ano, p.mes - 1, p.dia)) : null;
}
