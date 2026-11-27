/**
 * Excel de 6 abas do Saneamento de Estoques, em modo de escrita em fluxo (ExcelJS WorkbookWriter): 30 mil itens sem montar a planilha inteira na memória.
 * Códigos, NCM e identificadores são texto (valor string + formato "@"), preservando zeros à esquerda. Datas são datas de verdade, no relógio de
 * São Paulo (formato.ts).
 *
 * Entrega liberada (vai ao cliente) = só dado aprovado, sem coluna vazia nem identificador interno: cenários só com enquadramento concluído
 * (os demais viram contagem no Resumo, por motivo), "Devolução" só quando difere da aquisição, pendências agrupadas por tipo e grupo e o
 * histórico só das decisões aprovadas. Exportação para revisão (ferramenta interna) = completa, com o proposto marcado (aba laranja, coluna "Marca").
 */
import ExcelJS from 'exceljs';
import { PassThrough } from 'node:stream';
import type { DadosEntrega } from '../dados/portas';
import { ROTULO_FINALIDADE, type Camada } from '../tipos';
import {
  CAMADAS_FASE2, CASO_PENDENTE, MARCA_PROPOSTA, ROTULO_CAMADA, ROTULO_SITUACAO_CASO, TEXTO_FASE2_SEPARADA, celula, cenarioEnquadrado, codigosDosItens, comMilhar, competenciaBr, competenciaEntregue, construirModelo,
  dataBr, dataExcel, devolucaoIgualAquisicao, linhasDeCenario, lista, nomeCliente, obj, origemDaFinalidade, projetoTexto, propostasEmAberto, resumoCampos, rotuloDoCaso, rotuloObrigacao,
  rotuloSituacaoCelula, rotuloDoCampo, rotuloDoValor, rotuloTipoAjuste, rotuloTipoCaso, textoSemEscrituracaoEntregue, txt, mapaDoModelo, valorNoTrabalho, type ItemN, type LinhaCenario, type Modelo,
} from './modelo';
import {
  ROTULO_INATIVACAO, ROTULO_LISTA, ROTULO_SITUACAO_CONFLITO, ROTULO_SITUACAO_MAPA, ROTULO_TIPO_MAPA, TIPOS_DA_LISTA, conflitosDoMapa, linhaExecutavel, saldoDe, type LinhaMapa, type ListaMapa, type ParConflito,
} from './unificacoes';
import { escalaDaBase } from '../motor/conjuntos';
import { pendenciasPorTipo } from './relatorio';
import { LINHAS_LOGO_FAL, logoFalNoXlsx, reservarLinhaLogoFal } from '../../marca/logo-fal';

/** Nota visível do mapa quando a base traz o saldo multiplicado (mesma escala da Duplicidade): os saldos do mapa já estão divididos. */
export const notaDaEscala = (escala: number) => `Saldos divididos por ${escala.toLocaleString('pt-BR')} (escala detectada na base: o ERP mostra os valores multiplicados)`;
const SALDOS_DO_MAPA = new Set(['Saldo (código que sai)', 'Saldo atual (código que fica)', 'Saldo que entra', 'Saldo consolidado', 'Saldo']);

type Valor = string | number | Date | null | undefined;
type TipoCol = 'texto' | 'codigo' | 'data' | 'datahora' | 'numero' | 'quantidade';
/** `sempre`: a coluna fica mesmo vazia (a chave da linha). */
type Col = { cab: string; larg: number; tipo?: TipoCol; sempre?: boolean };
/** `cores`: fundo por célula (mesmo índice de `v`), por cima do destaque da linha (ex.: a célula alterada na base antes × depois). */
type LinhaV = { v: Valor[]; destaque?: boolean; cores?: (string | undefined)[] };

export const NOMES_ABAS = ['Resumo da entrega', 'Cadastro saneado', 'De para e equivalências', 'Cenários tributários', 'Impactos no SPED', 'Pendências e histórico'] as const;
/** Entrega da Fase 1: as mesmas abas, sem "Cenários tributários". */
export const NOMES_ABAS_FASE1 = NOMES_ABAS.filter((n) => n !== 'Cenários tributários');

const VERDE = 'FF197148'; const LARANJA = 'FFE08A00'; const AMARELO = 'FFFFF2CC'; const CINZA = 'FFF2F5F3'; const VERMELHO = 'FFB00020';
/** Célula ajustada pelo saneamento (base antes × depois): verde suave, diferente do amarelo do proposto. */
export const VERDE_CLARO = 'FFE2F0D9';
/**
 * Compressão rápida do zip (nível 1): o XML das planilhas comprime quase tanto quanto no nível padrão e a geração de 30 mil itens × 40 colunas
 * cai pela metade (a compressão era a maior parte do tempo).
 */
const ZIP_RAPIDO = { zlib: { level: 1 } } as never;
/** Padrão FAL: Arial em todas as abas (cabeçalho e dados). */
const FONTE = 'Arial';
/**
 * Arial como a fonte padrão do arquivo (a fonte zero do styles.xml, que vale para toda célula sem fonte própria). Fonte por célula custaria um
 * estilo por célula: com 30 mil linhas × 40 colunas, o arquivo levava o dobro do tempo.
 */
function fontePadraoArial(wb: ExcelJS.stream.xlsx.WorkbookWriter): void {
  const estilos = (wb as unknown as { styles?: { model?: { fonts?: unknown[] }; _addFont?: (f: Partial<ExcelJS.Font>) => number } }).styles;
  if (estilos?._addFont && estilos.model?.fonts?.length === 0) estilos._addFont({ name: FONTE, size: 10, family: 2 });
}
const FMT: Record<TipoCol, string | undefined> = { texto: undefined, codigo: '@', data: 'dd/mm/yyyy', datahora: 'dd/mm/yyyy hh:mm', numero: '#,##0', quantidade: '#,##0.00##' };
const vazio = (v: Valor) => v === undefined || v === null || v === '';

/**
 * Um objeto de estilo por combinação (formato × fundo), o mesmo para todas as células: o ExcelJS reconhece o objeto já visto e não recalcula o
 * estilo célula a célula (com 30 mil linhas × 40 colunas, era boa parte do tempo da geração).
 */
const ESTILOS = new Map<string, Partial<ExcelJS.Style>>();
function estiloCompartilhado(fmt: string | undefined, fundo: string | undefined): Partial<ExcelJS.Style> {
  const k = `${fmt ?? ''}|${fundo ?? ''}`;
  let e = ESTILOS.get(k);
  if (!e) {
    e = {};
    if (fmt) e.numFmt = fmt;
    if (fundo) e.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fundo } };
    ESTILOS.set(k, Object.freeze(e) as Partial<ExcelJS.Style>);
  }
  return e;
}

type Aba = { ws: ExcelJS.Worksheet; cols: Col[]; linhas: number; add(valores: Valor[], destaque?: boolean, cores?: (string | undefined)[]): void; fim(): void };

function criarAba(wb: ExcelJS.stream.xlsx.WorkbookWriter, nome: string, cols: Col[], cor: string, congelarColunas: number): Aba {
  // Logo da FAL na linha 1; títulos na linha 2 (o congelamento inclui as duas).
  const ws = wb.addWorksheet(nome, { properties: { tabColor: { argb: cor } }, views: [{ state: 'frozen', xSplit: congelarColunas, ySplit: 1 + LINHAS_LOGO_FAL }] });
  ws.columns = cols.map((c) => ({ width: c.larg }));
  reservarLinhaLogoFal(ws);
  const cab = ws.addRow(cols.map((c) => c.cab));
  cab.height = 30;
  cab.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: FONTE, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  cab.commit();
  const aba: Aba = {
    ws, cols, linhas: 0,
    add(valores, destaque, cores) {
      const row = ws.addRow(valores.map((v) => (vazio(v) ? null : v)));
      for (let i = 0; i < cols.length; i++) {
        const v = valores[i]; const cor = cores?.[i];
        if (vazio(v) && !cor) continue;
        const fmt = vazio(v) ? undefined : FMT[cols[i].tipo ?? 'texto'];
        const fundo = cor ?? (destaque ? AMARELO : undefined);
        // Sem formato nem fundo, a célula também recebe o objeto compartilhado (vazio): senão o ExcelJS calcula o estilo de cada uma.
        // Data sem formato fica com o estilo próprio (o ExcelJS dá a ela o formato de data padrão).
        if (fmt || fundo || !(v instanceof Date)) row.getCell(i + 1).style = estiloCompartilhado(fmt, fundo);
      }
      row.commit();
      aba.linhas++;
    },
    fim() {
      const ate = Math.max(2, aba.linhas + 1) + LINHAS_LOGO_FAL;
      ws.autoFilter = { from: { row: 1 + LINHAS_LOGO_FAL, column: 1 }, to: { row: ate, column: cols.length } } as never;
      ws.commit();
    },
  };
  return aba;
}

