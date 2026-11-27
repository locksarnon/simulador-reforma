/**
 * Tratamento dos itens sem data de última movimentação, escolhido na importação (obrigatório em toda importação do Saneamento) e editável em
 * Fase 1 > 1.1 Dados do projeto. Fica em `SanProjeto.parametros` (sem mudar o schema):
 *   - `semDataMovimentacao`: 'SEM_MOVIMENTACAO' ("Considerar sem movimentação") | 'DEPOIS' ("Deixar para tratar depois");
 *   - `semDataMovimentacaoDecisao`: { tratamento, por, em, origem: IMPORTACAO | CONFIGURACAO, arquivo? } (quem escolheu, quando e onde);
 *   - `semDataMovimentacaoAlteradaEm`: quando o comportamento da análise mudou (Qualidade e Duplicidades ficam desatualizadas).
 * Projeto sem escolha (anterior a esta regra) segue como "Deixar para tratar depois" (o comportamento de antes). Funções puras (sem Nest nem banco): o motor, os critérios e a política também leem daqui.
 */
export const TRATAMENTOS_SEM_DATA = ['SEM_MOVIMENTACAO', 'DEPOIS'] as const;
export type TratamentoSemData = (typeof TRATAMENTOS_SEM_DATA)[number];
export const ROTULO_TRATAMENTO_SEM_DATA: Record<TratamentoSemData, string> = {
  SEM_MOVIMENTACAO: 'Considerar sem movimentação',
  DEPOIS: 'Deixar para tratar depois',
};
export type DecisaoSemData = { tratamento: TratamentoSemData; por: string; em: string; origem: 'IMPORTACAO' | 'CONFIGURACAO'; arquivo?: string | null };
/** Camadas cuja análise usa o tratamento (mudou: ficam desatualizadas até analisar de novo). */
export const CAMADAS_DO_TRATAMENTO_SEM_DATA = ['QUALIDADE', 'DUPLICIDADE'] as const;

type Json = Record<string, unknown>;
export const ehTratamentoSemData = (v: unknown): v is TratamentoSemData => typeof v === 'string' && (TRATAMENTOS_SEM_DATA as readonly string[]).includes(v);

/** Valida a escolha enviada (importação ou Configuração). Sem ela, o erro com a mensagem da tela (quem chama responde 400). */
export function validarTratamentoSemData(v: unknown): { ok: true; valor: TratamentoSemData } | { ok: false; codigo: string; erro: string } {
  const t = typeof v === 'string' ? v.trim() : v;
  if (t === undefined || t === null || t === '') return { ok: false, codigo: 'TRATAMENTO_SEM_DATA_OBRIGATORIO', erro: 'Escolha o tratamento para itens sem data de última movimentação: Considerar sem movimentação ou Deixar para tratar depois.' };
  if (!ehTratamentoSemData(t)) return { ok: false, codigo: 'TRATAMENTO_SEM_DATA_INVALIDO', erro: 'Tratamento para itens sem data inválido: escolha Considerar sem movimentação ou Deixar para tratar depois.' };
  return { ok: true, valor: t };
}

/** O tratamento gravado no projeto (null = nunca escolhido). */
export const tratamentoSemDataDe = (parametros: Json | null | undefined): TratamentoSemData | null => (ehTratamentoSemData(parametros?.semDataMovimentacao) ? parametros!.semDataMovimentacao as TratamentoSemData : null);
export const decisaoSemDataDe = (parametros: Json | null | undefined): DecisaoSemData | null => {
  const d = parametros?.semDataMovimentacaoDecisao as DecisaoSemData | undefined;
  return d && typeof d === 'object' && ehTratamentoSemData(d.tratamento) ? d : null;
};

/**
 * Chaves de `parametros` a gravar para a escolha (atômico, com gravarChavesDosParametros). A mesma escolha de antes não muda nada (fica a decisão
 * original, com quem e quando); escolha diferente regrava a decisão e, se o comportamento da análise mudou, marca a data da mudança.
 */
export function chavesDaEscolhaSemData(parametros: Json | null | undefined, tratamento: TratamentoSemData, d: Omit<DecisaoSemData, 'tratamento'>): Json {
  const atual = tratamentoSemDataDe(parametros);
  if (atual === tratamento && decisaoSemDataDe(parametros)) return {};
  const definir: Json = { semDataMovimentacao: tratamento, semDataMovimentacaoDecisao: { tratamento, ...d } };
  // Sem escolha anterior, a análise rodou como "Deixar para tratar depois": só muda o comportamento se agora for outro.
  if ((atual ?? 'DEPOIS') !== tratamento) definir.semDataMovimentacaoAlteradaEm = d.em;
  return definir;
}

const dataHoraBr = (iso: string | null | undefined) => {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return String(iso);
  // Data no fuso do Brasil (o registro é UTC): uma escolha às 22h não vira o dia seguinte.
  return t.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

/** "na importação, por Fulano, em 27/11/2026" (vazio quando não há registro). */
export function textoDaDecisaoSemData(d: { por?: string | null; em?: string | null; origem?: string | null } | null | undefined): string {
  if (!d) return '';
  const onde = d.origem === 'CONFIGURACAO' ? 'na configuração do projeto' : 'na importação';
  return [onde, d.por ? `por ${d.por}` : '', d.em ? `em ${dataHoraBr(d.em)}` : ''].filter(Boolean).join(', ');
}

/** Texto para o cliente ("O que foi considerado" e política): como os itens sem data foram tratados. */
export function textoTratamentoSemData(parametros: Json | null | undefined): string {
  const t = tratamentoSemDataDe(parametros);
  if (!t) return 'não escolhido (tratados à parte, para depois)';
  const quem = textoDaDecisaoSemData(decisaoSemDataDe(parametros));
  return t === 'SEM_MOVIMENTACAO'
    ? `considerados sem movimentação desde o corte${quem ? ` (escolha ${quem})` : ''}`
    : `deixados para tratar depois: ficam fora do corte de movimentação, pendentes${quem ? ` (escolha ${quem})` : ''}`;
}
