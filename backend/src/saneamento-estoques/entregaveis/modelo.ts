/**
 * Modelo comum dos entregáveis (Excel e relatório): normaliza os DOIS formatos de linha que o servidor entrega
 * (foto da versão liberada × linhas da tabela atual) e calcula os números uma única vez, para que o Excel e o PDF nunca divirjam.
 */
import { CAMADAS, ROTULO_CENARIO, ROTULO_FINALIDADE, type Camada } from '../tipos';
import type { DadosEntrega } from '../dados/portas';
import { ROTULO_CAMADA, rotuloDoCampo, rotuloDoCaso, rotuloDoValor, rotuloTipoCaso } from '../rotulos';
import { escalaDaBase } from '../motor/conjuntos';
import { montarMapa, saldoDe, type LinhaMapa } from './unificacoes';

type Json = Record<string, unknown>;
const NAO_CONFIRMADO = 'não confirmado';

export { ROTULO_CAMADA, rotuloDoCampo, rotuloDoCaso, rotuloDoValor, rotuloTipoCaso };
export const ROTULO_SITUACAO: Record<string, string> = {
  PENDENTE: 'Pendente', SEM_PROBLEMA: 'Sem problema', PROPOSTO: 'Proposto', APROVADO: 'Aprovado', AGUARDANDO_INFORMACAO: 'Aguardando informação',
};
export const ROTULO_SITUACAO_CASO: Record<string, string> = {
  PROPOSTO: 'Proposto', RASCUNHO: 'Em edição', APROVADO: 'Aprovado', REJEITADO: 'Rejeitado', AGUARDANDO_INFORMACAO: 'Aguardando informação', OBSOLETO: 'Obsoleto',
};
/** Casos que ainda não foram decididos ou dependem de informação: são pendência, não dado aprovado. */
export const CASO_PENDENTE = ['PROPOSTO', 'RASCUNHO', 'AGUARDANDO_INFORMACAO'];
export const MARCA_PROPOSTA = 'Proposto — não aprovado';

// ── Conversores ──────────────────────────────────────────────────────────────

