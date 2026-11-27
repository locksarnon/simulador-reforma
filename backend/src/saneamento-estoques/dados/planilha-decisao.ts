/**
 * Planilha de decisão por camada (ida e volta em Excel): o consultor baixa os casos em aberto de uma camada, decide caso a caso no Excel
 * (Aprovar, Rejeitar ou Pedir informação, com motivo e, quando couber, o valor corrigido) e reimporta. Este arquivo é PURO (sem banco):
 * monta a planilha, lê o arquivo devolvido e confere cada linha. O serviço (`planilha-decisao.service.ts`) carrega o que a conferência
 * precisa e executa as decisões pelos mesmos caminhos da tela (aprovar, rejeitar, pedir informação).
 */
import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { rotuloDoCampo, rotuloDoValor, rotuloTipoCaso, ROTULO_CAMADA } from '../rotulos';
import { CASO_ABERTO, propostaAplicavel, type Json, type SituacaoCaso } from './constantes';
import { lerFator } from '../motor';

// ── Colunas ──────────────────────────────────────────────────────────────────

export const ABA_CASOS = 'Casos';
export const ABA_ITENS = 'Itens do caso';
export const ABA_CONTROLE = 'Controle';
export const DECISOES = ['Aprovar', 'Rejeitar', 'Pedir informação'] as const;
export type AcaoPlanilha = 'aprovar' | 'rejeitar' | 'pedir';
/** Situações que a planilha leva: as em aberto e o "aguardando informação". */
export const SITUACOES_DA_PLANILHA: SituacaoCaso[] = ['PROPOSTO', 'RASCUNHO', 'AGUARDANDO_INFORMACAO'];

/** Colunas da aba Casos, na ordem. `editavel` = a única parte da aba que o Excel deixa alterar. */
export const COLUNAS = [
  { chave: 'id', cab: 'ID do caso', larg: 28 },
  { chave: 'versao', cab: 'Versão do caso', larg: 9 },
  { chave: 'camada', cab: 'Camada', larg: 16 },
  { chave: 'situacao', cab: 'Situação', larg: 16 },
  { chave: 'tipo', cab: 'Tipo', larg: 26 },
  { chave: 'problema', cab: 'Problema', larg: 44 },
  { chave: 'qtd', cab: 'Qtd. de itens', larg: 9 },
  { chave: 'codigos', cab: 'Códigos dos itens', larg: 24 },
  { chave: 'grupo', cab: 'Grupo', larg: 20 },
  { chave: 'atual', cab: 'Valor atual', larg: 30 },
  { chave: 'proposta', cab: 'Proposta', larg: 30 },
  { chave: 'fundamento', cab: 'Fundamento', larg: 36 },
  { chave: 'campoCorrigivel', cab: 'Campo do valor corrigido', larg: 14 },
  { chave: 'decisao', cab: 'Decisão', larg: 16, editavel: true },
  { chave: 'motivo', cab: 'Motivo', larg: 36, editavel: true },
  { chave: 'valorCorrigido', cab: 'Valor corrigido', larg: 24, editavel: true },
] as const;
type ChaveColuna = (typeof COLUNAS)[number]['chave'];
const LINHA_CABECALHO = 7;

const FONTE = 'Arial';
const COR = { navy: 'FF243B55', verde: 'FF1C682F', borda: 'FFC9CFD6', entrada: 'FFFFF8DC', texto: 'FF1F2937', suave: 'FF5B6675', branco: 'FFFFFFFF', faixa: 'FFE9EDF2' };
const fonte = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONTE, size: 10, color: { argb: COR.texto }, ...o });
const preenche = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const traco = { style: 'thin' as const, color: { argb: COR.borda } };
const caixa = { top: traco, left: traco, bottom: traco, right: traco };

export const INSTRUCOES = [
  '1. Em cada linha, escolha a Decisão na lista: Aprovar, Rejeitar ou Pedir informação. Linha sem decisão fica como está.',
  '2. Motivo é obrigatório para Rejeitar, Pedir informação e para aprovar exceção. Valor corrigido só quando discordar da proposta, e só no campo indicado.',
  '3. Não altere as demais colunas. Salve e reimporte em "Planilha de decisão" > Reimportar: a prévia mostra o que será feito antes de aplicar.',
];

