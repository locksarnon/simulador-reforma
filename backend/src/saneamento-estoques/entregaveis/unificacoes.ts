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
import { saldoNaEscala } from '../motor/conjuntos';
import { chaveUnidade, classificarUnidade, lerFator } from '../motor/unidades';
import { rotuloDoValor } from '../rotulos';
import { acaoNoErp, type PerfilErp } from '../../erps/logica';

export type TipoLinhaMapa = 'UNIFICACAO' | 'INATIVACAO' | 'EQUIVALENCIA' | 'TROCA_CODIGO';
export type SituacaoMapa = 'PROPOSTA' | 'APROVADA' | 'AGUARDANDO' | 'REGISTRADA';
export const ROTULO_TIPO_MAPA: Record<TipoLinhaMapa, string> = {
  UNIFICACAO: 'Unificação de códigos', INATIVACAO: 'Inativação', EQUIVALENCIA: 'Equivalência (nenhum código morre)', TROCA_CODIGO: 'Troca de código',
};
/** De onde vem a inativação: Duplicidades (decisão editada para inativar os códigos de `consolidar`) ou Qualidade (sem movimentação desde o corte). */
export type OrigemInativacao = 'DUPLICIDADE' | 'QUALIDADE';
export const ROTULO_INATIVACAO: Record<OrigemInativacao, string> = { DUPLICIDADE: 'Inativação (duplicidade)', QUALIDADE: 'Inativação (sem movimentação)' };
/** Rótulo do tipo da linha (a inativação diz a origem). */
export const rotuloTipoMapa = (l: Pick<LinhaMapa, 'tipo' | 'origem'>) => (l.tipo === 'INATIVACAO' && l.origem ? ROTULO_INATIVACAO[l.origem] : ROTULO_TIPO_MAPA[l.tipo]);
export const ROTULO_SITUACAO_MAPA: Record<SituacaoMapa, string> = { PROPOSTA: 'Proposta', APROVADA: 'Aprovada', AGUARDANDO: 'Aguardando informação', REGISTRADA: 'Registrada' };

