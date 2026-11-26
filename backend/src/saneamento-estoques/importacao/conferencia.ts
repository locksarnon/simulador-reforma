import { chaveReconciliacao, lerAtivo, lerData, lerFinalidade, lerNumero, normalizarCodigo, normalizarNcm, textoOuNulo } from './normalizacao';
import { CAMPOS_BASE, type CampoBase, type ConfigImportacao, type ItemImportado, type LinhaConferida, type Ocorrencia, type SemanticaAtivo } from './tipos';

/** Textos fixos de cada ocorrência (agrupam o relatório). */
export const TEXTO_OCORRENCIA: Record<string, string> = {
  CODIGO_VAZIO: 'Código em branco',
  DESCRICAO_VAZIA: 'Descrição em branco',
  DUPLICADO_NO_ARQUIVO: 'Código repetido no mesmo estabelecimento do arquivo (vale a primeira ocorrência)',
  NCM_AUSENTE: 'NCM em branco',
  NCM_INVALIDO: 'NCM que não tem 8 dígitos',
  UNIDADE_AUSENTE: 'Unidade em branco',
  GRUPO_AUSENTE: 'Grupo em branco',
  DATA_INVALIDA: 'Data da última movimentação não reconhecida',
  ATIVO_INDEFINIDO: 'Situação (ativo/bloqueado) em branco ou não reconhecida',
  SALDO_INVALIDO: 'Saldo que não é número',
  FINALIDADE_NAO_RECONHECIDA: 'Finalidade fora da lista',
  CODIGO_NOTACAO_CIENTIFICA: 'Código em notação científica (o Excel pode ter truncado o número)',
};
export const CODIGOS_REJEICAO = ['CODIGO_VAZIO', 'DESCRICAO_VAZIA', 'DUPLICADO_NO_ARQUIVO'];

const oc = (codigo: string, detalhe?: string): Ocorrencia => ({ codigo, texto: TEXTO_OCORRENCIA[codigo], ...(detalhe ? { detalhe } : {}) });

type Preparada = {
  idx: Partial<Record<CampoBase, number>>;
  extras: { indice: number; nome: string }[];
  semantica: SemanticaAtivo;
  numerica: boolean[];
  fixo: string | null;
  hoje: Date;
};

/** Resolve a configuração contra o cabeçalho: índices dos campos, nomes únicos das colunas extras. */
export function prepararConfig(cabecalho: string[], cfg: ConfigImportacao): Preparada {
  const idx: Partial<Record<CampoBase, number>> = {};
  for (const c of CAMPOS_BASE) { const v = cfg.mapeamento[c]; if (v != null) idx[c] = v; }
  const usadas = new Set(Object.values(idx));
  const ex = cfg.colunasExtras ?? 'demais';
  const indices = ex === 'nenhuma' ? [] : ex === 'demais' ? cabecalho.map((_, i) => i).filter((i) => !usadas.has(i)) : [...new Set(ex)].filter((i) => i >= 0 && i < cabecalho.length && !usadas.has(i)).sort((a, b) => a - b);
  const nomes = new Set<string>();
  const extras = indices.map((indice) => {
    const base = (cabecalho[indice] || `Coluna ${indice + 1}`).trim() || `Coluna ${indice + 1}`;
    let nome = base; for (let n = 2; nomes.has(nome); n++) nome = `${base} (${n})`;
    nomes.add(nome);
    return { indice, nome };
  });
  return { idx, extras, semantica: cfg.semanticaAtivo ?? 'ATIVO', numerica: cfg.colunaNumerica ?? [], fixo: cfg.estabelecimentoFixo ?? null, hoje: cfg.hoje ?? new Date() };
}

/** Índices das colunas que precisam ser lidas (mapeadas + extras), para `lerPlanilha(arquivo, colunas)`. */
export function colunasNecessarias(cabecalho: string[], cfg: ConfigImportacao): number[] {
  const p = prepararConfig(cabecalho, cfg);
  return [...new Set([...Object.values(p.idx), ...p.extras.map((e) => e.indice)])].sort((a, b) => a - b);
}

/**
 * Confere e normaliza UMA linha. Não detecta duplicidade no arquivo (isso é do `Conferidor`, que conhece as linhas anteriores).
 * REJEITADA: sem código ou sem descrição. PENDENTE: aceita, mas falta dado numa coluna mapeada (NCM, unidade, grupo, ativo...).
 */
