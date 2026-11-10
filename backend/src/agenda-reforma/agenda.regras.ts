/**
 * Regras puras da Agenda da Reforma: filtro por regime e UF da empresa, situação de cada marco e datas em horário de Brasília.
 * Os marcos são cadastrados com a fonte oficial (ver agenda.marcos.ts); aqui não há acesso a banco.
 */

/** Mesmos valores do cadastro de empresa (EmpresaFormDialog). */
export const REGIMES = ['Lucro Real', 'Lucro Presumido', 'Simples Nacional', 'Produtor rural PF'] as const;
export type Regime = (typeof REGIMES)[number];

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export const CATEGORIAS = [
  'Transição',
  'Alíquotas de referência',
  'Crédito presumido do estoque',
  'Produtor rural',
  'Simples Nacional',
  'Documentos fiscais',
  'Zona Franca de Manaus',
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

/** marco = a partir de quando algo vale; prazo = data-limite para o contribuinte agir. */
export type TipoMarco = 'marco' | 'prazo';

export type MarcoBase = {
  id: string;
  chave: string;
  titulo: string;
  tipo: string;
  categoria: string;
  data: Date;
  data_fim: Date | null;
  regimes: string[];
  ufs: string[];
};

export type SituacaoMarco = 'passado' | 'em_andamento' | 'futuro';

const DIA_MS = 86_400_000;

/** Tira acento e caixa e junta espaços: "Produtor Rural PF" e "produtor rural pf" são o mesmo regime. */
export const chaveDeTexto = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function regimeConhecido(v?: string | null): Regime | null {
  if (!v) return null;
  return REGIMES.find((r) => chaveDeTexto(r) === chaveDeTexto(v)) ?? null;
}

export function ufConhecida(v?: string | null): string | null {
  const uf = (v ?? '').trim().toUpperCase();
  return (UFS as readonly string[]).includes(uf) ? uf : null;
}

export function categoriaConhecida(v?: string | null): Categoria | null {
  if (!v) return null;
  return CATEGORIAS.find((c) => chaveDeTexto(c) === chaveDeTexto(v)) ?? null;
}

/** "YYYY-MM-DD" válido no calendário → Date à meia-noite UTC; qualquer outra coisa → null. */
export function lerDataIso(s?: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === m[0] ? d : null;
}

export const paraIso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** O dia de hoje em Brasília (as datas da agenda são datas de calendário, sem hora), como meia-noite UTC. */
export function hojeBrasilia(agora: Date = new Date()): Date {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  return new Date(`${dia}T00:00:00.000Z`);
}

export const diasEntre = (de: Date, ate: Date) => Math.round((ate.getTime() - de.getTime()) / DIA_MS);

export const somarDias = (d: Date, dias: number) => new Date(d.getTime() + dias * DIA_MS);

/** Data que conta para o lembrete: o último dia do prazo, ou o dia em que o marco passa a valer. */
export const dataAlvo = (m: Pick<MarcoBase, 'tipo' | 'data' | 'data_fim'>) => (m.tipo === 'prazo' ? m.data_fim ?? m.data : m.data);

export function situacaoDoMarco(m: Pick<MarcoBase, 'data' | 'data_fim'>, hoje: Date): SituacaoMarco {
  const fim = m.data_fim ?? m.data;
  if (fim.getTime() < hoje.getTime()) return 'passado';
  return m.data.getTime() <= hoje.getTime() ? 'em_andamento' : 'futuro';
}

/**
 * O marco vale para a empresa? `undefined` = não filtrar por esse critério; vazio ou null = empresa sem a informação
 * (só passam os marcos sem restrição); valor = a empresa tem esse regime/UF.
 */
export function aplicaAoPerfil(m: Pick<MarcoBase, 'regimes' | 'ufs'>, perfil: { regime?: string | null; uf?: string | null }): boolean {
  const okRegime = perfil.regime === undefined || !m.regimes.length || (Boolean(perfil.regime) && m.regimes.some((r) => chaveDeTexto(r) === chaveDeTexto(perfil.regime as string)));
  const okUf = perfil.uf === undefined || !m.ufs.length || (Boolean(perfil.uf) && m.ufs.some((u) => u.toUpperCase() === (perfil.uf as string).trim().toUpperCase()));
  return okRegime && okUf;
}

export type FiltrosAgenda = {
  regime?: string | null;
  uf?: string | null;
  categoria?: string | null;
  incluirPassados?: boolean;
  hoje: Date;
};

export const porData = (a: Pick<MarcoBase, 'data' | 'data_fim' | 'titulo'>, b: Pick<MarcoBase, 'data' | 'data_fim' | 'titulo'>) =>
  a.data.getTime() - b.data.getTime() || (a.data_fim ?? a.data).getTime() - (b.data_fim ?? b.data).getTime() || a.titulo.localeCompare(b.titulo, 'pt-BR');

/** Marcos que valem para o regime e a UF pedidos, na ordem da data; por padrão sem os que já passaram. */
export function filtrarMarcos<T extends MarcoBase>(marcos: T[], f: FiltrosAgenda): T[] {
  return marcos
    .filter((m) => aplicaAoPerfil(m, { regime: f.regime, uf: f.uf }))
    .filter((m) => !f.categoria || m.categoria === f.categoria)
    .filter((m) => f.incluirPassados || situacaoDoMarco(m, f.hoje) !== 'passado')
    .sort(porData);
}

/** "dd/mm/aaaa" de uma data de calendário (meia-noite UTC). */
export const dataBr = (d: Date | null | undefined) => {
  const iso = paraIso(d);
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
};

/** Quando a data cai, em palavras: "hoje", "amanhã", "em 7 dias", "há 3 dias". */
export function quandoEmPalavras(dias: number): string {
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  if (dias === -1) return 'ontem';
  return dias > 0 ? `em ${dias} dias` : `há ${-dias} dias`;
}
