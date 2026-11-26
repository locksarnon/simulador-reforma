/**
 * Mapa de unificações e inativações: por item que MORRE, para onde vai (o código que fica), o saldo que entra e o saldo consolidado, a ação no
 * ERP e os alertas de coerência. É a lista que o consultor manda para quem faz os ajustes no ERP e o que mostra, na lista final, que o saldo ficou
 * concentrado no código que fica. Puro: o Excel (aba "De para e equivalências") e a consulta da tela usam a mesma função.
 *
 * Fontes: casos de Duplicidades com decisão PROPOR_CONSOLIDACAO (unificação), casos com decisão PROPOR_INATIVACAO (inativação: Qualidade, itens
 * sem movimentação desde o corte), os demais casos de Duplicidades (equivalência: nenhum código morre) e os vínculos de código antigo → novo que
 * não vêm de uma unificação (troca de código). Saldos, descrições e unidades são os da base de trabalho (ou da foto, na versão liberada).
 */
import { semItensDeExcecao } from '../dados/constantes';
import { chaveUnidade, lerFator } from '../motor/unidades';
import { rotuloDoValor } from '../rotulos';

export type TipoLinhaMapa = 'UNIFICACAO' | 'INATIVACAO' | 'EQUIVALENCIA' | 'TROCA_CODIGO';
export type SituacaoMapa = 'PROPOSTA' | 'APROVADA' | 'AGUARDANDO' | 'REGISTRADA';
export const ROTULO_TIPO_MAPA: Record<TipoLinhaMapa, string> = {
  UNIFICACAO: 'Unificação de códigos', INATIVACAO: 'Inativação (sem movimentação)', EQUIVALENCIA: 'Equivalência (nenhum código morre)', TROCA_CODIGO: 'Troca de código',
};
export const ROTULO_SITUACAO_MAPA: Record<SituacaoMapa, string> = { PROPOSTA: 'Proposta', APROVADA: 'Aprovada', AGUARDANDO: 'Aguardando informação', REGISTRADA: 'Registrada' };

/** O item como o mapa o enxerga (base de trabalho ou foto). */
export type ItemMapa = { id: string; codigo: string; estab: string; descricao: string; unidade: string; saldo: number | null };
export type CasoMapa = {
  id: string; camada: string; tipo: string; itens: string[]; proposta: Record<string, unknown>; justificativa: string; motivo: string; situacao: string;
  decididoPor: string; decididoEm: Date | null;
};
export type VinculoMapa = { de: string; para: string; inicio: Date | null; justificativa: string; criadoPor: string };
export type EntradaMapa = {
  /** Entrega liberada: só o que foi aprovado (e os vínculos registrados). */
  liberada: boolean;
  /** Início da vigência quando o vínculo não traz data: a data-base do projeto. */
  dataBase: Date | null;
  casos: CasoMapa[];
  item: (id: string) => ItemMapa | undefined;
  vinculos: VinculoMapa[];
};
type Lado = { codigo: string; estab: string; descricao: string; unidade: string; saldo: number | null };
export type LinhaMapa = {
  tipo: TipoLinhaMapa; situacao: SituacaoMapa; casoId: string | null;
  morre: Lado | null; fica: Omit<Lado, 'estab'> | null;
  saldoEntra: number | null; saldoConsolidado: number | null;
  acao: string; inicio: Date | null; justificativa: string; alertas: string[]; responsavel: string; decididoEm: Date | null;
};

const SITUACAO: Record<string, SituacaoMapa> = { PROPOSTO: 'PROPOSTA', RASCUNHO: 'PROPOSTA', APROVADO: 'APROVADA', AGUARDANDO_INFORMACAO: 'AGUARDANDO' };
const t = (v: unknown) => String(v ?? '').trim();
const num = (n: number) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
/** O vínculo leva a etiqueta interna do caso que o gerou: não vai para o cliente. */
export const semEtiquetas = (s: string) => s.replace(/\[caso:[^\]]*\]\s*/g, '').trim();
const lado = (i: ItemMapa): Lado => ({ codigo: i.codigo, estab: i.estab, descricao: i.descricao, unidade: i.unidade, saldo: i.saldo });
const comEstab = (codigo: string, estab: string) => (estab ? `${codigo} (${estab})` : codigo);

