/**
 * Regras da tela de importação de operações por planilha (/operacoes-planilha no backend): o que falta indicar antes de
 * conferir, coluna usada duas vezes e as opções enviadas. Sem React nem rede, para poder ser testado.
 */

/** Campos que a tela mostra sempre, em destaque. `alternativa` diz o que dispensa a coluna. */
export const CAMPOS_ESSENCIAIS = [
  { id: "data" },
  { id: "valor_bruto" },
  { id: "empresa", alternativa: "empresaPadrao", textoAlternativa: "uma empresa para todas as linhas" },
  { id: "direcao", alternativa: "direcaoPadrao", textoAlternativa: "uma direção (Entrada ou Saída) para todas as linhas" },
];

export const OPCOES_INICIAIS = {
  empresaPadrao: "",
  direcaoPadrao: "",
  tipoPadrao: "Mercadoria",
  unidadePct: "pontos",
  preencherTributos: true,
  creditoElegivelCompras: 0,
};

const usada = (v) => v !== null && v !== undefined && v !== "";

/** Índices de coluna usados por mais de um campo (o backend recusa). */
export function colunasRepetidas(mapa) {
  const contagem = new Map();
  for (const v of Object.values(mapa || {})) if (usada(v)) contagem.set(Number(v), (contagem.get(Number(v)) || 0) + 1);
  return [...contagem.entries()].filter(([, n]) => n > 1).map(([i]) => i);
}

/** Campos essenciais ainda sem coluna e sem a alternativa da tela. */
export function faltaIndicar(mapa, opcoes) {
  return CAMPOS_ESSENCIAIS.filter((c) => !usada(mapa?.[c.id]) && !(c.alternativa && opcoes?.[c.alternativa])).map((c) => c.id);
}

export function podeConferir(mapa, opcoes) {
  return faltaIndicar(mapa, opcoes).length === 0 && colunasRepetidas(mapa).length === 0;
}

/** Mapeamento no formato do backend: índice inteiro ou null. */
export function mapeamentoParaEnvio(mapa) {
  return Object.fromEntries(Object.entries(mapa || {}).map(([k, v]) => [k, usada(v) ? Number(v) : null]));
}

/** Opções no formato do backend: vazio vira null e o crédito vira fração (ou null se for 0). */
export function opcoesParaEnvio(opcoes) {
  const o = { ...OPCOES_INICIAIS, ...opcoes };
  return {
    empresaPadrao: o.empresaPadrao || null,
    direcaoPadrao: o.direcaoPadrao || null,
    tipoPadrao: o.tipoPadrao === "Servico" ? "Servico" : "Mercadoria",
    unidadePct: o.unidadePct === "fracao" ? "fracao" : "pontos",
    preencherTributos: Boolean(o.preencherTributos),
    creditoElegivelCompras: Number(o.creditoElegivelCompras) > 0 ? Number(o.creditoElegivelCompras) : null,
    grupoId: o.grupoId || null,
  };
}

/** Nome do campo (rótulo) a partir da lista que o backend devolve na prévia. */
export function rotuloDoCampo(campos, id) {
  return campos?.find((c) => c.id === id)?.rotulo || id;
}
