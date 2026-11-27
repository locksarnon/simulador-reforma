import type { CasoParaParecer } from '../dados/portas';

/**
 * Quando vale pedir parecer à IA: só na BORDA, isto é, no que a regra não decide sozinha.
 * Duplicidade exata ou de indicação alta, NCM inexistente, unidade, código etc. a regra resolve: nunca vão para a IA.
 * Função pura, sem acesso a banco.
 */

export type CodigoBorda = 'DUPLICIDADE_MISTA' | 'NCM_AMBIGUO' | 'FINALIDADE_INCERTA' | 'TRIBUTARIO_CANDIDATOS' | 'CREDITO_PIS_COFINS';
export type Borda = { codigo: CodigoBorda; motivo: string };

type CasoBorda = Pick<CasoParaParecer, 'camada' | 'tipo' | 'problema' | 'evidencia' | 'atual' | 'proposta' | 'justificativa'>;

const sem = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const evidencias = (c: CasoBorda): { rotulo: string; valor: string }[] =>
  (Array.isArray(c.evidencia) ? c.evidencia : []).map((e) => ({ rotulo: sem((e as { rotulo?: unknown })?.rotulo), valor: sem((e as { valor?: unknown })?.valor) }));

/** A regra decide: nunca vai para a IA, mesmo que o texto lembre uma dúvida. */
const REGRA_DECIDE = new Set(['DUPLICIDADE_EXATA', 'DUPLICIDADE_INDICACAO_ALTA']);

const DUPLICIDADE: Record<string, string> = {
  DUPLICIDADE_INDICACAO_POSSIVEL: 'Duplicidade só possível: o texto indica, mas não prova, que os códigos são o mesmo produto.',
  ATRIBUTOS_CONFLITANTES: 'Duplicidade com sinais mistos: mesmo nome, concentração ou composição diferente.',
  APRESENTACOES_DISTINTAS: 'Duplicidade com sinais mistos: o mesmo produto em apresentações diferentes.',
};
const NCM: Record<string, string> = {
  NCM_DIVERGENTE_ENTRE_ITENS_IGUAIS: 'Itens de descrição idêntica com NCMs diferentes: duas classes candidatas.',
  NCM_INCOMPATIVEL_DESCRICAO: 'NCM sem relação textual com a descrição: classificação ambígua.',
};

/** Finalidade: camada FINALIDADE (Fase 2); GRUPOS_FINALIDADE só nos casos anteriores à divisão em fases (fotos antigas). */
const ehFinalidade = (camada: string) => camada === 'FINALIDADE' || camada === 'GRUPOS_FINALIDADE';

export function motivoBorda(c: CasoBorda): Borda | null {
  if (REGRA_DECIDE.has(c.tipo)) return null;
  const ev = evidencias(c);
  const texto = sem(`${c.problema} ${c.justificativa} ${ev.map((e) => `${e.rotulo} ${e.valor}`).join(' ')}`);

  if (c.camada === 'DUPLICIDADE' && DUPLICIDADE[c.tipo]) return { codigo: 'DUPLICIDADE_MISTA', motivo: DUPLICIDADE[c.tipo] };

  if (c.camada === 'NCM' || c.camada === 'NCM_CLASSIFICACAO') {
    if (NCM[c.tipo]) return { codigo: 'NCM_AMBIGUO', motivo: NCM[c.tipo] };
    // Mais de um sucessor possível para a classificação encerrada: a escolha depende da característica do produto.
    if (c.tipo === 'NCM_CLASSIFICACAO_ANTIGA' && ev.some((e) => e.rotulo.startsWith('sucessor') && e.valor.includes(','))) {
      return { codigo: 'NCM_AMBIGUO', motivo: 'Classificação encerrada com mais de um sucessor possível: duas classes candidatas.' };
    }
  }

  // Crédito de PIS/Cofins sobre item de uso ambíguo (insumo × uso e consumo × manutenção depende do uso real).
  if ((c.camada === 'TRIBUTARIO' || ehFinalidade(c.camada)) && /\b(pis|cofins)\b/.test(texto) && /ambigu|depende do uso|uso incert|pode ser (insumo|uso e consumo|manutencao)/.test(texto)) {
    return { codigo: 'CREDITO_PIS_COFINS', motivo: 'Crédito de PIS/Cofins sobre item de uso ambíguo.' };
  }

  // Caso tributário que aguarda informação, mas com candidatos: a IA ajuda a escolher; sem candidato, falta dado e a IA não inventa.
  if (c.camada === 'TRIBUTARIO' && c.tipo === 'AGUARDANDO_INFORMACAO' && ev.some((e) => /candidat|alternativ/.test(e.rotulo) && e.valor)) {
    return { codigo: 'TRIBUTARIO_CANDIDATOS', motivo: 'Enquadramento aguardando informação, com candidatos a avaliar.' };
  }

  // Finalidade com confiança baixa (ex.: o cliente revende e também produz).
  if (ehFinalidade(c.camada) && (/finalidade/.test(sem(c.tipo)) || ev.some((e) => e.rotulo.includes('finalidade')) || /finalidade/.test(texto))
    && (ev.some((e) => /confianca/.test(e.rotulo) && /baixa/.test(e.valor)) || /confianca baixa|confirmar por grupo|pode ser revenda ou insumo/.test(texto))) {
    return { codigo: 'FINALIDADE_INCERTA', motivo: 'Finalidade com confiança baixa: o mesmo item pode ter mais de um uso.' };
  }
  return null;
}

/**
 * Pré-filtro da consulta de casos de borda: só estas camadas (e, quando indicado, só estes tipos) podem ser borda em `motivoBorda`.
 * O lote consulta o banco já com este filtro (não olha os milhares de casos que a regra decide). Mantido junto de `motivoBorda`:
 * quem acrescentar uma borda nova acrescenta aqui também (o teste confere a coerência).
 */
export const CANDIDATOS_BORDA: { camada: string; tipos: string[] | null }[] = [
  { camada: 'DUPLICIDADE', tipos: Object.keys(DUPLICIDADE) },
  { camada: 'NCM', tipos: ['NCM_CLASSIFICACAO_ANTIGA'] },
  { camada: 'NCM_CLASSIFICACAO', tipos: Object.keys(NCM) },
  { camada: 'TRIBUTARIO', tipos: null },
  { camada: 'FINALIDADE', tipos: null },
];

export const ehBorda = (c: CasoBorda): boolean => motivoBorda(c) !== null;

/** Casos tributários e de crédito levam a pesquisa na web; os demais usam só o modelo. */
export const usaBusca = (b: Borda): boolean => b.codigo === 'TRIBUTARIO_CANDIDATOS' || b.codigo === 'CREDITO_PIS_COFINS';