/** Saldo do item como número (null quando a base não traz ou não é número). */
export function saldoDe(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Monta o mapa. Uma linha por item que morre (unificação e inativação), uma por caso de equivalência e uma por vínculo de troca de código.
 * Ordem: unificações (por código que fica e que morre), inativações, equivalências, trocas. Não usa spread em listas grandes (30 mil itens).
 */
export function montarMapa(e: EntradaMapa): LinhaMapa[] {
  const unif: LinhaMapa[] = []; const inat: LinhaMapa[] = []; const equiv: LinhaMapa[] = []; const trocas: LinhaMapa[] = [];
  const pares = new Set<string>();
  const casos = semItensDeExcecao(e.casos);
  for (const c of casos) {
    const situacao = SITUACAO[c.situacao];
    if (!situacao || (e.liberada && situacao !== 'APROVADA')) continue;
    if (c.tipo.startsWith('EXCECAO') || c.tipo === 'FINALIDADE_EXCECAO') continue;
    const decisao = t(c.proposta.decisao);
    const comum = { situacao, casoId: c.id, inicio: e.dataBase, justificativa: [c.justificativa, c.motivo].filter(Boolean).join(' · '), responsavel: c.decididoPor, decididoEm: c.decididoEm };
    if (decisao === 'PROPOR_CONSOLIDACAO' && c.camada === 'DUPLICIDADE') linhasDeUnificacao(c, e, comum, unif, pares);
    else if (decisao === 'PROPOR_INATIVACAO') linhasDeInativacao(c, e, comum, inat);
    else if (c.camada === 'DUPLICIDADE') equiv.push(linhaDeEquivalencia(c, e, comum));
  }
  // A unificação aprovada gravou o vínculo: a data de início dele (quando informada) vale para a linha.
  const inicioDoVinculo = new Map<string, Date>();
  for (const v of e.vinculos) if (v.inicio) inicioDoVinculo.set(`${v.de}\u0001${v.para}`, v.inicio);
  for (const l of unif) { const d = l.morre && l.fica ? inicioDoVinculo.get(`${l.morre.codigo}\u0001${l.fica.codigo}`) : undefined; if (d) l.inicio = d; }
  for (const v of e.vinculos) {
    if (pares.has(`${v.de}\u0001${v.para}`)) continue; // já está na linha da unificação
    trocas.push({
      tipo: 'TROCA_CODIGO', situacao: 'REGISTRADA', casoId: null, morre: { codigo: v.de, estab: '', descricao: '', unidade: '', saldo: null }, fica: { codigo: v.para, descricao: '', unidade: '', saldo: null },
      saldoEntra: null, saldoConsolidado: null, acao: `Registrar ${v.de} como código anterior de ${v.para} (histórico do item; SPED 0205)`, inicio: v.inicio ?? e.dataBase,
      justificativa: semEtiquetas(v.justificativa), alertas: [], responsavel: v.criadoPor === 'sistema' ? '' : v.criadoPor, decididoEm: null,
    });
  }
  const ordem = (a: LinhaMapa, b: LinhaMapa) => cmp(a.fica?.codigo ?? '', b.fica?.codigo ?? '') || cmp(a.morre?.codigo ?? '', b.morre?.codigo ?? '') || cmp(a.morre?.estab ?? '', b.morre?.estab ?? '');
  unif.sort(ordem); inat.sort(ordem);
  const out: LinhaMapa[] = [];
  for (const l of [unif, inat, equiv, trocas]) for (const x of l) out.push(x);
  return out;
}
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type Comum = Pick<LinhaMapa, 'situacao' | 'casoId' | 'inicio' | 'justificativa' | 'responsavel' | 'decididoEm'>;

function linhasDeUnificacao(c: CasoMapa, e: EntradaMapa, comum: Comum, out: LinhaMapa[], pares: Set<string>) {
  const manter = t(c.proposta.manter);
  const saem = new Set(t(c.proposta.consolidar).split('|').map((x) => x.trim()).filter(Boolean));
  if (!manter || !saem.size) return;
  const fator = lerFator(c.proposta.fatorConversao);
  const ficam = new Map<string, ItemMapa>(); const morrem: ItemMapa[] = []; const achados = new Set<string>();
  for (const id of c.itens) {
    const i = e.item(id);
    if (!i) continue;
    if (i.codigo === manter) { if (!ficam.has(i.estab)) ficam.set(i.estab, i); } else if (saem.has(i.codigo)) { morrem.push(i); achados.add(i.codigo); }
  }
  const qualquerFica = ficam.values().next().value as ItemMapa | undefined;
  // Linhas por item que morre; o saldo consolidado soma, por estabelecimento, o saldo atual do que fica e tudo o que entra nele.
  const linhas: { l: LinhaMapa; estabFica: string | null }[] = [];
  for (const m of morrem) {
    pares.add(`${m.codigo}\u0001${manter}`);
    const f = ficam.get(m.estab) ?? null;
    const alertas: string[] = [];
    if (!f) alertas.push(qualquerFica ? `O código que fica (${manter}) não está cadastrado no estabelecimento ${m.estab || 'único'}: cadastrar antes de transferir o saldo.` : `O código que fica (${manter}) não foi encontrado na base.`);
    const ref = f ?? qualquerFica ?? null;
    let entra: number | null = null;
    const unDifere = !!ref && !!chaveUnidade(m.unidade) && !!chaveUnidade(ref.unidade) && chaveUnidade(m.unidade) !== chaveUnidade(ref.unidade);
    if (m.saldo == null) alertas.push(`Saldo de ${m.codigo} não informado na base: conferir no ERP antes de transferir.`);
    else if (unDifere && fator == null) alertas.push(`Unidades diferentes (${m.unidade} × ${ref!.unidade}): saldo não somável direto; converter antes de somar (sem fator de conversão aprovado).`);
    else if (unDifere) { entra = m.saldo * fator!; alertas.push(`Unidades diferentes (${m.unidade} × ${ref!.unidade}): saldo convertido pelo fator aprovado ${num(fator!)}.`); }
    else entra = m.saldo;
    if (m.saldo != null && m.saldo < 0) alertas.push(`Saldo negativo em ${m.codigo}: investigar a movimentação antes de transferir.`);
    if (f && f.saldo == null) alertas.push(`Saldo do código que fica (${manter}) não informado na base: o saldo consolidado não foi calculado.`);
    const acao = !ref ? `Conferir o código que fica (${manter}) antes de inativar ${m.codigo}`
      : m.saldo == null ? `Conferir o saldo de ${m.codigo} no ERP; havendo saldo, transferir para ${manter}; inativar ${m.codigo}`
        : unDifere && fator == null ? `Converter o saldo de ${m.codigo} para a unidade de ${manter} (${ref.unidade}), transferir para ${manter} e inativar ${m.codigo}`
          : m.saldo < 0 ? `Regularizar o saldo negativo de ${m.codigo}; depois transferir para ${manter} e inativar ${m.codigo}`
            : m.saldo === 0 ? `Inativar ${m.codigo} (sem saldo a transferir); o código que fica é ${manter}`
              : `Transferir o saldo de ${m.codigo} para ${manter} e inativar ${m.codigo}`;
    linhas.push({
      estabFica: f ? f.estab : null,
      l: {
        tipo: 'UNIFICACAO', ...comum, morre: lado(m), fica: ref ? { codigo: manter, descricao: ref.descricao, unidade: ref.unidade, saldo: f ? f.saldo : null } : { codigo: manter, descricao: '', unidade: '', saldo: null },
        saldoEntra: entra, saldoConsolidado: null, acao, alertas,
      },
    });
  }
  // Código que sai sem item na base: a linha fica, com o alerta.
  for (const cod of saem) {
    if (achados.has(cod) || cod === manter) continue;
    pares.add(`${cod}\u0001${manter}`);
    linhas.push({ estabFica: null, l: { tipo: 'UNIFICACAO', ...comum, morre: { codigo: cod, estab: '', descricao: '', unidade: '', saldo: null }, fica: { codigo: manter, descricao: qualquerFica?.descricao ?? '', unidade: qualquerFica?.unidade ?? '', saldo: null }, saldoEntra: null, saldoConsolidado: null, acao: `Conferir o código ${cod} no ERP (não está na base importada) antes de inativar`, alertas: [`O código que morre (${cod}) não foi encontrado na base.`] } });
  }
  // Consolidado por estabelecimento do que fica: só quando todos os saldos são conhecidos e somáveis.
  const porEstab = new Map<string, LinhaMapa[]>();
  for (const x of linhas) if (x.estabFica != null) { const l = porEstab.get(x.estabFica); if (l) l.push(x.l); else porEstab.set(x.estabFica, [x.l]); }
  for (const [estab, ls] of porEstab) {
    const f = ficam.get(estab)!;
    let total = f.saldo; for (const l of ls) total = total == null || l.saldoEntra == null ? null : total + l.saldoEntra;
    for (const l of ls) l.saldoConsolidado = total;
    if (total == null && f.saldo != null) for (const l of ls) if (l.saldoEntra != null) l.alertas.push('Saldo consolidado não calculado: há código que sai, no mesmo estabelecimento, com saldo desconhecido ou em outra unidade.');
  }
  for (const x of linhas) out.push(x.l);
}

function linhasDeInativacao(c: CasoMapa, e: EntradaMapa, comum: Comum, out: LinhaMapa[]) {
  // Inativação vinda de Duplicidades (decisão editada): inativam-se os códigos de `consolidar`; nos demais casos, todos os itens.
  const so = c.camada === 'DUPLICIDADE' ? new Set(t(c.proposta.consolidar).split('|').map((x) => x.trim()).filter(Boolean)) : null;
  for (const id of c.itens) {
    const i = e.item(id);
    if (!i || (so && !so.has(i.codigo))) continue;
    const alertas: string[] = [];
    let acao = `Inativar ${i.codigo}`;
    if (i.saldo == null) { alertas.push(`Saldo de ${i.codigo} não informado na base: conferir no ERP que está zerado antes de inativar.`); acao = `Conferir no ERP que ${i.codigo} está sem saldo e inativar ${i.codigo}`; }
    else if (i.saldo !== 0) { alertas.push(`${i.codigo} tem saldo (${num(i.saldo)} ${i.unidade}): regularizar o saldo antes de inativar.`); acao = `Regularizar o saldo de ${i.codigo} antes de inativar`; }
    out.push({ tipo: 'INATIVACAO', ...comum, morre: lado(i), fica: null, saldoEntra: null, saldoConsolidado: null, acao, alertas });
  }
}

function linhaDeEquivalencia(c: CasoMapa, e: EntradaMapa, comum: Comum): LinhaMapa {
  const decisao = t(c.proposta.decisao);
  const cods: string[] = [];
  for (const id of c.itens) { const i = e.item(id); if (i && cods.length < 12) cods.push(comEstab(i.codigo, i.estab)); }
  if (c.itens.length > 12) cods.push(`+${c.itens.length - 12}`);
  const fator = lerFator(c.proposta.fatorConversao);
  const acao = decisao === 'RELACIONAR_APRESENTACOES' ? `Relacionar as apresentações${fator ? ` (fator ${num(fator)})` : ''}; manter os códigos`
    : decisao === 'RELACIONAR_EQUIVALENTES' ? 'Relacionar os códigos como equivalentes; manter os códigos'
      : decisao === 'MANTER_DISTINTOS' ? 'Manter os códigos distintos'
        : decisao === 'SOLICITAR_INFORMACAO' ? 'Confirmar com o cliente se é o mesmo produto antes de qualquer ajuste'
          : decisao ? rotuloDoValor(decisao) : 'Conferir a decisão do caso';
  return { tipo: 'EQUIVALENCIA', ...comum, morre: null, fica: { codigo: cods.join(', '), descricao: '', unidade: '', saldo: null }, saldoEntra: null, saldoConsolidado: null, acao, alertas: [] };
}

// ── Filtro e página (consulta da tela) ──────────────────────────────────────

export type FiltroMapa = { situacao?: string; tipo?: string; busca?: string };
/** Linhas que passam no filtro: situação e tipo (um ou vários, separados por vírgula) e busca por código (que morre ou que fica). */
export function filtrarMapa(linhas: LinhaMapa[], f: FiltroMapa): LinhaMapa[] {
  const sit = f.situacao ? new Set(f.situacao.split(',').map((x) => x.trim()).filter(Boolean)) : null;
  const tip = f.tipo ? new Set(f.tipo.split(',').map((x) => x.trim()).filter(Boolean)) : null;
  const busca = t(f.busca).toLowerCase();
  if (!sit && !tip && !busca) return linhas;
  const out: LinhaMapa[] = [];
  for (const l of linhas) {
    if (sit && !sit.has(l.situacao)) continue;
    if (tip && !tip.has(l.tipo)) continue;
    if (busca && !(l.morre?.codigo ?? '').toLowerCase().includes(busca) && !(l.fica?.codigo ?? '').toLowerCase().includes(busca)) continue;
    out.push(l);
  }
  return out;
}

export function contarMapa(linhas: LinhaMapa[]) {
  const porSituacao: Record<string, number> = { PROPOSTA: 0, APROVADA: 0, AGUARDANDO: 0, REGISTRADA: 0 };
  const porTipo: Record<string, number> = { UNIFICACAO: 0, INATIVACAO: 0, EQUIVALENCIA: 0, TROCA_CODIGO: 0 };
  let comAlerta = 0;
  for (const l of linhas) { porSituacao[l.situacao]++; porTipo[l.tipo]++; if (l.alertas.length) comAlerta++; }
  return { porSituacao, porTipo, comAlerta };
}
