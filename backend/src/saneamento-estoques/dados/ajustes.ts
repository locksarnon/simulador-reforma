import type { Camada } from '../tipos';
import { impactosDoAjuste, ROTULO_AJUSTE, type AjusteSped, type TipoAjuste } from '../fiscal';
import { rotuloDoCaso } from '../rotulos';
import { propostaAplicavel, semItensDeExcecao } from './constantes';

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
 * | MUDOU_CODIGO_DESCRICAO              | proposta aplicável com `codigo` ou `descricao`, ou caso CODIGO_ANTIGO (vínculo antigo→novo) |
 * | MUDOU_UNIDADE                       | proposta aplicável com `unidade`, `unidadeCompra` ou `fatorConversao`                     |
 * | CONSOLIDOU_INATIVOU                 | decisão = PROPOR_CONSOLIDACAO (unificação: o código que sai vai para o que fica; nunca pela chave `consolidar`) |
 * | INATIVOU                            | decisão = PROPOR_INATIVACAO (inativação pura, sem troca de código: Qualidade sem movimentação e Duplicidades) |
 * | MUDOU_NCM                           | proposta aplicável com `ncm`                                                              |
 * | MUDOU_TRATAMENTO                    | proposta aplicável com `cClassTrib` ou `cst` (camada TRIBUTARIO)                          |
 * | ITEM_ATIVO_IMOBILIZADO              | proposta com `finalidade` = IMOBILIZADO                                                   |
 *
 * O impacto nasce da DECISÃO efetiva, não da presença de uma chave: decisão que não muda o cadastro (MANTER_DISTINTOS, SOLICITAR_INFORMACAO)
 * não gera ajuste, e as chaves só informativas da proposta (`manter`, `consolidar`, `decisao`...) nunca disparam tipo. Só entram casos
 * PROPOSTO, RASCUNHO e APROVADO (rejeitado e aguardando informação não geram ajuste). Casos da própria camada OBRIGACOES nunca geram
 * ajuste. O valor original e o proposto vêm de `atual` e `proposta` (primeiro campo relevante do tipo).
 */
const DECISAO_SEM_EFEITO = ['MANTER_DISTINTOS', 'SOLICITAR_INFORMACAO'];

export function tiposDeAjusteDoCaso(c: Pick<CasoParaAjuste, 'camada' | 'proposta'> & { tipo?: string }): TipoAjuste[] {
  if (c.camada === 'OBRIGACOES' || c.tipo === 'ENQUADRAMENTO_CONFERIDO') return [];
  const completa = (c.proposta ?? {}) as Mapa;
  if (DECISAO_SEM_EFEITO.includes(String(completa.decisao))) return [];
  const p = propostaAplicavel(c.camada, completa);
  const tem = (...k: string[]) => k.some((x) => p[x] !== undefined && p[x] !== null);
  const tipos: TipoAjuste[] = [];
  if (c.tipo === 'CODIGO_ANTIGO' || tem('codigo', 'descricao')) tipos.push('MUDOU_CODIGO_DESCRICAO');
  if (tem('unidade', 'unidadeCompra', 'fatorConversao')) tipos.push('MUDOU_UNIDADE');
  if (completa.decisao === 'PROPOR_CONSOLIDACAO') tipos.push('CONSOLIDOU_INATIVOU');
  else if (completa.decisao === 'PROPOR_INATIVACAO') tipos.push('INATIVOU');
  if (tem('ncm')) tipos.push('MUDOU_NCM');
  if (tem('cClassTrib', 'cst')) tipos.push('MUDOU_TRATAMENTO');
  if (p.finalidade === 'IMOBILIZADO') tipos.push('ITEM_ATIVO_IMOBILIZADO');
  return tipos;
}