/** O item como o mapa o enxerga (base de trabalho ou foto). */
export type ItemMapa = { id: string; codigo: string; estab: string; descricao: string; unidade: string; saldo: number | null; ativo?: boolean | null };
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
  /**
   * Escala do saldo da base (`escalaDaBase`, a mesma detecção da Duplicidade): com a base ×1.000.000, o mapa mostra 3 onde a planilha traz
   * 3.000.000. Padrão 1.
   */
  escala?: number;
  /** Perfil do ERP do projeto (Cadastro de ERPs): a "Ação no ERP" usa o texto dele quando houver; sem perfil, o texto geral. */
  perfilErp?: PerfilErp | null;
};
type Lado = { codigo: string; estab: string; descricao: string; unidade: string; saldo: number | null };
export type LinhaMapa = {
  tipo: TipoLinhaMapa; situacao: SituacaoMapa; casoId: string | null;
  /** Só na inativação: Duplicidades ou Qualidade (rótulo e contagem). */
  origem: OrigemInativacao | null;
  /** Rótulo do tipo (a inativação diz a origem). */
  rotuloTipo: string;
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
export function montarMapa(entrada: EntradaMapa): LinhaMapa[] {
  const escala = entrada.escala && entrada.escala !== 1 ? entrada.escala : 1;
  const e: EntradaMapa = escala === 1 ? entrada : { ...entrada, item: (id) => { const i = entrada.item(id); return i ? { ...i, saldo: saldoNaEscala(i.saldo, escala) } : i; } };
  const unif: LinhaMapa[] = []; const inatComId: { l: LinhaMapa; id: string }[] = []; const equiv: LinhaMapa[] = []; const trocas: LinhaMapa[] = [];
  const pares = new Set<string>();
  const cruz: Cruzamento = { linhasDoQueFica: new Map(), queMorrem: new Map() };
  const casos = semItensDeExcecao(e.casos);
  for (const c of casos) {
    const situacao = SITUACAO[c.situacao];
    if (!situacao || (e.liberada && situacao !== 'APROVADA')) continue;
    if (c.tipo.startsWith('EXCECAO') || c.tipo === 'FINALIDADE_EXCECAO') continue;
    const decisao = t(c.proposta.decisao);
    const comum = { situacao, casoId: c.id, origem: null, inicio: e.dataBase, justificativa: [c.justificativa, c.motivo].filter(Boolean).join(' · '), responsavel: c.decididoPor, decididoEm: c.decididoEm };
    if (decisao === 'PROPOR_CONSOLIDACAO' && c.camada === 'DUPLICIDADE') linhasDeUnificacao(c, e, comum, unif, pares, cruz);
    else if (decisao === 'PROPOR_INATIVACAO') linhasDeInativacao(c, e, comum, inatComId);
    else if (c.camada === 'DUPLICIDADE') equiv.push(linhaDeEquivalencia(c, e, comum));
  }
  // Cruzamento das fontes (a Qualidade pode ter rodado antes da Duplicidade): o código que fica numa unificação não pode ser inativado, e o
  // que morre já tem a inativação na linha da unificação. Decisão aprovada nunca some: a inativação só sai do mapa quando a unificação que a
  // cobre está APROVADA e a inativação não; nos demais casos as duas linhas ficam, com o alerta (propor ou aprovar a unificação marca a
  // Qualidade como "revisar").
  const inat: LinhaMapa[] = [];
  const sit = (s: SituacaoMapa) => ROTULO_SITUACAO_MAPA[s].toLowerCase();
  for (const x of inatComId) {
    const inatAprovada = x.l.situacao === 'APROVADA';
    const doFica = cruz.linhasDoQueFica.get(x.id);
    if (doFica) {
      const origem = x.l.origem === 'DUPLICIDADE' ? 'Duplicidades' : 'Qualidade, sem movimentação';
      const sai = !inatAprovada && doFica.some((l) => l.situacao === 'APROVADA');
      for (const l of doFica) l.alertas.push(`Conflito: o código que fica (${l.fica?.codigo}) tem inativação ${sit(x.l.situacao)} (${origem}): ${sai ? 'a inativação ficou fora deste mapa' : 'a inativação também está neste mapa'}; reabrir ou rejeitar o caso de inativação antes de transferir o saldo.`);
      if (sai) continue;
      const u = doFica[0];
      x.l.alertas.push(`Conflito: ${x.l.morre?.codigo} é o código que fica numa unificação ${sit(u.situacao)} (recebe ${u.morre?.codigo}): não inativar enquanto a unificação valer; rejeitar ou reabrir um dos dois casos.`);
      inat.push(x.l);
      continue;
    }
    const morreEm = cruz.queMorrem.get(x.id);
    if (morreEm) {
      if (!inatAprovada && morreEm.some((l) => l.situacao === 'APROVADA')) continue;
      const u = morreEm[0];
      x.l.alertas.push(`${x.l.morre?.codigo} também sai numa unificação ${sit(u.situacao)} (para ${u.fica?.codigo}): a inativação fica na linha da unificação; conferir para não inativar duas vezes.`);
    }
    inat.push(x.l);
  }
  // Código que fica já inativo (na base ou por decisão aprovada) sem caso de inativação no mapa: o mesmo conflito.
  for (const [id, ls] of cruz.linhasDoQueFica) {
    if (e.item(id)?.ativo !== false) continue;
    for (const l of ls) if (!l.alertas.some((a) => a.startsWith('Conflito:'))) l.alertas.push(`Conflito: o código que fica (${l.fica?.codigo}) está inativo: reativar o código (ou escolher outro que fique) antes de transferir o saldo.`);
  }
  // A unificação aprovada gravou o vínculo: a data de início dele (quando informada) vale para a linha.
  const inicioDoVinculo = new Map<string, Date>();
  for (const v of e.vinculos) if (v.inicio) inicioDoVinculo.set(`${v.de}\u0001${v.para}`, v.inicio);
  for (const l of unif) { const d = l.morre && l.fica ? inicioDoVinculo.get(`${l.morre.codigo}\u0001${l.fica.codigo}`) : undefined; if (d) l.inicio = d; }
  for (const v of e.vinculos) {
    if (pares.has(`${v.de}\u0001${v.para}`)) continue; // já está na linha da unificação
    trocas.push({
      tipo: 'TROCA_CODIGO', rotuloTipo: ROTULO_TIPO_MAPA.TROCA_CODIGO, situacao: 'REGISTRADA', casoId: null, origem: null, morre: { codigo: v.de, estab: '', descricao: '', unidade: '', saldo: null }, fica: { codigo: v.para, descricao: '', unidade: '', saldo: null },
      saldoEntra: null, saldoConsolidado: null, acao: acaoComErp(e, 'MUDOU_CODIGO_DESCRICAO', `Registrar ${v.de} como código anterior de ${v.para} (histórico do item; SPED 0205)`, { sai: v.de, fica: v.para }, true), inicio: v.inicio ?? e.dataBase,
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

/**
 * "Ação no ERP" com o texto do perfil do ERP (ACAO_NO_ERP do tipo de ajuste, com {sai} e {fica} trocados): na linha sem pendência ele
 * substitui o texto geral; na linha com pendência (saldo desconhecido, negativo, sem conversão), vem depois do que conferir antes.
 */
export function acaoComErp(e: Pick<EntradaMapa, 'perfilErp'>, tipo: string, geral: string, codigos: { sai?: string; fica?: string }, normal: boolean): string {
  const t = acaoNoErp(e.perfilErp, tipo, codigos);
  if (!t) return geral;
  return normal ? t : `${geral}. No ${e.perfilErp!.nome}: ${t}`;
}

type Comum = Pick<LinhaMapa, 'situacao' | 'casoId' | 'origem' | 'inicio' | 'justificativa' | 'responsavel' | 'decididoEm'>;
/** O que a unificação registra para o cruzamento com as inativações: linhas por item que fica e ids dos itens que morrem. */
type Cruzamento = { linhasDoQueFica: Map<string, LinhaMapa[]>; queMorrem: Map<string, LinhaMapa[]> };

/** Conversão do saldo do código que morre para a unidade do que fica: multiplicador, ou por que não converte. */
type Conversao = { multiplicador: number } | { falta: 'FATOR' | 'DIRECAO'; fator: number | null };
const perto = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
/**
 * Só converte quando a direção é inequívoca: o caso traz as unidades do fator (`fatorDe` → `fatorPara`: 1 de = fator para) e elas são as
 * do que morre e do que fica (em qualquer ordem), ou as duas unidades são medidas da mesma grandeza com fator exato na tabela e o fator
 * aprovado é esse (ou o inverso). Fator sem direção (ex.: apresentações 1 L × 5 L cadastradas em UN × CX, fator max/min) não converte.
 */
export function conversaoDoSaldo(proposta: Record<string, unknown>, de: string, para: string): Conversao {
  const fator = lerFator(proposta.fatorConversao);
  if (fator == null) return { falta: 'FATOR', fator: null };
  const ud = chaveUnidade(de); const up = chaveUnidade(para);
  const fd = chaveUnidade(proposta.fatorDe); const fp = chaveUnidade(proposta.fatorPara);
  if (fd && fp) {
    if (fd === ud && fp === up) return { multiplicador: fator };
    if (fd === up && fp === ud) return { multiplicador: 1 / fator };
    return { falta: 'DIRECAO', fator };
  }
  const a = classificarUnidade(de); const b = classificarUnidade(para);
  if (a && b && a.grandeza && a.grandeza === b.grandeza && a.fator != null && b.fator != null && a.nivel !== 'embalagem' && b.nivel !== 'embalagem') {
    const calc = a.fator / b.fator;
    if (perto(calc, fator)) return { multiplicador: fator };
    if (perto(calc, 1 / fator)) return { multiplicador: 1 / fator };
  }
  return { falta: 'DIRECAO', fator };
}

function linhasDeUnificacao(c: CasoMapa, e: EntradaMapa, comum: Comum, out: LinhaMapa[], pares: Set<string>, cruz: Cruzamento) {
  const manter = t(c.proposta.manter);
  const saem = new Set(t(c.proposta.consolidar).split('|').map((x) => x.trim()).filter(Boolean));
  if (!manter || !saem.size) return;
  const ficam = new Map<string, ItemMapa>(); const morrem: ItemMapa[] = []; const achados = new Set<string>();
  for (const id of c.itens) {
    const i = e.item(id);
    if (!i) continue;
    if (i.codigo === manter) { if (!ficam.has(i.estab)) ficam.set(i.estab, i); } else if (saem.has(i.codigo)) { morrem.push(i); achados.add(i.codigo); }
  }
  const qualquerFica = ficam.values().next().value as ItemMapa | undefined;
  // Linhas por item que morre; o saldo consolidado soma, por estabelecimento, o saldo atual do que fica e tudo o que entra nele.
  const linhas: { l: LinhaMapa; estabFica: string | null; fica: ItemMapa | null; morreId?: string }[] = [];
  for (const m of morrem) {
    pares.add(`${m.codigo}\u0001${manter}`);
    const f = ficam.get(m.estab) ?? null;
    const alertas: string[] = [];
    if (!f) alertas.push(qualquerFica ? `O código que fica (${manter}) não está cadastrado no estabelecimento ${m.estab || 'único'}: cadastrar antes de transferir o saldo.` : `O código que fica (${manter}) não foi encontrado na base.`);
    const ref = f ?? qualquerFica ?? null;
    let entra: number | null = null;
    const unDifere = !!ref && !!chaveUnidade(m.unidade) && !!chaveUnidade(ref.unidade) && chaveUnidade(m.unidade) !== chaveUnidade(ref.unidade);
    const conv: Conversao = unDifere ? conversaoDoSaldo(c.proposta, m.unidade, ref!.unidade) : { multiplicador: 1 };
    const semConversao = 'falta' in conv;
    if (m.saldo == null) alertas.push(`Saldo de ${m.codigo} não informado na base: conferir no ERP antes de transferir.`);
    else if ('falta' in conv && conv.falta === 'FATOR') alertas.push(`Unidades diferentes (${m.unidade} × ${ref!.unidade}): saldo não somável direto; converter antes de somar (sem fator de conversão aprovado).`);
    else if ('falta' in conv) alertas.push(`Unidades diferentes (${m.unidade} × ${ref!.unidade}): o fator ${num(conv.fator!)} não diz de qual unidade para qual; converter antes de somar (informe no caso a unidade de origem e a de destino do fator).`);
    else if (unDifere) { entra = m.saldo * conv.multiplicador; alertas.push(`Unidades diferentes (${m.unidade} × ${ref!.unidade}): saldo convertido pelo fator aprovado (1 ${m.unidade} = ${num(conv.multiplicador)} ${ref!.unidade}).`); }
    else entra = m.saldo;
    if (m.saldo != null && m.saldo < 0) alertas.push(`Saldo negativo em ${m.codigo}: investigar a movimentação antes de transferir.`);
    if (f && f.saldo == null) alertas.push(`Saldo do código que fica (${manter}) não informado na base: o saldo consolidado não foi calculado.`);
    const acao = !ref ? `Conferir o código que fica (${manter}) antes de inativar ${m.codigo}`
      : m.saldo == null ? `Conferir o saldo de ${m.codigo} no ERP; havendo saldo, transferir para ${manter}; inativar ${m.codigo}`
        : unDifere && semConversao ? `Converter o saldo de ${m.codigo} para a unidade de ${manter} (${ref.unidade}), transferir para ${manter} e inativar ${m.codigo}`
          : m.saldo < 0 ? `Regularizar o saldo negativo de ${m.codigo}; depois transferir para ${manter} e inativar ${m.codigo}`
            : m.saldo === 0 ? `Inativar ${m.codigo} (sem saldo a transferir); o código que fica é ${manter}`
              : `Transferir o saldo de ${m.codigo} para ${manter} e inativar ${m.codigo}`;
    const acaoErp = !ref ? acao : acaoComErp(e, 'CONSOLIDOU_INATIVOU', acao, { sai: m.codigo, fica: manter }, m.saldo != null && m.saldo >= 0 && !(unDifere && semConversao));
    linhas.push({
      estabFica: f ? f.estab : null,
      fica: f,
      morreId: m.id,
      l: {
        tipo: 'UNIFICACAO', rotuloTipo: ROTULO_TIPO_MAPA.UNIFICACAO, ...comum, morre: lado(m), fica: ref ? { codigo: manter, descricao: ref.descricao, unidade: ref.unidade, saldo: f ? f.saldo : null } : { codigo: manter, descricao: '', unidade: '', saldo: null },
        saldoEntra: entra, saldoConsolidado: null, acao: acaoErp, alertas,
      },
    });
  }
  // Código que sai sem item na base: a linha fica, com o alerta.
  for (const cod of saem) {
    if (achados.has(cod) || cod === manter) continue;
    pares.add(`${cod}\u0001${manter}`);
    linhas.push({ estabFica: null, fica: null, l: { tipo: 'UNIFICACAO', rotuloTipo: ROTULO_TIPO_MAPA.UNIFICACAO, ...comum, morre: { codigo: cod, estab: '', descricao: '', unidade: '', saldo: null }, fica: { codigo: manter, descricao: qualquerFica?.descricao ?? '', unidade: qualquerFica?.unidade ?? '', saldo: null }, saldoEntra: null, saldoConsolidado: null, acao: `Conferir o código ${cod} no ERP (não está na base importada) antes de inativar`, alertas: [`O código que morre (${cod}) não foi encontrado na base.`] } });
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
  for (const x of linhas) {
    out.push(x.l);
    if (x.morreId) { const l = cruz.queMorrem.get(x.morreId); if (l) l.push(x.l); else cruz.queMorrem.set(x.morreId, [x.l]); }
    if (x.fica) { const l = cruz.linhasDoQueFica.get(x.fica.id); if (l) l.push(x.l); else cruz.linhasDoQueFica.set(x.fica.id, [x.l]); }
  }
}

function linhasDeInativacao(c: CasoMapa, e: EntradaMapa, comum: Comum, out: { l: LinhaMapa; id: string }[]) {
  const origem: OrigemInativacao = c.camada === 'DUPLICIDADE' ? 'DUPLICIDADE' : 'QUALIDADE';
  // Inativação vinda de Duplicidades (decisão editada): inativam-se os códigos de `consolidar`; nos demais casos, todos os itens.
  const so = c.camada === 'DUPLICIDADE' ? new Set(t(c.proposta.consolidar).split('|').map((x) => x.trim()).filter(Boolean)) : null;
  for (const id of c.itens) {
    const i = e.item(id);
    if (!i || (so && !so.has(i.codigo))) continue;
    const alertas: string[] = [];
    let acao = `Inativar ${i.codigo}`;
    if (i.saldo == null) { alertas.push(`Saldo de ${i.codigo} não informado na base: conferir no ERP que está zerado antes de inativar.`); acao = `Conferir no ERP que ${i.codigo} está sem saldo e inativar ${i.codigo}`; }
    else if (i.saldo !== 0) { alertas.push(`${i.codigo} tem saldo (${num(i.saldo)} ${i.unidade}): regularizar o saldo antes de inativar.`); acao = `Regularizar o saldo de ${i.codigo} antes de inativar`; }
    acao = acaoComErp(e, 'INATIVOU', acao, { sai: i.codigo }, i.saldo === 0);
    out.push({ id: i.id, l: { tipo: 'INATIVACAO', ...comum, origem, rotuloTipo: ROTULO_INATIVACAO[origem], morre: lado(i), fica: null, saldoEntra: null, saldoConsolidado: null, acao, alertas } });
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
  return { tipo: 'EQUIVALENCIA', rotuloTipo: ROTULO_TIPO_MAPA.EQUIVALENCIA, ...comum, morre: null, fica: { codigo: cods.join(', '), descricao: '', unidade: '', saldo: null }, saldoEntra: null, saldoConsolidado: null, acao, alertas: [] };
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
  const inativacoesPorOrigem: Record<OrigemInativacao, number> = { DUPLICIDADE: 0, QUALIDADE: 0 };
  let comAlerta = 0;
  for (const l of linhas) { porSituacao[l.situacao]++; porTipo[l.tipo]++; if (l.origem) inativacoesPorOrigem[l.origem]++; if (l.alertas.length) comAlerta++; }
  return { porSituacao, porTipo, inativacoesPorOrigem, comAlerta };
}
