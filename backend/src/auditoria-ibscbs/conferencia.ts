/**
 * Conferência do IBS/CBS de uma nota com a calculadora oficial da Receita: monta o pedido a partir dos componentes da
 * própria nota (a calculadora calcula a base do art. 12 e os tributos) e compara item a item. Lógica pura.
 */
import type { ItemIbsCbs, NotaIbsCbs } from './leitor-ibscbs';

export type SituacaoItem = 'CONFERE' | 'DIVERGENTE' | 'ENQUADRAMENTO' | 'NAO_COBERTO' | 'SEM_GRUPO' | 'FALHA';
export type SituacaoNota = SituacaoItem | 'HOMOLOGACAO';
export type CampoDivergente = { campo: string; nota: number | null; oficial: number | null };
export type ResultadoItem = {
  numero: number; ncm: string; descricao: string; cst: string | null; cClassTrib: string | null; situacao: SituacaoItem;
  campos: CampoDivergente[]; erros: { codigo: string; mensagem: string }[]; aviso: string | null;
  nota: { vBC: number | null; vIBS: number | null; vCBS: number | null }; oficial: { vBC: number | null; vIBS: number | null; vCBS: number | null } | null;
};

/** Versão da regra de conferência: entra na marca da conferência, então mudar a regra refaz as notas já conferidas. */
export const REGRA_CONFERENCIA = 'r2';
/** Diferença de até 1 centavo é arredondamento da nota (cada ERP arredonda de um jeito), não divergência; o epsilon cobre o ponto flutuante. */
const TOLERANCIA = 0.0105;
const ROTULO: Record<string, string> = { vBC: 'Base de cálculo', vIBSUF: 'IBS estadual', vIBSMun: 'IBS municipal', vCBS: 'CBS', pRedAliq: 'Redução de alíquota (%)' };
const num = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));
const ano = (iso: string) => Number(String(iso).slice(0, 4));

/** Corpo do POST /observabilidade/regime-geral com os itens que têm grupo IBS/CBS. */
export function montarPedido(nota: NotaIbsCbs) {
  const itens = nota.itens.filter((i) => i.ibscbs && !i.temImpostoSeletivo).map((i) => {
    const g = i.ibscbs!;
    const c = Object.fromEntries(Object.entries(i.componentes).filter(([, v]) => v !== 0));
    const ncm = /^\d{8}$/.test(i.ncm) && i.ncm !== '00000000' ? i.ncm : undefined;
    return {
      numero: i.numero, ...(ncm ? { ncm } : {}), cst: g.cst, cClassTrib: g.cClassTrib, gComponentesBC: c,
      ...(g.tribRegular ? { tributacaoRegular: { cst: g.tribRegular.cst, cClassTrib: g.tribRegular.cClassTrib } } : {}),
      // A partir de 2027 a calculadora exige as alíquotas nominais; usa as da própria nota (a conferência é da regra e da conta).
      ...(ano(nota.dataEmissao) >= 2027 ? { aliquotasNominais: { cbs: g.cbs?.aliquota ?? 0, ibsEstadual: g.uf?.aliquota ?? 0, ibsMunicipal: g.mun?.aliquota ?? 0 } } : {}),
    };
  });
  return {
    id: nota.chave, versao: '1.0.0', dhFatoGerador: nota.dataEmissao, municipio: Number(nota.municipio),
    tpDoc: Number(nota.modelo) || 55, itens,
  };
}

type ObjetoOficial = { nObj: number; estadoItem: string; erros?: { code?: string; title?: string; detail?: string }[]; tribCalc?: { IBSCBS?: { gIBSCBS?: Record<string, any> } } };

/**
 * Compara um item da nota com o resultado oficial. `classesConhecidas`: cClassTrib da tabela oficial vigente (SVRS, no
 * InTAX) — código que a calculadora não conhece mas a tabela oficial tem é "não coberto pela versão", não erro da nota.
 */
