/**
 * Período da busca automática da captura de XML, por empresa: NOTURNO ou DIURNO (o mesmo modelo do Notalize, que o escritório já usa).
 *
 *   NOTURNO  das 18:00 às 05:59  (padrão)
 *   DIURNO   das 06:00 às 17:59
 *
 * O agendador confere as capturas ativas de 10 em 10 minutos, mas só consulta a empresa dentro do período dela (horário de Brasília).
 * Dentro do período valem as mesmas esperas da SEFAZ (1 hora e 1 minuto depois de "nenhum documento"): a primeira passagem traz as
 * notas e registra a Ciência, e a seguinte (mais de 1 hora depois) traz os XML completos que a Ciência liberou. O botão
 * "Capturar agora" não depende do período.
 */
export type PeriodoBusca = 'NOTURNO' | 'DIURNO';
/** Intervalo do dia em minutos desde a meia-noite; o fim é exclusivo e o intervalo pode virar a meia-noite. */
export type JanelaCaptura = { inicioMin: number; fimMin: number } | null; // null = o dia todo

export const PERIODOS: Record<PeriodoBusca, { inicioMin: number; fimMin: number; rotulo: string }> = {
  NOTURNO: { inicioMin: 18 * 60, fimMin: 6 * 60, rotulo: 'Noturno' },
  DIURNO: { inicioMin: 6 * 60, fimMin: 18 * 60, rotulo: 'Diurno' },
};
export const PERIODO_PADRAO: PeriodoBusca = 'NOTURNO';
const FUSO = 'America/Sao_Paulo';

export const periodoValido = (valor: unknown): valor is PeriodoBusca => valor === 'NOTURNO' || valor === 'DIURNO';

/** Período guardado na empresa; ausente ou desconhecido vale o padrão (nunca deixa a captura parada). */
export const periodoDe = (valor: unknown): PeriodoBusca => (periodoValido(valor) ? valor : PERIODO_PADRAO);

export const janelaDoPeriodo = (periodo: PeriodoBusca): JanelaCaptura => ({ inicioMin: PERIODOS[periodo].inicioMin, fimMin: PERIODOS[periodo].fimMin });

/** Minutos desde a meia-noite, no horário de Brasília. */
export function minutoDoDia(d: Date): number {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  return Number(partes.find((p) => p.type === 'hour')?.value) * 60 + Number(partes.find((p) => p.type === 'minute')?.value);
}

/** A janela está aberta neste instante? O fim é exclusivo: o noturno vale de 18:00:00 até 05:59:59. */
export function dentroDaJanela(agora: Date, janela: JanelaCaptura): boolean {
  if (!janela) return true;
  const m = minutoDoDia(agora);
  return janela.inicioMin < janela.fimMin ? m >= janela.inicioMin && m < janela.fimMin : m >= janela.inicioMin || m < janela.fimMin;
}

/** Primeiro instante, a partir de `depoisDe`, com a janela aberta: o próprio instante, se já estiver dentro; senão a próxima abertura. */
export function proximaAbertura(depoisDe: Date, janela: JanelaCaptura): Date {
  if (!janela || dentroDaJanela(depoisDe, janela)) return depoisDe;
  const faltam = (janela.inicioMin - minutoDoDia(depoisDe) + 1440) % 1440;
  return new Date(Math.floor(depoisDe.getTime() / 60_000) * 60_000 + faltam * 60_000);
}

const hhmm = (min: number) => `${String(Math.floor(((min % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String((((min % 1440) + 1440) % 1440) % 60).padStart(2, '0')}`;

/** "das 18:00 às 05:59 (horário de Brasília)": o último minuto que vale, como o Notalize escreve. */
export function descreverJanela(janela: JanelaCaptura): string {
  return janela ? `das ${hhmm(janela.inicioMin)} às ${hhmm(janela.fimMin - 1)} (horário de Brasília)` : 'a qualquer hora do dia';
}

export const descreverPeriodo = (periodo: PeriodoBusca): string => `${PERIODOS[periodo].rotulo}, ${descreverJanela(janelaDoPeriodo(periodo))}`;
