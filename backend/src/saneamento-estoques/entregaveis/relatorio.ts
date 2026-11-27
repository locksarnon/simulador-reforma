/**
 * Relatório de fechamento (PDF padrão FAL/InTAX): monta o DocumentoPdf que o PdfService desenha. Abre com o RESULTADO em itens (o que muda no
 * cadastro) e as pendências em itens e por tipo; o detalhe por camada vem depois e as restrições do ERP vão num anexo resumido, com a fonte
 * como link curto. Todo texto sai de regras sobre os números reais da versão liberada. Só caracteres do alfabeto latino (a fonte padrão do
 * PDF não tem setas).
 */
import type { DocumentoPdf, SecaoPdf } from '../../pdf/pdf.service';
import type { DadosEntrega } from '../dados/portas';
import type { Camada } from '../tipos';
import {
  CASO_PENDENTE, ROTULO_CAMADA, celula, comMilhar, construirModelo, dataBr, nomeCliente, obj, origemDaFinalidade, pct1, rotuloDoCampo, rotuloObrigacao, rotuloTipoAjuste,
  rotuloTipoCaso, textoSemEscrituracaoEntregue, txt, mapaDoModelo, type Modelo,
} from './modelo';
import type { LinhaMapa } from './unificacoes';
import { perfilEspecifico, restricoesDoTipo, type PerfilErp } from '../../erps/logica';
import { tiposDeAjusteDoCaso } from '../dados/ajustes';
import { ROTULO_AJUSTE, type TipoAjuste } from '../fiscal/impactoSped';

const n = comMilhar;
/** Finalidade confirmada por decisão (do grupo, exceção ou do consultor); a só informada no cadastro não conta. */
const finalidadeConfirmada = (m: Modelo, i: Modelo['itens'][number]) => !!i.finalidade && !origemDaFinalidade(m, i).startsWith('Informada no cadastro');
const plural = (q: number, um: string, varios: string) => `${n(q)} ${q === 1 ? um : varios}`;
const parte = (a: number, b: number) => (b > 0 ? pct1(a / b) : '0,0%');
/** Quantas linhas a tabela de pendências por tipo mostra; o resto vira "Demais tipos". */
const MAX_TIPOS = 15;

const TIPOS_DECISAO: Record<string, string> = { aprovar: 'aprovações', rejeitar: 'rejeições', desfazer: 'reversões', importar: 'incorporações de reimportação' };

/** O que muda no cadastro, em itens: a abertura do relatório. */
export type Resultado = {
  itensInativar: number; unificacoes: number; codigosQueSaem: number; finalidadeDefinida: number; descricoes: number; unidades: number; ncm: number;
  enquadramentos: number; vinculos: number; itensAjustados: number;
};
export function resultadoDaEntrega(m: Modelo): Resultado {
  const valem = (l: LinhaMapa) => !m.liberada || l.situacao === 'APROVADA';
  const mapa = mapaDoModelo(m).filter(valem);
  const inativar = new Set<string>(); const casosUnif = new Set<string>(); let codigosQueSaem = 0;
  for (const l of mapa) {
    if (l.tipo === 'INATIVACAO' && l.morre) inativar.add(`${l.morre.codigo}\u0001${l.morre.estab}`);
    if (l.tipo === 'UNIFICACAO') { codigosQueSaem++; if (l.casoId) casosUnif.add(l.casoId); }
  }
  const alterou = (campo: string) => m.itens.filter((i) => i.camposAlterados.includes(campo)).length;
  const ajustados = new Set<string>(); for (const s of m.itensAjustadosPorCamada.values()) for (const id of s) ajustados.add(id);
  return {
    itensInativar: inativar.size, unificacoes: casosUnif.size, codigosQueSaem, finalidadeDefinida: m.itens.filter((i) => finalidadeConfirmada(m, i)).length,
    descricoes: alterou('descricao'), unidades: alterou('unidade'), ncm: alterou('ncm'),
    enquadramentos: m.itens.filter((i) => { const x = celula(m, i.id, 'TRIBUTARIO')?.situacao; return (x === 'APROVADO' || x === 'SEM_PROBLEMA') && !!txt(i.campos.cClassTrib ?? i.campos.c_class_trib); }).length,
    vinculos: m.vinculos.length, itensAjustados: ajustados.size,
  };
}