// ── Regras do caso ───────────────────────────────────────────────────────────

/** Tipo de exceção: aprovar exige motivo escrito. */
export const ehTipoDeExcecao = (tipo: string) => tipo === 'FINALIDADE_EXCECAO' || tipo.startsWith('EXCECAO_');
/** Motivo mínimo da exceção (o mesmo da aprovação na tela). */
export const MOTIVO_MINIMO_EXCECAO = 5;

const TIPOS_DE_DESCRICAO = ['DESCRICAO_FORA_DO_PADRAO', 'DESCRICAO_FORA_PADRAO', 'TERMO_GENERICO', 'TERMO_PROIBIDO', 'COMPONENTE_AUSENTE', 'ABREVIACAO_ESCONDE_ATRIBUTO', 'CARACTERES_INVALIDOS', 'DESCRICAO_INSUFICIENTE'];

/**
 * Campo que o caso corrige e que o "Valor corrigido" pode trocar (NCM, descrição ou unidade): a mesma regra da tela (`campoAlvoDoCaso`).
 * Conjunto (mais de um item) não tem valor corrigido: um valor só para todos os itens é decisão da proposta, não correção.
 */
export function campoCorrigivel(c: { tipo: string; camada: string; itens: string[]; proposta?: unknown; atual?: unknown }): 'ncm' | 'descricao' | 'unidade' | null {
  const t = String(c.tipo || '');
  if (c.itens.length !== 1) return null;
  if (!t || t.startsWith('AGUARDANDO') || t.startsWith('IMPACTO_') || c.camada === 'DUPLICIDADE') return null;
  if (t.startsWith('NCM_')) return 'ncm';
  if (t.startsWith('UNIDADE_') && t !== 'UNIDADE_CONVERSAO') return 'unidade';
  if (TIPOS_DE_DESCRICAO.includes(t)) return 'descricao';
  if (t === 'TAMANHO_EXCEDIDO' || t === 'EXCEDE_LIMITE_DESTINO') {
    const k = Object.keys((c.proposta as Json) ?? {}).find((x) => x === 'descricao' || x === 'unidade') ?? Object.keys((c.atual as Json) ?? {}).find((x) => x === 'descricao' || x === 'unidade');
    return (k as 'descricao' | 'unidade' | undefined) ?? null;
  }
  return null;
}

// ── Montagem ─────────────────────────────────────────────────────────────────

export type CasoDaPlanilha = {
  id: string; versao: number; camada: string; situacao: string; tipo: string; problema: string; itens: string[]; atual: unknown; proposta: unknown;
  fundamento: string | null; justificativa: string;
};
export type ItemDaPlanilha = { id: string; codigo: string; descricao: string | null; grupo: string | null; ncm: string | null; unidade: string | null; saldo: number | null };
export type DadosPlanilha = { projetoId: string; projetoNome: string; camada: string; geradaEm: Date; casos: CasoDaPlanilha[]; itens: Map<string, ItemDaPlanilha> };

const ROTULO_SITUACAO: Record<string, string> = { PROPOSTO: 'Proposto', RASCUNHO: 'Em rascunho', AGUARDANDO_INFORMACAO: 'Aguardando informação' };
export const rotuloCamada = (c: string) => (ROTULO_CAMADA as Record<string, string>)[c] ?? c;
const valorTxt = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (Array.isArray(v)) return v.map(valorTxt).join(', ');
  return typeof v === 'string' ? rotuloDoValor(v) : String(v);
};
/** "Campo: valor; Campo: valor" (só os campos com valor). */
export function camposEmTexto(o: unknown): string {
  const p = (o as Json) ?? {};
  return Object.entries(p).filter(([k]) => k !== 'codigo').map(([k, v]) => `${rotuloDoCampo(k)}: ${valorTxt(v)}`).join('; ');
}
/** Proposta em texto: só o que a aprovação aplica; decisão de duplicidade e textos auxiliares ficam legíveis. */
function propostaEmTexto(c: CasoDaPlanilha): string {
  const p = (c.proposta as Json) ?? {};
  const aplicavel = propostaAplicavel(c.camada, p);
  const partes = [camposEmTexto(aplicavel)].filter(Boolean);
  if (p.decisao !== undefined) partes.unshift(`Decisão: ${valorTxt(p.decisao)}`);
  if (p.manter) partes.push(`Código que fica: ${String(p.manter)}`);
  if (p.consolidar) partes.push(`Códigos que saem: ${String(p.consolidar).split('|').join(', ')}`);
  if (p.fatorConversao !== undefined) partes.push(`Fator: ${valorTxt(p.fatorConversao)}`);
  return partes.join('; ') || 'Sem proposta';
}
const dataHora = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Nome do arquivo: "Planilha de decisão - <camada> - <aaaa-mm-dd>.xlsx" (sem acento estranho nem barra). */
export function nomeDaPlanilha(camada: string, d: Date): string {
  const dia = d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return `Planilha de decisao - ${rotuloCamada(camada).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w ()-]/g, '')} - ${dia}.xlsx`;
}

