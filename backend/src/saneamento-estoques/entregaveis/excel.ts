/**
 * Excel de 6 abas do Saneamento de Estoques, em modo de escrita em fluxo (ExcelJS WorkbookWriter): 30 mil itens sem montar a planilha inteira na memória.
 * Códigos, NCM e identificadores são texto (valor string + formato "@"), preservando zeros à esquerda. Datas são datas de verdade.
 * Entrega liberada = só dado aprovado; exportação para revisão = inclui o proposto, com marca visível (aba laranja, coluna "Marca").
 */
import ExcelJS from 'exceljs';
import { PassThrough } from 'node:stream';
import type { DadosEntrega } from '../dados/portas';
import { ROTULO_FINALIDADE, type Camada } from '../tipos';
import {
  CASO_PENDENTE, MARCA_PROPOSTA, ROTULO_CAMADA, ROTULO_SITUACAO_CASO, celula, codigosDosItens, comMilhar, competenciaBr, competenciaEntregue, construirModelo, dataBr,
  linhasDeCenario, nomeCliente, obj, origemDaFinalidade, paraData, projetoTexto, propostasEmAberto, resumoCampos, rotuloDoCaso, rotuloObrigacao, rotuloSituacaoCelula,
  rotuloDoCampo, rotuloDoValor, rotuloTipoAjuste, rotuloTipoCaso, textoSemEscrituracaoEntregue, txt, mapaDoModelo, type Modelo,
} from './modelo';
import { ROTULO_SITUACAO_MAPA, ROTULO_TIPO_MAPA, type LinhaMapa } from './unificacoes';

type Valor = string | number | Date | null | undefined;
type TipoCol = 'texto' | 'codigo' | 'data' | 'datahora' | 'numero' | 'quantidade';
type Col = { cab: string; larg: number; tipo?: TipoCol };

export const NOMES_ABAS = ['Resumo da entrega', 'Cadastro saneado', 'De para e equivalências', 'Cenários tributários', 'Impactos no SPED', 'Pendências e histórico'] as const;

const VERDE = 'FF197148'; const LARANJA = 'FFE08A00'; const AMARELO = 'FFFFF2CC'; const CINZA = 'FFF2F5F3';
const FMT: Record<TipoCol, string | undefined> = { texto: undefined, codigo: '@', data: 'dd/mm/yyyy', datahora: 'dd/mm/yyyy hh:mm', numero: '#,##0', quantidade: '#,##0.00##' };

/** Brasília (UTC-3, sem horário de verão): o Excel mostra o relógio da data gravada, então deslocamos para a hora local. */
const hora = (v: unknown): Date | null => { const d = paraData(v); return d ? new Date(+d - 3 * 3600_000) : null; };
const dia = (v: unknown): Date | null => { const d = v instanceof Date ? v : paraData(v); return d; };

type Aba = { ws: ExcelJS.Worksheet; cols: Col[]; linhas: number; add(valores: Valor[], destaque?: boolean): void; fim(): void };

function criarAba(wb: ExcelJS.stream.xlsx.WorkbookWriter, nome: string, cols: Col[], cor: string, congelarColunas: number): Aba {
  const ws = wb.addWorksheet(nome, { properties: { tabColor: { argb: cor } }, views: [{ state: 'frozen', xSplit: congelarColunas, ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ width: c.larg }));
  const cab = ws.addRow(cols.map((c) => c.cab));
  cab.height = 30;
  cab.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  cab.commit();
  const aba: Aba = {
    ws, cols, linhas: 0,
    add(valores, destaque) {
      const row = ws.addRow(valores.map((v) => (v === undefined || v === '' ? null : v)));
      for (let i = 0; i < cols.length; i++) {
        const v = valores[i];
        if (v === undefined || v === null || v === '') continue;
        const fmt = FMT[cols[i].tipo ?? 'texto'];
        const cell = row.getCell(i + 1);
        if (fmt) cell.numFmt = fmt;
        if (destaque) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARELO } };
      }
      row.commit();
      aba.linhas++;
    },
    fim() {
      const ate = Math.max(2, aba.linhas + 1);
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ate, column: cols.length } } as never;
      ws.commit();
    },
  };
  return aba;
}