/**
 * A cada mil linhas devolve a vez ao laço de eventos: o zip comprime e solta o XML já escrito. Num laço síncrono, as linhas de todas as abas
 * ficavam acumuladas na memória até o fim (190 mil linhas de histórico, só elas, eram centenas de MB).
 */
const respirar = (aba: Aba): Promise<void> | undefined => (aba.linhas % 1000 === 0 ? new Promise<void>((ok) => setImmediate(ok)) : undefined);

/**
 * Escreve uma aba a partir de um gerador de linhas. Com `tirarVazias` (entrega liberada), passa duas vezes pelo gerador: a primeira só marca as
 * colunas com algum valor; a segunda escreve sem as colunas totalmente vazias (as marcadas `sempre` ficam). Sem linha nenhuma, ficam todas.
 */
async function escreverAba(
  wb: ExcelJS.stream.xlsx.WorkbookWriter, nome: string, cols: Col[], gerar: () => Iterable<LinhaV>,
  o: { cor: string; congelar: number; tirarVazias: boolean; depois?: (aba: Aba) => void; usadas?: boolean[] },
): Promise<Aba> {
  let manter = cols.map((_, i) => i);
  // `usadas`: quem chama já sabe quais colunas têm valor (a base de 30 mil itens não passa duas vezes pelo gerador).
  if (o.tirarVazias && o.usadas) manter = manter.filter((i) => cols[i].sempre === true || o.usadas![i]);
  else if (o.tirarVazias) {
    const usado = cols.map((c) => c.sempre === true); let algum = false;
    for (const l of gerar()) { algum = true; for (let i = 0; i < cols.length; i++) if (!usado[i] && !vazio(l.v[i])) usado[i] = true; }
    if (algum) manter = manter.filter((i) => usado[i]);
  }
  const congelar = manter.filter((i) => i < o.congelar).length;
  const aba = criarAba(wb, nome, manter.map((i) => cols[i]), o.cor, congelar);
  for (const l of gerar()) { aba.add(manter.map((i) => l.v[i]), l.destaque, l.cores ? manter.map((i) => l.cores![i]) : undefined); await respirar(aba); }
  o.depois?.(aba);
  aba.fim();
  return aba;
}

const valorLegivel = (v: unknown) => (typeof v === 'string' ? rotuloDoValor(v) : txt(v));
const sn = (b: boolean | null) => (b === null ? '' : b ? 'Sim' : 'Não');
const ROTULO_FINALIDADE_TXT: Record<string, string> = ROTULO_FINALIDADE;
const rotuloFin = (f: string | null) => (f ? ROTULO_FINALIDADE_TXT[f] ?? f : '');

// ── Cenários da entrega liberada (calculados antes do Resumo, que traz a contagem do que ficou fora) ─────────────

type Cenarios = { porItem: { it: ItemN; linhas: LinhaCenario[] }[]; fora: Map<string, number>; devolucoesOmitidas: number; itensComEnquadramento: number };
function cenariosDaEntrega(m: Modelo): Cenarios {
  const porItem: Cenarios['porItem'] = []; const fora = new Map<string, number>();
  let devolucoesOmitidas = 0; let itensComEnquadramento = 0;
  for (const it of m.itens) {
    const todas = linhasDeCenario(m, it);
    const enq = todas.filter(cenarioEnquadrado);
    if (!enq.length) {
      const motivo = todas[0]?.motivoFora || 'Enquadramento ainda não aprovado';
      fora.set(motivo, (fora.get(motivo) ?? 0) + 1);
      continue;
    }
    itensComEnquadramento++;
    const linhas = enq.filter((l) => { const igual = devolucaoIgualAquisicao(enq, l); if (igual) devolucoesOmitidas++; return !igual; });
    porItem.push({ it, linhas });
  }
  return { porItem, fora, devolucoesOmitidas, itensComEnquadramento };
}

// ── Resumo ───────────────────────────────────────────────────────────────────

type LinhaResumo = { k: 'titulo' | 'alerta' | 'secao' | 'par' | 'cab' | 'linha' | 'total' | 'vazio' | 'nota'; v: Valor[]; pct?: number[] };

/** Exportação para revisão: a base de agora, dizendo qual foi a última versão liberada (ou que ainda não há nenhuma). */
export function textoDaBaseAtual(ultima: DadosEntrega['ultimaLiberada']): string {
  if (!ultima) return 'Base atual, para revisão (nenhuma versão liberada ainda)';
  return `Base atual, para revisão (inclui o que mudou depois da última versão liberada: Versão ${ultima.numero} — ${ultima.rotulo}, liberada em ${dataBr(ultima.criadaEm)})`;
}

/** Item com alguma camada ainda não aprovada nem sem problema. */
const itemComPendencia = (m: Modelo, it: ItemN) => m.camadas.some((c) => { const s = celula(m, it.id, c)?.situacao ?? 'PENDENTE'; return s !== 'APROVADO' && s !== 'SEM_PROBLEMA'; });

