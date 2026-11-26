/**
 * Camada DUPLICIDADE. Reaproveita o detector de backend/src/produtos/duplicidade.ts (normalização, medidas, vetos, bloqueio por palavra/NCM: nunca todos contra todos)
 * e acrescenta o que o plano pede: conjuntos com sugestão de qual código fica (conjuntos.ts), saldo e histórico antes de propor consolidação, relação de apresentações
 * (mesmo produto em embalagens diferentes, com fator de conversão) e atributos conflitantes (concentração). Critérios explicáveis em cada caso.
 *
 * Regras de negócio (decididas pelo usuário): a pontuação de similaridade NÃO é probabilidade (o caso diz "indicação alta" ou "indicação possível");
 * referências iguais de fabricantes diferentes NÃO provam equivalência técnica; corrigir descrição não funde itens; duplicidade com saldo ou histórico tem tratamento
 * próprio (consolidar com transferência de saldo e vínculo de código, nunca simplesmente apagar); a IA nunca copia classificação de similar.
 * O mesmo código em estabelecimentos diferentes é UM produto (não há duplicidade entre eles).
 */
import { detectarDuplicidades, normalizar, type CandidatoDup, type ItemDup } from '../../produtos/duplicidade';
import type { AnalisadorCamada, CasoProposto, ContextoAnalise, ItemTrabalho, ResultadoCamada } from '../tipos';
import { ev, justificar, montarResultado } from './base';
import { parametrosDe, type RegraUnidade } from './contexto';
import { novoCaso } from './dependencias';
import { detectarEscalaSaldo, montarConjuntos, saldoNaEscala, sugerirSobrevivente, type MembroConjunto, type NivelDuplicidade } from './conjuntos';
import { agrupar, campoExtra, dataBr, numeroBr, semAcento, soDigitos, txt, unicos } from './texto';
import { classificarUnidade, unidadeCanonica } from './unidades';

/** Decisões que a proposta oferece ao consultor (a recomendada vai em `proposta.decisao`). */
export const DECISOES_DUPLICIDADE = ['MANTER_DISTINTOS', 'CORRIGIR_IDENTIFICACAO', 'RELACIONAR_EQUIVALENTES', 'RELACIONAR_APRESENTACOES', 'PROPOR_CONSOLIDACAO', 'PROPOR_INATIVACAO', 'SOLICITAR_INFORMACAO'] as const;
export type DecisaoDuplicidade = (typeof DECISOES_DUPLICIDADE)[number];

/** Itens com o mesmo código (em estabelecimentos distintos) formam UM produto; sem código, o item é o próprio produto. */
type Produto = { codigo: string; itens: ItemTrabalho[]; rep: ItemTrabalho; saldo: number | null; ultima: string | null; linha: number };
type Membro = MembroConjunto & { produto: Produto };

const ROTULO_NIVEL: Record<NivelDuplicidade, string> = { EXATA: 'descrição idêntica após normalizar', MUITO_PROVAVEL: 'indicação alta', POSSIVEL: 'indicação possível' };
const lista = (xs: string[], n = 6) => (xs.length > n ? `${xs.slice(0, n).join(' | ')} | … (+${xs.length - n})` : xs.join(' | '));

function montarProdutos(itens: ItemTrabalho[]): Produto[] {
  const grupos = agrupar(itens, (i) => (txt(i.codigo) ? `c:${txt(i.codigo)}` : `i:${i.id}`));
  const saida: Produto[] = [];
  for (const g of grupos.values()) {
    const rep = g.find((i) => txt(i.descricao)) ?? g[0];
    const saldos = g.map((i) => i.saldo).filter((s): s is number => s != null && Number.isFinite(s));
    const datas = g.map((i) => i.ultimaMovimentacao).filter((d): d is string => !!d).sort();
    saida.push({ codigo: txt(rep.codigo), itens: g, rep, saldo: saldos.length ? saldos.reduce((a, b) => a + b, 0) : null, ultima: datas.length ? datas[datas.length - 1] : null, linha: saida.length + 1 });
  }
  return saida;
}

