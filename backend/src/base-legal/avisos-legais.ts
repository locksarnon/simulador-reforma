/** Avisos que acompanham um dispositivo quando um ato novo o altera e o texto compilado da norma ainda não traz a mudança. Função pura. */

export type PendenciaDeConsolidacao = { norma_chave: string | null; ato: string | null; detalhes: unknown };

/** A chave do mapa devolvido é "norma/caminho". Pendência sem lista de artigos (ato que revoga a norma inteira) vale para a norma toda. */
export function avisosDePendencias(pendencias: PendenciaDeConsolidacao[], itens: { chave: string; caminho: string }[]): Map<string, string[]> {
  const saida = new Map<string, string[]>();
  for (const p of pendencias) {
    const caminhos = (Array.isArray(p.detalhes) ? p.detalhes : []).map((d) => (d as { caminho?: string }).caminho).filter(Boolean) as string[];
    for (const i of itens) {
      if (i.chave !== p.norma_chave) continue;
      if (caminhos.length && !caminhos.includes(i.caminho)) continue;
      const k = `${i.chave}/${i.caminho}`;
      const aviso = `o ${p.ato ?? 'ato novo'} altera este dispositivo e o texto compilado ainda não traz a mudança`;
      saida.set(k, [...new Set([...(saida.get(k) ?? []), aviso])]);
    }
  }
  return saida;
}