const valorLegivel = (v: unknown) => (typeof v === 'string' ? rotuloDoValor(v) : txt(v));
/**
 * A cada mil linhas devolve a vez ao laço de eventos: o zip comprime e solta o XML já escrito. Num laço síncrono, as linhas de todas as abas
 * ficavam acumuladas na memória até o fim (190 mil linhas de histórico, só elas, eram centenas de MB).
 */
const respirar = (aba: Aba): Promise<void> | undefined => (aba.linhas % 1000 === 0 ? new Promise<void>((ok) => setImmediate(ok)) : undefined);

const sn = (b: boolean | null) => (b === null ? '' : b ? 'Sim' : 'Não');
const ESTAB = (e: string) => e;

// ── Resumo ───────────────────────────────────────────────────────────────────

type LinhaResumo = { k: 'titulo' | 'alerta' | 'secao' | 'par' | 'cab' | 'linha' | 'total' | 'vazio' | 'nota'; v: Valor[] };

/** Exportação para revisão: a base de agora, dizendo qual foi a última versão liberada (ou que ainda não há nenhuma). */
export function textoDaBaseAtual(ultima: DadosEntrega['ultimaLiberada']): string {
  if (!ultima) return 'Base atual, para revisão (nenhuma versão liberada ainda)';
  return `Base atual, para revisão (inclui o que mudou depois da última versão liberada: Versão ${ultima.numero} — ${ultima.rotulo}, liberada em ${dataBr(paraData(ultima.criadaEm))})`;
}

