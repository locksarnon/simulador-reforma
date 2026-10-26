// Contexto de uma conclusão: o que o analista examinou quando concluiu um grupo numa checagem. A conclusão vale para a base, para os itens que estavam em escopo no grupo e para a configuração
// do teste daquela hora. Se o escopo (o corte por data, os grupos do saneamento) ou a configuração do teste (as regras de padronização, a política de unidades, a regra de observação, o
// roteiro da conferência manual) mudar, a conclusão deixa de valer: nada se conclui sobre o que não foi verificado, nem reaprovar a regra a traz de volta. Voltar ao que era devolve a
// validade. A conclusão feita antes de o contexto ser registrado continua valendo como está. Funções puras.
import { CRITERIOS, REGRAS_PADRAO, abreviacoesAprovadas } from "./logica";
import { assinaturaObservacao } from "./observacao";

/** Resumo curto e estável de um texto (FNV-1a de 32 bits em base 36): para comparar, não para proteger. */
const resumo = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
/** JSON com as chaves em ordem: o mesmo conteúdo dá sempre o mesmo texto. */
const estavel = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

/** Os itens do grupo que estavam em escopo: quais são (a linha identifica o item na base analisada). */
export const assinaturaDoEscopo = (itens) => resumo(itens.map((i) => i.linha).join(","));

/**
 * O que o teste do critério lê além dos itens: a padronização, as regras de formato e as abreviações aprovadas; a unidade, a política da menor unidade e a tabela de unidades; a duplicidade,
 * a regra de observação (grupos e palavras); a conferência manual, o roteiro escrito pelo analista (o que foi conferido). Os demais testes só leem os itens. `nomesDosGrupos` são os grupos em escopo.
 */
export function assinaturaDoTeste(estado, crit, nomesDosGrupos = []) {
  switch (crit.id) {
    case "padrao": return resumo(estavel({ regras: { ...REGRAS_PADRAO, ...(estado?.padronizacao?.regras || {}) }, abreviacoes: abreviacoesAprovadas(estado) }));
    case "unidade": return resumo(estavel({ ativa: estado?.politicaUnidade?.ativa !== false, regras: estado?.politicaUnidade?.regras || {}, rotulos: estado?.politicaUnidade?.rotulos || {} }));
    case "duplicidade": return resumo(assinaturaObservacao(estado?.observacao, nomesDosGrupos));
    default: return crit.auto ? "" : resumo(String(estado?.criterios?.[crit.id]?.regra ?? ""));
  }
}

/** O contexto de cada conclusão possível: { "grupo|critério": contexto }, para os grupos em escopo ([{ nome, itens }]). Vai junto da contagem dos achados. */
export function contextosDasConclusoes(estado, grupos) {
  const nomes = grupos.map((g) => g.nome); const teste = Object.fromEntries(CRITERIOS.map((c) => [c.id, assinaturaDoTeste(estado, c, nomes)]));
  const saida = {};
  for (const g of grupos) { const escopo = assinaturaDoEscopo(g.itens); for (const c of CRITERIOS) saida[`${g.nome}|${c.id}`] = resumo(`${escopo}|${teste[c.id]}`); }
  return saida;
}
