/**
 * Busca de cartões de perguntas frequentes (funções puras): tolera acento, plural e palavras diferentes.
 *
 * Um cartão só aparece se explicar a PERGUNTA, e não só algumas palavras dela. Para isso cada palavra pesa pela raridade nos cartões
 * (IDF): "IBS" e "CBS", que estão em quase todo cartão, pesam pouco; "soja", que não está em nenhum, pesa o máximo e, como nenhum
 * cartão a explica, derruba a cobertura de todos. Nada é fixo por palavra: vale para qualquer assunto, inclusive os que ainda
 * não têm cartão.
 */

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

/** Cobertura mínima do peso informativo da pergunta que o cartão precisa explicar. */
// Medido com os cartões revisados reais (18/11/2026): de 0,45 a 0,55 acha 13 de 14 perguntas legítimas e nenhuma das 11 sem cartão; no meio da faixa há margem nos dois lados.
export const COBERTURA_MINIMA = 0.5;
/** Uma palavra que está em mais que esta fração dos cartões é do assunto da base inteira: não decide sozinha. */
const FRACAO_COMUM = 0.3;
/** Cartões abaixo desta fração da melhor pontuação são descartados (evita cauda de resultados fracos). */
const FRACAO_DO_TOPO = 0.5;

/** Pontua cada cartão: cobertura da pergunta pesada por raridade; o campo decide o peso (pergunta 3, sinônimos/tema 2, resposta 1). */
export function buscarCartoes<T extends CartaoBusca>(consulta: string, cartoes: T[], limite = 4, coberturaMinima = COBERTURA_MINIMA): (T & { pontos: number })[] {
  const q = [...new Set(radicais(consulta))];
  if (!q.length || !cartoes.length) return [];
  const campos = cartoes.map((c) => ({
    p: new Set(radicais(c.pergunta)),
    s: new Set(radicais(`${c.sinonimos ?? ''} ${c.tema}`)),
    r: new Set(radicais(c.resposta)),
  }));
  const n = cartoes.length;
  const df = (t: string) => campos.filter((c) => c.p.has(t) || c.s.has(t) || c.r.has(t)).length;
  // Palavra que nenhum cartão tem recebe o peso máximo: é justamente o assunto que a base não cobre.
  const peso = (t: string) => Math.log(1 + n / (1 + df(t)));
  const limiteComum = Math.max(1, Math.floor(FRACAO_COMUM * n));
  const info = q.map((t) => ({ t, peso: peso(t), distintiva: df(t) <= limiteComum }));
  const total = info.reduce((s, x) => s + x.peso, 0);
  // Pergunta feita só de palavras do assunto da base inteira ("tem incidência de IBS e CBS?"): não há o que casar.
  if (!info.some((x) => x.distintiva)) return [];

  const pontuados = cartoes.map((c, i) => {
    const f = campos[i];
    let coberto = 0;
    let pontos = 0;
    let distintivaNoTitulo = false;
    for (const x of info) {
      const v = f.p.has(x.t) ? 3 : f.s.has(x.t) ? 2 : f.r.has(x.t) ? 1 : 0;
      if (!v) continue;
      coberto += x.peso;
      pontos += v * x.peso;
      if (x.distintiva && v >= 2) distintivaNoTitulo = true;
    }
    const cobertura = total > 0 ? coberto / total : 0;
    // Precisa explicar boa parte da pergunta e ter uma palavra distintiva na pergunta/sinônimos/tema do cartão (não só na resposta).
    return { ...c, pontos: cobertura >= coberturaMinima && distintivaNoTitulo ? pontos : 0 };
  });
  const validos = pontuados.filter((c) => c.pontos > 0).sort((a, b) => b.pontos - a.pontos);
  if (!validos.length) return [];
  const topo = validos[0].pontos;
  return validos.filter((c) => c.pontos >= topo * FRACAO_DO_TOPO).slice(0, limite);
}
