import type { Camada } from '../tipos';
import { impactosDoAjuste, ROTULO_AJUSTE, type AjusteSped, type TipoAjuste } from '../fiscal';

/** O mínimo do caso de que o mapeamento precisa (um registro de SanCaso serve). */
export type CasoParaAjuste = {
  camada: string; tipo: string; itens: string[]; justificativa: string; situacao: string;
  atual: unknown; proposta: unknown;
};
type Mapa = Record<string, unknown>;

/**
 * Tabela de mapeamento caso → tipo de ajuste do checklist de SPED (camada de OBRIGAÇÕES). Um caso pode gerar mais de um tipo.
 *
 * | Tipo de ajuste (checklist)          | Quando o caso entra                                                                       |
 * |-------------------------------------|-------------------------------------------------------------------------------------------|
 * | MUDOU_CODIGO_DESCRICAO              | camada IDENTIFICACAO, ou proposta com `codigo` ou `descricao`                              |
 * | MUDOU_UNIDADE                       | proposta com `unidade`, `unidadeCompra` ou `fatorConversao`                                |
 * | CONSOLIDOU_INATIVOU                 | camada DUPLICIDADE com proposta.decisao = PROPOR_CONSOLIDACAO, ou proposta com `consolidar`|
 * | MUDOU_NCM                           | proposta com `ncm`                                                                         |
 * | MUDOU_TRATAMENTO                    | proposta com `cClassTrib` ou `cst` (camada TRIBUTARIO)                                     |
 * | ITEM_ATIVO_IMOBILIZADO              | proposta com `finalidade` = IMOBILIZADO                                                    |
 *
 * Só entram casos PROPOSTO, RASCUNHO e APROVADO (rejeitado e aguardando informação não geram ajuste). Casos da própria camada OBRIGACOES
 * nunca geram ajuste. O valor original e o proposto vêm de `atual` e `proposta` (primeiro campo relevante do tipo).
 */
export function tiposDeAjusteDoCaso(c: Pick<CasoParaAjuste, 'camada' | 'proposta'> & { tipo?: string }): TipoAjuste[] {
  if (c.camada === 'OBRIGACOES' || c.tipo === 'ENQUADRAMENTO_CONFERIDO') return [];
  const p = (c.proposta ?? {}) as Mapa;
  const tem = (...k: string[]) => k.some((x) => p[x] !== undefined && p[x] !== null);
  const tipos: TipoAjuste[] = [];
  if (c.camada === 'IDENTIFICACAO' || tem('codigo', 'descricao')) tipos.push('MUDOU_CODIGO_DESCRICAO');
  if (tem('unidade', 'unidadeCompra', 'fatorConversao')) tipos.push('MUDOU_UNIDADE');
  if ((c.camada === 'DUPLICIDADE' && p.decisao === 'PROPOR_CONSOLIDACAO') || tem('consolidar')) tipos.push('CONSOLIDOU_INATIVOU');
  if (tem('ncm')) tipos.push('MUDOU_NCM');
  if (tem('cClassTrib', 'cst')) tipos.push('MUDOU_TRATAMENTO');
  if (p.finalidade === 'IMOBILIZADO') tipos.push('ITEM_ATIVO_IMOBILIZADO');
  return tipos;
}

const CAMPOS_DO_TIPO: Record<TipoAjuste, string[]> = {
  MUDOU_CODIGO_DESCRICAO: ['codigo', 'descricao'], MUDOU_UNIDADE: ['unidade', 'fatorConversao', 'unidadeCompra'], CONSOLIDOU_INATIVOU: ['manter', 'consolidar'],
  MUDOU_NCM: ['ncm'], MUDOU_TRATAMENTO: ['cClassTrib', 'cst'], ITEM_ATIVO_IMOBILIZADO: ['finalidade'],
};
const valor = (m: Mapa, campos: string[]): string | number | null => {
  for (const k of campos) { const v = m[k]; if (v !== undefined && v !== null) return typeof v === 'number' ? v : String(v); }
  return null;
};