function linhasResumo(m: Modelo, dados: DadosEntrega, cen: Cenarios | null): LinhaResumo[] {
  const L: LinhaResumo[] = [];
  const p = dados.projeto;
  const nomeVersao = dados.versao ? `Versão ${dados.versao.numero} — ${dados.versao.rotulo}` : null;
  L.push({ k: 'titulo', v: [m.liberada ? 'Saneamento de estoques e cadastro de produtos — Entrega liberada' : 'Saneamento de estoques e cadastro de produtos — Exportação para revisão'] });
  if (!m.liberada) L.push({ k: 'alerta', v: ['EXPORTAÇÃO PARA REVISÃO: inclui itens e ajustes ainda propostos, não aprovados (marcados em amarelo e na coluna "Marca"). Não é a entrega liberada.'] });
  else if ([...m.porCamada.values()].some((x) => x.revisar > 0)) L.push({ k: 'alerta', v: [`ATENÇÃO: ${comMilhar([...m.porCamada.values()].reduce((s, x) => s + x.revisar, 0))} célula(s) estão marcadas para revisão (a decisão anterior depende de dado que mudou). Esses itens saem como "Aguardando revisão", não como aprovados.`] });
  if (m.liberada) L.push({ k: 'nota', v: ['Entrega liberada: contém somente dados aprovados. O que ainda é proposto ou depende de informação ficou de fora e está resumido abaixo e na aba "Pendências e histórico".'] });
  if (m.soFase1) L.push({ k: 'nota', v: [TEXTO_FASE2_SEPARADA] });
  L.push({ k: 'vazio', v: [] });

  L.push({ k: 'secao', v: ['Identificação da entrega'] });
  const par = (k: string, v: Valor) => L.push({ k: 'par', v: [k, v] });
  par('Cliente', nomeCliente(m));
  if (projetoTexto(m, 'clienteDocumento')) par('CNPJ/CPF', projetoTexto(m, 'clienteDocumento'));
  if (projetoTexto(m, 'diagnosticoNome')) par('Projeto de consultoria', projetoTexto(m, 'diagnosticoNome'));
  par('Escopo', m.soFase1 ? `Fase 1 — saneamento de estoques e cadastro de produtos: ${comMilhar(m.itens.length)} itens do cadastro` : `Saneamento de estoques e cadastro de produtos com foco em IBS e CBS: ${comMilhar(m.itens.length)} itens do cadastro`);
  par('Data-base', dataBr(p.data_base) || '—');
  // Nome do Cadastro de ERPs (o gravado na foto, senão o do perfil); sem cadastro, o texto antigo.
  par('ERP', [txt(p.erp_nome) || txt(dados.perfilErp?.nome) || txt(p.erp), txt(p.erp_versao)].filter(Boolean).join(' ') || '—');
  const estabs = Array.isArray(p.estabelecimentos) ? (p.estabelecimentos as unknown[]).map(txt).filter(Boolean) : [];
  par('Estabelecimentos', estabs.length ? estabs.join(', ') : 'Único');
  par('Versão', nomeVersao ?? textoDaBaseAtual(dados.ultimaLiberada));
  if (dados.versao) par('Versão liberada em', dataBr(dados.versao.criadaEm, { hora: true }));
  par('Responsável', txt(p.responsavel) || '—');
  if (!m.soFase1 && txt(p.atividades_confirmadas_por)) par('Atividades confirmadas por', `${txt(p.atividades_confirmadas_por)} em ${dataBr(p.atividades_confirmadas_em)}`);
  par('Gerado em', dataBr(new Date(), { hora: true }));
  const mod = obj(p.modulos);
  par('Módulos opcionais ligados', [mod.conciliacao === true ? 'Conciliação de estoque' : '', mod.blocosKG === true ? 'Blocos K/G' : '', mod.arquivoErp === true ? 'Arquivo para o ERP' : ''].filter(Boolean).join(', ') || 'Nenhum');
  L.push({ k: 'vazio', v: [] });

  L.push({ k: 'secao', v: ['Situação por camada (itens)'] });
  L.push({ k: 'cab', v: ['Camada', 'Itens', 'Pendente', 'Sem problema', 'Proposto', 'Aprovado', 'Aguardando informação', 'Analisados (%)', 'Marcados para revisar'] });
  const tot = { itens: 0, PENDENTE: 0, SEM_PROBLEMA: 0, PROPOSTO: 0, APROVADO: 0, AGUARDANDO_INFORMACAO: 0, revisar: 0 };
  for (const camada of m.camadas) {
    const c = m.porCamada.get(camada)!; const s = c.porSituacao;
    const analisados = c.total - (s.PENDENTE ?? 0);
    L.push({ k: 'linha', v: [ROTULO_CAMADA[camada], c.total, s.PENDENTE ?? 0, s.SEM_PROBLEMA ?? 0, s.PROPOSTO ?? 0, s.APROVADO ?? 0, s.AGUARDANDO_INFORMACAO ?? 0, c.total ? analisados / c.total : 0, c.revisar], pct: [8] });
    tot.itens += c.total; tot.PENDENTE += s.PENDENTE ?? 0; tot.SEM_PROBLEMA += s.SEM_PROBLEMA ?? 0; tot.PROPOSTO += s.PROPOSTO ?? 0; tot.APROVADO += s.APROVADO ?? 0;
    tot.AGUARDANDO_INFORMACAO += s.AGUARDANDO_INFORMACAO ?? 0; tot.revisar += c.revisar;
  }
  L.push({ k: 'total', v: ['Total (item × camada)', tot.itens, tot.PENDENTE, tot.SEM_PROBLEMA, tot.PROPOSTO, tot.APROVADO, tot.AGUARDANDO_INFORMACAO, tot.itens ? (tot.itens - tot.PENDENTE) / tot.itens : 0, tot.revisar], pct: [8] });
  L.push({ k: 'vazio', v: [] });

  if (!m.liberada) {
    L.push({ k: 'secao', v: ['Casos por camada'] });
    L.push({ k: 'cab', v: ['Camada', 'Casos', 'Aprovados', 'Rejeitados', 'Propostos', 'Em edição', 'Aguardando informação'] });
    const temCasos = [...m.casosPorCamada.keys()];
    for (const camada of [...m.camadas, ...temCasos.filter((c) => !(m.camadas as string[]).includes(c))]) {
      const r = m.casosPorCamada.get(camada); if (!r) continue;
      const total = Object.values(r).reduce((s, n) => s + n, 0);
      L.push({ k: 'linha', v: [ROTULO_CAMADA[camada as Camada] ?? camada, total, r.APROVADO ?? 0, r.REJEITADO ?? 0, r.PROPOSTO ?? 0, r.RASCUNHO ?? 0, r.AGUARDANDO_INFORMACAO ?? 0] });
    }
    L.push({ k: 'vazio', v: [] });
  }

  if (cen) {
    L.push({ k: 'secao', v: ['Cenários tributários'] });
    par('Itens com enquadramento concluído (na aba "Cenários tributários")', cen.itensComEnquadramento);
    const totalFora = [...cen.fora.values()].reduce((s, n) => s + n, 0);
    par('Itens sem enquadramento nesta entrega', totalFora);
    if (totalFora) {
      L.push({ k: 'cab', v: ['Motivo', 'Itens'] });
      for (const [motivo, q] of [...cen.fora].sort((a, b) => b[1] - a[1])) L.push({ k: 'linha', v: [motivo, q] });
    }
    L.push({ k: 'nota', v: [`"Devolução" só aparece quando o tratamento difere do da aquisição (CST, cClassTrib, enquadramento ou crédito); sem a linha, vale o da aquisição${cen.devolucoesOmitidas ? ` (${comMilhar(cen.devolucoesOmitidas)} linha(s) iguais omitidas)` : ''}.`] });
    L.push({ k: 'vazio', v: [] });
  }

  const abertos = m.casos.filter((c) => CASO_PENDENTE.includes(c.situacao));
  L.push({ k: 'secao', v: [m.liberada ? 'O que ficou fora desta entrega e pendências' : 'Pendências'] });
  if (m.liberada) {
    // Os mesmos números do relatório de fechamento (itens com pendência, por tipo).
    const pend = pendenciasPorTipo(m);
    par('Itens com pendência', pend.itens);
    par('  dos quais aguardando informação do cliente', pend.aguardando);
    par('Tipos de pendência (detalhe por grupo na aba "Pendências e histórico")', pend.porTipo.length);
    par('Linhas de impacto no SPED excluídas (ligadas a caso não aprovado)', m.impactosExcluidos);
  } else {
    par('Itens com alguma camada ainda não aprovada nem sem problema', m.itens.filter((it) => itemComPendencia(m, it)).length);
    par('Casos pendentes (propostos, em edição ou aguardando informação)', abertos.length);
    par('  dos quais aguardando informação', abertos.filter((c) => c.situacao === 'AGUARDANDO_INFORMACAO').length);
  }
  par('Impactos no SPED registrados', m.impactos.length);
  const comp = competenciaEntregue(m);
  par('Última competência de escrituração já entregue', comp ? competenciaBr(comp) : 'não informada');
  const entregue = m.impactos.filter((i) => i.tipo === 'ESCRITURACAO_ENTREGUE' || i.tipo === 'ESCRITURACAO_JA_ENTREGUE').length;
  par('Impacto em escrituração já entregue', entregue ? `${comMilhar(entregue)} linha(s)` : textoSemEscrituracaoEntregue(m));
  par('Vínculos de código (de/para) registrados', m.vinculos.length);
  par(m.liberada ? 'Alterações aprovadas (aba "Pendências e histórico")' : 'Alterações registradas no histórico', m.liberada ? historicoAprovado(m).length : m.decisoes.length);
  L.push({ k: 'vazio', v: [] });
  L.push({ k: 'nota', v: ['Material de apoio à decisão; não constitui parecer jurídico nem tributário. "Analisados (%)" é a parcela de itens já analisados na camada (diferentes de "Pendente").'] });
  return L;
}