export function compararItem(item: ItemIbsCbs, oficial: ObjetoOficial | undefined, classesConhecidas: Set<string>): ResultadoItem {
  const g = item.ibscbs;
  const base: ResultadoItem = {
    numero: item.numero, ncm: item.ncm, descricao: item.descricao, cst: g?.cst ?? null, cClassTrib: g?.cClassTrib ?? null,
    situacao: 'CONFERE', campos: [], erros: [], aviso: null,
    nota: { vBC: g?.vBC ?? null, vIBS: g?.vIBS ?? null, vCBS: g?.cbs?.valor ?? null }, oficial: null,
  };
  if (!g) return { ...base, situacao: 'SEM_GRUPO', aviso: 'O item não traz o grupo IBS/CBS.' };
  if (item.temImpostoSeletivo) return { ...base, situacao: 'NAO_COBERTO', aviso: 'Item com Imposto Seletivo: a conferência do IS ainda não é feita.' };
  if (!oficial) return { ...base, situacao: 'FALHA', aviso: 'A calculadora oficial não devolveu este item.' };
  const erros = (oficial.erros ?? []).map((e) => ({ codigo: String(e.code ?? ''), mensagem: String(e.detail ?? e.title ?? '') }));
  if (oficial.estadoItem === 'NAO_IMPLEMENTADO') return { ...base, situacao: 'NAO_COBERTO', erros, aviso: 'A calculadora oficial ainda não calcula esta classificação.' };
  if (oficial.estadoItem === 'FALHA_TECNICA') return { ...base, situacao: 'FALHA', erros };
  if (oficial.estadoItem === 'INCONSISTENCIA_ENTRADA') {
    const soCodigoDesconhecido = erros.length > 0 && erros.every((e) => e.codigo === 'REG-005') && classesConhecidas.has(g.cClassTrib);
    if (soCodigoDesconhecido) return { ...base, situacao: 'NAO_COBERTO', erros, aviso: 'cClassTrib vigente na tabela oficial, mas ainda não carregado na versão da calculadora.' };
    return { ...base, situacao: 'ENQUADRAMENTO', erros };
  }
  const o = oficial.tribCalc?.IBSCBS?.gIBSCBS;
  const vOf = {
    vBC: num(o?.vBC), vIBSUF: num(o?.gIBSUF?.vIBSUF), vIBSMun: num(o?.gIBSMun?.vIBSMun), vCBS: num(o?.gCBS?.vCBS),
    pRedAliq: num(o?.gCBS?.gRed?.pRedAliq),
  };
  const vNota = { vBC: g.vBC, vIBSUF: g.uf?.valor ?? null, vIBSMun: g.mun?.valor ?? null, vCBS: g.cbs?.valor ?? null, pRedAliq: g.cbs?.pRedAliq ?? null };
  const campos: CampoDivergente[] = [];
  if (!o) {
    // A classificação não leva o grupo de valores (ex.: CST 410): a nota também não deveria trazer tributo.
    for (const k of ['vIBSUF', 'vIBSMun', 'vCBS'] as const) if ((vNota[k] ?? 0) > TOLERANCIA) campos.push({ campo: ROTULO[k], nota: vNota[k], oficial: 0 });
  } else {
    for (const k of ['vBC', 'vIBSUF', 'vIBSMun', 'vCBS'] as const) {
      const a = vNota[k] ?? 0; const b = vOf[k] ?? 0;
      if (Math.abs(a - b) > TOLERANCIA) campos.push({ campo: ROTULO[k], nota: vNota[k], oficial: vOf[k] });
    }
    if ((vOf.pRedAliq ?? 0) !== (vNota.pRedAliq ?? 0) && Math.abs((vOf.pRedAliq ?? 0) - (vNota.pRedAliq ?? 0)) > 0.001) campos.push({ campo: ROTULO.pRedAliq, nota: vNota.pRedAliq, oficial: vOf.pRedAliq });
  }
  return {
    ...base, situacao: campos.length ? 'DIVERGENTE' : 'CONFERE', campos, erros,
    oficial: o ? { vBC: vOf.vBC, vIBS: num(o.vIBS), vCBS: vOf.vCBS } : { vBC: null, vIBS: 0, vCBS: 0 },
  };
}

const PESO: Record<SituacaoNota, number> = { ENQUADRAMENTO: 6, DIVERGENTE: 5, FALHA: 4, NAO_COBERTO: 3, CONFERE: 2, SEM_GRUPO: 1, HOMOLOGACAO: 0 };
/** Situação da nota = a do pior item (itens sem grupo só contam se nenhum item tiver o grupo). */
export function situacaoDaNota(itens: ResultadoItem[]): SituacaoNota {
  const comGrupo = itens.filter((i) => i.situacao !== 'SEM_GRUPO');
  if (!comGrupo.length) return 'SEM_GRUPO';
  return comGrupo.reduce<SituacaoNota>((p, i) => (PESO[i.situacao] > PESO[p] ? i.situacao : p), 'CONFERE');
}
