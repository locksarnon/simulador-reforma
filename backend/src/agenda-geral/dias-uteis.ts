/**
 * Dias úteis para as datas de obrigações: sábado, domingo e os feriados nacionais fixos definidos em lei federal não são dias úteis.
 * Feriados estaduais e municipais não entram (cada praça tem os seus): a tela avisa que eles podem mudar a data.
 * As datas são "AAAA-MM-DD" em UTC (meia-noite), sem fuso.
 */

/** Feriados nacionais de data fixa (MM-DD), com a lei de cada um. */
export const FERIADOS_NACIONAIS_FIXOS: { dia: string; nome: string; lei: string }[] = [
  { dia: '01-01', nome: 'Confraternização Universal', lei: 'Lei nº 662/1949, art. 1º (redação da Lei nº 10.607/2002)' },
  { dia: '04-21', nome: 'Tiradentes', lei: 'Lei nº 662/1949, art. 1º (redação da Lei nº 10.607/2002)' },
  { dia: '05-01', nome: 'Dia do Trabalho', lei: 'Lei nº 662/1949, art. 1º (redação da Lei nº 10.607/2002)' },
  { dia: '09-07', nome: 'Independência do Brasil', lei: 'Lei nº 662/1949, art. 1º (redação da Lei nº 10.607/2002)' },
  { dia: '10-12', nome: 'Nossa Senhora Aparecida', lei: 'Lei nº 6.802/1980, art. 1º' },
  { dia: '11-02', nome: 'Finados', lei: 'Lei nº 662/1949, art. 1º (redação da Lei nº 10.607/2002)' },
  { dia: '11-15', nome: 'Proclamação da República', lei: 'Lei nº 662/1949, art. 1º (redação da Lei nº 10.607/2002)' },
  { dia: '11-20', nome: 'Dia Nacional de Zumbi e da Consciência Negra', lei: 'Lei nº 14.759/2023, art. 1º' },
  { dia: '12-25', nome: 'Natal', lei: 'Lei nº 662/1949, art. 1º (redação da Lei nº 10.607/2002)' },
];

const FIXOS = new Set(FERIADOS_NACIONAIS_FIXOS.map((f) => f.dia));

export const data = (ano: number, mes: number, dia: number) => new Date(Date.UTC(ano, mes - 1, dia));
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const ultimoDiaDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const somarDias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function ehFeriadoNacional(d: Date): boolean {
  return FIXOS.has(iso(d).slice(5));
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return data(ano, mes, dia);
}

/**
 * Dias sem expediente bancário além dos feriados nacionais: segunda e terça de carnaval e Corpus Christi
 * (Resolução CMN nº 4.880/2020, art. 6º, I e II). A Sexta-Feira da Paixão é feriado municipal (Lei nº 9.093/1995) e não entra.
 */
export function diasSemExpedienteBancario(ano: number): string[] {
  const p = pascoa(ano).getTime();
  return [-48, -47, 60].map((n) => iso(new Date(p + n * 86_400_000)));
}

const MOVEIS = new Map<number, Set<string>>();
const moveis = (ano: number) => {
  if (!MOVEIS.has(ano)) MOVEIS.set(ano, new Set(diasSemExpedienteBancario(ano)));
  return MOVEIS.get(ano)!;
};

export function ehDiaUtil(d: Date): boolean {
  const semana = d.getUTCDay();
  return semana !== 0 && semana !== 6 && !ehFeriadoNacional(d) && !moveis(d.getUTCFullYear()).has(iso(d));
}

/** O próprio dia, se útil; senão, o dia útil seguinte. */
export function proximoDiaUtil(d: Date): Date {
  let x = d;
  while (!ehDiaUtil(x)) x = somarDias(x, 1);
  return x;
}

/** O próprio dia, se útil; senão, o dia útil anterior. */
export function diaUtilAnterior(d: Date): Date {
  let x = d;
  while (!ehDiaUtil(x)) x = somarDias(x, -1);
  return x;
}

/** O último dia útil do mês. */
export const ultimoDiaUtilDoMes = (ano: number, mes: number) => diaUtilAnterior(data(ano, mes, ultimoDiaDoMes(ano, mes)));

/** O n-ésimo dia útil do mês (1 = o primeiro). */
export function enesimoDiaUtil(ano: number, mes: number, n: number): Date {
  let x = proximoDiaUtil(data(ano, mes, 1));
  for (let i = 1; i < n; i++) x = proximoDiaUtil(somarDias(x, 1));
  return x;
}

/** O último dia útil até o dia `limite` do mês (ex.: o fim do 2º decêndio = até o dia 20). */
export const ultimoDiaUtilAte = (ano: number, mes: number, limite: number) => diaUtilAnterior(data(ano, mes, limite));

/** Soma meses a um mês (ano, mês 1–12). */
export function somarMeses(ano: number, mes: number, n: number): { ano: number; mes: number } {
  const total = ano * 12 + (mes - 1) + n;
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}