/** Monta o Excel (Padrão FAL: Arial, cabeçalho azul, cabeçalho congelado, filtros, aba protegida exceto as colunas de decisão). */
export async function montarPlanilha(d: DadosPlanilha): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'InTAX · FAL Agro';
  wb.created = d.geradaEm;
  const ws = wb.addWorksheet(ABA_CASOS, {
    properties: { tabColor: { argb: COR.verde } },
    views: [{ state: 'frozen', xSplit: 1, ySplit: LINHA_CABECALHO, showGridLines: false, zoomScale: 90 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = COLUNAS.map((c) => ({ width: c.larg }));
  const ultimaCol = COLUNAS.length;

  const t = ws.getCell(1, 1);
  t.value = `Planilha de decisão — ${rotuloCamada(d.camada)}`;
  t.font = fonte({ size: 15, bold: true, color: { argb: COR.navy } });
  const info = ws.getCell(2, 1);
  info.value = `Projeto: ${d.projetoNome || '—'}     |     Camada: ${rotuloCamada(d.camada)}     |     Gerada em: ${dataHora(d.geradaEm)}     |     ${d.casos.length.toLocaleString('pt-BR')} caso(s)`;
  info.font = fonte({ size: 10.5, color: { argb: COR.suave } });
  for (let c = 1; c <= ultimaCol; c++) ws.getCell(2, c).border = { bottom: { style: 'medium', color: { argb: COR.verde } } };
  INSTRUCOES.forEach((txt, i) => {
    const cel = ws.getCell(3 + i, 1);
    cel.value = txt;
    cel.font = fonte({ size: 10, color: { argb: COR.texto } });
  });

  const cab = ws.getRow(LINHA_CABECALHO);
  cab.height = 32;
  COLUNAS.forEach((col, i) => {
    const c = cab.getCell(i + 1);
    c.value = col.cab;
    c.font = fonte({ bold: true, color: { argb: COR.branco } });
    c.fill = preenche(('editavel' in col && col.editavel) ? COR.verde : COR.navy);
    c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    c.border = caixa;
  });

  const ordem = (s: string) => (s === 'AGUARDANDO_INFORMACAO' ? 1 : 0);
  const casos = [...d.casos].sort((a, b) => ordem(a.situacao) - ordem(b.situacao) || a.tipo.localeCompare(b.tipo) || a.id.localeCompare(b.id));
  let r = LINHA_CABECALHO;
  for (const c of casos) {
    r++;
    const itens = c.itens.map((i) => d.itens.get(i)).filter((x): x is ItemDaPlanilha => !!x);
    const grupos = [...new Set(itens.map((i) => i.grupo || '(sem grupo)'))];
    const campo = campoCorrigivel(c);
    const valores: Record<ChaveColuna, string | number> = {
      id: c.id, versao: c.versao, camada: rotuloCamada(c.camada), situacao: ROTULO_SITUACAO[c.situacao] ?? c.situacao, tipo: rotuloTipoCaso(c.tipo), problema: c.problema,
      qtd: c.itens.length, codigos: itens.slice(0, 20).map((i) => i.codigo).join(', ') + (c.itens.length > 20 ? ', …' : ''),
      grupo: grupos.length > 3 ? `${grupos.slice(0, 3).join(', ')} e mais ${grupos.length - 3}` : grupos.join(', '),
      atual: camposEmTexto(c.atual) || '—', proposta: propostaEmTexto(c), fundamento: c.fundamento || c.justificativa || '—',
      campoCorrigivel: campo ? rotuloDoCampo(campo) : '—', decisao: '', motivo: '', valorCorrigido: '',
    };
    const row = ws.getRow(r);
    COLUNAS.forEach((col, i) => {
      const cel = row.getCell(i + 1);
      const v = valores[col.chave];
      cel.value = v === '' ? null : v;
      cel.font = fonte();
      cel.border = caixa;
      cel.alignment = { vertical: 'top', wrapText: true };
      if (col.chave === 'id' || col.chave === 'codigos' || col.chave === 'valorCorrigido') cel.numFmt = '@';
      if ('editavel' in col && col.editavel) {
        cel.protection = { locked: false };
        cel.fill = preenche(COR.entrada);
      }
    });
    row.getCell(COLUNAS.findIndex((x) => x.chave === 'decisao') + 1).dataValidation = {
      type: 'list', allowBlank: true, showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Decisão', error: 'Escolha Aprovar, Rejeitar ou Pedir informação (ou deixe vazio).',
      formulae: [`"${DECISOES.join(',')}"`],
    };
  }
  ws.autoFilter = { from: { row: LINHA_CABECALHO, column: 1 }, to: { row: Math.max(r, LINHA_CABECALHO + 1), column: ultimaCol } };
  await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, autoFilter: true, sort: false, formatColumns: true, formatRows: true });

  // Itens de cada caso (consulta; aba inteira protegida).
  const wi = wb.addWorksheet(ABA_ITENS, { properties: { tabColor: { argb: COR.navy } }, views: [{ state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: false }] });
  const colItens = [['ID do caso', 28], ['Código', 16], ['Descrição', 50], ['Grupo', 22], ['NCM', 12], ['Unidade', 10], ['Saldo', 14]] as const;
  wi.columns = colItens.map(([, w]) => ({ width: w }));
  const ci = wi.getRow(1);
  colItens.forEach(([nome], i) => { const c = ci.getCell(i + 1); c.value = nome; c.font = fonte({ bold: true, color: { argb: COR.branco } }); c.fill = preenche(COR.navy); c.border = caixa; });
  let ri = 1;
  for (const c of casos) {
    for (const id of c.itens) {
      const it = d.itens.get(id);
      if (!it) continue;
      ri++;
      const row = wi.getRow(ri);
      [c.id, it.codigo, it.descricao, it.grupo, it.ncm, it.unidade, it.saldo].forEach((v, i) => {
        const cel = row.getCell(i + 1);
        cel.value = v === null || v === undefined || v === '' ? null : v;
        cel.font = fonte();
        if (i <= 1 || i === 4) cel.numFmt = '@';
        if (i === 6) cel.numFmt = '#,##0.00##';
      });
    }
  }
  wi.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(ri, 2), column: colItens.length } };
  await wi.protect('', { selectLockedCells: true, selectUnlockedCells: true, autoFilter: true, sort: false });

  // Controle (oculta): de que projeto e camada é a planilha.
  const wc = wb.addWorksheet(ABA_CONTROLE, { state: 'veryHidden' });
  wc.addRow(['projeto', d.projetoId]);
  wc.addRow(['camada', d.camada]);
  wc.addRow(['gerada_em', d.geradaEm.toISOString()]);
  await wc.protect('', {});
  return wb;
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export type LinhaLida = { linha: number; id: string; versao: string; decisao: string; motivo: string; valorCorrigido: string; valorNumerico: boolean };
export type PlanilhaLida = { projetoId: string | null; camada: string | null; linhas: LinhaLida[] };