function escreverResumo(wb: ExcelJS.stream.xlsx.WorkbookWriter, m: Modelo, dados: DadosEntrega, cen: Cenarios | null): void {
  const ws = wb.addWorksheet(NOMES_ABAS[0], { properties: { tabColor: { argb: m.liberada ? VERDE : LARANJA } }, views: [{ showGridLines: false }] });
  ws.columns = [60, 22, 14, 14, 14, 14, 18, 16, 18].map((width) => ({ width }));
  reservarLinhaLogoFal(ws);
  for (const l of linhasResumo(m, dados, cen)) {
    const row = ws.addRow(l.v.map((v) => (v === '' || v === undefined ? null : v)));
    if (l.k === 'titulo') { row.getCell(1).font = { name: FONTE, bold: true, size: 14, color: { argb: VERDE } }; row.height = 24; }
    if (l.k === 'alerta') { row.getCell(1).font = { name: FONTE, bold: true, color: { argb: VERMELHO } }; row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARELO } }; }
    if (l.k === 'nota') row.getCell(1).font = { name: FONTE, italic: true, color: { argb: 'FF5B6B63' } };
    if (l.k === 'secao') { row.getCell(1).font = { name: FONTE, bold: true, size: 11, color: { argb: VERDE } }; row.getCell(1).border = { bottom: { style: 'thin', color: { argb: VERDE } } }; }
    if (l.k === 'par') {
      row.getCell(1).font = { name: FONTE, bold: true };
      if (typeof l.v[1] === 'number') row.getCell(2).numFmt = '#,##0';
      row.getCell(2).alignment = { horizontal: 'left' };
    }
    if (l.k === 'cab') row.eachCell((c) => { c.font = { name: FONTE, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }; c.alignment = { wrapText: true, vertical: 'middle' }; });
    if (l.k === 'linha' || l.k === 'total') {
      row.eachCell((c, i) => { if (i > 1) c.numFmt = l.pct?.includes(i) ? '0.0%' : '#,##0'; if (l.k === 'total') c.font = { name: FONTE, bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: l.k === 'total' ? 'FFDCE5E0' : CINZA } }; });
    }
    row.commit();
  }
  ws.commit();
}

// ── Abas de dados ────────────────────────────────────────────────────────────

/** Campos de topo do item na ordem da base (o código vai à parte, como chave). A finalidade e o "também usado como" são da Fase 2. */
const CAMPOS_DA_BASE = ['descricao', 'unidade', 'ncm', 'grupo', 'finalidade', 'tambemUsadoComo', 'ativo', 'saldo', 'ultimaMovimentacao', 'fabricante', 'referencia'];
const CAMPOS_FASE2_DA_BASE = ['finalidade', 'tambemUsadoComo'];
const ROTULO_COLUNA: Record<string, string> = { subgrupo: 'Subgrupo' };
const rotuloDaColuna = (chave: string) => { const k = chave.replace(/^campos\./, ''); return ROTULO_COLUNA[k] ?? rotuloDoCampo(k); };
const LARGURA: Record<string, number> = { descricao: 44, grupo: 24, finalidade: 22, tambemUsadoComo: 26, ativo: 8, unidade: 9, ncm: 12, saldo: 14, ultimaMovimentacao: 14 };
const TIPO: Record<string, TipoCol> = { ncm: 'codigo', codigo: 'codigo', saldo: 'quantidade' };

/** Valor do campo na planilha (rótulos no lugar dos códigos internos; saldo como número). */
function valorDaBase(chave: string, v: unknown, rotular = false): Valor {
  if (v == null || v === '') return null;
  if (chave === 'ativo') return typeof v === 'boolean' ? sn(v) : txt(v);
  if (chave === 'finalidade') return rotuloFin(txt(v));
  if (chave === 'tambemUsadoComo') return lista(v).map((x) => ROTULO_FINALIDADE_TXT[txt(x)] ?? txt(x)).join(', ');
  if (chave === 'saldo') return saldoDe(v) ?? txt(v);
  if (typeof v === 'number') return v;
  // Campo que o próprio saneamento grava (cClassTrib, CST, origem...): o rótulo do valor; coluna do ERP fica como veio.
  return rotular && typeof v === 'string' ? rotuloDoValor(v) : txt(v);
}
/** Coluna que o próprio saneamento grava (tem rótulo próprio): o valor sai rotulado. */
const colunaRotulada = (chave: string) => { const k = chave.replace(/^campos\./, ''); return chave.startsWith('campos.') && rotuloDoCampo(k) !== k; };
const temValor = (v: unknown) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
/** Valor atual (como ficou): grupo, finalidade e ativo vêm das colunas do item; o resto, do trabalho. */
function atualDaBase(it: ItemN, chave: string): unknown {
  if (chave === 'descricao') return it.descricao;
  if (chave === 'grupo') return it.grupo;
  if (chave === 'finalidade') return it.finalidade;
  if (chave === 'ativo') return it.ativo;
  if (chave === 'tambemUsadoComo') return it.tambem;
  return valorNoTrabalho(it.trabalho, chave);
}

/** Situação do item no ERP a partir do mapa (unificação vence inativação) e o código de destino da unificação. */
function situacoesDoMapa(m: Modelo): Map<string, { situacao: string; destino: string }> {
  const r = new Map<string, { situacao: string; destino: string }>();
  const sufixo = (l: LinhaMapa) => (l.situacao === 'PROPOSTA' ? ' (proposta)' : l.situacao === 'AGUARDANDO' ? ' (aguardando informação)' : '') + (l.executado ? ' — executado no ERP' : '');
  for (const l of mapaDoModelo(m)) {
    if (!l.morre || (l.tipo !== 'UNIFICACAO' && l.tipo !== 'INATIVACAO')) continue;
    const k = `${l.morre.codigo}\u0001${l.morre.estab}`;
    if (l.tipo === 'INATIVACAO' && r.has(k)) continue;
    r.set(k, l.tipo === 'UNIFICACAO' ? { situacao: `Unificado em outro código${sufixo(l)}`, destino: l.fica?.codigo ?? '' } : { situacao: `Inativado${sufixo(l)}`, destino: '' });
  }
  return r;
}

/**
 * Cadastro saneado = base completa antes × depois: todas as colunas que vieram do ERP (as de topo e as adicionais de `campos`, mesmo as que o
 * saneamento não usa). Coluna com algum item alterado vira o par "(como era)" e "(como ficou)", com a célula alterada em verde suave; a coluna
 * "Camada que alterou" diz quem mudou. Item inativado ou unificado continua na base, com a situação e o código de destino. Na entrega da
 * Fase 1, sem a finalidade e sem as colunas que só existem pela parte tributária.
 */