function linhasResumo(m: Modelo, dados: DadosEntrega): LinhaResumo[] {
  const L: LinhaResumo[] = [];
  const p = dados.projeto;
  const nomeVersao = dados.versao ? `Versão ${dados.versao.numero} — ${dados.versao.rotulo}` : null;
  L.push({ k: 'titulo', v: [m.liberada ? 'Saneamento de estoques e cadastro de produtos — Entrega liberada' : 'Saneamento de estoques e cadastro de produtos — Exportação para revisão'] });
  if (!m.liberada) L.push({ k: 'alerta', v: ['EXPORTAÇÃO PARA REVISÃO: inclui itens e ajustes ainda propostos, não aprovados (marcados em amarelo e na coluna "Marca"). Não é a entrega liberada.'] });
  else if ([...m.porCamada.values()].some((x) => x.revisar > 0)) L.push({ k: 'alerta', v: [`ATENÇÃO: ${[...m.porCamada.values()].reduce((s, x) => s + x.revisar, 0)} célula(s) estão marcadas para revisão (a decisão anterior depende de dado que mudou). Esses itens saem como "Aguardando revisão", não como aprovados.`] });
  if (m.liberada) L.push({ k: 'nota', v: ['Entrega liberada: contém somente dados aprovados. O que ainda é proposto ou depende de informação ficou de fora e está listado abaixo e na aba "Pendências e histórico".'] });
  L.push({ k: 'vazio', v: [] });

  L.push({ k: 'secao', v: ['Identificação da entrega'] });
  const par = (k: string, v: Valor) => L.push({ k: 'par', v: [k, v] });
  par('Cliente', nomeCliente(m));
  if (projetoTexto(m, 'clienteDocumento')) par('CNPJ/CPF', projetoTexto(m, 'clienteDocumento'));
  if (projetoTexto(m, 'diagnosticoNome')) par('Projeto de consultoria', projetoTexto(m, 'diagnosticoNome'));
  par('Escopo', `Saneamento de estoques e cadastro de produtos com foco em IBS e CBS: ${comMilhar(m.itens.length)} itens do cadastro`);
  par('Data-base', dia(p.data_base));
  par('ERP', [txt(p.erp), txt(p.erp_versao)].filter(Boolean).join(' ') || '—');
  const estabs = Array.isArray(p.estabelecimentos) ? (p.estabelecimentos as unknown[]).map(txt).filter(Boolean) : [];
  par('Estabelecimentos', estabs.length ? estabs.join(', ') : 'Único');
  par('Versão', nomeVersao ?? textoDaBaseAtual(dados.ultimaLiberada));
  if (dados.versao) par('Versão liberada em', hora(dados.versao.criadaEm));
  par('Responsável', txt(p.responsavel) || '—');
  if (txt(p.atividades_confirmadas_por)) par('Atividades confirmadas por', `${txt(p.atividades_confirmadas_por)} em ${dataBr(paraData(p.atividades_confirmadas_em))}`);
  par('Gerado em', hora(new Date()));
  const mod = obj(p.modulos);
  par('Módulos opcionais ligados', [mod.conciliacao === true ? 'Conciliação de estoque' : '', mod.blocosKG === true ? 'Blocos K/G' : '', mod.arquivoErp === true ? 'Arquivo para o ERP' : ''].filter(Boolean).join(', ') || 'Nenhum');
  L.push({ k: 'vazio', v: [] });

  L.push({ k: 'secao', v: ['Cobertura por camada (itens × situação)'] });
  L.push({ k: 'cab', v: ['Camada', 'Itens', 'Pendente', 'Sem problema', 'Proposto', 'Aprovado', 'Aguardando informação', 'Cobertura (analisados)', 'Marcados para revisar'] });
  const tot = { itens: 0, PENDENTE: 0, SEM_PROBLEMA: 0, PROPOSTO: 0, APROVADO: 0, AGUARDANDO_INFORMACAO: 0, revisar: 0 };
  for (const camada of m.camadas) {
    const c = m.porCamada.get(camada)!; const s = c.porSituacao;
    const analisados = c.total - (s.PENDENTE ?? 0);
    L.push({ k: 'linha', v: [ROTULO_CAMADA[camada], c.total, s.PENDENTE ?? 0, s.SEM_PROBLEMA ?? 0, s.PROPOSTO ?? 0, s.APROVADO ?? 0, s.AGUARDANDO_INFORMACAO ?? 0, c.total ? analisados / c.total : 0, c.revisar] });
    tot.itens += c.total; tot.PENDENTE += s.PENDENTE ?? 0; tot.SEM_PROBLEMA += s.SEM_PROBLEMA ?? 0; tot.PROPOSTO += s.PROPOSTO ?? 0; tot.APROVADO += s.APROVADO ?? 0;
    tot.AGUARDANDO_INFORMACAO += s.AGUARDANDO_INFORMACAO ?? 0; tot.revisar += c.revisar;
  }
  L.push({ k: 'total', v: ['Total (células item × camada)', tot.itens, tot.PENDENTE, tot.SEM_PROBLEMA, tot.PROPOSTO, tot.APROVADO, tot.AGUARDANDO_INFORMACAO, tot.itens ? (tot.itens - tot.PENDENTE) / tot.itens : 0, tot.revisar] });
  L.push({ k: 'vazio', v: [] });

  L.push({ k: 'secao', v: ['Casos por camada'] });
  L.push({ k: 'cab', v: ['Camada', 'Casos', 'Aprovados', 'Rejeitados', 'Propostos', 'Em edição', 'Aguardando informação'] });
  const temCasos = [...m.casosPorCamada.keys()];
  for (const camada of [...m.camadas, ...temCasos.filter((c) => !(m.camadas as string[]).includes(c))]) {
    const r = m.casosPorCamada.get(camada); if (!r) continue;
    const total = Object.values(r).reduce((s, n) => s + n, 0);
    L.push({ k: 'linha', v: [ROTULO_CAMADA[camada as Camada] ?? camada, total, r.APROVADO ?? 0, r.REJEITADO ?? 0, r.PROPOSTO ?? 0, r.RASCUNHO ?? 0, r.AGUARDANDO_INFORMACAO ?? 0] });
  }
  L.push({ k: 'vazio', v: [] });

  const abertos = m.casos.filter((c) => CASO_PENDENTE.includes(c.situacao));
  L.push({ k: 'secao', v: [m.liberada ? 'O que ficou fora desta entrega e pendências' : 'Pendências'] });
  par('Casos pendentes (propostos, em edição ou aguardando informação)', abertos.length);
  par('  dos quais aguardando informação', abertos.filter((c) => c.situacao === 'AGUARDANDO_INFORMACAO').length);
  par('Itens com alguma camada ainda não aprovada nem sem problema', m.itens.filter((it) => m.camadas.some((c) => { const s = celula(m, it.id, c)?.situacao ?? 'PENDENTE'; return s !== 'APROVADO' && s !== 'SEM_PROBLEMA'; })).length);
  if (m.liberada) {
    par('Ajustes propostos e não aprovados, excluídos desta entrega', abertos.filter((c) => c.situacao !== 'AGUARDANDO_INFORMACAO' && Object.keys(c.proposta).length > 0).length);
    par('Linhas de impacto no SPED excluídas (caso não aprovado)', m.impactosExcluidos);
  }
  par('Impactos no SPED registrados', m.impactos.length);
  const comp = competenciaEntregue(m);
  par('Última competência de escrituração já entregue', comp ? competenciaBr(comp) : 'não informada');
  const entregue = m.impactos.filter((i) => i.tipo === 'ESCRITURACAO_ENTREGUE' || i.tipo === 'ESCRITURACAO_JA_ENTREGUE').length;
  par('Impacto em escrituração já entregue', entregue ? `${entregue} linha(s)` : textoSemEscrituracaoEntregue(m));
  par('Vínculos de código (de/para) registrados', m.vinculos.length);
  par('Alterações registradas no histórico', m.decisoes.length);
  L.push({ k: 'vazio', v: [] });
  L.push({ k: 'nota', v: ['Material de apoio à decisão; não constitui parecer jurídico nem tributário. Nesta aba, "Cobertura" é a parcela de células já analisadas (diferentes de "Pendente").'] });
  L.push({ k: 'nota', v: ['Nas abas de itens, o cenário que não se aplica à finalidade do item não gera linha.'] });
  return L;
}

