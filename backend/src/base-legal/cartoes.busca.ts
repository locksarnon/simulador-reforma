/** Busca de cartões de perguntas frequentes (funções puras): tolera acento, plural e palavras diferentes. */

const PARADAS = new Set([
  'para', 'como', 'qual', 'quais', 'quando', 'onde', 'quem', 'que', 'uma', 'uns', 'umas', 'dos', 'das', 'nos', 'nas', 'com', 'sem', 'por', 'pelo', 'pela',
  'mais', 'menos', 'muito', 'ser', 'sao', 'esta', 'esse', 'essa', 'isso', 'ate', 'sobre', 'entre', 'quanto', 'quantos', 'fica', 'pode', 'podem', 'tem', 'ter', 'seu', 'sua',
  'vira', 'sobre', 'caso', 'quando', 'deve', 'devem', 'existe', 'preciso', 'posso',
]);

export const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "produtores" e "produtor" viram o mesmo radical (5 letras) — suficiente para o vocabulário jurídico daqui. */
export function radicais(texto: string): string[] {
  return semAcento(texto)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !PARADAS.has(t))
    .map((t) => (/^\d+$/.test(t) ? t : t.slice(0, 6)));
}

export type CartaoBusca = { id: string; pergunta: string; sinonimos: string | null; resposta: string; tema: string };

/** Pontua cada cartão: radical na pergunta (3), nos sinônimos/tema (2), na resposta (1). */
export function buscarCartoes<T extends CartaoBusca>(consulta: string, cartoes: T[], limite = 4): (T & { pontos: number })[] {
  const q = [...new Set(radicais(consulta))];
  if (!q.length) return [];
  const pontuados = cartoes.map((c) => {
    const p = new Set(radicais(c.pergunta));
    const s = new Set(radicais(`${c.sinonimos ?? ''} ${c.tema}`));
    const r = new Set(radicais(c.resposta));
    let pontos = 0;
    let acertos = 0;
    for (const t of q) {
      const v = p.has(t) ? 3 : s.has(t) ? 2 : r.has(t) ? 1 : 0;
      if (v) acertos += 1;
      pontos += v;
    }
    // exige que uma parte razoável da pergunta apareça (evita acertar por uma palavra solta)
    return { ...c, pontos: acertos / q.length >= 0.4 ? pontos : 0 };
  });
  return pontuados.filter((c) => c.pontos >= 4).sort((a, b) => b.pontos - a.pontos).slice(0, limite);
}