async function abaCadastro(wb: ExcelJS.stream.xlsx.WorkbookWriter, m: Modelo): Promise<void> {
  // 1ª passada: colunas presentes (valor atual ou de antes), colunas alteradas em algum item e as adicionais na ordem em que aparecem.
  const presentes = new Set<string>(); const alteradas = new Set<string>(); const extras: string[] = []; const extrasVistos = new Set<string>();
  const foraDaFase = (chave: string) => m.soFase1 && (CAMPOS_FASE2_DA_BASE.includes(chave) || m.camposDaFase2.has(chave));
  for (const it of m.itens) {
    for (const k of Object.keys(it.campos)) { const ch = `campos.${k}`; if (!extrasVistos.has(ch)) { extrasVistos.add(ch); extras.push(ch); } }
    for (const ch of it.camposAlterados) alteradas.add(ch);
    const alt = m.alteracoes.get(it.id);
    if (alt) for (const [ch, a] of alt) if (!vazio(a.antes as Valor)) presentes.add(ch);
  }
  // Coluna presente: algum item com valor (para na primeira).
  for (const ch of [...CAMPOS_DA_BASE, ...extras]) { if (presentes.has(ch)) continue; for (const it of m.itens) if (temValor(atualDaBase(it, ch))) { presentes.add(ch); break; } }
  const campos = [...CAMPOS_DA_BASE, ...extras.filter((ch) => !CAMPOS_DA_BASE.includes(ch))].filter((ch) => (ch === 'descricao' || presentes.has(ch)) && !foraDaFase(ch));
  const codigoMudou = alteradas.has('codigo');
  const situacoes = situacoesDoMapa(m);

  const cols: Col[] = [{ cab: 'Código', larg: 16, tipo: 'codigo', sempre: true }];
  if (codigoMudou) cols.push({ cab: 'Código (como era)', larg: 16, tipo: 'codigo' });
  cols.push({ cab: 'Estabelecimento', larg: 14, tipo: 'codigo' }, { cab: 'Situação do item', larg: 24, sempre: true }, { cab: 'Código de destino', larg: 16, tipo: 'codigo' });
  // Colunas dos campos: [chave, como era?] na ordem das colunas.
  const desenho: { chave: string; antes: boolean; rotular: boolean }[] = [];
  for (const ch of campos) {
    const rot = rotuloDaColuna(ch); const larg = LARGURA[ch] ?? 18; const tipo = TIPO[ch]; const rotular = colunaRotulada(ch);
    if (alteradas.has(ch)) {
      // O par fica mesmo vazio de um lado ("como era" vazio = o campo não estava preenchido no ERP).
      cols.push({ cab: `${rot} (como era)`, larg, tipo, sempre: true }, { cab: `${rot} (como ficou)`, larg, tipo, sempre: true });
      desenho.push({ chave: ch, antes: true, rotular }, { chave: ch, antes: false, rotular });
    } else { cols.push({ cab: rot, larg, tipo, sempre: true }); desenho.push({ chave: ch, antes: false, rotular }); }
    if (ch === 'finalidade') { cols.push({ cab: 'Origem da finalidade', larg: 34 }); desenho.push({ chave: '__origem', antes: false, rotular: false }); }
  }
  cols.push({ cab: 'Campos alterados', larg: 22 }, { cab: 'Camada que alterou', larg: 26 });
  const camadas = m.camadas.map((c) => ({ cab: ROTULO_CAMADA[c] ?? c, larg: 17, sempre: true }));
  cols.push(...camadas, { cab: 'Camadas a revisar', larg: 26 });
  if (!m.liberada) cols.push({ cab: 'Marca', larg: 24 }, { cab: 'Propostas não aprovadas', larg: 60 }, { cab: 'ID interno', larg: 26, tipo: 'codigo' });
  const propostas = m.liberada ? new Map<string, string[]>() : propostasEmAberto(m);
  // Entrega liberada sem colunas vazias, decidido aqui (as colunas dos campos já são só as presentes): o gerador passa uma vez só.
  const usadas = cols.map((c) => {
    if (c.cab === 'Estabelecimento') return m.itens.some((it) => !!it.estab);
    if (c.cab === 'Código de destino') return [...situacoes.values()].some((s) => !!s.destino);
    if (c.cab === 'Origem da finalidade') return m.itens.some((it) => !!it.finalidade);
    if (c.cab === 'Campos alterados' || c.cab === 'Camada que alterou') return alteradas.size > 0;
    if (c.cab === 'Camadas a revisar') return m.camadas.some((x) => (m.porCamada.get(x)?.revisar ?? 0) > 0);
    return true;
  });
  const rotuloCamadaQueAlterou = (c: string) => (c ? ROTULO_CAMADA[c as Camada] ?? c : 'Ajuste direto no cadastro');

  function* gerar(): Iterable<LinhaV> {
    for (const it of m.itens) {
      const cel = m.camadas.map((c) => celula(m, it.id, c));
      const revisar = m.camadas.filter((c, i) => cel[i]?.revisar).map((c) => ROTULO_CAMADA[c] ?? c).join(', ');
      const temProposta = cel.some((c) => c?.situacao === 'PROPOSTO');
      const alt = m.alteracoes.get(it.id);
      const mudou = new Set(it.camposAlterados);
      const v: Valor[] = []; const cores: (string | undefined)[] = [];
      const por = (valor: Valor, cor?: string) => { v.push(valor); cores.push(cor); };
      por(it.codigo, mudou.has('codigo') ? VERDE_CLARO : undefined);
      if (codigoMudou) por(mudou.has('codigo') ? txt(alt?.get('codigo')?.antes) : it.codigo);
      const sit = situacoes.get(`${it.codigo}\u0001${it.estab}`);
      por(it.estab); por(sit?.situacao ?? (it.ativo === false ? 'Inativo no cadastro' : 'Ativo')); por(sit?.destino ?? '');
      for (const d of desenho) {
        if (d.chave === '__origem') { por(origemDaFinalidade(m, it)); continue; }
        const a = alt?.get(d.chave);
        // Fase 1: o que só a parte tributária mudou fica como era (a Fase 2 é entregue em separado).
        const atual = m.soFase1 && a?.soFase2 ? a.antes : atualDaBase(it, d.chave);
        if (d.antes) por(valorDaBase(d.chave, mudou.has(d.chave) ? a?.antes : atual, d.rotular));
        else por(valorDaBase(d.chave, atual, d.rotular), mudou.has(d.chave) ? VERDE_CLARO : undefined);
      }
      const quem = new Set<string>();
      if (alt) for (const ch of it.camposAlterados) for (const c of alt.get(ch)?.camadas ?? []) if (!(m.soFase1 && CAMADAS_FASE2.includes(c))) quem.add(rotuloCamadaQueAlterou(c));
      por(it.camposAlterados.map(rotuloDaColuna).join(', ')); por([...quem].join(', '));
      for (const c of cel) por(rotuloSituacaoCelula(c));
      por(revisar);
      if (!m.liberada) { por(temProposta ? MARCA_PROPOSTA : ''); por((propostas.get(it.id) ?? []).join(' | ')); por(it.id); }
      yield { v, cores, destaque: !m.liberada && temProposta };
    }
  }
  await escreverAba(wb, NOMES_ABAS[1], cols, gerar, { cor: m.liberada ? VERDE : LARANJA, congelar: 1, tirarVazias: m.liberada, usadas });
}

// ── Mapa de unificações (aba "De para e equivalências" e Excel da consulta "Unificações") ─────────────

const escalado = (cols: Col[], escala: number) => { if (escala !== 1) for (const c of cols) if (SALDOS_DO_MAPA.has(c.cab)) c.cab = `${c.cab} ÷ ${escala.toLocaleString('pt-BR')}`; return cols; };
const comNotaDaEscala = (escala: number) => (aba: Aba) => {
  // Com a escala, a nota fica abaixo da lista (fora do filtro) e no cabeçalho das colunas de saldo.
  if (escala === 1) return;
  const r = aba.ws.addRow([]); r.commit();
  const n = aba.ws.addRow([notaDaEscala(escala)]); n.getCell(1).font = { bold: true, color: { argb: 'FF9C5700' } }; n.commit();
};

/** Colunas da marca "Executado no ERP" (no fim de cada lista do mapa): Sim/Não só nas linhas aprovadas ou registradas. */
const COLUNAS_EXECUTADO: Col[] = [{ cab: 'Executado no ERP', larg: 12, sempre: true }, { cab: 'Executado em', larg: 16, tipo: 'datahora' }, { cab: 'Executado por', larg: 22 }];
const valoresExecutado = (l: LinhaMapa): Valor[] => [linhaExecutavel(l) ? (l.executado ? 'Sim' : 'Não') : '', l.executado ? dataExcel(new Date(l.executado.em)) : null, l.executado?.por ?? ''];

/** Colunas do mapa completo (aba "De para e equivalências" do Excel de 6 abas). Sem código interno: o cliente lê a lista e ajusta o ERP. */
function colunasDoMapa(liberada: boolean, escala = 1): Col[] {
  const cols: Col[] = [
    { cab: 'Tipo de registro', larg: 24, sempre: true }, { cab: 'Código que sai', larg: 18, tipo: 'codigo' }, { cab: 'Estabelecimento', larg: 14, tipo: 'codigo' },
    { cab: 'Descrição (código que sai)', larg: 40 }, { cab: 'Unidade (código que sai)', larg: 10 }, { cab: 'Saldo (código que sai)', larg: 14, tipo: 'quantidade' },
    { cab: 'Código que fica', larg: 18, tipo: 'codigo' }, { cab: 'Descrição (código que fica)', larg: 40 }, { cab: 'Unidade (código que fica)', larg: 10 },
    { cab: 'Saldo atual (código que fica)', larg: 14, tipo: 'quantidade' }, { cab: 'Saldo que entra', larg: 14, tipo: 'quantidade' }, { cab: 'Saldo consolidado', larg: 14, tipo: 'quantidade' },
    { cab: 'Situação', larg: 18 }, { cab: 'Ação no ERP', larg: 56 }, { cab: 'Início da vigência', larg: 13, tipo: 'data' }, { cab: 'Justificativa', larg: 60 },
    { cab: 'Alerta de coerência', larg: 60 }, { cab: 'Responsável', larg: 24 }, { cab: 'Data da decisão', larg: 16, tipo: 'datahora' }, ...COLUNAS_EXECUTADO,
  ];
  if (!liberada) cols.push({ cab: 'Marca', larg: 24 });
  return escalado(cols, escala);
}
const aberta = (l: LinhaMapa) => l.situacao === 'PROPOSTA' || l.situacao === 'AGUARDANDO';