export function conferirLinhaPreparada(p: Preparada, valores: string[], linhaOrigem: number): LinhaConferida {
  const v = (c: CampoBase) => (p.idx[c] === undefined ? '' : String(valores[p.idx[c] as number] ?? '').trim());
  const cod = normalizarCodigo(v('codigo'));
  const desc = textoOuNulo(v('descricao'));
  const referencia = { codigo: cod.valor, descricao: desc ?? '' };
  const rejeicoes: Ocorrencia[] = [];
  if (!cod.valor) rejeicoes.push(oc('CODIGO_VAZIO'));
  if (!desc) rejeicoes.push(oc('DESCRICAO_VAZIA'));
  const estabelecimento = p.idx.estabelecimento !== undefined ? textoOuNulo(v('estabelecimento')) : textoOuNulo(p.fixo);
  const chave = cod.valor ? chaveReconciliacao(estabelecimento, cod.valor) : null;
  if (rejeicoes.length) return { linhaOrigem, situacao: 'REJEITADA', ocorrencias: rejeicoes, chave, item: null, referencia };

  const faltas: Ocorrencia[] = [];
  if (cod.problema) faltas.push(oc('CODIGO_NOTACAO_CIENTIFICA', cod.valor));

  let ncm: string | null = null;
  if (p.idx.ncm !== undefined) {
    const n = normalizarNcm(v('ncm'), !!p.numerica[p.idx.ncm]);
    ncm = n.valor;
    if (n.problema === 'AUSENTE') faltas.push(oc('NCM_AUSENTE'));
    else if (n.problema === 'INVALIDO') faltas.push(oc('NCM_INVALIDO', n.valor ?? ''));
  }
  const unidade = textoOuNulo(v('unidade'));
  if (p.idx.unidade !== undefined && !unidade) faltas.push(oc('UNIDADE_AUSENTE'));
  const grupo = textoOuNulo(v('grupo'));
  if (p.idx.grupo !== undefined && !grupo) faltas.push(oc('GRUPO_AUSENTE'));

  let ativo: boolean | null = null;
  if (p.idx.ativo !== undefined) {
    ativo = lerAtivo(v('ativo'), p.semantica);
    if (ativo === null) faltas.push(oc('ATIVO_INDEFINIDO', v('ativo') || undefined));
  }
  let saldo: number | null = null;
  if (p.idx.saldo !== undefined && v('saldo')) {
    saldo = lerNumero(v('saldo'));
    if (saldo === null) faltas.push(oc('SALDO_INVALIDO', v('saldo')));
  }
  let ultimaMovimentacao: string | null = null;
  if (p.idx.ultimaMovimentacao !== undefined) {
    const d = lerData(v('ultimaMovimentacao'), p.hoje);
    ultimaMovimentacao = d.data;
    if (d.invalida) faltas.push(oc('DATA_INVALIDA', v('ultimaMovimentacao')));
  }
  let finalidade: ItemImportado['finalidade'] = null;
  if (p.idx.finalidade !== undefined && v('finalidade')) {
    finalidade = lerFinalidade(v('finalidade'));
    if (!finalidade) faltas.push(oc('FINALIDADE_NAO_RECONHECIDA', v('finalidade')));
  }

  const campos: ItemImportado['campos'] = {};
  for (const e of p.extras) { const t = String(valores[e.indice] ?? '').trim(); if (t) campos[e.nome] = t; }

  const item: ItemImportado = {
    codigo: cod.valor, estabelecimento, descricao: desc as string, unidade, ncm, grupo, ativo, saldo, ultimaMovimentacao,
    fabricante: textoOuNulo(v('fabricante')), referencia: textoOuNulo(v('referencia')), finalidade, campos,
  };
  return { linhaOrigem, situacao: faltas.length ? 'PENDENTE' : 'ACEITA', ocorrencias: faltas, chave, item, referencia };
}

/**
 * Confere linha a linha mantendo o registro das chaves já aceitas: o mesmo código + estabelecimento repetido no arquivo é rejeitado
 * (a primeira linha aceita vale). Linhas rejeitadas por outro motivo não ocupam a chave.
 */
export class Conferidor {
  private readonly p: Preparada;
  private readonly vistas = new Map<string, number>();
  constructor(cabecalho: string[], cfg: ConfigImportacao) { this.p = prepararConfig(cabecalho, cfg); }
  get colunasExtras(): string[] { return this.p.extras.map((e) => e.nome); }
  conferir(valores: string[], linhaOrigem: number): LinhaConferida {
    const r = conferirLinhaPreparada(this.p, valores, linhaOrigem);
    if (r.situacao === 'REJEITADA' || !r.chave) return r;
    const primeira = this.vistas.get(r.chave);
    if (primeira !== undefined) {
      return { ...r, situacao: 'REJEITADA', ocorrencias: [oc('DUPLICADO_NO_ARQUIVO', `primeira ocorrência na linha ${primeira}`)], item: null };
    }
    this.vistas.set(r.chave, linhaOrigem);
    return r;
  }
}