function escreverResumo(wb: ExcelJS.stream.xlsx.WorkbookWriter, m: Modelo, dados: DadosEntrega): void {
  const ws = wb.addWorksheet(NOMES_ABAS[0], { properties: { tabColor: { argb: m.liberada ? VERDE : LARANJA } }, views: [{ showGridLines: false }] });
  ws.columns = [{ width: 52 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }];
  for (const l of linhasResumo(m, dados)) {
    const row = ws.addRow(l.v.map((v) => (v === '' || v === undefined ? null : v)));
    if (l.k === 'titulo') { row.getCell(1).font = { bold: true, size: 14, color: { argb: VERDE } }; row.height = 24; }
    if (l.k === 'alerta') { row.getCell(1).font = { bold: true, color: { argb: 'FFB00020' } }; row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARELO } }; }
    if (l.k === 'nota') row.getCell(1).font = { italic: true, color: { argb: 'FF5B6B63' } };
    if (l.k === 'secao') { row.getCell(1).font = { bold: true, size: 11, color: { argb: VERDE } }; row.getCell(1).border = { bottom: { style: 'thin', color: { argb: VERDE } } }; }
    if (l.k === 'par') {
      row.getCell(1).font = { bold: true };
      const v = l.v[1];
      if (v instanceof Date) row.getCell(2).numFmt = Number.isInteger(+v / 86_400_000) ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm';
      row.getCell(2).alignment = { horizontal: 'left' };
    }
    if (l.k === 'cab') row.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }; c.alignment = { wrapText: true, vertical: 'middle' }; });
    if (l.k === 'linha' || l.k === 'total') {
      row.eachCell((c, i) => { if (i > 1) c.numFmt = '#,##0'; if (l.k === 'total') c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: l.k === 'total' ? 'FFDCE5E0' : CINZA } }; });
      if (typeof l.v[7] === 'number' && l.v.length === 9) row.getCell(8).numFmt = '0%';
    }
    row.commit();
  }
  ws.commit();
}

// ── Abas de dados ────────────────────────────────────────────────────────────