const CONDICAO = /\b(original|originais|paralel[ao]s?|similar(?:es)?|generic[ao]s?)\b/gi;
const paraDup = (p: Produto, semCondicao = false): ItemDup => ({
  descricao: semCondicao ? (p.rep.descricao ?? '').replace(CONDICAO, ' ') : p.rep.descricao ?? '', unidade: p.rep.unidade ?? '', ncm: soDigitos(p.rep.ncm), principio: campoExtra(p.rep, 'principioAtivo', 'principio_ativo', 'principio'),
  barras: campoExtra(p.rep, 'barras', 'codigoBarras', 'codigo_barras', 'ean', 'gtin'), codigo: p.codigo, grupo: p.rep.grupo ?? '',
});
const paraMembro = (p: Produto): Membro => ({
  linha: p.linha, codigo: p.codigo, descricao: p.rep.descricao, unidade: p.rep.unidade, ncm: p.rep.ncm, principio_ativo: campoExtra(p.rep, 'principioAtivo', 'principio_ativo', 'principio') || null,
  grupo_atual: p.rep.grupo, saldo: p.saldo, ultima_mov: p.ultima, duplicidade: null, produto: p,
});

/** Fator para converter 1 unidade de `de` em `para`, quando as duas são da mesma medida e têm fator exato; senão null (a confirmar). */
function fatorEntre(de: string | null | undefined, para: string | null | undefined, regras: Record<string, RegraUnidade> = {}): number | null {
  const a = classificarUnidade(de, regras); const b = classificarUnidade(para, regras);
  if (!a || !b || !a.grandeza || a.grandeza !== b.grandeza || a.fator == null || b.fator == null || a.nivel === 'embalagem' || b.nivel === 'embalagem') return null;
  return Math.round((a.fator / b.fator) * 1e6) / 1e6;
}

type Resumo = { diferencas: string[]; unidadesDiferem: boolean; fabricantesDiferem: boolean; ncmDiferem: boolean; saidas: Membro[]; comSaldoOuUso: Membro[]; desconhecidos: Membro[]; saldoTotalSaidas: number };

function resumir(membros: Membro[], escala: number, corte: string | null, semData: 'SINALIZAR' | 'ANTERIOR_AO_CORTE'): Resumo {
  const prods = membros.map((m) => m.produto);
  const dif: string[] = [];
  const unidades = unicos(prods.map((p) => unidadeCanonica(p.rep.unidade) ?? txt(p.rep.unidade).toLowerCase()).filter(Boolean));
  const unidadesDiferem = unidades.length > 1;
  if (unidadesDiferem) dif.push(`unidades diferentes: ${unicos(prods.map((p) => txt(p.rep.unidade).toUpperCase()).filter(Boolean)).join(', ')}`);
  const ncms = unicos(prods.map((p) => soDigitos(p.rep.ncm)).filter(Boolean));
  const ncmDiferem = ncms.length > 1;
  if (ncmDiferem) dif.push(`NCM diferentes: ${ncms.join(', ')}`);
  const fabs = unicos(prods.map((p) => semAcento(p.rep.fabricante).toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean));
  const fabricantesDiferem = fabs.length > 1;
  if (fabricantesDiferem) dif.push(`fabricantes diferentes: ${unicos(prods.map((p) => txt(p.rep.fabricante).toUpperCase()).filter(Boolean)).join(', ')}`);
  const refs = unicos(prods.map((p) => semAcento(p.rep.referencia).toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean));
  if (refs.length > 1) dif.push(`referências diferentes: ${unicos(prods.map((p) => txt(p.rep.referencia).toUpperCase()).filter(Boolean)).join(', ')}`);
  const grupos = unicos(prods.map((p) => txt(p.rep.grupo)).filter(Boolean));
  if (grupos.length > 1) dif.push(`grupos diferentes: ${grupos.join(', ')}`);
  const saidas = membros.slice(1);
  const usa = (m: Membro) => { const s = saldoNaEscala(m.saldo, escala); return (s != null && s > 0) || (!!m.ultima_mov && (corte ? m.ultima_mov >= corte : true)); };
  const comSaldoOuUso = saidas.filter(usa);
  // Dado ausente é desconhecido, não zero: sem saldo E sem data (e o projeto manda sinalizar), não dá para dizer que o código não tem saldo nem uso.
  const desconhecidos = saidas.filter((m) => !usa(m) && saldoNaEscala(m.saldo, escala) == null && !m.ultima_mov && semData === 'SINALIZAR');
  const saldoTotalSaidas = saidas.reduce((n, m) => n + Math.max(0, saldoNaEscala(m.saldo, escala) ?? 0), 0);
  return { diferencas: dif, unidadesDiferem, fabricantesDiferem, ncmDiferem, saidas, comSaldoOuUso, desconhecidos, saldoTotalSaidas };
}