async function abaDePara(wb: ExcelJS.stream.xlsx.WorkbookWriter, m: Modelo): Promise<void> {
  const linhas = mapaDoModelo(m); const escala = escalaDaBase(m.itens);
  function* gerar(): Iterable<LinhaV> {
    for (const l of linhas) {
      const v: Valor[] = [
        l.rotuloTipo || ROTULO_TIPO_MAPA[l.tipo], l.morre?.codigo, l.morre?.estab, l.morre?.descricao, l.morre?.unidade, l.morre?.saldo,
        l.fica?.codigo, l.fica?.descricao, l.fica?.unidade, l.fica?.saldo, l.saldoEntra, l.saldoConsolidado,
        ROTULO_SITUACAO_MAPA[l.situacao], l.acao, dataExcel(l.inicio), l.justificativa, l.alertas.join(' '), l.responsavel, dataExcel(l.decididoEm), ...valoresExecutado(l),
      ];
      if (!m.liberada) v.push(aberta(l) ? MARCA_PROPOSTA : '');
      yield { v, destaque: !m.liberada && aberta(l) };
    }
  }
  await escreverAba(wb, NOMES_ABAS[2], colunasDoMapa(m.liberada, escala), gerar, { cor: m.liberada ? VERDE : LARANJA, congelar: 2, tirarVazias: m.liberada, depois: comNotaDaEscala(escala) });
}

/** Colunas e valores de cada uma das três listas do mapa (tela e Excel da consulta "Unificações"): cada lista só com as colunas que usa. */
const COLUNAS_DA_LISTA: Record<ListaMapa, (escala: number) => Col[]> = {
  UNIFICACOES: (escala) => escalado([
    { cab: 'Tipo de registro', larg: 22, sempre: true }, { cab: 'Código que sai', larg: 16, tipo: 'codigo', sempre: true }, { cab: 'Estabelecimento', larg: 14, tipo: 'codigo' },
    { cab: 'Descrição (código que sai)', larg: 40 }, { cab: 'Unidade (código que sai)', larg: 10 }, { cab: 'Saldo (código que sai)', larg: 14, tipo: 'quantidade' },
    { cab: 'Código que fica', larg: 16, tipo: 'codigo', sempre: true }, { cab: 'Descrição (código que fica)', larg: 40 }, { cab: 'Unidade (código que fica)', larg: 10 },
    { cab: 'Saldo atual (código que fica)', larg: 14, tipo: 'quantidade' }, { cab: 'Saldo que entra', larg: 14, tipo: 'quantidade' }, { cab: 'Saldo consolidado', larg: 14, tipo: 'quantidade' },
    { cab: 'Situação', larg: 18, sempre: true }, { cab: 'Ação no ERP', larg: 60, sempre: true }, { cab: 'Início da vigência', larg: 13, tipo: 'data' }, { cab: 'Justificativa', larg: 50 },
    { cab: 'Alerta de coerência', larg: 60 }, { cab: 'Responsável', larg: 22 }, { cab: 'Data da decisão', larg: 16, tipo: 'datahora' }, ...COLUNAS_EXECUTADO,
  ], escala),
  INATIVACOES: (escala) => escalado([
    { cab: 'Origem', larg: 26, sempre: true }, { cab: 'Código', larg: 16, tipo: 'codigo', sempre: true }, { cab: 'Estabelecimento', larg: 14, tipo: 'codigo' }, { cab: 'Descrição', larg: 44 },
    { cab: 'Unidade', larg: 9 }, { cab: 'Saldo', larg: 14, tipo: 'quantidade' }, { cab: 'Situação', larg: 18, sempre: true }, { cab: 'Ação no ERP', larg: 56, sempre: true },
    { cab: 'Início da vigência', larg: 13, tipo: 'data' }, { cab: 'Justificativa', larg: 50 }, { cab: 'Alerta de coerência', larg: 60 }, { cab: 'Responsável', larg: 22 }, { cab: 'Data da decisão', larg: 16, tipo: 'datahora' },
    ...COLUNAS_EXECUTADO,
  ], escala),
  EQUIVALENCIAS: () => [
    { cab: 'Códigos relacionados', larg: 50, sempre: true }, { cab: 'Ação', larg: 56, sempre: true }, { cab: 'Situação', larg: 18, sempre: true }, { cab: 'Justificativa', larg: 60 },
    { cab: 'Responsável', larg: 22 }, { cab: 'Data da decisão', larg: 16, tipo: 'datahora' }, ...COLUNAS_EXECUTADO,
  ],
};
function valoresDaLista(lista: ListaMapa, l: LinhaMapa): Valor[] {
  const comum = [ROTULO_SITUACAO_MAPA[l.situacao], l.acao];
  if (lista === 'UNIFICACOES') {
    return [l.rotuloTipo || ROTULO_TIPO_MAPA[l.tipo], l.morre?.codigo, l.morre?.estab, l.morre?.descricao, l.morre?.unidade, l.morre?.saldo, l.fica?.codigo, l.fica?.descricao, l.fica?.unidade,
      l.fica?.saldo, l.saldoEntra, l.saldoConsolidado, ...comum, dataExcel(l.inicio), l.justificativa, l.alertas.join(' '), l.responsavel, dataExcel(l.decididoEm), ...valoresExecutado(l)];
  }
  if (lista === 'INATIVACOES') {
    return [l.origem ? ROTULO_INATIVACAO[l.origem] : l.rotuloTipo, l.morre?.codigo, l.morre?.estab, l.morre?.descricao, l.morre?.unidade, l.morre?.saldo, ...comum,
      dataExcel(l.inicio), l.justificativa, l.alertas.join(' '), l.responsavel, dataExcel(l.decididoEm), ...valoresExecutado(l)];
  }
  return [l.fica?.codigo, l.acao, ROTULO_SITUACAO_MAPA[l.situacao], l.justificativa, l.responsavel, dataExcel(l.decididoEm), ...valoresExecutado(l)];
}

/** O que fazer com o par em conflito (texto da aba "Conflitos" e da tela). */
export function oQueFazerNoConflito(c: ParConflito): string {
  if (c.inativacao.situacao === 'INATIVO_NA_BASE') return `Reativar ${c.fica} (ou escolher outro código que fique) antes de transferir o saldo de ${c.sai}.`;
  return `${c.fica} recebe ${c.sai} e também tem inativação: rejeitar ou reabrir um dos dois casos antes de ajustar o ERP.`;
}
const COLUNAS_CONFLITO: Col[] = [
  { cab: 'Código que sai', larg: 16, tipo: 'codigo' }, { cab: 'Código que fica', larg: 16, tipo: 'codigo' }, { cab: 'Situação da unificação', larg: 20 },
  { cab: 'Código inativado', larg: 16, tipo: 'codigo' }, { cab: 'Situação da inativação', larg: 20 }, { cab: 'Origem da inativação', larg: 28 }, { cab: 'O que fazer', larg: 80 },
];
const valoresDoConflito = (c: ParConflito): Valor[] => [
  c.sai, c.fica, ROTULO_SITUACAO_MAPA[c.situacaoUnificacao], c.inativacao.codigo, ROTULO_SITUACAO_CONFLITO[c.inativacao.situacao], c.inativacao.origem ? ROTULO_INATIVACAO[c.inativacao.origem] : 'Cadastro (inativo na base)', oQueFazerNoConflito(c),
];

/**
 * Excel só do mapa (botão da consulta "Unificações"): uma aba por lista (Unificações, Inativações, Equivalências), cada uma com as colunas
 * que usa, e a aba "Conflitos" (o par unificação × inativação) primeiro, quando houver. Só as listas com linha (sem nenhuma: Unificações vazia).
 */
