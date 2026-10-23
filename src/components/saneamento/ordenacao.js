// Ordenação das tabelas do saneamento (funções puras): clicar no cabeçalho alterna crescente, decrescente e a ordem original.
const colador = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const vazio = (v) => v == null || v === "" || (typeof v === "number" && Number.isNaN(v));

/** Próxima ordem ao clicar no cabeçalho `chave`: crescente → decrescente → sem ordem (a original). */
export const proximaOrdem = (ord, chave) => (!ord || ord.chave !== chave ? { chave, dir: 1 } : ord.dir === 1 ? { chave, dir: -1 } : null);

/** Compara dois valores: número com número; o resto como texto (sem acento nem caixa; "10" vem depois de "9"). */
export const compararValores = (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : colador.compare(String(a), String(b)));

/**
 * Ordena uma cópia da lista pela coluna `ord.chave`; `acessores[chave](linha)` dá o valor da coluna. Valor vazio fica sempre por último
 * (em qualquer sentido) e a ordem original desempata. Sem ordem ou com coluna desconhecida, devolve a própria lista.
 */
export function ordenarPor(lista, ord, acessores) {
  const f = ord && acessores?.[ord.chave];
  if (!f) return lista;
  return lista.map((x, i) => ({ x, i, v: f(x) })).sort((p, q) => {
    const ep = vazio(p.v); const eq = vazio(q.v);
    if (ep || eq) return ep === eq ? p.i - q.i : ep ? 1 : -1;
    return compararValores(p.v, q.v) * ord.dir || p.i - q.i;
  }).map((p) => p.x);
}