function impactosDe(r: Resumo, escala: number): string[] {
  const imp: string[] = [];
  if (r.comSaldoOuUso.length) {
    const comSaldo = r.saidas.filter((m) => (saldoNaEscala(m.saldo, escala) ?? 0) > 0);
    if (comSaldo.length) imp.push(`Saldo a transferir antes de consolidar: ${comSaldo.length} código(s), total ${numeroBr(r.saldoTotalSaidas)} (inventário H010)`);
    const comMov = r.saidas.filter((m) => !!m.ultima_mov);
    if (comMov.length) imp.push(`Histórico de movimentação nos códigos que saem (${comMov.length}): preservar o vínculo código antigo → mantido (SPED: registro 0205, COD_ANT_ITEM/DT_INI/DT_FIM; o campo COD_ANT_ITEM do 0200 não é preenchido, conforme o Guia Prático da EFD ICMS/IPI 3.2.4)`);
  }
  imp.push('Documentos abertos e cartilhas/planos de manutenção que usam os códigos que saem');
  return imp;
}

type Base = { membros: Membro[]; nivel: NivelDuplicidade; score: number; escala: number; corte: string | null; semData: 'SINALIZAR' | 'ANTERIOR_AO_CORTE'; motivos: string[]; tipoBase: string; origem: string; sugestao: ReturnType<typeof sugerirSobrevivente> };

