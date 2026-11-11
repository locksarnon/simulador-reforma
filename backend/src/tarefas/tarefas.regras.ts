/**
 * Regras de datas e de geração das tarefas recorrentes. Tudo aqui é função pura (sem banco), para testar sem mock:
 * o dia de hoje é sempre o de Brasília, e o prazo é guardado como data (meia-noite UTC), sem hora.
 */
export const STATUS_TAREFA = ['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'] as const;
/** Status em que a tarefa ainda está por fazer. */
export const STATUS_ABERTOS = ['ABERTA', 'EM_ANDAMENTO'];
export const PRIORIDADES = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as const;
export const RECORRENCIAS = ['MENSAL', 'TRIMESTRAL', 'ANUAL'] as const;
export const ESCOPOS_DO_PROCESSO = ['POR_EMPRESA_BPO', 'GERAL'] as const;
/** A rodada automática cria a tarefa este número de dias antes do prazo (e até o prazo). */
export const ANTECEDENCIA_DIAS = 10;
const DIA_MS = 86_400_000;

export type DataBR = { ano: number; mes: number; dia: number };

/** A data de hoje em Brasília. */
export function hojeEmBrasilia(agora = new Date()): DataBR {
  const [ano, mes, dia] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora).split('-').map(Number);
  return { ano, mes, dia };
}

/** Meia-noite UTC da data (é assim que o prazo fica guardado). */
export const utcDe = (d: DataBR) => new Date(Date.UTC(d.ano, d.mes - 1, d.dia));

export const competenciaDe = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`;

export function lerCompetencia(c: unknown): { ano: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(c ?? ''));
  if (!m) return null;
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12 ? { ano: Number(m[1]), mes } : null;
}

const ultimoDiaDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Data "AAAA-MM-DD" válida (30 de fevereiro não passa) em meia-noite UTC; vazio vira null; o resto é erro (undefined). */
export function lerData(valor: unknown): Date | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor));
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? d : undefined;
}

/** O prazo no mês da competência; dia 31 num mês de 30 dias cai no último dia do mês. */
export function prazoDaCompetencia(competencia: string, dia: number): Date {
  const c = lerCompetencia(competencia);
  if (!c) throw new Error('Competência inválida.');
  return new Date(Date.UTC(c.ano, c.mes - 1, Math.min(Math.max(1, Math.trunc(dia) || 1), ultimoDiaDoMes(c.ano, c.mes))));
}

/** O processo gera tarefa nessa competência? Mensal sempre; trimestral em janeiro, abril, julho e outubro; anual só no mês dele. */
export function geraNaCompetencia(modelo: { recorrencia: string; mes: number | null }, competencia: string): boolean {
  const c = lerCompetencia(competencia);
  if (!c) return false;
  if (modelo.recorrencia === 'MENSAL') return true;
  if (modelo.recorrencia === 'TRIMESTRAL') return [1, 4, 7, 10].includes(c.mes);
  if (modelo.recorrencia === 'ANUAL') return modelo.mes === c.mes;
  return false;
}

/** As competências que a rodada automática avalia: o mês de hoje e o seguinte (a janela de antecedência pode cruzar o mês). */
export function competenciasDaRodada(hoje: DataBR): string[] {
  const prox = hoje.mes === 12 ? { ano: hoje.ano + 1, mes: 1 } : { ano: hoje.ano, mes: hoje.mes + 1 };
  return [competenciaDe(hoje.ano, hoje.mes), competenciaDe(prox.ano, prox.mes)];
}

/** Hoje está dentro da janela em que a rodada automática cria a tarefa deste prazo? */
export function naJanelaDeGeracao(prazo: Date, hoje: DataBR): boolean {
  const h = utcDe(hoje).getTime();
  return h >= prazo.getTime() - ANTECEDENCIA_DIAS * DIA_MS && h <= prazo.getTime();
}

/** "Conferir apuração — 11/2026": o nome do processo com o mês da competência. */
export function tituloGerado(nome: string, competencia: string): string {
  const c = lerCompetencia(competencia);
  return c ? `${nome} — ${String(c.mes).padStart(2, '0')}/${c.ano}` : nome;
}

/** A tarefa em aberto está vencida? (prazo antes de hoje, em Brasília) */
export function estaAtrasada(t: { status: string; prazo: Date | null }, hoje: DataBR): boolean {
  return STATUS_ABERTOS.includes(t.status) && !!t.prazo && t.prazo.getTime() < utcDe(hoje).getTime();
}
