/**
 * Recorte do resultado de uma camada aos itens afetados por uma regra ("aplicar e reanalisar" reexecuta só esses itens). A análise roda
 * sobre a base inteira (a grafia dominante e os conjuntos dependem dela), mas só se grava o que toca o escopo. O escopo é FECHADO: entra todo
 * item de caso produzido ou de caso aberto (proposto) que tenha algum item do escopo, até não mudar mais. Assim nenhum caso de conjunto
 * fica pela metade (o caso antigo vira obsoleto e o novo cobre os mesmos itens). Função pura.
 */
import type { ResultadoCamada } from '../tipos';

export function fecharEscopo(inicial: Iterable<string>, produzidos: { itens: string[] }[], abertos: { itens: string[] }[]): Set<string> {
  const escopo = new Set(inicial);
  const conjuntos = [...produzidos, ...abertos];
  const porItem = new Map<string, number[]>();
  conjuntos.forEach((c, i) => { for (const id of c.itens) { const l = porItem.get(id); if (l) l.push(i); else porItem.set(id, [i]); } });
  const usados = new Set<number>();
  const fila = [...escopo];
  while (fila.length) {
    const id = fila.pop()!;
    for (const i of porItem.get(id) ?? []) {
      if (usados.has(i)) continue;
      usados.add(i);
      for (const outro of conjuntos[i].itens) if (!escopo.has(outro)) { escopo.add(outro); fila.push(outro); }
    }
  }
  return escopo;
}

/** O resultado só com o que toca o escopo (casos com algum item do escopo; "sem problema" e analisados do escopo). */
export function recortarResultado(r: ResultadoCamada, escopo: Set<string>): ResultadoCamada {
  return {
    ...r,
    analisados: Math.min(r.analisados, escopo.size),
    casos: r.casos.filter((c) => c.itens.some((i) => escopo.has(i))),
    semProblema: r.semProblema.filter((i) => escopo.has(i)),
  };
}
