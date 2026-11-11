import { data, diaUtilAnterior, enesimoDiaUtil, iso, proximoDiaUtil, somarMeses, ultimoDiaDoMes, ultimoDiaUtilAte, ultimoDiaUtilDoMes } from './dias-uteis';
import { OBRIGACOES_FEDERAIS } from './obrigacoes.tabela';

/**
 * Agenda de obrigações federais: a regra de prazo de cada obrigação vem de `obrigacoes.tabela.ts`, com a fonte oficial e o trecho
 * lido. Aqui só se calcula a data. Regra sem fonte oficial confirmada aparece com `confirmado: false` e a tela mostra "não confirmado".
 */
export type Regime = 'Simples Nacional' | 'MEI' | 'Lucro Presumido' | 'Lucro Real' | 'Produtor rural PF';
/** O que fazer quando a data cai em dia sem expediente: antecipar, prorrogar ou nada (a norma não diz). */
export type Ajuste = 'ANTECIPA' | 'PRORROGA' | 'NENHUM';
export type Regra =
  | { tipo: 'DIA_FIXO'; dia: number; ajuste: Ajuste }
  | { tipo: 'ULTIMO_DIA_UTIL' }
  | { tipo: 'ENESIMO_DIA_UTIL'; n: number }
  | { tipo: 'ULTIMO_DIA_UTIL_ATE'; dia: number };
export type Fonte = { norma: string; dispositivo: string; url: string; trecho: string };
export type Obrigacao = {
  id: string;
  nome: string;
  tipo: 'PAGAMENTO' | 'DECLARACAO';
  /** Mensal: competência = mês de `mesesDepois` antes do vencimento. Trimestral: trimestre encerrado. Anual: ano-calendário anterior. */
  periodicidade: 'MENSAL' | 'TRIMESTRAL' | 'ANUAL';
  /** Quantos meses depois da competência (ou do fim do trimestre) vence. No anual, o mês do vencimento vai em `mesAnual`. */
  mesesDepois: number;
  mesAnual?: number;
  regra: Regra;
  regimes: Regime[] | 'TODOS';
  /** Quando a obrigação só existe se houver o fato (empregado, retenção…). */
  condicao?: string;
  fonte: Fonte | null;
  confirmado: boolean;
  observacao?: string;
  /** A obrigação só existe para vencimentos a partir de / até esta data (AAAA-MM-DD). */
  vigenteDesde?: string;
  vigenteAte?: string;
};

export type Vencimento = {
  obrigacao: string;
  nome: string;
  tipo: Obrigacao['tipo'];
  competencia: string;
  /** A data que a norma diz, antes de mover por fim de semana ou feriado. */
  data_legal: string;
  /** A data a cumprir, já movida conforme a regra de ajuste. */
  data: string;
  movida: boolean;
  regimes: Regime[] | 'TODOS';
  condicao: string | null;
  fonte: Fonte | null;
  confirmado: boolean;
  observacao: string | null;
};

/** A data legal e a data a cumprir de uma obrigação num mês de vencimento. */
export function calcularData(regra: Regra, ano: number, mes: number): { legal: Date; efetiva: Date } {
  switch (regra.tipo) {
    case 'DIA_FIXO': {
      const legal = data(ano, mes, Math.min(regra.dia, ultimoDiaDoMes(ano, mes)));
      const efetiva = regra.ajuste === 'ANTECIPA' ? diaUtilAnterior(legal) : regra.ajuste === 'PRORROGA' ? proximoDiaUtil(legal) : legal;
      return { legal, efetiva };
    }
    case 'ULTIMO_DIA_UTIL':
      return { legal: ultimoDiaUtilDoMes(ano, mes), efetiva: ultimoDiaUtilDoMes(ano, mes) };
    case 'ENESIMO_DIA_UTIL':
      return { legal: enesimoDiaUtil(ano, mes, regra.n), efetiva: enesimoDiaUtil(ano, mes, regra.n) };
    case 'ULTIMO_DIA_UTIL_ATE':
      return { legal: data(ano, mes, regra.dia), efetiva: ultimoDiaUtilAte(ano, mes, regra.dia) };
  }
}

/** A competência que vence no mês (ano, mês), ou null se a obrigação não vence naquele mês. */
export function competenciaQueVence(o: Obrigacao, ano: number, mes: number): string | null {
  if (o.periodicidade === 'MENSAL') {
    const c = somarMeses(ano, mes, -o.mesesDepois);
    return `${c.ano}-${String(c.mes).padStart(2, '0')}`;
  }
  if (o.periodicidade === 'TRIMESTRAL') {
    const fim = somarMeses(ano, mes, -o.mesesDepois);
    return fim.mes % 3 === 0 ? `${fim.ano}-T${fim.mes / 3}` : null;
  }
  return mes === o.mesAnual ? String(ano - 1) : null;
}

/** A obrigação vale para o regime? Sem regime (empresa sem cadastro de regime), vale tudo, e a tela avisa. */
export function seAplica(o: Obrigacao, regime?: string | null): boolean {
  if (!regime || o.regimes === 'TODOS') return true;
  return (o.regimes as string[]).includes(regime);
}

/** Os vencimentos de um mês, em ordem de data. `regime` filtra pelo regime da empresa. */
export function vencimentosDoMes(ano: number, mes: number, regime?: string | null, tabela: Obrigacao[] = OBRIGACOES_FEDERAIS): Vencimento[] {
  const lista: Vencimento[] = [];
  for (const o of tabela) {
    if (!seAplica(o, regime)) continue;
    const competencia = competenciaQueVence(o, ano, mes);
    if (!competencia) continue;
    const { legal, efetiva } = calcularData(o.regra, ano, mes);
    if ((o.vigenteDesde && iso(legal) < o.vigenteDesde) || (o.vigenteAte && iso(legal) > o.vigenteAte)) continue;
    lista.push({
      obrigacao: o.id, nome: o.nome, tipo: o.tipo, competencia, data_legal: iso(legal), data: iso(efetiva), movida: iso(legal) !== iso(efetiva),
      regimes: o.regimes, condicao: o.condicao ?? null, fonte: o.fonte, confirmado: o.confirmado, observacao: o.observacao ?? null,
    });
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome));
}

/** Os vencimentos entre duas datas (AAAA-MM-DD, inclusive). */
export function vencimentosNoPeriodo(de: string, ate: string, regime?: string | null, tabela: Obrigacao[] = OBRIGACOES_FEDERAIS): Vencimento[] {
  const [a1, m1] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  const lista: Vencimento[] = [];
  // Um mês antes e um depois: o ajuste por feriado pode cruzar a virada do mês.
  for (let c = somarMeses(a1, m1, -1); c.ano * 12 + c.mes <= a2 * 12 + m2 + 1; c = somarMeses(c.ano, c.mes, 1)) {
    lista.push(...vencimentosDoMes(c.ano, c.mes, regime, tabela));
  }
  return lista.filter((v) => v.data >= de && v.data <= ate);
}
