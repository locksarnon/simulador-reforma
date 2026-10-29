/**
 * Alíquotas do sistema atual para preencher a operação quando a planilha não traz o percentual. Espelha
 * src/lib/tabelasLegais.js (a tela de operação): só lei nacional, conferida; o ICMS interno varia por UF e produto e NÃO
 * é sugerido. O usuário sempre pode corrigir a operação depois.
 */
export const TABELA_PIS_COFINS: Record<string, { pis: number; cofins: number; base: string }> = {
  'Lucro Real': { pis: 0.0165, cofins: 0.076, base: 'Lucro Real: PIS 1,65% e Cofins 7,6% (regime não cumulativo, Leis 10.637/2002 e 10.833/2003)' },
  'Lucro Presumido': { pis: 0.0065, cofins: 0.03, base: 'Lucro Presumido: PIS 0,65% e Cofins 3,0% (regime cumulativo, Leis 9.715/1998 e 9.718/1998)' },
  'Simples Nacional': { pis: 0, cofins: 0, base: 'Simples Nacional: PIS/Cofins vão dentro do DAS' },
  'Produtor rural PF': { pis: 0, cofins: 0, base: 'Produtor rural pessoa física: sem PIS/Cofins nas vendas diretas' },
};

const SUL_SUDESTE_SEM_ES = new Set(['SP', 'RJ', 'MG', 'PR', 'SC', 'RS']);

/**
 * ICMS interestadual (Resolução do Senado 22/1989): 12% como regra; 7% quando a origem é Sul/Sudeste (exceto ES) e o
 * destino é Norte, Nordeste, Centro-Oeste ou ES. Devolve null quando as UFs faltam ou são iguais.
 */
export function icmsInterestadual(ufOrigem?: string | null, ufDestino?: string | null): number | null {
  const o = String(ufOrigem || '').toUpperCase();
  const d = String(ufDestino || '').toUpperCase();
  if (!o || !d || o === d) return null;
  return SUL_SUDESTE_SEM_ES.has(o) && !SUL_SUDESTE_SEM_ES.has(d) ? 0.07 : 0.12;
}