/** Pendências da versão por tipo de caso: itens distintos e grupos atingidos (o relatório fala em itens, não em casos). */
export type PendenciaPorTipo = { camada: string; tipo: string; itens: number; grupos: number; aguardando: number };
export function pendenciasPorTipo(m: Modelo): { porTipo: PendenciaPorTipo[]; itens: number; aguardando: number } {
  const g = new Map<string, { camada: string; tipo: string; itens: Set<string>; grupos: Set<string>; aguardando: Set<string> }>();
  const todos = new Set<string>(); const aguardando = new Set<string>();
  for (const c of m.casos) {
    if (!CASO_PENDENTE.includes(c.situacao)) continue;
    const k = `${c.camada}\u0001${c.tipo}`;
    let x = g.get(k); if (!x) { x = { camada: c.camada, tipo: c.tipo, itens: new Set(), grupos: new Set(), aguardando: new Set() }; g.set(k, x); }
    for (const id of c.itens) {
      x.itens.add(id); todos.add(id); x.grupos.add(m.porId.get(id)?.grupo || 'Sem grupo');
      if (c.situacao === 'AGUARDANDO_INFORMACAO') { x.aguardando.add(id); aguardando.add(id); }
    }
  }
  const porTipo = [...g.values()].map((x) => ({ camada: x.camada, tipo: x.tipo, itens: x.itens.size, grupos: x.grupos.size, aguardando: x.aguardando.size }))
    .sort((a, b) => b.itens - a.itens || a.tipo.localeCompare(b.tipo));
  return { porTipo, itens: todos.size, aguardando: aguardando.size };
}