async function abaCadastro(wb: ExcelJS.stream.xlsx.WorkbookWriter, m: Modelo): Promise<void> {
  const fixas: Col[] = [
    { cab: 'Código', larg: 16, tipo: 'codigo' }, { cab: 'Estabelecimento', larg: 14, tipo: 'codigo' }, { cab: 'Descrição original', larg: 44 }, { cab: 'Descrição saneada', larg: 44 },
    { cab: 'Unidade', larg: 9 }, { cab: 'NCM', larg: 12, tipo: 'codigo' }, { cab: 'Grupo', larg: 24 }, { cab: 'Finalidade', larg: 22 }, { cab: 'Origem da finalidade', larg: 34 }, { cab: 'Também usado como', larg: 26 },
    { cab: 'Ativo', larg: 7 }, { cab: 'Campos alterados', larg: 22 },
  ];
  const camadas = m.camadas.map((c) => ({ cab: ROTULO_CAMADA[c], larg: 17 }));
  const cols: Col[] = [...fixas, ...camadas, { cab: 'Camadas a revisar', larg: 26 }];
  if (!m.liberada) cols.push({ cab: 'Marca', larg: 24 }, { cab: 'Propostas não aprovadas', larg: 60 });
  cols.push({ cab: 'ID interno', larg: 26, tipo: 'codigo' });
  const aba = criarAba(wb, NOMES_ABAS[1], cols, m.liberada ? VERDE : LARANJA, 1);
  const propostas = m.liberada ? new Map<string, string[]>() : propostasEmAberto(m);
  const rotuloFin = (f: string | null) => (f ? ROTULO_FINALIDADE_TXT[f] ?? f : '');
  for (const it of m.itens) {
    const cel = m.camadas.map((c) => celula(m, it.id, c));
    const revisar = m.camadas.filter((c, i) => cel[i]?.revisar).map((c) => ROTULO_CAMADA[c]).join(', ');
    const temProposta = cel.some((c) => c?.situacao === 'PROPOSTO');
    const linha: Valor[] = [
      it.codigo, ESTAB(it.estab), it.descricaoOriginal, it.descricao, it.unidade, it.ncm, it.grupo, rotuloFin(it.finalidade), origemDaFinalidade(m, it), it.tambem.join(', '), sn(it.ativo), it.camposAlterados.map(rotuloDoCampo).join(', '),
      ...cel.map(rotuloSituacaoCelula), revisar,
    ];
    if (!m.liberada) linha.push(temProposta ? MARCA_PROPOSTA : '', (propostas.get(it.id) ?? []).join(' | '));
    linha.push(it.id);
    aba.add(linha, !m.liberada && temProposta);
    await respirar(aba);
  }
  aba.fim();
}

const ROTULO_FINALIDADE_TXT: Record<string, string> = ROTULO_FINALIDADE;

/** Colunas do mapa de unificações (aba "De para e equivalências" e o Excel só do mapa). Sem código interno: o cliente lê a lista e ajusta o ERP. */
function colunasDoMapa(liberada: boolean): Col[] {
  const cols: Col[] = [
    { cab: 'Tipo de registro', larg: 24 }, { cab: 'Código que morre', larg: 18, tipo: 'codigo' }, { cab: 'Estabelecimento', larg: 14, tipo: 'codigo' },
    { cab: 'Descrição (código que morre)', larg: 40 }, { cab: 'Unidade (código que morre)', larg: 10 }, { cab: 'Saldo (código que morre)', larg: 14, tipo: 'quantidade' },
    { cab: 'Código que fica', larg: 18, tipo: 'codigo' }, { cab: 'Descrição (código que fica)', larg: 40 }, { cab: 'Unidade (código que fica)', larg: 10 },
    { cab: 'Saldo atual (código que fica)', larg: 14, tipo: 'quantidade' }, { cab: 'Saldo que entra', larg: 14, tipo: 'quantidade' }, { cab: 'Saldo consolidado', larg: 14, tipo: 'quantidade' },
    { cab: 'Situação', larg: 18 }, { cab: 'Ação no ERP', larg: 56 }, { cab: 'Início da vigência', larg: 13, tipo: 'data' }, { cab: 'Justificativa', larg: 60 },
    { cab: 'Alerta de coerência', larg: 60 }, { cab: 'Responsável', larg: 24 }, { cab: 'Data da decisão', larg: 16, tipo: 'datahora' },
  ];
  if (!liberada) cols.push({ cab: 'Marca', larg: 24 });
  return cols;
}

async function escreverMapa(wb: ExcelJS.stream.xlsx.WorkbookWriter, linhas: LinhaMapa[], liberada: boolean, nome: string): Promise<void> {
  const aba = criarAba(wb, nome, colunasDoMapa(liberada), liberada ? VERDE : LARANJA, 2);
  for (const l of linhas) {
    const aberta = l.situacao === 'PROPOSTA' || l.situacao === 'AGUARDANDO';
    const linha: Valor[] = [
      l.rotuloTipo || ROTULO_TIPO_MAPA[l.tipo], l.morre?.codigo, l.morre?.estab, l.morre?.descricao, l.morre?.unidade, l.morre?.saldo,
      l.fica?.codigo, l.fica?.descricao, l.fica?.unidade, l.fica?.saldo, l.saldoEntra, l.saldoConsolidado,
      ROTULO_SITUACAO_MAPA[l.situacao], l.acao, dia(l.inicio), l.justificativa, l.alertas.join(' '), l.responsavel, hora(l.decididoEm),
    ];
    if (!liberada) linha.push(aberta ? MARCA_PROPOSTA : '');
    aba.add(linha, !liberada && aberta);
    await respirar(aba);
  }
  aba.fim();
}