const CAMPOS_DO_TIPO: Record<TipoAjuste, string[]> = {
  MUDOU_CODIGO_DESCRICAO: ['codigo', 'descricao'], MUDOU_UNIDADE: ['unidade', 'fatorConversao', 'unidadeCompra'], CONSOLIDOU_INATIVOU: ['manter', 'consolidar'], INATIVOU: [],
  MUDOU_NCM: ['ncm'], MUDOU_TRATAMENTO: ['cClassTrib', 'cst'], ITEM_ATIVO_IMOBILIZADO: ['finalidade'],
};
const valor = (m: Mapa, campos: string[]): string | number | null => {
  for (const k of campos) { const v = m[k]; if (v !== undefined && v !== null) return typeof v === 'number' ? v : String(v); }
  return null;
};

/** aaaa-mm da competência do início do ajuste ≤ última competência de escrituração já entregue (informada pelo consultor). */
export function emEscrituracaoEntregue(inicio: string, competenciaEntregue: string | null | undefined): boolean {
  return !!competenciaEntregue && /^\d{4}-\d{2}$/.test(competenciaEntregue) && inicio.slice(0, 7) <= competenciaEntregue;
}

/** Código de cada item (id → código): a inativação vinda de Duplicidades se refere aos códigos de `consolidar`. */
export type CodigosDosItens = ReadonlyMap<string, string>;

/** O caso precisa do código dos itens para saber quais são inativados (inativação vinda de Duplicidades)? */
export const precisaDeCodigos = (c: Pick<CasoParaAjuste, 'camada' | 'proposta'>) => c.camada === 'DUPLICIDADE' && ((c.proposta ?? {}) as Mapa).decisao === 'PROPOR_INATIVACAO';

/**
 * Itens que o tipo de ajuste atinge de fato. INATIVOU vindo de Duplicidades: só os itens cujos códigos estão em `consolidar` (o código que
 * fica não é inativado), como no mapa de unificações; item sem código conhecido (`codigos`) não entra. Nos demais casos (inclusive
 * Qualidade sem movimentação), todos os itens do caso, já sem os de exceção.
 */
export function itensDoAjuste(c: Pick<CasoParaAjuste, 'camada' | 'itens' | 'proposta'>, tipo: TipoAjuste, codigos?: CodigosDosItens): string[] {
  if (tipo !== 'INATIVOU' || !precisaDeCodigos(c)) return c.itens;
  const saem = new Set(String(((c.proposta ?? {}) as Mapa).consolidar ?? '').split('|').map((x) => x.trim()).filter(Boolean));
  return c.itens.filter((id) => { const cod = codigos?.get(id); return cod != null && saem.has(cod); });
}

/** Motivo da linha: rótulo do caso (nunca o código interno) e a justificativa. */
const motivoDoCaso = (c: Pick<CasoParaAjuste, 'camada' | 'tipo' | 'justificativa'>) => `${rotuloDoCaso(c.camada, c.tipo)}: ${c.justificativa}`.slice(0, 500);

/**
 * Ajustes por item, derivados dos casos do projeto. O caso de regra conta só os itens a que se aplica: o item com exceção viva na mesma
 * camada (que vale mais) fica fora, por isso a lista deve trazer também os casos de exceção. Com a última competência entregue, o ajuste
 * cujo início (data-base) cai nela ou antes é marcado como impacto em escrituração já entregue.
 */
export function ajustesDosCasos(todos: CasoParaAjuste[], opcoes: { dataBase?: string; competenciaEntregue?: string | null; codigos?: CodigosDosItens } = {}): AjusteSped[] {
  const out: AjusteSped[] = [];
  const entregue = !!opcoes.dataBase && emEscrituracaoEntregue(opcoes.dataBase, opcoes.competenciaEntregue);
  for (const c of semItensDeExcecao(todos)) {
    if (!['PROPOSTO', 'RASCUNHO', 'APROVADO'].includes(c.situacao)) continue;
    const proposta = (c.proposta ?? {}) as Mapa;
    const atual = (c.atual ?? {}) as Mapa;
    for (const tipo of tiposDeAjusteDoCaso(c)) {
      for (const itemId of itensDoAjuste(c, tipo, opcoes.codigos)) {
        out.push({
          tipo, itemId, valorOriginal: valor(atual, CAMPOS_DO_TIPO[tipo]), valorProposto: valor(proposta, CAMPOS_DO_TIPO[tipo]),
          motivo: motivoDoCaso(c), status: c.situacao === 'APROVADO' ? 'APROVADO' : 'PROPOSTO', ...(entregue ? { escrituracaoEntregue: true } : {}),
        });
      }
    }
  }
  return out;
}

