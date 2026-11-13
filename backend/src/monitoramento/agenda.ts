import { GRUPOS, SERVICOS, Servico } from './catalogo';

/** Quando um serviço ou documento é atualizado sozinho: desligado, todo dia, um dia da semana (1 = segunda … 7 = domingo) ou um dia do mês (1 a 28). */
export type Agenda = { frequencia: 'DESLIGADA' | 'DIARIA' | 'SEMANAL' | 'MENSAL'; dia: number };
export type AgendaCertidao = { ativa: boolean; dias_antes: number };
export const TIPOS_CERTIDAO = ['FEDERAL', 'ESTADUAL', 'MUNICIPAL', 'TRABALHISTA', 'FGTS'] as const;
export type TipoCertidaoAgenda = (typeof TIPOS_CERTIDAO)[number];
export type AgendaDocumentos = { sped: Agenda; certidoes: Record<TipoCertidaoAgenda, AgendaCertidao> };

const FREQUENCIAS = ['DESLIGADA', 'DIARIA', 'SEMANAL', 'MENSAL'];

/** Serviços que podem rodar sozinhos: só consultas, sem parâmetro obrigatório que dependa de alguém digitar. */
export function servicosAgendaveis(): Servico[] {
  return SERVICOS.filter((s) => !s.acao && s.parametros.every((p) => !p.obrigatorio || p.padrao));
}

/** Agenda de cada serviço: a escolhida ou, se nunca escolhida, o dia do mês do assunto (para os serviços da rotina). */
export function agendasDosServicos(salvas: Record<string, Agenda> | undefined, diasPorGrupo: Record<string, number>): Record<string, Agenda> {
  const r: Record<string, Agenda> = {};
  for (const s of servicosAgendaveis()) {
    const salva = salvas?.[s.chave];
    if (salva && FREQUENCIAS.includes(salva.frequencia)) { r[s.chave] = { frequencia: salva.frequencia, dia: Number(salva.dia) || 1 }; continue; }
    const d = diasPorGrupo[s.grupo] ?? 0;
    r[s.chave] = s.rotina && d > 0 ? { frequencia: 'MENSAL', dia: d } : { frequencia: 'DESLIGADA', dia: 1 };
  }
  return r;
}

export const DOCUMENTOS_PADRAO: AgendaDocumentos = {
  sped: { frequencia: 'MENSAL', dia: 20 },
  certidoes: {
    FEDERAL: { ativa: true, dias_antes: 15 }, ESTADUAL: { ativa: true, dias_antes: 15 }, MUNICIPAL: { ativa: true, dias_antes: 15 },
    TRABALHISTA: { ativa: true, dias_antes: 15 }, FGTS: { ativa: true, dias_antes: 5 },
  },
};

export function agendaDocumentos(salva: Partial<AgendaDocumentos> | undefined): AgendaDocumentos {
  const sped = salva?.sped && FREQUENCIAS.includes(salva.sped.frequencia) ? { frequencia: salva.sped.frequencia, dia: Number(salva.sped.dia) || 1 } : DOCUMENTOS_PADRAO.sped;
  const certidoes = { ...DOCUMENTOS_PADRAO.certidoes };
  for (const t of TIPOS_CERTIDAO) {
    const c = salva?.certidoes?.[t];
    if (c) certidoes[t] = { ativa: c.ativa !== false, dias_antes: Number.isInteger(Number(c.dias_antes)) ? Number(c.dias_antes) : DOCUMENTOS_PADRAO.certidoes[t].dias_antes };
  }
  return { sped, certidoes };
}

/** Confere e normaliza uma agenda vinda da tela; lança com a mensagem para a tela quando inválida. */
export function validarAgenda(a: Agenda, nome: string): Agenda {
  if (!a || !FREQUENCIAS.includes(a.frequencia)) throw new Error(`${nome}: frequência inválida.`);
  const dia = Number(a.dia);
  if (a.frequencia === 'SEMANAL' && (!Number.isInteger(dia) || dia < 1 || dia > 7)) throw new Error(`${nome}: dia da semana de 1 (segunda) a 7 (domingo).`);
  if (a.frequencia === 'MENSAL' && (!Number.isInteger(dia) || dia < 1 || dia > 28)) throw new Error(`${nome}: dia do mês de 1 a 28.`);
  return { frequencia: a.frequencia, dia: a.frequencia === 'DIARIA' || a.frequencia === 'DESLIGADA' ? 1 : dia };
}

/** Dia de Brasília: dia do mês e dia da semana (1 = segunda … 7 = domingo). */
export function diaDeBrasilia(hoje: Date) {
  const p = new Intl.DateTimeFormat('en-US', { day: 'numeric', weekday: 'short', timeZone: 'America/Sao_Paulo' }).formatToParts(hoje);
  const semana = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.find((x) => x.type === 'weekday')?.value ?? '') + 1;
  return { mes: Number(p.find((x) => x.type === 'day')?.value), semana };
}

/** A agenda cai hoje? */
export function caiHoje(a: Agenda, hoje: Date): boolean {
  const d = diaDeBrasilia(hoje);
  if (a.frequencia === 'DIARIA') return true;
  if (a.frequencia === 'SEMANAL') return a.dia === d.semana;
  if (a.frequencia === 'MENSAL') return a.dia === d.mes;
  return false;
}

/** Texto curto da agenda para a tela e os registros. */
export function textoDaAgenda(a: Agenda): string {
  if (a.frequencia === 'DIARIA') return 'Todo dia';
  if (a.frequencia === 'SEMANAL') return ['Toda segunda', 'Toda terça', 'Toda quarta', 'Toda quinta', 'Toda sexta', 'Todo sábado', 'Todo domingo'][a.dia - 1];
  if (a.frequencia === 'MENSAL') return `Todo dia ${a.dia}`;
  return 'Desligada';
}

export const ROTULO_GRUPO = new Map(GRUPOS.map((g) => [g.id, g.rotulo]));