function comentarioDaCamada(m: Modelo, camada: Camada): string | null {
  const c = m.porCamada.get(camada);
  const casos = m.casosPorCamada.get(camada) ?? {};
  const nCasos = Object.values(casos).reduce((s, x) => s + x, 0);
  if (!c) return null;
  const s = c.porSituacao;
  const pendentes = s.PENDENTE ?? 0;
  const analisados = c.total - pendentes;
  if (analisados === 0 && nCasos === 0) return camada === 'ESTOQUE' ? null : `${ROTULO_CAMADA[camada]}: camada ainda não executada para este cadastro; nenhum dos ${plural(c.total, 'item', 'itens')} foi analisado nela.`;

  const partes: string[] = [];
  partes.push(`${ROTULO_CAMADA[camada]}: ${n(analisados)} de ${n(c.total)} itens analisados (${parte(analisados, c.total)}), sendo ${n(s.SEM_PROBLEMA ?? 0)} sem problema e ${n(s.APROVADO ?? 0)} com ajuste aprovado.`);
  const ajustados = m.itensAjustadosPorCamada.get(camada)?.size ?? 0;
  if (ajustados) partes.push(`${plural(ajustados, 'item teve', 'itens tiveram')} campo ajustado por decisão aprovada.`);

  if (camada === 'DUPLICIDADE' || camada === 'QUALIDADE') {
    // Cada camada conta só as linhas que vêm dela: a inativação diz a origem (Duplicidades ou sem movimentação da Qualidade).
    const valem = (l: LinhaMapa) => !m.liberada || l.situacao === 'APROVADA';
    const mapa = mapaDoModelo(m);
    const comAlerta = (ls: LinhaMapa[]) => ls.filter((l) => l.alertas.length).length;
    if (camada === 'DUPLICIDADE') {
      const unif = mapa.filter((l) => l.tipo === 'UNIFICACAO' && valem(l));
      const inat = mapa.filter((l) => l.tipo === 'INATIVACAO' && l.origem === 'DUPLICIDADE' && valem(l));
      const alertas = comAlerta(unif);
      if (unif.length) partes.push(`${plural(unif.length, 'código deixa', 'códigos deixam')} de existir por unificação, com o saldo concentrado no código que fica (lista na aba "De para e equivalências" do Excel)${alertas ? `; ${plural(alertas, 'linha pede', 'linhas pedem')} conferência antes do ajuste (unidade diferente, saldo não informado ou conflito com inativação)` : ''}.`);
      if (inat.length) partes.push(`${plural(inat.length, 'código duplicado será inativado', 'códigos duplicados serão inativados')} sem unificação (mesma lista)${comAlerta(inat) ? `; ${plural(comAlerta(inat), 'linha pede', 'linhas pedem')} conferência do saldo antes` : ''}.`);
    } else {
      const inat = mapa.filter((l) => l.tipo === 'INATIVACAO' && l.origem === 'QUALIDADE' && valem(l));
      const alertas = comAlerta(inat);
      if (inat.length) partes.push(`${plural(inat.length, 'item sem movimentação desde o corte e sem saldo será inativado', 'itens sem movimentação desde o corte e sem saldo serão inativados')} (lista na aba "De para e equivalências" do Excel)${alertas ? `; ${plural(alertas, 'linha pede', 'linhas pedem')} conferência do saldo antes` : ''}.`);
    }
  }
  if (camada === 'DUPLICIDADE' && m.vinculos.length) partes.push(`${plural(m.vinculos.length, 'vínculo de código antigo e novo registrado', 'vínculos de código antigo e novo registrados')}, com data e justificativa.`);
  if (camada === 'GRUPOS_FINALIDADE') partes.push(`Finalidade confirmada em ${n(m.itens.filter((i) => finalidadeConfirmada(m, i)).length)} de ${n(m.itens.length)} itens.`);
  if (camada === 'NCM') partes.push(`NCM de 8 dígitos em ${n(m.itens.filter((i) => i.ncm.replace(/\D/g, '').length === 8).length)} de ${n(m.itens.length)} itens.`);
  if (camada === 'NOMES_UNIDADES') {
    const desc = m.itens.filter((i) => i.camposAlterados.includes('descricao')).length; const un = m.itens.filter((i) => i.camposAlterados.includes('unidade')).length;
    if (desc || un) partes.push(`Descrições alteradas: ${n(desc)}; unidades alteradas: ${n(un)}.`);
  }
  if (camada === 'TRIBUTARIO') {
    const comClasse = m.itens.filter((i) => { const x = celula(m, i.id, 'TRIBUTARIO')?.situacao; return (x === 'APROVADO' || x === 'SEM_PROBLEMA') && txt(i.campos.cClassTrib ?? i.campos.c_class_trib); }).length;
    const excecoes = m.casos.filter((x) => x.camada === 'TRIBUTARIO' && x.tipo.startsWith('EXCECAO') && x.situacao === 'APROVADO').length;
    partes.push(`Itens com cClassTrib aprovado ou conferido: ${n(comClasse)}; exceções por item aprovadas: ${n(excecoes)}.`);
  }
  if (camada === 'OBRIGACOES') partes.push(`${plural(m.impactos.length, 'linha de impacto registrada', 'linhas de impacto registradas')}.`);
  if (c.revisar) partes.push(`${plural(c.revisar, 'item marcado', 'itens marcados')} para nova revisão por dependência de outra camada.`);
  if (pendentes) partes.push(`${plural(pendentes, 'item ainda sem análise', 'itens ainda sem análise')} nesta camada.`);
  return partes.join(' ');
}