/** Ajustes por item, derivados dos casos do projeto. */
export function ajustesDosCasos(casos: CasoParaAjuste[]): AjusteSped[] {
  const out: AjusteSped[] = [];
  for (const c of casos) {
    if (!['PROPOSTO', 'RASCUNHO', 'APROVADO'].includes(c.situacao)) continue;
    const proposta = (c.proposta ?? {}) as Mapa;
    const atual = (c.atual ?? {}) as Mapa;
    for (const tipo of tiposDeAjusteDoCaso(c)) {
      for (const itemId of c.itens) {
        out.push({
          tipo, itemId, valorOriginal: valor(atual, CAMPOS_DO_TIPO[tipo]), valorProposto: valor(proposta, CAMPOS_DO_TIPO[tipo]),
          motivo: `${c.camada}/${c.tipo}: ${c.justificativa}`.slice(0, 500), status: c.situacao === 'APROVADO' ? 'APROVADO' : 'PROPOSTO',
        });
      }
    }
  }
  return out;
}

export type { Camada };

const TIPO_IMPACTO: Record<string, string> = { CADASTRAL_FUTURO: 'CADASTRAL_FUTURO', REGULARIZACAO_SALDO: 'REGULARIZACAO_SALDO', ESCRITURACAO_JA_ENTREGUE: 'ESCRITURACAO_ENTREGUE' };

/**
 * Linhas de impacto no SPED de UM caso (ajuste × registro do checklist), prontas para SanImpactoSped. Uma por tipo de ajuste e registro
 * (não por item): a evidência diz quantos itens o caso toca. Só casos PROPOSTO, RASCUNHO e APROVADO geram; os demais devolvem vazio.
 */
export function linhasDeImpactoDoCaso(c: CasoParaAjuste & { id: string; projeto_id: string }, dataBase: string) {
  if (!['PROPOSTO', 'RASCUNHO', 'APROVADO'].includes(c.situacao)) return [];
  const proposta = (c.proposta ?? {}) as Mapa;
  const atual = (c.atual ?? {}) as Mapa;
  const out: Record<string, unknown>[] = [];
  for (const tipo of tiposDeAjusteDoCaso(c)) {
    const ajuste: Partial<AjusteSped> = {
      itemId: c.itens[0], valorOriginal: valor(atual, CAMPOS_DO_TIPO[tipo]), valorProposto: valor(proposta, CAMPOS_DO_TIPO[tipo]),
      motivo: `${c.camada}/${c.tipo}: ${c.justificativa}`.slice(0, 500), inicio: dataBase,
      evidencia: [{ rotulo: 'Itens afetados', valor: String(c.itens.length) }],
    };
    for (const l of impactosDoAjuste(tipo, { dataBase }, ajuste)) {
      if (l.aplicabilidade === 'NAO_APLICAVEL') continue;
      out.push({
        projeto_id: c.projeto_id, caso_id: c.id, obrigacao: l.obrigacao, competencia: l.competencia, versao_leiaute: l.versaoLeiaute, registro: l.registro, campo: l.campo,
        valor_original: l.valorOriginal == null ? null : String(l.valorOriginal), valor_proposto: l.valorProposto == null ? null : String(l.valorProposto),
        motivo: `${ROTULO_AJUSTE[tipo]}: ${l.verificar}`.slice(0, 2000), evidencia: `Itens afetados: ${c.itens.length} · ${l.motivo}`.slice(0, 2000),
        inicio: new Date(`${l.inicio}T00:00:00.000Z`), avaliar_anteriores: l.avaliarAnteriores, responsavel: null, tipo_ajuste: TIPO_IMPACTO[l.tipo] ?? 'CADASTRAL_FUTURO',
      });
    }
  }
  return out;
}
