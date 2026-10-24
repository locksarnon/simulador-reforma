// Passos do projeto de saneamento. O passo Checagens reúne o que eram os passos Critérios e Análises. O projeto guarda em `estado.passo` o passo em que o analista estava:
// projeto salvo com a numeração antiga (sem `versaoPassos`) é convertido ao abrir, uma única vez. Funções puras.
export const PASSO = { TRIAGEM: 0, CHECAGENS: 1, PILOTO: 2, DEPARA: 3, EXECUCAO: 4, CONFERENCIA: 5, FISCAL: 6, POLITICA: 7 };
export const TOTAL_PASSOS = 8;
export const VERSAO_PASSOS = 2;
// numeração antiga: 0 Triagem, 1 Critérios, 2 Piloto SAP, 3 Análises, 4 De/para, 5 Execução, 6 Conferência, 7 Fiscal, 8 Política
const ANTIGO_PARA_NOVO = [0, 1, 2, 1, 3, 4, 5, 6, 7];

/** O passo do projeto salvo na numeração de hoje (sempre entre 0 e o último passo; valor inválido volta à Triagem). */
export function passoDoProjeto(estado) {
  const p = Number(estado?.passo); if (!Number.isInteger(p) || p < 0) return PASSO.TRIAGEM;
  if ((estado?.versaoPassos ?? 1) >= VERSAO_PASSOS) return Math.min(p, TOTAL_PASSOS - 1);
  return ANTIGO_PARA_NOVO[p] ?? PASSO.TRIAGEM;
}
/** O trecho do estado que carrega o passo já convertido: { passo, versaoPassos }. */
export const migrarPassos = (estado) => ({ passo: passoDoProjeto(estado), versaoPassos: VERSAO_PASSOS });