/** O caso de um conjunto: o que é, por quê (critérios), o que difere, o que acontece com saldo/histórico e qual decisão se recomenda. */
function casoDoConjunto(b: Base, regrasUnidade: Record<string, RegraUnidade>): CasoProposto {
  const r = resumir(b.membros, b.escala, b.corte, b.semData);
  const manter = b.membros[0];
  const forte = b.nivel === 'EXATA' || b.nivel === 'MUITO_PROVAVEL';
  let decisao: DecisaoDuplicidade; let tipo: string; let porque: string; let providencia: string;
  const proposta: CasoProposto['proposta'] = {};
  const fator = r.unidadesDiferem && b.membros.length === 2 ? fatorEntre(b.membros[1].unidade, manter.unidade, regrasUnidade) : null;
  if (r.fabricantesDiferem) {
    decisao = 'SOLICITAR_INFORMACAO'; tipo = b.tipoBase;
    porque = 'Os itens parecem iguais, mas os fabricantes são diferentes: referência ou descrição parecida de fabricantes diferentes NÃO prova equivalência técnica.';
    providencia = 'pedir ao cliente a confirmação técnica; se forem equivalentes, relacionar (sem fundir); caso contrário, manter distintos.';
  } else if (r.unidadesDiferem || r.ncmDiferem) {
    decisao = r.unidadesDiferem ? 'RELACIONAR_APRESENTACOES' : 'SOLICITAR_INFORMACAO'; tipo = b.tipoBase;
    porque = r.unidadesDiferem ? 'Os itens parecem o mesmo produto em apresentações/unidades diferentes: não se fundem; relacionam-se com o fator de conversão.' : 'Os itens parecem iguais, mas têm NCM diferentes: um dos dois está classificado de forma diferente.';
    providencia = r.unidadesDiferem ? 'confirmar o conteúdo de cada apresentação e cadastrar o fator de conversão.' : 'conferir a classificação de cada item antes de qualquer consolidação (a camada NCM trata a divergência).';
    if (r.unidadesDiferem && fator != null) proposta.fatorConversao = fator;
  } else if (forte && r.comSaldoOuUso.length) {
    decisao = 'PROPOR_CONSOLIDACAO'; tipo = 'DUPLICIDADE_COM_SALDO';
    porque = 'Itens duplicados em que os códigos que saem têm saldo ou histórico de movimentação: a consolidação exige transferir o saldo e preservar o vínculo, não apenas inativar.';
    providencia = 'transferir o saldo para o código que fica, registrar o vínculo código antigo → mantido e só então inativar os que saem.';
    proposta.tratamentoDoSaldo = 'transferir saldo e preservar histórico antes de inativar';
  } else if (forte && r.desconhecidos.length) {
    decisao = 'SOLICITAR_INFORMACAO'; tipo = b.tipoBase;
    porque = `Itens com a mesma identidade pelos critérios, mas ${r.desconhecidos.length} código(s) que saem não trazem saldo nem data de movimentação: dado ausente é desconhecido, não zero.`;
    providencia = 'obter saldo e última movimentação desses códigos no ERP antes de propor consolidação ou inativação.';
    proposta.tratamentoDoSaldo = 'saldo e movimentação desconhecidos: não propor inativação';
  } else if (forte) {
    decisao = 'PROPOR_CONSOLIDACAO'; tipo = b.tipoBase;
    porque = 'Itens com a mesma identidade segundo os critérios abaixo e sem saldo nem movimentação nos códigos que saem.';
    providencia = 'confirmar a identidade do produto; consolidar no código sugerido e inativar os demais.';
    proposta.tratamentoDoSaldo = 'sem saldo nem movimentação nos códigos que saem: inativar após conferir documentos abertos';
  } else {
    decisao = 'SOLICITAR_INFORMACAO'; tipo = b.tipoBase;
    porque = 'Similaridade parcial: o texto indica possível duplicidade, mas não prova identidade (a pontuação de similaridade não é probabilidade).';
    providencia = 'confirmar com o cliente se é o mesmo produto; se não for, manter distintos.';
  }
  proposta.decisao = decisao;
  proposta.decisoesPossiveis = DECISOES_DUPLICIDADE.join(' | ');
  if (decisao === 'PROPOR_CONSOLIDACAO' || decisao === 'SOLICITAR_INFORMACAO' || decisao === 'RELACIONAR_APRESENTACOES') { proposta.manter = manter.codigo; proposta.consolidar = r.saidas.map((m) => m.codigo).join(' | '); }
  const criterios = unicos(b.motivos).slice(0, 8).map((m) => ev('Critério', m));
  const idsItens = unicos(b.membros.flatMap((m) => m.produto.itens.map((i) => i.id)));
  return novoCaso({
    camada: 'DUPLICIDADE', tipo, itens: idsItens,
    problema: `${b.membros.length} códigos com ${forte ? 'indicação alta de serem' : 'indicação possível de serem'} o mesmo produto`,
    evidencia: [ev('Origem', b.origem), ev('Nível', ROTULO_NIVEL[b.nivel]), ev('Pontuação de similaridade (não é probabilidade)', b.score.toFixed(2)), ...criterios,
      ...r.diferencas.map((d) => ev('Diferença', d)), ev('Sugestão de qual fica', `${manter.codigo}: ${b.sugestao.motivo || 'único'}`), ...b.membros.slice(0, 6).map((m) => ev(`Código ${m.codigo}`, `${txt(m.descricao)} · saldo ${m.saldo == null ? 'n/d' : numeroBr(saldoNaEscala(m.saldo, b.escala) ?? 0)} · mov. ${m.ultima_mov ? dataBr(m.ultima_mov) : 'sem data'}`))],
    atual: { codigos: lista(b.membros.map((m) => m.codigo), 20), descricoes: lista(b.membros.map((m) => txt(m.descricao)), 3) },
    proposta, impactos: impactosDe(r, b.escala), justificativa: justificar(porque, providencia),
    fundamento: 'Critério de similaridade do detector (descrição normalizada, medidas, unidade, NCM); indicação para revisão humana, nunca prova de identidade.',
  });
}