const abaDePara = (wb: ExcelJS.stream.xlsx.WorkbookWriter, m: Modelo) => escreverMapa(wb, mapaDoModelo(m), m.liberada, NOMES_ABAS[2]);

/** Excel só com o mapa de unificações e inativações (botão da consulta "Unificações"): o mesmo conteúdo da aba "De para e equivalências". */
export async function gerarExcelMapa(linhas: LinhaMapa[], opcoes: { liberada?: boolean; titulo?: string } = {}): Promise<Buffer> {
  const saida = new PassThrough();
  const partes: Buffer[] = [];
  saida.on('data', (c: Buffer) => partes.push(c));
  const fim = new Promise<void>((ok, erro) => { saida.on('end', ok); saida.on('error', erro); });
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: saida, useStyles: true, useSharedStrings: false });
  wb.creator = 'InTAX — FAL Agro';
  wb.title = opcoes.titulo ?? 'Saneamento de estoques — unificações e inativações';
  wb.created = new Date();
  await escreverMapa(wb, linhas, opcoes.liberada === true, 'Unificações e inativações');
  await wb.commit();
  await fim;
  return Buffer.concat(partes);
}

async function abaCenarios(wb: ExcelJS.stream.xlsx.WorkbookWriter, m: Modelo): Promise<void> {
  const cols: Col[] = [
    { cab: 'Código', larg: 16, tipo: 'codigo' }, { cab: 'Estabelecimento', larg: 14, tipo: 'codigo' }, { cab: 'Descrição saneada', larg: 40 }, { cab: 'NCM', larg: 12, tipo: 'codigo' },
    { cab: 'Finalidade', larg: 20 }, { cab: 'Cenário', larg: 20 }, { cab: 'Enquadramento legal (texto da lei)', larg: 60 }, { cab: 'Artigo / anexo', larg: 30 },
    { cab: 'CST', larg: 8, tipo: 'codigo' }, { cab: 'cClassTrib', larg: 11, tipo: 'codigo' }, { cab: 'Origem', larg: 20 }, { cab: 'Situação', larg: 20 }, { cab: 'Observação', larg: 60 },
  ];
  if (!m.liberada) cols.push({ cab: 'Marca', larg: 30 });
  cols.push({ cab: 'ID interno', larg: 26, tipo: 'codigo' });
  const aba = criarAba(wb, NOMES_ABAS[3], cols, m.liberada ? VERDE : LARANJA, 1);
  for (const it of m.itens) {
    for (const l of linhasDeCenario(m, it)) {
      const linha: Valor[] = [it.codigo, it.estab, it.descricao, it.ncm, it.finalidade ? ROTULO_FINALIDADE_TXT[it.finalidade] ?? it.finalidade : '', l.cenario, l.enquadramentoLegal, l.artigo, l.cst, l.cClassTrib, l.origem, l.situacao, l.observacao];
      if (!m.liberada) linha.push(l.marca);
      linha.push(it.id);
      aba.add(linha, !m.liberada && !!l.marca);
      await respirar(aba);
    }
  }
  aba.fim();
}

async function abaImpactos(wb: ExcelJS.stream.xlsx.WorkbookWriter, m: Modelo): Promise<void> {
  const cols: Col[] = [
    { cab: 'Obrigação', larg: 24 }, { cab: 'Competência', larg: 13, tipo: 'codigo' }, { cab: 'Versão do leiaute', larg: 16 }, { cab: 'Registro', larg: 10, tipo: 'codigo' }, { cab: 'Campo', larg: 18 },
    { cab: 'Valor original', larg: 22, tipo: 'codigo' }, { cab: 'Valor proposto', larg: 22, tipo: 'codigo' }, { cab: 'Motivo', larg: 50 }, { cab: 'Evidência', larg: 40 }, { cab: 'Início', larg: 12, tipo: 'data' },
    { cab: 'Avaliar períodos anteriores', larg: 14 }, { cab: 'Responsável', larg: 22 }, { cab: 'Tipo de ajuste', larg: 32 }, { cab: 'Camada / caso', larg: 30 },
  ];
  if (!m.liberada) cols.push({ cab: 'Marca', larg: 24 });
  const aba = criarAba(wb, NOMES_ABAS[4], cols, m.liberada ? VERDE : LARANJA, 0);
  for (const i of m.impactos) {
    const caso = i.casoId ? m.casoPorId.get(i.casoId) : undefined;
    const aberto = !!caso && CASO_PENDENTE.includes(caso.situacao);
    const linha: Valor[] = [
      rotuloObrigacao(i.obrigacao), i.competencia, i.leiaute || 'não confirmado', i.registro, i.campo, i.valorOriginal, i.valorProposto, i.motivo, i.evidencia, dia(i.inicio),
      i.avaliarAnteriores ? 'Sim' : 'Não', i.responsavel, rotuloTipoAjuste(i.tipo), caso ? rotuloDoCaso(caso.camada, caso.tipo) : '',
    ];
    if (!m.liberada) linha.push(aberto ? MARCA_PROPOSTA : '');
    aba.add(linha, !m.liberada && aberto);
    await respirar(aba);
  }
  aba.fim();
}

