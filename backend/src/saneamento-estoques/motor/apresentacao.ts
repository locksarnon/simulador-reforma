/**
 * Regra determinística do critério "Embalagens ou apresentações diferentes são itens diferentes" (Duplicidades). Separa a descrição em NOME
 * e APRESENTAÇÃO (volume, peso, quantidade por embalagem e a palavra da embalagem: caixa, saco, frasco, galão, balde...) e soma a unidade do item.
 * Dois itens "diferem só pela apresentação" quando o nome é o mesmo e a apresentação é diferente: 20 L × 5 L, SC 50 KG × SC 25 KG, CX 12 UN × UN.
 * Medidas são convertidas antes de comparar (0,5 L = 500 ML; 1 KG = 1000 G), então 0,5 L e 500 ML são a MESMA apresentação.
 * Sem IA: roda em todos os pares que o detector indicaria, sem custo.
 */
import { unidadeCanonica } from '../../produtos/duplicidade';

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Palavra da embalagem → forma única. */
const EMBALAGEM: Record<string, string> = {
  cx: 'caixa', cxs: 'caixa', caixa: 'caixa', caixas: 'caixa', sc: 'saco', scs: 'saco', saco: 'saco', sacos: 'saco', sacaria: 'saco',
  fr: 'frasco', frs: 'frasco', frasco: 'frasco', frascos: 'frasco', gl: 'galao', galao: 'galao', galoes: 'galao', bd: 'balde', balde: 'balde', baldes: 'balde',
  tb: 'tambor', tambor: 'tambor', tambores: 'tambor', bombona: 'bombona', bombonas: 'bombona', lata: 'lata', latas: 'lata', pct: 'pacote', pcte: 'pacote', pacote: 'pacote', pacotes: 'pacote',
  emb: 'embalagem', embalagem: 'embalagem', bag: 'bag', bags: 'bag', bigbag: 'bag', bisnaga: 'bisnaga', ampola: 'ampola', ampolas: 'ampola', fardo: 'fardo', fardos: 'fardo',
  un: 'unidade', und: 'unidade', unid: 'unidade', unidade: 'unidade', unidades: 'unidade', pc: 'unidade', pcs: 'unidade', peca: 'unidade', pecas: 'unidade', dz: 'duzia', duzia: 'duzia',
  kit: 'kit', jogo: 'kit', display: 'display', blister: 'blister', refil: 'refil', ib: 'ibc', ibc: 'ibc', container: 'ibc',
};
const MASSA: Record<string, number> = { kg: 1000, kgs: 1000, quilo: 1000, quilos: 1000, g: 1, gr: 1, grs: 1, grama: 1, gramas: 1, mg: 0.001, t: 1e6, ton: 1e6, tonelada: 1e6, toneladas: 1e6 };
const VOLUME: Record<string, number> = { l: 1000, lt: 1000, lts: 1000, litro: 1000, litros: 1000, ml: 1, cc: 1 };
const QTD = new Set(['un', 'und', 'unid', 'unidade', 'unidades', 'pc', 'pcs', 'peca', 'pecas', 'frascos', 'ampolas', 'sacos', 'doses', 'dose']);
const arred = (n: number) => String(Math.round(n * 1000) / 1000);

export type Apresentacao = { nome: string; apresentacao: string };

/** Nome e apresentação da descrição (com a unidade do item). Nome vazio = não dá para afirmar nada. */
export function separarApresentacao(descricao: string | null | undefined, unidade?: string | null): Apresentacao {
  let s = sem(String(descricao ?? '')).replace(/(\d),(\d)/g, '$1.$2').replace(/c\//g, ' com ').replace(/[()[\]]/g, ' ');
  const partes: string[] = [];
  const medida = (n: string, u: string): string | null => {
    const v = Number(n);
    if (!Number.isFinite(v)) return null;
    if (MASSA[u] !== undefined) return `massa:${arred(v * MASSA[u])}`;
    if (VOLUME[u] !== undefined) return `volume:${arred(v * VOLUME[u])}`;
    if (QTD.has(u)) return `qtd:${arred(v)}`;
    return null;
  };
  // "12x500ml", "12 x 1 l": quantidade por embalagem e a medida de cada uma
  s = s.replace(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*([a-z]+)\b/g, (m, q: string, n: string, u: string) => { const md = medida(n, u); if (!md) return m; partes.push(`qtd:${q}`, md); return ' '; });
  // "com 12 un", "com 20 frascos"
  s = s.replace(/\bcom\s+(\d+)\s*(un|und|unid|unidades?|pc|pcs|pecas?|frascos?|ampolas?|sacos?|doses?)?\b/g, (_m, q: string) => { partes.push(`qtd:${q}`); return ' '; });
  // "20l", "50 kg", "12un"
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*([a-z]+)\b/g, (m, n: string, u: string) => { const md = medida(n, u); if (!md) return m; partes.push(md); return ' '; });
  const nome: string[] = [];
  for (const w of s.split(/[^a-z0-9.]+/).map((x) => x.replace(/^\.+|\.+$/g, '')).filter(Boolean)) {
    if (EMBALAGEM[w]) { partes.push(`emb:${EMBALAGEM[w]}`); continue; }
    if (['de', 'da', 'do', 'com', 'c', 'e', 'x'].includes(w)) continue;
    nome.push(w);
  }
  const un = unidadeCanonica(String(unidade ?? ''));
  if (un) partes.push(`unidade:${EMBALAGEM[un] ?? un}`);
  return { nome: nome.join(' '), apresentacao: [...new Set(partes)].sort().join('|') };
}

/** Os dois itens são o mesmo produto em embalagens/apresentações diferentes (mesmo nome, apresentação diferente)? */
export function diferemSoPelaApresentacao(a: Apresentacao, b: Apresentacao): boolean {
  return !!a.nome && a.nome === b.nome && /[a-z]{3}/.test(a.nome) && a.apresentacao !== b.apresentacao;
}