export class AnalisadorDuplicidade implements AnalisadorCamada {
  readonly camada = 'DUPLICIDADE' as const;

  analisar(itens: ItemTrabalho[], contexto: ContextoAnalise): ResultadoCamada {
    const par = parametrosDe(contexto);
    const regrasUn = par.politicaUnidade?.regras ?? {};
    const casos: CasoProposto[] = [];
    const produtos = montarProdutos(itens);
    const escala = detectarEscalaSaldo(produtos);
    const corte = contexto.corteMovimentacao ?? null;
    const semData = par.semDataMovimentacao ?? 'SINALIZAR';
    const comTexto = produtos.filter((p) => txt(p.rep.descricao));

    // 1) Descrições iguais ou parecidas (detector) → conjuntos.
    const resultados0 = detectarDuplicidades(comTexto.map((p) => paraDup(p, par.paralelosNoMesmoCodigo === true)), { exigirPrincipio: false });
    const resultados = resultados0;
    const membros: Membro[] = comTexto.map((p, i) => {
      const m = paraMembro(p); const r = resultados[i]; const top = r.candidatos[0];
      m.duplicidade = top ? { nivel: top.nivel, score: top.score, grupo: r.grupo, candidatos: r.candidatos.map((c: CandidatoDup) => ({ linha: comTexto[c.idx].linha, score: c.score, nivel: c.nivel, motivos: c.motivos })) } : null;
      return m;
    });
    const motivosPorPar = new Map<string, string[]>();
    for (const m of membros) for (const c of m.duplicidade?.candidatos ?? []) motivosPorPar.set(`${m.linha}:${c.linha}`, c.motivos ?? []);
    const membroPorLinha = new Map(membros.map((m) => [m.linha, m] as const));
    const jaEmConjunto = new Set<number>();
    for (const conj of montarConjuntos(membros, { escala })) {
      for (const m of conj.membros) jaEmConjunto.add(m.linha);
      const motivos = conj.membros.flatMap((a) => conj.membros.flatMap((b) => (a.linha < b.linha ? motivosPorPar.get(`${a.linha}:${b.linha}`) ?? motivosPorPar.get(`${b.linha}:${a.linha}`) ?? [] : [])));
      const tipoBase = conj.nivel === 'EXATA' ? 'DUPLICIDADE_EXATA' : conj.nivel === 'MUITO_PROVAVEL' ? 'DUPLICIDADE_INDICACAO_ALTA' : 'DUPLICIDADE_INDICACAO_POSSIVEL';
      casos.push(casoDoConjunto({ membros: conj.membros as Membro[], nivel: conj.nivel, score: conj.score, escala, corte, semData, motivos, tipoBase, origem: 'Descrições, unidades e medidas da base importada', sugestao: conj.sugestao }, regrasUn));
    }

    // 2) Referência de fabricante coincidente (mesmo texto de referência em códigos diferentes), fora do que o detector já juntou.
    const refKey = (p: Produto) => semAcento(p.rep.referencia).toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [ref, g] of agrupar(comTexto.filter((p) => refKey(p).length >= 4), refKey)) {
      if (g.length < 2 || g.length > 30) continue; // referência curta ou comum demais não identifica nada
      const ms = g.map((p) => membroPorLinha.get(p.linha)!);
      if (g.every((p) => jaEmConjunto.has(p.linha))) { const mesmo = montarConjuntos(ms, { escala }); if (mesmo.length === 1 && mesmo[0].membros.length === g.length) continue; }
      const sug = sugerirSobrevivente(ms, { escala }); const pos = new Map(sug.ordem.map((l, i) => [l, i]));
      const ordenados = [...ms].sort((a, b) => pos.get(a.linha)! - pos.get(b.linha)!);
      const fabs = g.map((p) => semAcento(p.rep.fabricante).toLowerCase().replace(/[^a-z0-9]/g, ''));
      const todosTemFab = fabs.every(Boolean); const mesmoFab = todosTemFab && new Set(fabs).size === 1;
      // Original e paralelo ficam em códigos distintos (regra do cadastro): condição diferente na descrição afasta a consolidação.
      const condicoes = g.map((p) => [...new Set(semAcento(p.rep.descricao).toLowerCase().match(/\b(original|paralel[ao]|similar|generic[ao]|recondicionad[ao]|remanufaturad[ao]|usad[ao])\b/g) ?? [])].sort().join(','));
      const condicaoDiferente = par.paralelosNoMesmoCodigo !== true && new Set(condicoes).size > 1;
      const tipoBase = condicaoDiferente ? 'REFERENCIA_COINCIDENTE_CONDICAO_DIFERENTE' : mesmoFab ? 'REFERENCIA_COINCIDENTE' : todosTemFab ? 'REFERENCIA_FABRICANTES_DIFERENTES' : 'REFERENCIA_COINCIDENTE_SEM_FABRICANTE';
      const motivos = [`mesma referência "${txt(g[0].rep.referencia)}"`, condicaoDiferente ? 'condição diferente na descrição (original × paralelo...): produtos distintos' : mesmoFab ? 'mesmo fabricante' : todosTemFab ? 'fabricantes diferentes: referência igual não prova equivalência técnica' : 'fabricante não informado em algum dos itens'];
      const forteRef = mesmoFab && !condicaoDiferente;
      casos.push(casoDoConjunto({ membros: ordenados, nivel: forteRef ? 'MUITO_PROVAVEL' : 'POSSIVEL', score: forteRef ? 0.95 : 0.6, escala, corte, semData, motivos, tipoBase, origem: 'Campo referência (e fabricante) da base importada', sugestao: sug }, regrasUn));
    }