const celTxt = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if ('richText' in o) return (o.richText as { text: string }[]).map((x) => x.text).join('').trim();
    if ('result' in o) return celTxt(o.result as ExcelJS.CellValue);
    if ('text' in o) return String(o.text).trim();
    return '';
  }
  return String(v).trim();
};

export class ErroPlanilha extends Error {}

/** Lê o arquivo devolvido: as linhas da aba Casos (pelo cabeçalho, não pela posição) e o controle oculto, quando houver. */
export async function lerPlanilhaDecisao(buffer: Buffer): Promise<PlanilhaLida> {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer as never); } catch { throw new ErroPlanilha('Não consegui abrir o Excel. Envie a planilha de decisão baixada do InTAX, salva como .xlsx.'); }
  const ws = wb.getWorksheet(ABA_CASOS);
  if (!ws) throw new ErroPlanilha(`A planilha não tem a aba "${ABA_CASOS}". Envie a planilha de decisão baixada do InTAX.`);
  let linhaCab = 0;
  const pos: Partial<Record<ChaveColuna, number>> = {};
  for (let r = 1; r <= Math.min(30, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const achou: Partial<Record<ChaveColuna, number>> = {};
    row.eachCell((cel, col) => { const k = COLUNAS.find((c) => c.cab === celTxt(cel.value)); if (k) achou[k.chave] = col; });
    if (achou.id && achou.decisao) { linhaCab = r; Object.assign(pos, achou); break; }
  }
  if (!linhaCab) throw new ErroPlanilha('Não encontrei o cabeçalho da planilha de decisão (coluna "ID do caso"). Envie a planilha baixada do InTAX, sem apagar colunas.');
  for (const k of ['versao', 'motivo', 'valorCorrigido'] as const) if (!pos[k]) throw new ErroPlanilha(`A coluna "${COLUNAS.find((c) => c.chave === k)!.cab}" sumiu da planilha. Baixe a planilha de novo.`);
  const linhas: LinhaLida[] = [];
  for (let r = linhaCab + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const v = (k: ChaveColuna) => (pos[k] ? celTxt(row.getCell(pos[k]!).value) : '');
    const id = v('id');
    const resto = [v('decisao'), v('motivo'), v('valorCorrigido')];
    if (!id && resto.every((x) => !x)) continue;
    const bruto = pos.valorCorrigido ? row.getCell(pos.valorCorrigido).value : null;
    linhas.push({ linha: r, id, versao: v('versao'), decisao: resto[0], motivo: resto[1], valorCorrigido: resto[2], valorNumerico: typeof bruto === 'number' });
  }
  const wc = wb.getWorksheet(ABA_CONTROLE);
  const controle = new Map<string, string>();
  wc?.eachRow((row) => controle.set(celTxt(row.getCell(1).value), celTxt(row.getCell(2).value)));
  return { projetoId: controle.get('projeto') || null, camada: controle.get('camada') || null, linhas };
}

