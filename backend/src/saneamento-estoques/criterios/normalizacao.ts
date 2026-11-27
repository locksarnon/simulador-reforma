/**
 * "Acrescentar critério (texto livre)": a IA só NORMALIZA a frase do usuário. Ou ela se encaixa num critério ajustável do catálogo (com um valor
 * dentro do mínimo e do máximo), e vira uma PROPOSTA que o usuário confirma com um clique (nunca aplicada sozinha), ou é uma verificação manual
 * (vai para a política; o sistema não a aplica). Funções puras: prompt e leitura da resposta, com validação pelo catálogo.
 */
import type { Camada } from '../tipos';
import { ROTULO_CAMADA } from '../rotulos';
import { criterioPorChave, criteriosAjustaveis, textoDoValor, validarValor, type ValorCriterio } from './catalogo';

export type Normalizacao =
  | { tipo: 'PARAMETRO'; camada: Camada; chave: string; valor: ValorCriterio; criterio: string; textoValor: string; explicacao: string }
  | { tipo: 'MANUAL'; explicacao: string };

export function montarPromptNormalizacao(camada: Camada, texto: string): string {
  const lista = criteriosAjustaveis().map((c) => {
    const p = c.parametro!;
    const faixa = p.tipo === 'booleano' ? 'true ou false' : p.tipo === 'lista' ? (p.opcoes ?? []).map((o) => o.valor).join(', ') : `${p.min ?? ''} a ${p.max ?? ''}${p.unidade === '%' ? ' (em %, número inteiro)' : ''}`;
    return `- camada ${c.camada} (${ROTULO_CAMADA[c.camada]}), chave "${p.chave}": ${c.texto}. ${p.ajuda} Valores: ${faixa}. Padrão: ${String(p.padrao)}.`;
  }).join('\n');
  return [
    'Você classifica um critério escrito por um consultor fiscal para a análise de um cadastro de estoque (saneamento de cadastro de produtos).',
    `A frase foi escrita na camada ${camada} (${ROTULO_CAMADA[camada]}).`,
    'Critérios que o sistema sabe aplicar (ajustáveis):',
    lista,
    '',
    'Regras:',
    '1. Se a frase pede claramente o mesmo que um dos critérios acima, responda tipo "PARAMETRO" com a camada, a chave e o valor que a frase pede (dentro da faixa).',
    '2. Se a frase não corresponde exatamente a nenhum critério acima, ou se o valor pedido não é claro, responda tipo "MANUAL". Na dúvida, MANUAL.',
    '3. Não invente critério novo nem valor fora da faixa.',
    '4. "explicacao": uma frase curta, em português simples, sem termos técnicos.',
    'Responda só um JSON, sem texto fora dele: {"tipo":"PARAMETRO","camada":"...","chave":"...","valor":...,"explicacao":"..."} ou {"tipo":"MANUAL","explicacao":"..."}',
    '',
    `Frase do consultor: """${texto.replace(/"""/g, '"')}"""`,
  ].join('\n');
}

/** Lê a resposta do modelo. Qualquer coisa fora do catálogo ou da faixa vira MANUAL (nunca se aplica valor inválido). */
export function lerNormalizacao(resposta: string | null | undefined): Normalizacao {
  const manual = (explicacao = 'Não corresponde a um critério que o sistema aplica sozinho.'): Normalizacao => ({ tipo: 'MANUAL', explicacao });
  const m = String(resposta ?? '').match(/\{[\s\S]*\}/);
  if (!m) return manual();
  let o: Record<string, unknown>;
  try { o = JSON.parse(m[0]) as Record<string, unknown>; } catch { return manual(); }
  const explicacao = typeof o.explicacao === 'string' && o.explicacao.trim() ? o.explicacao.trim().slice(0, 300) : '';
  if (o.tipo !== 'PARAMETRO') return manual(explicacao || undefined);
  const c = criterioPorChave(String(o.camada ?? '') as Camada, String(o.chave ?? ''));
  if (!c?.parametro) return manual();
  const v = validarValor(c.parametro, o.valor);
  if (!v.ok) return manual();
  return { tipo: 'PARAMETRO', camada: c.camada, chave: c.parametro.chave, valor: v.valor, criterio: c.texto, textoValor: textoDoValor(c.parametro, v.valor), explicacao };
}