export async function gerarExcelMapa(linhas: LinhaMapa[], opcoes: { liberada?: boolean; titulo?: string; escala?: number; conflitos?: ParConflito[] } = {}): Promise<Buffer> {
  const saida = new PassThrough();
  const partes: Buffer[] = [];
  saida.on('data', (c: Buffer) => partes.push(c));
  const fim = new Promise<void>((ok, erro) => { saida.on('end', ok); saida.on('error', erro); });
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: saida, useStyles: true, useSharedStrings: false, zip: ZIP_RAPIDO });
  wb.creator = 'InTAX — FAL Agro';
  wb.title = opcoes.titulo ?? 'Saneamento de estoques — unificações, inativações e equivalências';
  fontePadraoArial(wb);
  wb.created = new Date();
  const escala = opcoes.escala ?? 1;
  const conflitos = opcoes.conflitos ?? conflitosDoMapa(linhas);
  if (conflitos.length) {
    const aba = criarAba(wb, 'Conflitos', COLUNAS_CONFLITO, VERMELHO, 2);
    for (const c of conflitos) {
      aba.add(valoresDoConflito(c));
    }
    aba.fim();
  }
  const listas = (Object.keys(TIPOS_DA_LISTA) as ListaMapa[]).map((lista) => ({ lista, ls: linhas.filter((l) => TIPOS_DA_LISTA[lista].includes(l.tipo)) }));
  const comLinhas = listas.filter((x) => x.ls.length);
  for (const { lista, ls } of comLinhas.length ? comLinhas : listas.slice(0, 1)) {
    const cols = COLUNAS_DA_LISTA[lista](escala);
    if (!opcoes.liberada) cols.push({ cab: 'Marca', larg: 24 });
    function* gerar(): Iterable<LinhaV> {
      for (const l of ls) {
        const v = valoresDaLista(lista, l);
        if (!opcoes.liberada) v.push(aberta(l) ? MARCA_PROPOSTA : '');
        yield { v, destaque: !opcoes.liberada && aberta(l) };
      }
    }
    await escreverAba(wb, ROTULO_LISTA[lista], cols, gerar, { cor: lista === 'UNIFICACOES' ? VERDE : lista === 'INATIVACOES' ? LARANJA : 'FF5B6B63', congelar: 2, tirarVazias: true, depois: lista === 'EQUIVALENCIAS' ? undefined : comNotaDaEscala(escala) });
  }
  await wb.commit();
  await fim;
  // O gravador em fluxo não aceita imagem: a logo da FAL entra no arquivo pronto, na linha 1 reservada de cada aba.
  return logoFalNoXlsx(Buffer.concat(partes));
}

async function abaCenarios(wb: ExcelJS.stream.xlsx.WorkbookWriter, m: Modelo, cen: Cenarios | null): Promise<void> {
  const cols: Col[] = [
    { cab: 'Código', larg: 16, tipo: 'codigo', sempre: true }, { cab: 'Estabelecimento', larg: 14, tipo: 'codigo' }, { cab: 'Descrição saneada', larg: 40, sempre: true }, { cab: 'NCM', larg: 12, tipo: 'codigo' },
    { cab: 'Finalidade', larg: 20 }, { cab: 'Cenário', larg: 20, sempre: true }, { cab: 'Enquadramento legal (texto da lei)', larg: 60 }, { cab: 'Artigo / anexo', larg: 30 },
    { cab: 'CST', larg: 8, tipo: 'codigo' }, { cab: 'cClassTrib', larg: 11, tipo: 'codigo' }, { cab: 'Origem', larg: 20 }, { cab: 'Situação', larg: 20 }, { cab: 'Observação', larg: 60 },
  ];
  if (!m.liberada) cols.push({ cab: 'Marca', larg: 30 }, { cab: 'ID interno', larg: 26, tipo: 'codigo' });
  const valores = (it: ItemN, l: LinhaCenario): Valor[] => [it.codigo, it.estab, it.descricao, it.ncm, rotuloFin(it.finalidade), l.cenario, l.enquadramentoLegal, l.artigo, l.cst, l.cClassTrib, l.origem, l.situacao, l.observacao];
  function* gerar(): Iterable<LinhaV> {
    if (cen) { for (const { it, linhas } of cen.porItem) for (const l of linhas) yield { v: valores(it, l) }; return; }
    for (const it of m.itens) for (const l of linhasDeCenario(m, it)) yield { v: [...valores(it, l), l.marca, it.id], destaque: !!l.marca };
  }
  await escreverAba(wb, NOMES_ABAS[3], cols, gerar, { cor: m.liberada ? VERDE : LARANJA, congelar: 1, tirarVazias: m.liberada });
}

async function abaImpactos(wb: ExcelJS.stream.xlsx.WorkbookWriter, m: Modelo): Promise<void> {
  const cols: Col[] = [
    { cab: 'Obrigação', larg: 24, sempre: true }, { cab: 'Competência', larg: 13, tipo: 'codigo' }, { cab: 'Versão do leiaute', larg: 16 }, { cab: 'Registro', larg: 10, tipo: 'codigo' }, { cab: 'Campo', larg: 18 },
    { cab: 'Valor original', larg: 22, tipo: 'codigo' }, { cab: 'Valor proposto', larg: 22, tipo: 'codigo' }, { cab: 'Motivo', larg: 50 }, { cab: 'Evidência', larg: 40 }, { cab: 'Início', larg: 12, tipo: 'data' },
    { cab: 'Avaliar períodos anteriores', larg: 14 }, { cab: 'Responsável', larg: 22 }, { cab: 'Tipo de ajuste', larg: 32 }, { cab: 'Camada / caso', larg: 30 },
  ];
  if (!m.liberada) cols.push({ cab: 'Marca', larg: 24 });
  function* gerar(): Iterable<LinhaV> {
    for (const i of m.impactos) {
      const caso = i.casoId ? m.casoPorId.get(i.casoId) : undefined;
      const emAberto = !!caso && CASO_PENDENTE.includes(caso.situacao);
      const v: Valor[] = [
        rotuloObrigacao(i.obrigacao), i.competencia, i.leiaute || 'não confirmado', i.registro, i.campo, i.valorOriginal, i.valorProposto, i.motivo, i.evidencia, dataExcel(i.inicio),
        i.avaliarAnteriores ? 'Sim' : 'Não', i.responsavel, rotuloTipoAjuste(i.tipo), caso ? rotuloDoCaso(caso.camada, caso.tipo) : '',
      ];
      if (!m.liberada) v.push(emAberto ? MARCA_PROPOSTA : '');
      yield { v, destaque: !m.liberada && emAberto };
    }
  }
  await escreverAba(wb, NOMES_ABAS[4], cols, gerar, { cor: m.liberada ? VERDE : LARANJA, congelar: 0, tirarVazias: m.liberada });
}

/** Decisões que entram no histórico da entrega liberada: só as aprovadas (sem a marca de aprovação do caso). O detalhe completo fica no Excel de revisão. */
function historicoAprovado(m: Modelo) {
  return m.decisoes.filter((d) => d.tipo === 'aprovar' && !d.campo.startsWith('caso:') && (!d.casoId || !m.casoPorId.has(d.casoId) || m.casoPorId.get(d.casoId)!.situacao === 'APROVADO'));
}

/** Pendências da entrega liberada agrupadas por camada, tipo e grupo: uma linha por tipo × grupo, com casos, itens e exemplos. */
export type GrupoPendencia = { camada: string; tipo: string; grupo: string; casos: number; itens: Set<string>; situacoes: Map<string, number>; exemplos: string[]; problema: string };
export function pendenciasAgrupadas(m: Modelo): GrupoPendencia[] {
  const g = new Map<string, GrupoPendencia>();
  for (const c of m.casos) {
    if (!CASO_PENDENTE.includes(c.situacao)) continue;
    const porGrupo = new Map<string, string[]>();
    for (const id of c.itens) { const grupo = m.porId.get(id)?.grupo || 'Sem grupo'; const l = porGrupo.get(grupo); if (l) l.push(id); else porGrupo.set(grupo, [id]); }
    if (!porGrupo.size) porGrupo.set('Sem grupo', []);
    for (const [grupo, ids] of porGrupo) {
      const k = `${c.camada}\u0001${c.tipo}\u0001${grupo}`;
      let x = g.get(k);
      if (!x) { x = { camada: c.camada, tipo: c.tipo, grupo, casos: 0, itens: new Set(), situacoes: new Map(), exemplos: [], problema: c.problema }; g.set(k, x); }
      x.casos++;
      const sit = ROTULO_SITUACAO_CASO[c.situacao] ?? c.situacao;
      x.situacoes.set(sit, (x.situacoes.get(sit) ?? 0) + 1);
      for (const id of ids) { x.itens.add(id); if (x.exemplos.length < 5) { const cod = m.porId.get(id)?.codigo; if (cod && !x.exemplos.includes(cod)) x.exemplos.push(cod); } }
    }
  }
  return [...g.values()].sort((a, b) => b.itens.size - a.itens.size || b.casos - a.casos || a.tipo.localeCompare(b.tipo) || a.grupo.localeCompare(b.grupo, 'pt-BR'));
}