/** Resumo do arquivo para a auditoria: nome e os 12 primeiros caracteres do SHA-256. */
export const sha256Curto = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 12);
/** Sufixo gravado na justificativa ou no motivo de cada decisão vinda da planilha. */
export const sufixoDaPlanilha = (nome: string, sha: string) => `(planilha ${String(nome || 'arquivo').replace(/[()]/g, '').slice(0, 120)}, ${sha})`;

// ── Conferência de uma linha ─────────────────────────────────────────────────

const semAcento = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** Decisão escrita → ação ("" = sem decisão; null = texto que não é nenhuma das três). */
export function lerDecisao(t: string): AcaoPlanilha | '' | null {
  const s = semAcento(t);
  if (!s) return '';
  if (s === 'aprovar' || s === 'aprovado') return 'aprovar';
  if (s === 'rejeitar' || s === 'rejeitado') return 'rejeitar';
  if (s === 'pedir informacao' || s === 'pedir informacoes' || s === 'solicitar informacao') return 'pedir';
  return null;
}

/** O que a conferência do valor corrigido precisa saber do projeto (carregado pelo serviço). */
export type RegrasDoValor = {
  /** true/false pela tabela de NCM; null = tabela não carregada (não se afirma nada). */
  ncm(ncm: string): { existe: boolean; vigente: boolean } | null;
  /** Limite de caracteres efetivo do campo para o item (Diretrizes e parâmetros do projeto); null = sem limite confirmado. */
  limite(itemId: string, campo: 'descricao' | 'unidade'): number | null;
  /** Unidade aceita para o item? Devolve o motivo da recusa ou null. */
  unidade(itemId: string, valor: string): string | null;
};