export const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
export const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Texto seguro de qualquer valor (nulo → vazio; objeto → JSON). */
export function txt(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return Number.isNaN(+v) ? '' : v.toISOString();
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function paraData(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(+d) ? null : d;
}

/** Resumo "campo: valor; campo: valor" de um objeto (atual/proposta do caso), com rótulos (nunca o nome interno do campo). */
export function resumoCampos(o: unknown): string {
  return Object.entries(obj(o)).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${rotuloDoCampo(k)}: ${typeof v === 'string' ? rotuloDoValor(v) : txt(v)}`).join('; ');
}

export const comMilhar = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const pct1 = (x: number) => `${(Math.round(x * 1000) / 10).toFixed(1).replace('.', ',')}%`;
export const dataBr = (d: Date | null, utc = true) => {
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return utc ? `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ── Tipos normalizados ───────────────────────────────────────────────────────

export type ItemN = {
  id: string; codigo: string; estab: string; descricao: string; descricaoOriginal: string; unidade: string; ncm: string; grupo: string;
  finalidade: string | null; tambem: string[]; ativo: boolean | null; saldo: number | null; campos: Json; camposAlterados: string[];
};
export type CelulaN = { situacao: string; revisar: boolean; casoId: string | null };
export type CasoN = {
  id: string; camada: string; tipo: string; itens: string[]; problema: string; evidencia: { rotulo: string; valor: string }[]; atual: Json; proposta: Json;
  justificativa: string; fundamento: string; situacao: string; motivo: string; responsavel: string; decididoPor: string; decididoEm: Date | null; criadoEm: Date | null;
};
export type DecisaoN = { itemId: string; casoId: string | null; campo: string; antes: unknown; depois: unknown; fundamento: string; usuario: string; tipo: string; quando: Date | null };
export type ImpactoN = {
  casoId: string | null; obrigacao: string; competencia: string; leiaute: string; registro: string; campo: string; valorOriginal: string; valorProposto: string; motivo: string;
  evidencia: string; inicio: Date | null; avaliarAnteriores: boolean; responsavel: string; tipo: string; criadoEm: Date | null;
};
export type VinculoN = { de: string; para: string; inicio: Date | null; justificativa: string; criadoPor: string; criadoEm: Date | null };

export type ContagemSituacao = { total: number; porSituacao: Record<string, number>; revisar: number };

export type Modelo = {
  dados: DadosEntrega;
  liberada: boolean;
  itens: ItemN[];
  porId: Map<string, ItemN>;
  celulas: Map<string, Map<string, CelulaN>>;
  camadas: Camada[];
  casos: CasoN[];
  casoPorId: Map<string, CasoN>;
  decisoes: DecisaoN[];
  impactos: ImpactoN[];
  /** Impactos que ficaram fora da entrega liberada (ligados a caso ainda não aprovado). */
  impactosExcluidos: number;
  vinculos: VinculoN[];
  /** Casos tributários por item, na ordem de preferência. */
  casosDoItem: Map<string, CasoN[]>;
  /** Contagem por camada (células). */
  porCamada: Map<Camada, ContagemSituacao>;
  /** Casos por camada e situação. */
  casosPorCamada: Map<string, Record<string, number>>;
  /** Itens com campo efetivamente alterado por decisão, por camada do caso. */
  itensAjustadosPorCamada: Map<string, Set<string>>;
  decisoesPorCamada: Map<string, number>;
};

function rotulosFinalidade(v: unknown): string[] {
  return lista(v).map((x) => ROTULO_FINALIDADE[x as keyof typeof ROTULO_FINALIDADE] ?? txt(x)).filter(Boolean);
}

export function construirModelo(dados: DadosEntrega): Modelo {
  const liberada = dados.liberada === true;
  const aprovadoOuDecidido = (s: string) => !CASO_PENDENTE.includes(s);
  const limite = liberada ? paraData(dados.versao?.criadaEm) : null;
  const ate = (d: Date | null) => !limite || !d || +d <= +limite;

  // decisões: primeira "antes" e última "depois" por item e campo (descrição original e campos alterados)
  const decisoes: DecisaoN[] = dados.decisoes.map((d) => ({
    itemId: txt(d.item_id), casoId: d.caso_id ? txt(d.caso_id) : null, campo: txt(d.campo), antes: d.antes ?? null, depois: d.depois ?? null,
    fundamento: txt(d.fundamento), usuario: txt(d.usuario), tipo: txt(d.tipo), quando: paraData(d.quando),
  })).sort((a, b) => (+(a.quando ?? 0)) - (+(b.quando ?? 0)));
  const primeira = new Map<string, unknown>(); const ultima = new Map<string, unknown>(); const camposDoItem = new Map<string, string[]>();
  for (const d of decisoes) {
    if (d.tipo === 'rejeitar' || d.campo.startsWith('caso:')) continue;
    const k = `${d.itemId}\u0001${d.campo}`;
    if (!primeira.has(k)) { primeira.set(k, d.antes); (camposDoItem.get(d.itemId) ?? camposDoItem.set(d.itemId, []).get(d.itemId)!).push(d.campo); }
    ultima.set(k, d.depois);
  }

  const itens: ItemN[] = dados.itens.map((r) => {
    const t = obj(r.trabalho); const campos = obj(t.campos);
    const id = txt(r.id);
    const original = obj(r.original);
    const k = `${id}\u0001descricao`;
    const descricao = txt(t.descricao ?? r.descricao);
    const descricaoOriginal = txt(original.descricao) || (primeira.has(k) ? txt(primeira.get(k)) : descricao);
    const alterados = (camposDoItem.get(id) ?? []).filter((c) => !igual(primeira.get(`${id}\u0001${c}`), ultima.get(`${id}\u0001${c}`)));
    const fin = r.finalidade ?? t.finalidade;
    const ativo = typeof r.ativo === 'boolean' ? r.ativo : typeof t.ativo === 'boolean' ? t.ativo : null;
    return {
      // Código de TRABALHO primeiro (a decisão pode trocá-lo; a coluna é a chave da importação), como o mapa e a orquestração.
      id, codigo: txt(t.codigo ?? r.codigo), estab: txt(r.estabelecimento ?? t.estabelecimento), descricao, descricaoOriginal,
      unidade: txt(t.unidade), ncm: txt(t.ncm), grupo: txt(r.grupo ?? t.grupo), finalidade: fin ? txt(fin) : null,
      tambem: rotulosFinalidade(r.tambemUsadoComo ?? r.tambem_usado_como ?? t.tambemUsadoComo), ativo, saldo: saldoDe(t.saldo), campos, camposAlterados: alterados,
    };
  });
  const porId = new Map(itens.map((i) => [i.id, i]));

  const celulas = new Map<string, Map<string, CelulaN>>();
  const presentes = new Set<string>();
  for (const c of dados.celulas) {
    const id = txt(c.item_id); const camada = txt(c.camada);
    presentes.add(camada);
    let m = celulas.get(id); if (!m) { m = new Map(); celulas.set(id, m); }
    m.set(camada, { situacao: txt(c.situacao) || 'PENDENTE', revisar: c.revisar === true, casoId: c.caso_id ? txt(c.caso_id) : null });
  }
  const modulos = obj(dados.projeto.modulos);
  const camadas = CAMADAS.filter((c) => c !== 'ESTOQUE' || modulos.conciliacao === true || presentes.has('ESTOQUE'));

  const casos: CasoN[] = dados.casos.filter((c) => txt(c.situacao) !== 'OBSOLETO').map((c) => ({
    id: txt(c.id), camada: txt(c.camada), tipo: txt(c.tipo), itens: lista(c.itens).map(txt), problema: txt(c.problema),
    evidencia: lista(c.evidencia).map((e) => ({ rotulo: txt(obj(e).rotulo), valor: txt(obj(e).valor) })), atual: obj(c.atual), proposta: obj(c.proposta),
    justificativa: txt(c.justificativa), fundamento: txt(c.fundamento), situacao: txt(c.situacao), motivo: txt(c.motivo), responsavel: txt(c.responsavel),
    decididoPor: txt(c.decidido_por), decididoEm: paraData(c.decidido_em), criadoEm: paraData(c.createdAt),
  }));
  const casoPorId = new Map(casos.map((c) => [c.id, c]));

  const impactosTodos: ImpactoN[] = dados.impactosSped.map((i) => ({
    casoId: i.caso_id ? txt(i.caso_id) : null, obrigacao: txt(i.obrigacao), competencia: txt(i.competencia), leiaute: txt(i.versao_leiaute), registro: txt(i.registro),
    campo: txt(i.campo), valorOriginal: txt(i.valor_original), valorProposto: txt(i.valor_proposto), motivo: txt(i.motivo), evidencia: txt(i.evidencia),
    inicio: paraData(i.inicio), avaliarAnteriores: i.avaliar_anteriores === true, responsavel: txt(i.responsavel), tipo: txt(i.tipo_ajuste), criadoEm: paraData(i.createdAt),
  })).filter((i) => ate(i.criadoEm));
  // liberada: só impacto de caso já decidido (ou lançado sem caso); o resto fica registrado como excluído
  const impactos = liberada ? impactosTodos.filter((i) => !i.casoId || !casoPorId.has(i.casoId) || aprovadoOuDecidido(casoPorId.get(i.casoId)!.situacao)) : impactosTodos;
  const vinculos: VinculoN[] = dados.vinculos.map((v) => ({ de: txt(v.de), para: txt(v.para), inicio: paraData(v.inicio), justificativa: txt(v.justificativa), criadoPor: txt(v.criado_por), criadoEm: paraData(v.createdAt) })).filter((v) => ate(v.criadoEm));

  // casos tributários por item (preferência: aprovado > proposto/em edição > aguardando > rejeitado)
  const ordem: Record<string, number> = { APROVADO: 0, PROPOSTO: 1, RASCUNHO: 1, AGUARDANDO_INFORMACAO: 2, REJEITADO: 3 };
  const ehExcecao = (c: CasoN) => c.tipo.startsWith('EXCECAO') || txt(c.proposta.origem) === 'EXCECAO';
  /** O caso de CONJUNTO só vale para o item que ainda pertence a ele (mesmo NCM e mesma finalidade de quando o caso foi gerado). */
  const pertenceAoConjunto = (c: CasoN, it: ItemN | undefined) => {
    if (ehExcecao(c) || !it) return true;
    const conj = c.evidencia.find((e) => e.rotulo === 'Conjunto')?.valor;
    if (!conj || !conj.includes(' × ')) return true;
    const [ncm, fin] = conj.split(' × ');
    return ncm.replace(/\D/g, '') === it.ncm.replace(/\D/g, '') && fin === (it.finalidade ? ROTULO_FINALIDADE[it.finalidade as keyof typeof ROTULO_FINALIDADE] ?? it.finalidade : '');
  };
  const casosDoItem = new Map<string, CasoN[]>();
  for (const c of casos) {
    if (c.camada !== 'TRIBUTARIO') continue;
    for (const id of c.itens) { if (!pertenceAoConjunto(c, porId.get(id))) continue; let l = casosDoItem.get(id); if (!l) { l = []; casosDoItem.set(id, l); } l.push(c); }
  }
  // Exceção por item tem prioridade sobre o caso do conjunto (dentro da mesma situação, e a aprovada vale mais que a proposta).
  for (const l of casosDoItem.values()) if (l.length > 1) l.sort((a, b) => (ordem[a.situacao] ?? 9) - (ordem[b.situacao] ?? 9) || Number(ehExcecao(b)) - Number(ehExcecao(a)));

  const porCamada = new Map<Camada, ContagemSituacao>();
  for (const camada of camadas) porCamada.set(camada, { total: itens.length, porSituacao: {}, revisar: 0 });
  for (const m of celulas.values()) {
    for (const [camada, c] of m) {
      const x = porCamada.get(camada as Camada); if (!x) continue;
      x.porSituacao[c.situacao] = (x.porSituacao[c.situacao] ?? 0) + 1;
      if (c.revisar) x.revisar++;
    }
  }
  for (const x of porCamada.values()) {
    const contadas = Object.values(x.porSituacao).reduce((s, n) => s + n, 0);
    if (contadas < x.total) x.porSituacao.PENDENTE = (x.porSituacao.PENDENTE ?? 0) + (x.total - contadas);
  }

  const casosPorCamada = new Map<string, Record<string, number>>();
  for (const c of casos) {
    const r = casosPorCamada.get(c.camada) ?? {}; r[c.situacao] = (r[c.situacao] ?? 0) + 1; casosPorCamada.set(c.camada, r);
  }
  const itensAjustadosPorCamada = new Map<string, Set<string>>(); const decisoesPorCamada = new Map<string, number>();
  for (const d of decisoes) {
    const camada = d.casoId ? casoPorId.get(d.casoId)?.camada : undefined;
    if (!camada) continue;
    decisoesPorCamada.set(camada, (decisoesPorCamada.get(camada) ?? 0) + 1);
    if (d.tipo === 'aprovar' && !d.campo.startsWith('caso:') && !igual(d.antes, d.depois)) {
      const s = itensAjustadosPorCamada.get(camada) ?? new Set<string>(); s.add(d.itemId); itensAjustadosPorCamada.set(camada, s);
    }
  }

  return {
    dados, liberada, itens, porId, celulas, camadas, casos, casoPorId, decisoes, impactos, impactosExcluidos: impactosTodos.length - impactos.length, vinculos,
    casosDoItem, porCamada, casosPorCamada, itensAjustadosPorCamada, decisoesPorCamada,
  };
}

// ── Consultas comuns ─────────────────────────────────────────────────────────

export const celula = (m: Modelo, itemId: string, camada: string): CelulaN | undefined => m.celulas.get(itemId)?.get(camada);
export const rotuloSituacaoCelula = (c: CelulaN | undefined) => (c ? ROTULO_SITUACAO[c.situacao] ?? c.situacao : 'Pendente') + (c?.revisar ? ' (revisar)' : '');

/** Códigos dos itens de um caso, até `max`, com "+N". */
export function codigosDosItens(m: Modelo, ids: string[], max = 8): string {
  const cods = ids.slice(0, max).map((id) => m.porId.get(id)?.codigo ?? id);
  return cods.join(', ') + (ids.length > max ? ` (+${ids.length - max})` : '');
}

export const projetoTexto = (m: Modelo, campo: string) => txt(m.dados.projeto[campo]);
export const nomeCliente = (m: Modelo) => projetoTexto(m, 'clienteNome') || '—';

export type LinhaCenario = {
  cenario: string; enquadramentoLegal: string; artigo: string; cst: string; cClassTrib: string; origem: string; observacao: string; situacao: string; marca: string;
};

// "Em regra" não afirma crédito: a descrição traz as condições do art. 47 (débito extinto, documento idôneo) e a classe de alíquota zero
// já chega como "a verificar".
const CREDITO: Record<string, string> = { EM_REGRA: 'Crédito em regra, nas condições da lei', VERIFICAR: 'A verificar', NAO_SE_APLICA: 'Sem crédito (operação de saída)' };
function textoCredito(caso: CasoN | undefined, rotulo: string): string {
  const e = caso?.evidencia.find((x) => x.rotulo === rotulo);
  if (!e) return '';
  const i = e.valor.indexOf(': ');
  const cod = i > 0 ? e.valor.slice(0, i) : '';
  return CREDITO[cod] ? `${CREDITO[cod]}: ${e.valor.slice(i + 2)}` : e.valor;
}
const ORIGEM: Record<string, string> = { HERDADO: 'Herdado do conjunto', EXCECAO: 'Exceção do item' };

/** Cenários aplicáveis por finalidade (espelha fiscal/cenarios.ts sem importar o catálogo). */
const CENARIOS: Record<string, string[]> = {
  REVENDA: ['COMPRA_REVENDA', 'VENDA', 'DEVOLUCAO'], MATERIA_PRIMA: ['COMPRA_REVENDA', 'DEVOLUCAO'], INSUMO_PRODUCAO: ['COMPRA_REVENDA', 'DEVOLUCAO'],
  EMBALAGEM: ['COMPRA_REVENDA', 'DEVOLUCAO'], USO_CONSUMO: ['USO_CONSUMO', 'DEVOLUCAO'], MANUTENCAO: ['USO_CONSUMO', 'DEVOLUCAO'],
  IMOBILIZADO: ['USO_CONSUMO', 'DEVOLUCAO'], MATERIAL_TERCEIROS: [],
};

/**
 * Linhas da aba de cenários para um item: uma por cenário aplicável à finalidade. Liberada: só enquadramento aprovado (ou classe já
 * conferida sem problema); proposta aparece apenas na exportação para revisão, com marca.
 */
const ehExcecao = (c: CasoN) => c.tipo.startsWith('EXCECAO') || txt(c.proposta.origem) === 'EXCECAO';

export function linhasDeCenario(m: Modelo, it: ItemN): LinhaCenario[] {
  const cel = celula(m, it.id, 'TRIBUTARIO');
  // Entrega liberada: item com célula marcada "revisar" (NCM ou finalidade mudou depois da decisão) não sai como aprovado nem com o enquadramento antigo.
  if (m.liberada && cel?.revisar) {
    return [{ cenario: '—', enquadramentoLegal: '', artigo: '', cst: '', cClassTrib: '', origem: '', situacao: 'Aguardando revisão', marca: '', observacao: 'A decisão anterior depende de dado que mudou depois dela: revisar o enquadramento antes de usar.' }];
  }
  const casos = m.casosDoItem.get(it.id) ?? [];
  const decidida = cel?.situacao === 'APROVADO' || cel?.situacao === 'SEM_PROBLEMA';
  const informada = txt(it.campos.cClassTrib ?? it.campos.c_class_trib);
  const aprovado = casos.find((c) => c.situacao === 'APROVADO');
  const aberto = m.liberada ? undefined : casos.find((c) => c.situacao === 'PROPOSTO' || c.situacao === 'RASCUNHO');
  const aguardando = casos.find((c) => c.situacao === 'AGUARDANDO_INFORMACAO');
  const ehConjunto = (c: CasoN) => c.tipo === 'ENQUADRAMENTO_CONJUNTO' || c.tipo === 'ENQUADRAMENTO_CONFERIDO';
  const conjunto = casos.find((c) => ehConjunto(c) && (c.situacao === 'APROVADO' || (!m.liberada && c.situacao !== 'REJEITADO')));

  let base: Omit<LinhaCenario, 'cenario' | 'observacao'>; let obsBase = ''; let fonteCredito: CasoN | undefined = conjunto;
  const situacaoCel = ROTULO_SITUACAO[cel?.situacao ?? 'PENDENTE'] ?? 'Pendente';
  if (decidida && informada) {
    const p = obj(aprovado?.proposta);
    // Exceção aprovada: enquadramento e artigo são os da exceção (nunca os herdados do conjunto que ficaram no cadastro); sem eles, "não confirmado".
    const daExcecao = !!aprovado && ehExcecao(aprovado);
    base = daExcecao ? {
      enquadramentoLegal: txt(p.enquadramentoLegal) || NAO_CONFIRMADO, artigo: txt(p.artigo) || NAO_CONFIRMADO, cst: txt(p.cst ?? it.campos.cst), cClassTrib: informada,
      origem: ORIGEM.EXCECAO, situacao: situacaoCel, marca: '',
    } : {
      enquadramentoLegal: txt(it.campos.enquadramentoLegal ?? p.enquadramentoLegal), artigo: txt(it.campos.artigo ?? p.artigo), cst: txt(it.campos.cst ?? p.cst), cClassTrib: informada,
      origem: ORIGEM[txt(it.campos.origem ?? p.origem)] ?? 'Informado no cadastro', situacao: situacaoCel, marca: '',
    };
    fonteCredito = aprovado && ehConjunto(aprovado) ? aprovado : conjunto;
    if (aprovado && ehExcecao(aprovado)) obsBase = aprovado.justificativa;
  } else if (aberto) {
    const p = aberto.proposta;
    const naoConf = ehExcecao(aberto) ? NAO_CONFIRMADO : '';
    base = { enquadramentoLegal: txt(p.enquadramentoLegal) || naoConf, artigo: txt(p.artigo) || naoConf, cst: txt(p.cst), cClassTrib: txt(p.cClassTrib), origem: ORIGEM[txt(p.origem)] ?? '', situacao: 'Proposto', marca: MARCA_PROPOSTA };
    fonteCredito = ehConjunto(aberto) ? aberto : conjunto;
    if (ehExcecao(aberto)) obsBase = aberto.justificativa;
  } else if (aguardando) {
    base = { enquadramentoLegal: '', artigo: '', cst: '', cClassTrib: '', origem: '', situacao: 'Aguardando informação', marca: '' };
    obsBase = aguardando.motivo || aguardando.justificativa; fonteCredito = undefined;
  } else if (!m.liberada && informada) {
    base = { enquadramentoLegal: '', artigo: '', cst: txt(it.campos.cst), cClassTrib: informada, origem: 'Informado no cadastro', situacao: situacaoCel, marca: 'Informado no cadastro, ainda não conferido' };
    fonteCredito = undefined;
  } else {
    base = { enquadramentoLegal: '', artigo: '', cst: '', cClassTrib: '', origem: '', situacao: situacaoCel, marca: '' };
    fonteCredito = undefined;
  }

  const cenarios = it.finalidade ? CENARIOS[it.finalidade] ?? [] : [];
  if (cenarios.length === 0) {
    const motivo = !it.finalidade ? 'Finalidade não confirmada: o cenário depende dela' : 'Material de terceiros: o tratamento depende da operação e não foi conferido nesta base';
    return [{ cenario: '—', enquadramentoLegal: '', artigo: '', cst: '', cClassTrib: '', origem: '', situacao: base.situacao, marca: '', observacao: [motivo, obsBase].filter(Boolean).join(' · ') }];
  }
  return cenarios.map((c) => {
    const rotuloBase = ROTULO_CENARIO[c as keyof typeof ROTULO_CENARIO];
    const nota = notaDoCenario(c, it.finalidade!);
    return {
      ...base, cenario: rotuloDoCenario(c, it.finalidade!),
      observacao: [nota, textoCredito(fonteCredito, rotuloBase), obsBase].filter(Boolean).join(' · '),
    };
  });
}

/**
 * Os 4 cenários do plano são fixos: a aquisição de matéria-prima, insumo ou embalagem usa o cenário "Compra para revenda" e a de
 * manutenção ou imobilizado usa o de "Uso e consumo" (mesma regra de crédito). O rótulo diz a finalidade real e a observação explica.
 */
export function rotuloDoCenario(cenario: string, finalidade: string): string {
  const base = ROTULO_CENARIO[cenario as keyof typeof ROTULO_CENARIO] ?? cenario;
  const fin = ROTULO_FINALIDADE[finalidade as keyof typeof ROTULO_FINALIDADE];
  if ((cenario === 'COMPRA_REVENDA' && finalidade !== 'REVENDA') || (cenario === 'USO_CONSUMO' && finalidade !== 'USO_CONSUMO')) return `Aquisição (${(fin ?? finalidade).toLowerCase()})`;
  return base;
}
function notaDoCenario(cenario: string, finalidade: string): string {
  const fin = (ROTULO_FINALIDADE[finalidade as keyof typeof ROTULO_FINALIDADE] ?? finalidade).toLowerCase();
  if (cenario === 'COMPRA_REVENDA' && finalidade !== 'REVENDA') return `Aquisição de ${fin} avaliada no cenário "Compra para revenda" (mesma regra de crédito)`;
  if (cenario === 'USO_CONSUMO' && finalidade !== 'USO_CONSUMO') return `Aquisição de ${fin} avaliada no cenário "Uso e consumo"`;
  return '';
}

/**
 * Origem da finalidade do item, para o Excel: herdada do grupo (decisão do grupo aplicou a finalidade), exceção ao grupo (com o motivo),
 * informada pelo cliente e confirmada no grupo (a decisão do grupo confirmou sem mudar), ou ainda não confirmada.
 */
const indicesFinalidade = new WeakMap<Modelo, { porItem: Map<string, CasoN[]>; aplicadas: Set<string> }>();
export function origemDaFinalidade(m: Modelo, it: ItemN): string {
  if (!it.finalidade) return '';
  let idx = indicesFinalidade.get(m);
  if (!idx) {
    const porItem = new Map<string, CasoN[]>();
    for (const c of m.casos) {
      if (c.camada !== 'GRUPOS_FINALIDADE' || c.situacao !== 'APROVADO' || !txt(c.proposta.finalidade)) continue;
      for (const id of c.itens) (porItem.get(id) ?? porItem.set(id, []).get(id)!).push(c);
    }
    const aplicadas = new Set(m.decisoes.filter((d) => d.campo === 'finalidade' && d.tipo === 'aprovar' && d.casoId).map((d) => `${d.casoId}\u0001${d.itemId}`));
    idx = { porItem, aplicadas };
    indicesFinalidade.set(m, idx);
  }
  const caso = (idx.porItem.get(it.id) ?? []).filter((c) => txt(c.proposta.finalidade) === it.finalidade).sort((a, b) => +(b.decididoEm ?? 0) - +(a.decididoEm ?? 0))[0];
  if (!caso) return 'Informada no cadastro, não confirmada';
  if (caso.tipo === 'FINALIDADE_EXCECAO') return `Exceção ao grupo: ${caso.justificativa || NAO_CONFIRMADO}`;
  if (caso.tipo !== 'FINALIDADE_GRUPO') return 'Decisão do consultor';
  return idx.aplicadas.has(`${caso.id}\u0001${it.id}`) ? 'Herdada do grupo' : 'Informada pelo cliente, confirmada no grupo';
}

/** Última competência de escrituração já entregue informada na configuração (aaaa-mm), ou null. */
export function competenciaEntregue(m: Modelo): string | null {
  const v = obj(m.dados.projeto.parametros).competenciaEntregue;
  return typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) ? v : null;
}
export const competenciaBr = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
/** Texto do grupo "escrituração já entregue" quando não há linha: sem a competência informada, não foi avaliado. */
export function textoSemEscrituracaoEntregue(m: Modelo): string {
  const c = competenciaEntregue(m);
  return c ? `nenhuma linha (última competência entregue informada: ${competenciaBr(c)})` : 'não avaliado (competência entregue não informada)';
}

/** Propostas em aberto que tocam o item (só na exportação para revisão). */
export function propostasEmAberto(m: Modelo): Map<string, string[]> {
  const r = new Map<string, string[]>();
  for (const c of m.casos) {
    if (c.situacao !== 'PROPOSTO' && c.situacao !== 'RASCUNHO') continue;
    const resumo = resumoCampos(c.proposta);
    if (!resumo) continue;
    const texto = `${ROTULO_CAMADA[c.camada as Camada] ?? c.camada}: ${resumo.slice(0, 120)}`;
    for (const id of c.itens) { let l = r.get(id); if (!l) { l = []; r.set(id, l); } if (l.length < 4) l.push(texto); }
  }
  return r;
}

const ROTULO_OBRIGACAO: Record<string, string> = { EFD_ICMS_IPI: 'EFD ICMS/IPI', EFD_CONTRIBUICOES: 'EFD-Contribuições', NFE: 'NF-e (documento eletrônico)' };
const ROTULO_TIPO_AJUSTE: Record<string, string> = {
  CADASTRAL_FUTURO: 'Ajuste cadastral futuro', REGULARIZACAO_SALDO: 'Regularização de saldo', ESCRITURACAO_ENTREGUE: 'Impacto em escrituração já entregue', ESCRITURACAO_JA_ENTREGUE: 'Impacto em escrituração já entregue',
};
export const rotuloObrigacao = (o: string) => ROTULO_OBRIGACAO[o] ?? o;
export const rotuloTipoAjuste = (t: string) => ROTULO_TIPO_AJUSTE[t] ?? t;

/** Mapa de unificações e inativações do modelo (aba "De para e equivalências" e relatório), calculado uma vez por modelo. */
const mapas = new WeakMap<Modelo, LinhaMapa[]>();
export function mapaDoModelo(m: Modelo): LinhaMapa[] {
  let r = mapas.get(m);
  if (!r) {
    r = montarMapa({
      liberada: m.liberada, dataBase: paraData(m.dados.projeto.data_base), item: (id) => m.porId.get(id), escala: escalaDaBase(m.itens),
      casos: m.casos.map((c) => ({ id: c.id, camada: c.camada, tipo: c.tipo, itens: c.itens, proposta: c.proposta, justificativa: c.justificativa, motivo: c.motivo, situacao: c.situacao, decididoPor: c.decididoPor, decididoEm: c.decididoEm })),
      vinculos: m.vinculos.map((v) => ({ de: v.de, para: v.para, inicio: v.inicio, justificativa: v.justificativa, criadoPor: v.criadoPor })),
    });
    mapas.set(m, r);
  }
  return r;
}