function secaoImpactoSped(m: Modelo): SecaoPdf {
  const tipos = ['CADASTRAL_FUTURO', 'REGULARIZACAO_SALDO', 'ESCRITURACAO_ENTREGUE'];
  const norm = (t: string) => (t === 'ESCRITURACAO_JA_ENTREGUE' ? 'ESCRITURACAO_ENTREGUE' : t);
  const porTipo = new Map<string, typeof m.impactos>();
  for (const i of m.impactos) { const k = norm(i.tipo); const l = porTipo.get(k); if (l) l.push(i); else porTipo.set(k, [i]); }
  const registros = (l: typeof m.impactos) => [...new Set(l.map((i) => i.registro).filter(Boolean))].sort().join(', ') || '-';
  const obrigacoes = (l: typeof m.impactos) => [...new Set(l.map((i) => rotuloObrigacao(i.obrigacao)))].join(', ') || '-';
  const s: SecaoPdf = { titulo: 'Impacto nas obrigações (SPED)', paragrafos: [], tabela: undefined };
  if (m.impactos.length === 0) {
    s.paragrafos = [
      'Nenhuma linha de impacto nas obrigações foi registrada nesta versão. Os ajustes aprovados no cadastro não geraram registro a conferir no SPED ou na NF-e, ou a camada de obrigações ainda não foi executada.',
      `Escrituração já entregue: ${textoSemEscrituracaoEntregue(m)}.`,
    ];
    return s;
  }
  const cad = porTipo.get('CADASTRAL_FUTURO') ?? []; const sal = porTipo.get('REGULARIZACAO_SALDO') ?? []; const ent = porTipo.get('ESCRITURACAO_ENTREGUE') ?? [];
  const outros = m.impactos.filter((i) => !tipos.includes(norm(i.tipo)));
  s.paragrafos = [
    `${plural(m.impactos.length, 'linha de impacto registrada', 'linhas de impacto registradas')}, classificadas em três grupos: ajuste cadastral futuro (vale a partir da data de início, sem mexer no que já foi escriturado), regularização de saldo (acerto de saldo, inventário ou correlação de códigos) e impacto em escrituração já entregue (período transmitido com o cadastro anterior).`,
    cad.length ? `Ajuste cadastral futuro: ${plural(cad.length, 'linha', 'linhas')} (${registros(cad)}). Atualizar o cadastro no ERP e nos arquivos das próximas competências.` : 'Ajuste cadastral futuro: nenhuma linha.',
    sal.length ? `Regularização de saldo: ${plural(sal.length, 'linha', 'linhas')} (${registros(sal)}). Conferir saldos, inventário e vínculo com documentos antes de aplicar.` : 'Regularização de saldo: nenhuma linha.',
    ent.length ? `Escrituração já entregue: ${plural(ent.length, 'linha', 'linhas')} (${registros(ent)}). Avaliar se os períodos anteriores precisam de retificação; a retificação e a transmissão não fazem parte deste serviço e exigem análise e autorização próprias.` : `Escrituração já entregue: ${textoSemEscrituracaoEntregue(m)}.`,
  ];
  if (outros.length) s.paragrafos.push(`${plural(outros.length, 'linha sem tipo de ajuste reconhecido', 'linhas sem tipo de ajuste reconhecido')}: classificar antes de aplicar.`);
  const anteriores = m.impactos.filter((i) => i.avaliarAnteriores).length;
  const semLeiaute = m.impactos.filter((i) => !i.leiaute || /n[aã]o confirmado/i.test(i.leiaute)).length;
  if (anteriores) s.paragrafos.push(`${plural(anteriores, 'linha pede', 'linhas pedem')} avaliação de períodos anteriores.`);
  if (semLeiaute) s.paragrafos.push(`Em ${plural(semLeiaute, 'linha', 'linhas')} a versão do leiaute ainda não foi confirmada no guia oficial vigente: conferir registro e campo antes de usar.`);
  s.tabela = {
    cabecalho: ['Tipo de ajuste', 'Linhas', 'Obrigações', 'Registros'], larguras: [0.34, 0.1, 0.3, 0.26],
    linhas: tipos.map((t) => { const l = porTipo.get(t) ?? []; return [rotuloTipoAjuste(t), n(l.length), obrigacoes(l), registros(l)]; }),
  };
  return s;
}