async function abaPendencias(wb: ExcelJS.stream.xlsx.WorkbookWriter, m: Modelo): Promise<void> {
  if (m.liberada) {
    const cols: Col[] = [
      { cab: 'Registro', larg: 14, sempre: true }, { cab: 'Camada', larg: 20 }, { cab: 'Tipo', larg: 30 }, { cab: 'Grupo', larg: 26 }, { cab: 'Situação', larg: 26 },
      { cab: 'Casos', larg: 9, tipo: 'numero' }, { cab: 'Itens', larg: 9, tipo: 'numero' }, { cab: 'Código do item (ou exemplos)', larg: 30, tipo: 'codigo' }, { cab: 'Exemplo do problema', larg: 60 },
      { cab: 'Campo', larg: 18 }, { cab: 'Antes', larg: 34, tipo: 'codigo' }, { cab: 'Depois', larg: 34, tipo: 'codigo' }, { cab: 'Fundamento', larg: 50 }, { cab: 'Responsável', larg: 24 }, { cab: 'Data', larg: 16, tipo: 'datahora' },
    ];
    const grupos = pendenciasAgrupadas(m);
    const hist = historicoAprovado(m);
    function* gerar(): Iterable<LinhaV> {
      for (const x of grupos) {
        const exemplos = x.exemplos.join(', ') + (x.itens.size > x.exemplos.length ? ` (+${comMilhar(x.itens.size - x.exemplos.length)})` : '');
        yield { v: ['Pendência', ROTULO_CAMADA[x.camada as Camada] ?? x.camada, rotuloTipoCaso(x.tipo), x.grupo, [...x.situacoes].map(([s, q]) => `${s}: ${comMilhar(q)}`).join('; '), x.casos, x.itens.size, exemplos, x.problema] };
      }
      for (const d of hist) {
        const it = m.porId.get(d.itemId); const caso = d.casoId ? m.casoPorId.get(d.casoId) : undefined;
        yield { v: [
          'Histórico', caso ? ROTULO_CAMADA[caso.camada as Camada] ?? caso.camada : '', caso ? rotuloTipoCaso(caso.tipo) : '', it?.grupo ?? '', 'Aprovada', null, null, it?.codigo ?? '', '',
          rotuloDoCampo(d.campo), valorLegivel(d.antes), valorLegivel(d.depois), d.fundamento, d.usuario, dataExcel(d.quando),
        ] };
      }
    }
    await escreverAba(wb, NOMES_ABAS[5], cols, gerar, { cor: VERDE, congelar: 0, tirarVazias: true });
    return;
  }
  const cols: Col[] = [
    { cab: 'Registro', larg: 12 }, { cab: 'Camada', larg: 20 }, { cab: 'Tipo do caso', larg: 26 }, { cab: 'Situação / tipo', larg: 20 }, { cab: 'Código do item', larg: 16, tipo: 'codigo' },
    { cab: 'Estabelecimento', larg: 14, tipo: 'codigo' }, { cab: 'Qtde de itens', larg: 9, tipo: 'numero' }, { cab: 'Campo', larg: 18 }, { cab: 'Antes', larg: 34, tipo: 'codigo' }, { cab: 'Depois', larg: 34, tipo: 'codigo' },
    { cab: 'Fundamento / problema', larg: 60 }, { cab: 'Motivo', larg: 36 }, { cab: 'Responsável', larg: 24 }, { cab: 'Data', larg: 16, tipo: 'datahora' }, { cab: 'ID do caso', larg: 26, tipo: 'codigo' },
  ];
  const rotuloTipo: Record<string, string> = { aprovar: 'Aprovada', rejeitar: 'Rejeitada', desfazer: 'Desfeita', importar: 'Reimportação' };
  function* gerar(): Iterable<LinhaV> {
    for (const c of m.casos) {
      if (!CASO_PENDENTE.includes(c.situacao)) continue;
      yield { v: [
        'Pendência', ROTULO_CAMADA[c.camada as Camada] ?? c.camada, rotuloTipoCaso(c.tipo), ROTULO_SITUACAO_CASO[c.situacao] ?? c.situacao, codigosDosItens(m, c.itens, 6), '', c.itens.length, '',
        resumoCampos(c.atual), resumoCampos(c.proposta), [c.problema, c.fundamento].filter(Boolean).join(' · '), c.motivo || c.justificativa, c.responsavel, dataExcel(c.criadoEm), c.id,
      ], destaque: c.situacao !== 'AGUARDANDO_INFORMACAO' };
    }
    for (const d of m.decisoes) {
      const it = m.porId.get(d.itemId);
      const caso = d.casoId ? m.casoPorId.get(d.casoId) : undefined;
      yield { v: [
        'Histórico', caso ? ROTULO_CAMADA[caso.camada as Camada] ?? caso.camada : '', caso ? rotuloTipoCaso(caso.tipo) : '', rotuloTipo[d.tipo] ?? d.tipo, it?.codigo ?? d.itemId, it?.estab ?? '', null, d.campo.startsWith('caso:') ? 'Aprovação do caso' : rotuloDoCampo(d.campo),
        valorLegivel(d.antes), valorLegivel(d.depois), d.fundamento, '', d.usuario, dataExcel(d.quando), d.casoId ?? '',
      ] };
    }
  }
  await escreverAba(wb, NOMES_ABAS[5], cols, gerar, { cor: LARANJA, congelar: 0, tirarVazias: false });
}

// ── Entrada ──────────────────────────────────────────────────────────────────

/**
 * `consumir`: quem chama não usa mais `dados` depois (o serviço de entregas). As listas brutas (itens, células, casos, decisões, impactos)
 * são esvaziadas assim que o modelo está montado, para não ficarem na memória junto com o modelo durante a escrita.
 */
export async function gerarExcelDeDados(dados: DadosEntrega, opcoes: { consumir?: boolean } = {}): Promise<Buffer> {
  const m = construirModelo(dados);
  if (opcoes.consumir) { dados.itens = []; dados.celulas = []; dados.casos = []; dados.decisoes = []; dados.impactosSped = []; }
  const saida = new PassThrough();
  const partes: Buffer[] = [];
  saida.on('data', (c: Buffer) => partes.push(c));
  const fim = new Promise<void>((ok, erro) => { saida.on('end', ok); saida.on('error', erro); });
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: saida, useStyles: true, useSharedStrings: false, zip: ZIP_RAPIDO });
  wb.creator = 'InTAX — FAL Agro';
  wb.title = m.liberada ? 'Saneamento de estoques — entrega liberada' : 'Saneamento de estoques — exportação para revisão';
  fontePadraoArial(wb);
  wb.created = new Date();
  // Fase 1: sem cenários (nem a aba, nem a seção do Resumo); a parte tributária é entregue em separado.
  const cen = m.liberada && !m.soFase1 ? cenariosDaEntrega(m) : null;
  escreverResumo(wb, m, dados, cen);
  await abaCadastro(wb, m);
  await abaDePara(wb, m);
  if (!m.soFase1) await abaCenarios(wb, m, cen);
  await abaImpactos(wb, m);
  await abaPendencias(wb, m);
  await wb.commit();
  await fim;
  // O gravador em fluxo não aceita imagem: a logo da FAL entra no arquivo pronto, na linha 1 reservada de cada aba.
  return logoFalNoXlsx(Buffer.concat(partes));
}