async function abaPendencias(wb: ExcelJS.stream.xlsx.WorkbookWriter, m: Modelo): Promise<void> {
  const cols: Col[] = [
    { cab: 'Registro', larg: 12 }, { cab: 'Camada', larg: 20 }, { cab: 'Tipo do caso', larg: 26 }, { cab: 'Situação / tipo', larg: 20 }, { cab: 'Código do item', larg: 16, tipo: 'codigo' },
    { cab: 'Estabelecimento', larg: 14, tipo: 'codigo' }, { cab: 'Qtde de itens', larg: 9, tipo: 'numero' }, { cab: 'Campo', larg: 18 }, { cab: 'Antes', larg: 34, tipo: 'codigo' }, { cab: 'Depois', larg: 34, tipo: 'codigo' },
    { cab: 'Fundamento / problema', larg: 60 }, { cab: 'Motivo', larg: 36 }, { cab: 'Responsável', larg: 24 }, { cab: 'Data', larg: 16, tipo: 'datahora' }, { cab: 'ID do caso', larg: 26, tipo: 'codigo' },
  ];
  const aba = criarAba(wb, NOMES_ABAS[5], cols, m.liberada ? VERDE : LARANJA, 0);
  for (const c of m.casos) {
    if (!CASO_PENDENTE.includes(c.situacao)) continue;
    aba.add([
      'Pendência', ROTULO_CAMADA[c.camada as Camada] ?? c.camada, rotuloTipoCaso(c.tipo), ROTULO_SITUACAO_CASO[c.situacao] ?? c.situacao, codigosDosItens(m, c.itens, 6), '', c.itens.length, '',
      resumoCampos(c.atual), resumoCampos(c.proposta), [c.problema, c.fundamento].filter(Boolean).join(' · '), c.motivo || c.justificativa, c.responsavel, hora(c.criadoEm), c.id,
    ], !m.liberada && c.situacao !== 'AGUARDANDO_INFORMACAO');
    await respirar(aba);
  }
  const rotuloTipo: Record<string, string> = { aprovar: 'Aprovada', rejeitar: 'Rejeitada', desfazer: 'Desfeita', importar: 'Reimportação' };
  for (const d of m.decisoes) {
    const it = m.porId.get(d.itemId);
    const caso = d.casoId ? m.casoPorId.get(d.casoId) : undefined;
    aba.add([
      'Histórico', caso ? ROTULO_CAMADA[caso.camada as Camada] ?? caso.camada : '', caso ? rotuloTipoCaso(caso.tipo) : '', rotuloTipo[d.tipo] ?? d.tipo, it?.codigo ?? d.itemId, it?.estab ?? '', null, d.campo.startsWith('caso:') ? 'Aprovação do caso' : rotuloDoCampo(d.campo),
      valorLegivel(d.antes), valorLegivel(d.depois), d.fundamento, '', d.usuario, hora(d.quando), d.casoId ?? '',
    ]);
    await respirar(aba);
  }
  aba.fim();
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
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: saida, useStyles: true, useSharedStrings: false });
  wb.creator = 'InTAX — FAL Agro';
  wb.title = m.liberada ? 'Saneamento de estoques — entrega liberada' : 'Saneamento de estoques — exportação para revisão';
  wb.created = new Date();
  escreverResumo(wb, m, dados);
  await abaCadastro(wb, m);
  await abaDePara(wb, m);
  await abaCenarios(wb, m);
  await abaImpactos(wb, m);
  await abaPendencias(wb, m);
  await wb.commit();
  await fim;
  return Buffer.concat(partes);
}