/** Texto curto do link da fonte: o domínio, sem "www." ("help.sap.com"); endereço inválido fica como veio. */
export function linkCurto(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/**
 * Anexo "Particularidades do ERP <nome>": as restrições do perfil do ERP (Cadastro de ERPs) para os tipos de ajuste dos casos aprovados, com o
 * grau e a fonte (link curto, clicável). Sem perfil específico (A_DESENVOLVER ou Outro ERP) ou sem restrição aplicável: o anexo não entra.
 */
export function secaoParticularidadesErp(m: Pick<Modelo, 'casos'>, perfil: PerfilErp | null | undefined): SecaoPdf | null {
  if (!perfilEspecifico(perfil)) return null;
  const tipos = new Set<string>();
  for (const c of m.casos) if (c.situacao === 'APROVADO') for (const t of tiposDeAjusteDoCaso(c)) tipos.add(t);
  const r = restricoesDoTipo(perfil, [...tipos]);
  if (!r.length) return null;
  return {
    titulo: `Anexo: particularidades do ERP ${perfil.nome}`,
    paragrafos: ['Restrições do ERP para os ajustes aprovados (Cadastro de ERPs). "Não confirmado" = sem fonte oficial que o afirme: conferir com o fornecedor antes de aplicar.'],
    tabela: {
      cabecalho: ['Ajuste', 'Restrição', 'Grau', 'Fonte'], larguras: [0.19, 0.47, 0.13, 0.21],
      linhas: r.map((i) => [ROTULO_AJUSTE[i.tipo_ajuste as TipoAjuste] ?? txt(i.tipo_ajuste), i.texto, i.grau === 'CONFIRMADO' ? 'Confirmado' : 'Não confirmado', i.fonte_url ? linkCurto(i.fonte_url) : '-']),
      links: r.map((i) => [null, null, null, i.fonte_url || null]),
    },
  };
}

export function montarRelatorio(dados: DadosEntrega): DocumentoPdf {
  const m = construirModelo(dados);
  const v = dados.versao;
  const cliente = nomeCliente(m);
  const totalItens = m.itens.length;
  const completos = m.itens.filter((i) => m.camadas.every((c) => (celula(m, i.id, c)?.situacao ?? 'PENDENTE') !== 'PENDENTE')).length;
  const r = resultadoDaEntrega(m);
  const pend = pendenciasPorTipo(m);

  const secoes: SecaoPdf[] = [];

  // Resultado (abre o relatório): o que muda no cadastro, em itens
  const resultado: string[] = [];
  if (r.itensInativar) resultado.push(`${plural(r.itensInativar, 'item a inativar', 'itens a inativar')} (sem movimentação desde o corte ou duplicados sem unificação).`);
  if (r.unificacoes) resultado.push(`${plural(r.unificacoes, 'unificação', 'unificações')}: ${plural(r.codigosQueSaem, 'código deixa', 'códigos deixam')} de existir, com o saldo levado ao código que fica.`);
  if (r.finalidadeDefinida) resultado.push(`Finalidade definida para ${plural(r.finalidadeDefinida, 'item', 'itens')} (${parte(r.finalidadeDefinida, totalItens)} do cadastro).`);
  if (r.descricoes) resultado.push(`${plural(r.descricoes, 'descrição padronizada', 'descrições padronizadas')}.`);
  if (r.unidades) resultado.push(`${plural(r.unidades, 'unidade ajustada', 'unidades ajustadas')}.`);
  if (r.ncm) resultado.push(`${plural(r.ncm, 'NCM corrigido', 'NCM corrigidos')}.`);
  if (r.enquadramentos) resultado.push(`Enquadramento tributário (cClassTrib) aprovado ou conferido em ${plural(r.enquadramentos, 'item', 'itens')}.`);
  if (r.vinculos) resultado.push(`${plural(r.vinculos, 'vínculo de código antigo e novo registrado', 'vínculos de código antigo e novo registrados')}, com data e justificativa.`);
  if (!resultado.length) resultado.push('Nenhuma alteração do cadastro foi aprovada até esta versão.');
  const marcadasRevisar = [...m.porCamada.values()].reduce((s, x) => s + x.revisar, 0);
  secoes.push({
    titulo: 'Resultado da entrega',
    paragrafos: [`Cadastro de ${cliente} com ${plural(totalItens, 'item', 'itens')}; na versão ${v?.numero ?? '-'} (${txt(v?.rotulo)}), ${plural(r.itensAjustados, 'item teve', 'itens tiveram')} campo ajustado por decisão aprovada.`],
    destaques: [
      { rotulo: 'Itens a inativar', valor: n(r.itensInativar), detalhe: parte(r.itensInativar, totalItens) },
      { rotulo: 'Unificações', valor: n(r.unificacoes), detalhe: plural(r.codigosQueSaem, 'código sai', 'códigos saem') },
      { rotulo: 'Finalidade definida', valor: n(r.finalidadeDefinida), detalhe: `de ${n(totalItens)} itens` },
    ],
    itens: [
      ...resultado,
      ...(marcadasRevisar ? [`Atenção: ${plural(marcadasRevisar, 'célula continua marcada', 'células continuam marcadas')} para revisão (a decisão anterior depende de dado que mudou); esses itens saem como "Aguardando revisão" e não como aprovados.`] : []),
    ],
  });

  // Pendências em itens e por tipo
  const linhasPend = pend.porTipo.slice(0, MAX_TIPOS).map((x) => [rotuloTipoCaso(x.tipo), ROTULO_CAMADA[x.camada as Camada] ?? x.camada, n(x.itens), n(x.grupos), x.aguardando ? n(x.aguardando) : '-']);
  const demais = pend.porTipo.slice(MAX_TIPOS);
  if (demais.length) linhasPend.push([`Demais tipos (${n(demais.length)})`, '-', n(demais.reduce((s, x) => s + x.itens, 0)), '-', '-']);
  secoes.push({
    titulo: 'Pendências',
    paragrafos: pend.itens
      ? [`${plural(pend.itens, 'item tem', 'itens têm')} alguma pendência (${parte(pend.itens, totalItens)} do cadastro), em ${plural(pend.porTipo.length, 'tipo', 'tipos')}; ${plural(pend.aguardando, 'item depende', 'itens dependem')} de informação do cliente. Não integram esta entrega; a lista por tipo e grupo está na aba "Pendências e histórico" do Excel. Um item pode aparecer em mais de um tipo.`]
      : ['Não há pendência nesta versão.'],
    tabela: pend.itens ? { cabecalho: ['Tipo de pendência', 'Camada', 'Itens', 'Grupos', 'Aguardando o cliente'], larguras: [0.36, 0.22, 0.13, 0.12, 0.17], linhas: linhasPend } : undefined,
  });

  // Itens recebidos e analisados
  const imp = m.dados.importacoes.map((i) => obj(i));
  secoes.push({
    titulo: 'Itens recebidos e analisados',
    destaques: [
      { rotulo: 'Itens recebidos', valor: n(totalItens), detalhe: `${plural(m.camadas.length, 'camada', 'camadas')} de análise` },
      { rotulo: 'Com todas as camadas analisadas', valor: n(completos), detalhe: parte(completos, totalItens) },
      { rotulo: 'Com campo ajustado', valor: n(r.itensAjustados), detalhe: parte(r.itensAjustados, totalItens) },
    ],
    tabela: imp.length ? {
      cabecalho: ['Arquivo importado', 'Data', 'Aceitas', 'Rejeitadas', 'Pendentes'], larguras: [0.4, 0.16, 0.14, 0.15, 0.15],
      linhas: imp.slice(0, 20).map((i) => [txt(i.arquivo), dataBr(i.createdAt), n(Number(i.aceitas) || 0), n(Number(i.rejeitadas) || 0), n(Number(i.pendentes) || 0)]),
    } : undefined,
  });

  // Situação por camada, em itens
  secoes.push({
    titulo: 'Situação por camada (itens)',
    paragrafos: ['Situação de cada item em cada camada de análise: aprovado é o ajuste que o consultor decidiu aplicar; pendente é o que ainda não foi decidido ou depende de informação.'],
    tabela: {
      cabecalho: ['Camada', 'Analisados', 'Sem problema', 'Ajuste aprovado', 'Pendentes', 'Aguardando informação'], larguras: [0.26, 0.14, 0.15, 0.15, 0.14, 0.16],
      linhas: m.camadas.map((c) => {
        const x = m.porCamada.get(c)!; const s = x.porSituacao;
        return [ROTULO_CAMADA[c], parte(x.total - (s.PENDENTE ?? 0), x.total), n(s.SEM_PROBLEMA ?? 0), n(s.APROVADO ?? 0), n((s.PENDENTE ?? 0) + (s.PROPOSTO ?? 0)), n(s.AGUARDANDO_INFORMACAO ?? 0)];
      }),
    },
  });

  // Revisões executadas
  const porTipo = new Map<string, number>(); const porCampo = new Map<string, number>(); const quem = new Set<string>();
  for (const d of m.decisoes) {
    porTipo.set(d.tipo, (porTipo.get(d.tipo) ?? 0) + 1);
    if (d.usuario) quem.add(d.usuario);
    if (d.tipo === 'aprovar' && !d.campo.startsWith('caso:')) porCampo.set(d.campo, (porCampo.get(d.campo) ?? 0) + 1);
  }
  // menor e maior data num laço: Math.min(...lista) estoura a pilha com centenas de milhares de decisões
  let menorData = Infinity; let maiorData = -Infinity;
  for (const d of m.decisoes) {
    if (!d.quando) continue;
    const t = Number(d.quando);
    if (t < menorData) menorData = t;
    if (t > maiorData) maiorData = t;
  }
  const temDatas = Number.isFinite(menorData);
  const detalheTipos = [...porTipo].map(([t, q]) => `${n(q)} ${TIPOS_DECISAO[t] ?? t}`).join(', ');
  secoes.push({
    titulo: 'Revisões executadas',
    paragrafos: m.decisoes.length
      ? [`${plural(m.decisoes.length, 'registro', 'registros')} no histórico de alterações (${detalheTipos}), feitos por ${plural(quem.size, 'pessoa', 'pessoas')}${temDatas ? `, entre ${dataBr(new Date(menorData))} e ${dataBr(new Date(maiorData))}` : ''}. Cada alteração guarda o valor anterior, o novo valor, o fundamento, o responsável e a data.`]
      : ['Nenhuma alteração foi aplicada ao cadastro até esta versão.'],
    tabela: porCampo.size ? {
      cabecalho: ['Campo alterado', 'Alterações aprovadas'], larguras: [0.6, 0.4],
      linhas: [...porCampo].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, q]) => [rotuloDoCampo(c), n(q)]),
    } : undefined,
  });

  // Comentário por aspecto
  const comentarios = m.camadas.map((c) => comentarioDaCamada(m, c)).filter((x): x is string => !!x);
  secoes.push({ titulo: 'Comentário por aspecto tratado', paragrafos: comentarios.length ? comentarios : ['Nenhuma camada foi analisada até esta versão.'] });

  secoes.push(secaoImpactoSped(m));

  // Limitações
  const itens: string[] = [];
  if (m.impactosExcluidos) itens.push(`${plural(m.impactosExcluidos, 'linha de impacto no SPED', 'linhas de impacto no SPED')} ligada${m.impactosExcluidos === 1 ? '' : 's'} a ajuste não aprovado: fora desta entrega.`);
  const incompletas = m.camadas.filter((c) => { const x = m.porCamada.get(c)!; return (x.porSituacao.PENDENTE ?? 0) > 0; });
  if (incompletas.length) itens.push(`Análise incompleta em: ${incompletas.map((c) => `${ROTULO_CAMADA[c]} (${parte(m.porCamada.get(c)!.total - (m.porCamada.get(c)!.porSituacao.PENDENTE ?? 0), totalItens)} analisados)`).join('; ')}.`);
  const semFin = totalItens - r.finalidadeDefinida; const semNcm = m.itens.filter((i) => i.ncm.replace(/\D/g, '').length !== 8).length;
  if (semFin) itens.push(`${plural(semFin, 'item sem finalidade confirmada', 'itens sem finalidade confirmada')}: o enquadramento por cenário depende dela.`);
  if (semNcm) itens.push(`${plural(semNcm, 'item sem NCM de 8 dígitos', 'itens sem NCM de 8 dígitos')}: sem o NCM o enquadramento legal não é definido.`);
  const corte = obj(dados.projeto.parametros).corteMovimentacao;
  if (!(typeof corte === 'string' && corte)) itens.push('Itens sem movimentação a longa data: critério não aplicado, porque o corte de movimentação não foi definido na configuração do projeto.');
  const mod = obj(dados.projeto.modulos);
  const desligados = [mod.conciliacao === true ? '' : 'conciliação de estoque', mod.blocosKG === true ? '' : 'Blocos K e G', mod.arquivoErp === true ? '' : 'arquivo para o ERP'].filter(Boolean);
  if (desligados.length) itens.push(`Fora do escopo desta entrega: ${desligados.join(', ')}. O trabalho cobre o cadastro e o tratamento tributário dos itens, não a movimentação do estoque.`);
  itens.push('A análise se apoia na legislação e nas tabelas oficiais carregadas no sistema na data da versão; mudança posterior de norma ou de leiaute exige nova conferência.');
  secoes.push({ titulo: 'Limitações', itens });

  // Versão liberada
  const fotoCelulas = dados.celulas.length;
  secoes.push({
    titulo: 'Versão liberada',
    paragrafos: [
      `Versão ${v?.numero ?? '-'} — ${txt(v?.rotulo)}${v ? `, liberada em ${dataBr(v.criadaEm)}` : ''}. A versão congela ${plural(totalItens, 'item', 'itens')} e ${plural(fotoCelulas, 'situação de camada', 'situações de camada')}; somente decisões aprovadas até essa data compõem a entrega, e o Excel desta versão traz o cadastro saneado, o de/para de códigos, os cenários tributários, os impactos no SPED, as pendências e o histórico das alterações aprovadas.`,
    ],
    destaques: [
      { rotulo: 'Itens ajustados', valor: n(r.itensAjustados), detalhe: `de ${n(totalItens)} itens` },
      { rotulo: 'Itens com pendência', valor: n(pend.itens), detalhe: `${n(pend.aguardando)} aguardando o cliente` },
      { rotulo: 'Impactos SPED', valor: n(m.impactos.length), detalhe: `${n(m.vinculos.length)} vínculos de código` },
    ],
  });

  const erp = secaoParticularidadesErp(m, dados.perfilErp);
  if (erp) secoes.push(erp);

  const subtitulo = [cliente, `Data-base ${dataBr(dados.projeto.data_base)}`, v ? `Versão ${v.numero}: ${v.rotulo}` : ''].filter(Boolean).join('  ·  ');
  return {
    titulo: 'Relatório de fechamento: saneamento de estoques e cadastro de produtos',
    marca: 'Consultoria tributária · FAL Agro',
    subtitulo,
    secoes,
    aviso: 'Material de apoio à decisão do cliente e do consultor; não constitui parecer jurídico nem tributário. As conclusões refletem o cadastro recebido e a legislação carregada na data da versão. A conferência final, a aplicação dos ajustes no ERP e a escrituração são de responsabilidade do contribuinte.',
  };
}
