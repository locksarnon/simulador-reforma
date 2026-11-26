/** Peças comuns às camadas: evidência, justificativa com providência e montagem do resultado. */
import type { Camada, CasoProposto, Evidencia, ItemTrabalho, ResultadoCamada } from '../tipos';
import { chaveEstab, porTexto } from './texto';

export const ev = (rotulo: string, valor: unknown): Evidencia => ({ rotulo, valor: String(valor ?? '') });

/** Todo caso aponta a causa e a providência: a providência vai ao fim da justificativa. */
export const justificar = (porque: string, providencia: string): string => `${porque} Providência: ${providencia}`;

/** Como o item é citado nas evidências: código e, quando há, o estabelecimento. */
export const rotuloItem = (it: Pick<ItemTrabalho, 'codigo' | 'estabelecimento'>): string => (chaveEstab(it) ? `${it.codigo} (${chaveEstab(it)})` : it.codigo);

/** O id do item mais a ordem estável dos casos: tipo, depois ids. */
const chaveOrdem = (c: CasoProposto) => `${c.tipo}\u0000${c.itens.length > 40 ? `${c.itens.slice(0, 40).join('\u0001')}\u0001${c.itens.length}` : c.itens.join('\u0001')}`;

/** Resultado da camada: casos em ordem estável e, em `semProblema`, os itens analisados que não aparecem em nenhum caso. */
export function montarResultado(camada: Camada, itens: ItemTrabalho[], casos: CasoProposto[], semDados: ResultadoCamada['semDados'] = null): ResultadoCamada {
  const comChave = casos.map((c) => [chaveOrdem(c), c] as const).sort((a, b) => porTexto(a[0], b[0]));
  const comProblema = new Set<string>();
  for (const [, c] of comChave) for (const id of c.itens) comProblema.add(id);
  return { camada, analisados: itens.length, semDados, casos: comChave.map(([, c]) => c), semProblema: itens.filter((i) => !comProblema.has(i.id)).map((i) => i.id) };
}

/** Itens sem repetir id (a entrada pode, por engano, trazer o mesmo id duas vezes). */
export const porId = (itens: ItemTrabalho[]): Map<string, ItemTrabalho> => new Map(itens.map((i) => [i.id, i]));