export type CasoAtual = CasoDaPlanilha & { projeto_id: string; parecer_ia?: unknown };
export type LinhaConferida = {
  linha: number; casoId: string; acao: AcaoPlanilha | 'nenhuma'; motivo: string; campo: 'ncm' | 'descricao' | 'unidade' | null; valor: string | null;
  recusa: string | null; tipo?: string; codigo?: string;
};

const ehUnidade = (p: Json) => p.fatorSituacao !== undefined || p.unidadeCompra !== undefined;

/** Normaliza o valor corrigido do campo (NCM: só dígitos; 7 dígitos vindos de número recuperam o zero à esquerda). */
export function normalizarValor(campo: 'ncm' | 'descricao' | 'unidade', bruto: string, numerico = false): string {
  const t = bruto.replace(/\s+/g, ' ').trim();
  if (campo === 'ncm') {
    const d = t.replace(/[.\-\s]/g, '');
    return numerico && /^\d{7}$/.test(d) ? `0${d}` : d;
  }
  return campo === 'unidade' ? t.toUpperCase() : t;
}

/** Recusa do valor corrigido (ou null): as regras da tela e do motor para NCM, descrição e unidade. */
export function recusaDoValor(campo: 'ncm' | 'descricao' | 'unidade', valor: string, itemId: string, regras: RegrasDoValor): string | null {
  if (!valor) return 'Valor corrigido vazio.';
  if (campo === 'ncm') {
    if (!/^\d{8}$/.test(valor)) return `NCM corrigido inválido (${valor}): use 8 dígitos.`;
    if (/^0+$/.test(valor)) return 'NCM corrigido só com zeros não é classificação.';
    const t = regras.ncm(valor);
    if (t && !t.existe) return `O NCM ${valor} não existe na tabela do Siscomex.`;
    if (t && !t.vigente) return `O NCM ${valor} não consta como ativo na tabela atual do Siscomex.`;
    return null;
  }
  if (valor.length > 2000) return 'Valor corrigido longo demais (máximo 2.000 caracteres).';
  const lim = regras.limite(itemId, campo);
  if (lim != null && valor.length > lim) return `${rotuloDoCampo(campo)} corrigida passa do limite de ${lim} caracteres (tem ${valor.length}).`;
  if (campo === 'unidade') return regras.unidade(itemId, valor);
  return null;
}

/**
 * Confere uma linha contra o caso como está agora no banco. Recusa linha velha (versão diferente), caso que não é do projeto ou da camada,
 * caso substituído ou já decidido, decisão inválida, motivo faltando, valor corrigido fora do campo do caso ou fora das regras.
 * `vistos` evita o mesmo caso duas vezes no arquivo.
 */