export type { Camada };

const TIPO_IMPACTO: Record<string, string> = {
  CADASTRAL_FUTURO: 'CADASTRAL_FUTURO', REGULARIZACAO_SALDO: 'REGULARIZACAO_SALDO', ESCRITURACAO_ENTREGUE: 'ESCRITURACAO_ENTREGUE', ESCRITURACAO_JA_ENTREGUE: 'ESCRITURACAO_ENTREGUE',
};

/**
 * Linhas de impacto no SPED de UM caso (ajuste × registro do checklist), prontas para SanImpactoSped. Uma por tipo de ajuste e registro
 * (não por item): a evidência diz quantos itens o caso toca (quem chama passa só os itens a que o caso se aplica, sem os de exceção).
 * Só casos PROPOSTO, RASCUNHO e APROVADO geram; os demais devolvem vazio. A ressalva do registro (ex.: C170 sem CST de IBS/CBS; 0221 só
 * para TIPO_ITEM 00 e conforme a UF) vai junto do "verificar" no motivo, para chegar ao Excel e ao PDF.
 */
export function linhasDeImpactoDoCaso(c: CasoParaAjuste & { id: string; projeto_id: string }, dataBase: string, competenciaEntregue: string | null = null, codigos?: CodigosDosItens) {
  if (!['PROPOSTO', 'RASCUNHO', 'APROVADO'].includes(c.situacao)) return [];
  const proposta = (c.proposta ?? {}) as Mapa;
  const atual = (c.atual ?? {}) as Mapa;
  const out: Record<string, unknown>[] = [];
  for (const tipo of tiposDeAjusteDoCaso(c)) {
    const itens = itensDoAjuste(c, tipo, codigos);
    if (!itens.length) continue;
    const ajuste: Partial<AjusteSped> = {
      itemId: itens[0], valorOriginal: valor(atual, CAMPOS_DO_TIPO[tipo]), valorProposto: valor(proposta, CAMPOS_DO_TIPO[tipo]),
      motivo: motivoDoCaso(c), inicio: dataBase,
      evidencia: [{ rotulo: 'Itens afetados', valor: String(itens.length) }],
      escrituracaoEntregue: emEscrituracaoEntregue(dataBase, competenciaEntregue),
    };
    for (const l of impactosDoAjuste(tipo, { dataBase }, ajuste)) {
      if (l.aplicabilidade === 'NAO_APLICAVEL') continue;
      out.push({
        projeto_id: c.projeto_id, caso_id: c.id, obrigacao: l.obrigacao, competencia: l.competencia, versao_leiaute: l.versaoLeiaute, registro: l.registro, campo: l.campo,
        valor_original: l.valorOriginal == null ? null : String(l.valorOriginal), valor_proposto: l.valorProposto == null ? null : String(l.valorProposto),
        motivo: `${ROTULO_AJUSTE[tipo]}: ${l.verificar}${l.ressalva ? `. Ressalva: ${l.ressalva}` : ''}`.slice(0, 2000), evidencia: `Itens afetados: ${itens.length} ·${l.motivo}`.slice(0, 2000),
        inicio: new Date(`${l.inicio}T00:00:00.000Z`), avaliar_anteriores: l.avaliarAnteriores, responsavel: null, tipo_ajuste: TIPO_IMPACTO[l.tipo] ?? 'CADASTRAL_FUTURO',
      });
    }
  }
  return out;
}