    // 3) Mesmo nome, apresentações diferentes (embalagem) ou concentração diferente: nunca se fundem.
    const normas = comTexto.map((p) => normalizar(p.rep.descricao));
    const porNome = new Map<string, number[]>();
    normas.forEach((n, i) => { const k = n.tokens.filter((t) => !t.leve).map((t) => t.t).sort().join(' '); if (k) { const a = porNome.get(k); if (a) a.push(i); else porNome.set(k, [i]); } });
    for (const [nome, idxs] of porNome) {
      if (idxs.length < 2 || idxs.length > 12) continue;
      const ms = idxs.map((i) => membros[i]); const ns = idxs.map((i) => normas[i]);
      if (ms.every((m) => jaEmConjunto.has(m.linha)) && montarConjuntos(ms, { escala }).length === 1) continue;
      const valores = (n: ReturnType<typeof normalizar>, dim: string) => [...(n.medidas.get(dim) ?? [])].sort().join(',');
      const diferem = (dim: string) => ns.every((n) => n.medidas.has(dim)) && new Set(ns.map((n) => valores(n, dim))).size > 1;
      const dimsCompos = ['conc', 'pct', 'ui'].filter(diferem);
      const sameOther = (dims: string[]) => dims.every((d) => new Set(ns.map((n) => valores(n, d))).size === 1) && new Set(ns.map((n) => [...n.numeros].sort().join(','))).size === 1 && new Set(ns.map((n) => [...n.codigos].sort().join(','))).size === 1;
      const dimsApres = ['massa', 'volume', 'pack'].filter((d) => ns.some((n) => n.medidas.has(d)));
      const sug = sugerirSobrevivente(ms, { escala }); const pos = new Map(sug.ordem.map((l, i) => [l, i]));
      const ordenados = [...ms].sort((a, b) => pos.get(a.linha)! - pos.get(b.linha)!);
      const ids = unicos(ordenados.flatMap((m) => m.produto.itens.map((i) => i.id)));
      const atual = { codigos: lista(ordenados.map((m) => m.codigo), 20), descricoes: lista(ordenados.map((m) => txt(m.descricao)), 3) };
      if (dimsCompos.length) {
        casos.push(novoCaso({ camada: 'DUPLICIDADE', tipo: 'ATRIBUTOS_CONFLITANTES', itens: ids, problema: `Mesmo nome com ${dimsCompos.includes('conc') ? 'concentração' : 'composição'} diferente em ${ordenados.length} códigos`,
          evidencia: [ev('Origem', 'Descrições da base importada'), ev('Nome comum', nome), ...ordenados.slice(0, 6).map((m) => ev(`Código ${m.codigo}`, txt(m.descricao)))], atual,
          proposta: { decisao: 'MANTER_DISTINTOS', decisoesPossiveis: DECISOES_DUPLICIDADE.join(' | ') }, impactos: ['Os itens não podem ser consolidados: produtos de composição diferente têm tratamento e crédito próprios'],
          justificativa: justificar('Produtos de mesmo nome e concentração/composição diferentes são produtos distintos, ainda que as descrições se pareçam.', 'manter distintos; se a descrição de algum estiver incompleta, pedir a informação ao cliente.') }));
      } else if (dimsApres.length && sameOther(['conc', 'pct', 'ui', 'compr', 'dim'].filter((d) => ns.some((n) => n.medidas.has(d)))) && dimsApres.some(diferem)) {
        const unico = (n: ReturnType<typeof normalizar>) => { const d = n.medidas.get('volume') ?? n.medidas.get('massa'); return d && d.size === 1 ? Number([...d][0]) : null; };
        const vs = ns.map(unico); const mesmaDim = ns.every((n) => n.medidas.has('volume')) || ns.every((n) => n.medidas.has('massa'));
        const proposta: CasoProposto['proposta'] = { decisao: 'RELACIONAR_APRESENTACOES', decisoesPossiveis: DECISOES_DUPLICIDADE.join(' | ') };
        if (ordenados.length === 2 && mesmaDim && vs[0] && vs[1]) proposta.fatorConversao = Math.round((Math.max(vs[0], vs[1]) / Math.min(vs[0], vs[1])) * 1e6) / 1e6;
        casos.push(novoCaso({ camada: 'DUPLICIDADE', tipo: 'APRESENTACOES_DISTINTAS', itens: ids, problema: `O mesmo produto em ${ordenados.length} apresentações (embalagens) diferentes`,
          evidencia: [ev('Origem', 'Descrições da base importada'), ev('Nome comum', nome), ...ordenados.slice(0, 6).map((m) => ev(`Código ${m.codigo}`, txt(m.descricao)))], atual, proposta,
          impactos: ['Relacionar apresentações altera unidades e conversões (SPED 0190/0220)'],
          justificativa: justificar('Mesmo produto em embalagens diferentes são itens distintos que se relacionam por conversão, não duplicidade a consolidar.', 'cadastrar a relação e o fator de conversão (ou unidade de compra); manter os códigos separados.') }));
      }
    }

    const motivos: string[] = [];
    if (!comTexto.length) motivos.push('nenhuma descrição utilizável');
    if (itens.length && !itens.some((i) => i.saldo != null) && !itens.some((i) => i.ultimaMovimentacao)) motivos.push('nenhum saldo nem data de movimentação na base: o impacto de consolidar (saldo e histórico) não foi avaliado');
    const semDados = motivos.length ? { motivo: `Duplicidade analisada com limitação: ${motivos.join('; ')}`, itens: itens.length } : null;
    return montarResultado('DUPLICIDADE', itens, casos, semDados);
  }
}