export function conferirLinha(l: LinhaLida, caso: CasoAtual | undefined, ctx: { projetoId: string; camada: string; regras: RegrasDoValor; vistos: Set<string>; codigo?: (c: CasoAtual) => string | undefined }): LinhaConferida {
  const base = { linha: l.linha, casoId: l.id, motivo: l.motivo.trim(), campo: null, valor: null } as const;
  const recusar = (recusa: string, extra: Partial<LinhaConferida> = {}): LinhaConferida => ({ ...base, acao: 'nenhuma', recusa, ...(caso ? { tipo: caso.tipo, codigo: ctx.codigo?.(caso) } : {}), ...extra });
  const acao = lerDecisao(l.decisao);
  if (!l.id) return recusar('Linha sem o ID do caso.');
  if (ctx.vistos.has(l.id)) return recusar('O mesmo caso aparece mais de uma vez na planilha; vale só a primeira linha.');
  ctx.vistos.add(l.id);
  if (acao === null) return recusar(`Decisão "${l.decisao}" inválida: use Aprovar, Rejeitar ou Pedir informação.`);
  if (acao === '') {
    if (l.motivo.trim() || l.valorCorrigido.trim()) return recusar('Motivo ou valor corrigido preenchido sem a Decisão: escolha a decisão ou apague o texto.');
    return { ...base, acao: 'nenhuma', recusa: null };
  }
  if (!caso || caso.projeto_id !== ctx.projetoId) return recusar('Este caso não pertence a este projeto.');
  if (caso.camada !== ctx.camada) return recusar(`Este caso é da camada ${rotuloCamada(caso.camada)}, não desta planilha.`);
  if (caso.situacao === 'OBSOLETO') return recusar('O caso foi substituído por uma nova análise. Baixe a planilha de novo.');
  if (caso.situacao === 'APROVADO' || caso.situacao === 'REJEITADO') return recusar(`O caso já foi ${caso.situacao === 'APROVADO' ? 'aprovado' : 'rejeitado'}.`);
  if (String(caso.versao) !== String(l.versao).trim()) return recusar(`O caso mudou depois que a planilha foi gerada (versão ${l.versao || '—'} na planilha, ${caso.versao} agora). Baixe a planilha de novo.`);
  const motivo = l.motivo.trim();
  const ok = (extra: Partial<LinhaConferida> = {}): LinhaConferida => ({ ...base, acao, recusa: null, tipo: caso.tipo, codigo: ctx.codigo?.(caso), ...extra });
  if (acao !== 'aprovar' && l.valorCorrigido.trim()) return recusar('Valor corrigido só vale para Aprovar.');
  if (acao === 'rejeitar') return motivo ? ok() : recusar('Rejeitar exige o Motivo.');
  if (acao === 'pedir') {
    if (!motivo) return recusar('Pedir informação exige o Motivo (que informação falta).');
    if (caso.situacao === 'AGUARDANDO_INFORMACAO') return recusar('O caso já está aguardando informação.');
    return ok();
  }
  // Aprovar
  if (ehTipoDeExcecao(caso.tipo) && motivo.length < MOTIVO_MINIMO_EXCECAO) return recusar(`Aprovar exceção exige o Motivo (ao menos ${MOTIVO_MINIMO_EXCECAO} caracteres).`);
  if (caso.tipo.startsWith('AGUARDANDO')) return recusar('Falta informação para decidir este caso: informe o que falta na tela ou rejeite.');
  const proposta = (caso.proposta as Json) ?? {};
  const campo = campoCorrigivel(caso);
  let valor: string | null = null;
  if (l.valorCorrigido.trim()) {
    if (!campo) return recusar('Este caso não aceita valor corrigido: aprove a proposta como está, rejeite ou peça informação.');
    valor = normalizarValor(campo, l.valorCorrigido, l.valorNumerico);
    const r = recusaDoValor(campo, valor, caso.itens[0], ctx.regras);
    if (r) return recusar(r);
  }
  if (!valor) {
    if (proposta.decisao === 'SOLICITAR_INFORMACAO') return recusar('A decisão proposta é solicitar informação: use Pedir informação ou informe o Valor corrigido.');
    if (ehUnidade(proposta) && (lerFator(proposta.fatorConversao) == null || proposta.fatorSituacao === 'INFORMAR')) return recusar('Conversão de unidade sem fator: informe o fator na tela.');
    if (ehUnidade(proposta) && proposta.fatorSituacao === 'CONFIRMAR') return recusar('O fator de conversão veio da descrição do item: confirme-o na tela.');
    const aplicavel = propostaAplicavel(caso.camada, proposta);
    if (caso.camada !== 'OBRIGACOES' && caso.tipo !== 'CODIGO_ANTIGO' && proposta.decisao === undefined && !Object.keys(aplicavel).length) {
      return recusar(campo ? `Este caso não traz proposta: informe o Valor corrigido (${rotuloDoCampo(campo)}) ou rejeite.` : 'Este caso não traz proposta aplicável: rejeite ou peça informação.');
    }
  }
  return ok({ campo: valor ? campo : null, valor });
}

/** Contagem da prévia. */
export function contarConferidas(ls: LinhaConferida[]) {
  return {
    aprovar: ls.filter((l) => !l.recusa && l.acao === 'aprovar').length,
    rejeitar: ls.filter((l) => !l.recusa && l.acao === 'rejeitar').length,
    pedirInformacao: ls.filter((l) => !l.recusa && l.acao === 'pedir').length,
    semDecisao: ls.filter((l) => !l.recusa && l.acao === 'nenhuma').length,
    recusadas: ls.filter((l) => !!l.recusa).length,
  };
}

export const situacaoAberta = (s: string) => CASO_ABERTO.includes(s as SituacaoCaso) || s === 'AGUARDANDO_INFORMACAO';
