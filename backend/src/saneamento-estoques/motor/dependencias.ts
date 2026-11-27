/**
 * Dependências entre camadas (docs/saneamento-estoques.md, seção 4). Mexer em um campo marca "revisar" nas camadas que dependem dele, sem apagar a decisão anterior:
 *   composição/identificação → NCM (validar e classificação) → tratamento → obrigações;   grupo → finalidade → tratamento → obrigações;
 *   unidade/conversão → duplicidade e obrigações;   consolidação/mudança de código → obrigações;
 *   unificação ou inativação (Duplicidades × itens sem movimentação da Qualidade) → a outra das duas: o código que fica não pode ser inativado.
 * Mudança só de forma da descrição (caixa, espaços, abreviação aprovada) NÃO muda composição: não marca nada.
 */
import { CAMADAS, type Camada, type CasoProposto } from '../tipos';

/** Efeito indireto: se esta camada precisa ser revista, estas também. */
const DEPENDENTES: Partial<Record<Camada, Camada[]>> = { NCM: ['NCM_CLASSIFICACAO', 'TRIBUTARIO'], NCM_CLASSIFICACAO: ['TRIBUTARIO'], FINALIDADE: ['TRIBUTARIO'], TRIBUTARIO: ['OBRIGACOES'] };

/** Campos da proposta que mudam a identificação/composição do produto. */
const CAMPOS_COMPOSICAO = ['composicao', 'concentracao', 'principioAtivo', 'referencia', 'fabricante', 'marca', 'identificacao'];
/** Casos cuja mudança de descrição é só de forma. */
const TIPOS_SO_FORMA = new Set(['DESCRICAO_FORA_DO_PADRAO', 'CARACTERES_INVALIDOS']);
const DECISOES_CONSOLIDACAO = new Set(['PROPOR_CONSOLIDACAO', 'PROPOR_INATIVACAO']);

type Entrada = Pick<CasoProposto, 'camada' | 'tipo' | 'proposta'>;

/** Camadas que passam a "revisar" se o caso for aprovado/alterado (nunca inclui a própria camada do caso). */
export function camadasAfetadas(caso: Entrada): Camada[] {
  const p = caso.proposta ?? {};
  const tem = (k: string) => Object.prototype.hasOwnProperty.call(p, k) && p[k] !== undefined;
  const diretas = new Set<Camada>();
  if (CAMPOS_COMPOSICAO.some(tem) || (tem('descricao') && !TIPOS_SO_FORMA.has(caso.tipo))) { diretas.add('NCM'); diretas.add('NCM_CLASSIFICACAO'); }
  if (tem('ncm')) { diretas.add('NCM_CLASSIFICACAO'); diretas.add('TRIBUTARIO'); }
  if (tem('finalidade') || tem('tambemUsadoComo')) diretas.add('TRIBUTARIO');
  if (tem('grupo')) diretas.add('FINALIDADE');
  if (tem('unidade') || tem('unidadeCompra') || tem('fatorConversao')) { diretas.add('DUPLICIDADE'); diretas.add('OBRIGACOES'); }
  if (tem('codigo') || tem('manter') || DECISOES_CONSOLIDACAO.has(String(p.decisao ?? ''))) diretas.add('OBRIGACOES');
  if (DECISOES_CONSOLIDACAO.has(String(p.decisao ?? ''))) { diretas.add('DUPLICIDADE'); diretas.add('QUALIDADE'); }
  const todas = new Set<Camada>(diretas);
  const fila = [...diretas];
  while (fila.length) for (const d of DEPENDENTES[fila.shift()!] ?? []) if (!todas.has(d)) { todas.add(d); fila.push(d); }
  todas.delete(caso.camada);
  return CAMADAS.filter((c) => todas.has(c));
}

type Parcial = Omit<CasoProposto, 'afeta' | 'origem' | 'impactos' | 'fundamento' | 'evidencia' | 'atual' | 'proposta'>
  & Partial<Pick<CasoProposto, 'origem' | 'impactos' | 'fundamento' | 'evidencia' | 'atual' | 'proposta'>> & { afeta?: Camada[] };

/** Monta um caso já com o campo `afeta` coerente com a proposta. */
export function novoCaso(c: Parcial): CasoProposto {
  const base: CasoProposto = { origem: 'REGRA', impactos: [], fundamento: null, evidencia: [], atual: {}, proposta: {}, ...c, afeta: [] };
  base.afeta = c.afeta ?? camadasAfetadas(base);
  return base;
}
