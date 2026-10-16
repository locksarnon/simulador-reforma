import { normalizarProduto, OPCOES_PADRAO, OpcoesValidacao } from './opcoes-validacao';
import { lerDataMovimento } from './data-movimento';
import { chavePlano, montarPlanoContas, PlanoContas } from './plano-contas';
import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../prisma/prisma.service';
import { ClassificacaoService } from '../classificacao/classificacao.service';
import { avaliarNcm, compararComDeclarado, soDigitos, textoConfianca } from '../classificacao/ncm-classe';

export const CAMPOS = ['codigo', 'descricao', 'ncm', 'unidade', 'origem', 'c_class_trib', 'principio_ativo', 'data_cadastro', 'grupo_contabil', 'grupo_produto'] as const;
export type Campo = (typeof CAMPOS)[number];
export type Mapeamento = Partial<Record<Campo, number | null>>;

export const ROTULOS: Record<Campo, string> = {
  principio_ativo: 'Princípio ativo (inclua concentração e formulação)',
  data_cadastro: 'Data da última movimentação ou do cadastro (para o corte)',
  grupo_contabil: 'Grupo contábil atual',
  grupo_produto: 'Grupo de produto atual (opcional)',
  codigo: 'Código do produto',
  descricao: 'Descrição',
  ncm: 'NCM',
  unidade: 'Unidade',
  origem: 'Origem',
  c_class_trib: 'cClassTrib atual',
};

/** Nomes de coluna (já normalizados) que cada ERP costuma usar. */
const SINONIMOS: Record<Campo, string[]> = {
  principio_ativo: ['principioativo', 'ingredienteativo', 'composicao', 'ativo'],
  // b1ucom (Protheus) e lastpurdat (SAP B1) são a data da última COMPRA — confirmado na documentação dos ERPs; nenhum dos dois é "última venda".
  data_cadastro: ['datacadastro', 'datamovimento', 'ultimomovimento', 'data', 'b1datref', 'ultimamovimentacao', 'dataultimamovimentacao', 'dtultimamovimentacao',
    'dtmovimento', 'dtultmov', 'ultmov', 'ultimavenda', 'dataultimavenda', 'dtultvenda', 'ultimacompra', 'dataultimacompra', 'dtultcompra', 'ultcompra',
    'dataultimaentrada', 'dataultimasaida', 'b1ucom', 'lastpurdat'],
  grupo_contabil: ['grupocontabil', 'contacontabil'],
  // B1_GRUPO (Protheus) e "grupo do produto" são grupo de PRODUTO, não conta contábil.
  grupo_produto: ['grupoproduto', 'grupodoproduto', 'b1grupo', 'grupo', 'itmsgrpcod', 'familia'],
  codigo: ['codigo', 'cod', 'codproduto', 'codprod', 'b1cod', 'itemcode', 'material', 'sku', 'referencia', 'codigoproduto', 'codigodoproduto', 'codigointerno', 'codigoitem'],
  descricao: ['descricao', 'desc', 'descrproduto', 'descrprod', 'b1desc', 'itemname', 'denominacao', 'nome', 'produto', 'descricaodoproduto', 'textobreve', 'descricaomaterial', 'descricaoproduto', 'descricaoitem'],
  ncm: ['ncm', 'ncmcode', 'b1posipi', 'posipi', 'steuc', 'classificacaofiscal', 'codigoncm', 'ncmsh', 'posicaoipi', 'nbm', 'classfiscal', 'codncm'],
  unidade: ['un', 'um', 'unid', 'unidade', 'unidademedida', 'b1um', 'unidadedemedida', 'salunitmsr'],
  origem: ['origem', 'b1origem', 'origemmercadoria', 'orig'],
  c_class_trib: ['cclasstrib', 'classtrib', 'classificacaotributaria', 'classetributaria', 'codigoclasstrib'],
};

const normCab = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const MAX_LINHAS = 50_000;

export type Planilha = { cabecalho: string[]; linhas: string[][]; ncmNumerico: boolean[]; formato: 'xlsx' | 'csv' };

export type Problema = { codigo: string; severidade: 'erro' | 'alerta' | 'info'; mensagem: string };
export type LinhaResultado = {
  linha: number;
  codigo: string;
  descricao: string;
  ncm_original: string;
  ncm: string;
  situacao: 'OK' | 'ALERTA' | 'ERRO';
  problemas: Problema[];
  sugestao: { c_class_trib: string | null; descricao: string | null; reducao: number; confianca: string; ambiguo: boolean; anexo: string | null; padrao?: boolean } | null;
  c_class_trib_informado: string;
  unidade: string; principio_ativo: string; grupo_contabil: string; candidatos_duplicidade: number[];
  /** Grupo de produto: como é (coluna do cliente), como deveria (por tratamento tributário) e flag. */
  grupo_atual: string; grupo_sugerido: string | null; grupo_flag: FlagComparacao | null;
  /** Conta contábil: atual = `grupo_contabil`; sugerida só vem do de-para do cliente. */
  conta_sugerida: string | null; conta_flag: FlagComparacao | null;
  /** Data da coluna de movimentação/cadastro (AAAA-MM-DD), quando legível. */
  ultima_mov: string | null;
  /** Só com período: DENTRO, SEM_DATA ou DATA_INVALIDA (FORA não entra na análise; vai em `fora_periodo`). */
  periodo: 'DENTRO' | 'SEM_DATA' | 'DATA_INVALIDA' | null;
};
export type FlagComparacao = 'IGUAL' | 'DIFERENTE' | 'SEM_ATUAL' | 'SEM_SUGESTAO' | 'SEM_REGRA' | 'SEM_PLANO';
const igualTexto = (a: string, b: string) => normalizarProduto(a) === normalizarProduto(b);
/** Grupo "como deveria": agrupa pelo tratamento tributário (classe sugerida), nunca por palavra da descrição. */
function grupoSugeridoDe(sug: LinhaResultado['sugestao'], classes: Map<string, { descricao_oficial?: string | null }>): string | null {
  if (!sug?.c_class_trib) return null;
  if (sug.padrao) return 'Tributação integral (padrão IBS/CBS)';
  return (classes.get(sug.c_class_trib)?.descricao_oficial || `Classe ${sug.c_class_trib}`).trim();
}
function compararGrupo(atual: string, sugerido: string | null): FlagComparacao {
  if (!sugerido) return 'SEM_SUGESTAO';
  if (!atual) return 'SEM_ATUAL';
  return igualTexto(atual, sugerido) ? 'IGUAL' : 'DIFERENTE';
}
/** Pivô "como é → como deveria": cada grupo sugerido com os grupos atuais que ele reúne. */
function resumirGrupos(itens: LinhaResultado[]) {
  const m = new Map<string, { qtd: number; atuais: Map<string, number> }>();
  for (const i of itens) {
    const k = i.grupo_sugerido ?? 'Sem sugestão (NCM ambíguo ou inválido)';
    const e = m.get(k) ?? { qtd: 0, atuais: new Map<string, number>() };
    e.qtd++;
    const a = i.grupo_atual || '(sem grupo atual)';
    e.atuais.set(a, (e.atuais.get(a) || 0) + 1);
    m.set(k, e);
  }
  return [...m.entries()].sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 100)
    .map(([grupo, e]) => ({ grupo, qtd: e.qtd, atuais: [...e.atuais.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g, qtd]) => ({ grupo: g, qtd })) }));
}

export type ForaDoPeriodo = { linha: number; codigo: string; descricao: string; ncm_original: string; ultima_mov: string };

@Injectable()
export class ProdutosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classificacao: ClassificacaoService,
  ) {}

  // ── Leitura ──────────────────────────────────────────────────────────

  async lerArquivo(file: Express.Multer.File): Promise<Planilha> {
    if (!file?.buffer?.length) throw new BadRequestException('Arquivo vazio ou não enviado.');
    const nome = (file.originalname || '').toLowerCase();
    if (nome.endsWith('.xlsx')) return this.lerXlsx(file.buffer);
    if (nome.endsWith('.csv') || nome.endsWith('.txt')) return this.lerCsv(file.buffer);
    if (nome.endsWith('.xls')) {
      throw new BadRequestException('O formato .xls (Excel antigo) não é suportado. Salve a planilha como .xlsx ou .csv e envie novamente.');
    }
    throw new BadRequestException('Formato não reconhecido. Envie um arquivo .xlsx ou .csv.');
  }

  private async lerXlsx(buf: Buffer): Promise<Planilha> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('Não consegui abrir o Excel. Confirme que o arquivo não está corrompido ou protegido por senha.');
    }
    const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
    if (!ws) throw new BadRequestException('A planilha está vazia.');

    const texto = (v: ExcelJS.CellValue): string => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') {
        const o = v as unknown as Record<string, unknown>;
        if ('result' in o) return texto(o.result as ExcelJS.CellValue);
        if ('richText' in o) return (o.richText as { text: string }[]).map((t) => t.text).join('');
        if ('text' in o) return String(o.text);
        if (v instanceof Date) return v.toISOString().slice(0, 10);
      }
      return String(v).trim();
    };

    const linhas: string[][] = [];
    const numericos: boolean[][] = [];
    let colunas = 0;
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values as ExcelJS.CellValue[];
      const cel: string[] = [];
      const num: boolean[] = [];
      for (let i = 1; i < vals.length; i++) {
        cel.push(texto(vals[i]));
        num.push(typeof vals[i] === 'number');
      }
      colunas = Math.max(colunas, cel.length);
      linhas.push(cel);
      numericos.push(num);
    });
    return this.montar(linhas, numericos, colunas, 'xlsx');
  }

  private lerCsv(buf: Buffer): Planilha {
    let txt = buf.toString('utf8');
    if (txt.includes('�')) txt = buf.toString('latin1'); // ERPs brasileiros costumam exportar em Latin-1
    const primeira = txt.split(/\r?\n/, 1)[0] || '';
    const cont = (c: string) => primeira.split(c).length - 1;
    const delimitador = [';', '\t', ',', '|'].sort((a, b) => cont(b) - cont(a))[0];
    let registros: string[][];
    try {
      registros = parse(txt, {
        delimiter: delimitador, bom: true, relax_column_count: true, skip_empty_lines: true, relax_quotes: true, trim: true,
      });
    } catch {
      throw new BadRequestException('Não consegui ler o CSV. Confira o separador (; ou ,) e as aspas do arquivo.');
    }
    const colunas = Math.max(0, ...registros.map((r) => r.length));
    return this.montar(registros, registros.map((r) => r.map(() => false)), colunas, 'csv');
  }

  private montar(linhas: string[][], numericos: boolean[][], colunas: number, formato: 'xlsx' | 'csv'): Planilha {
    if (linhas.length < 2) throw new BadRequestException('A planilha precisa ter o cabeçalho e ao menos uma linha de produto.');
    const pad = (r: string[]) => Array.from({ length: colunas }, (_, i) => r[i] ?? '');
    const cabecalho = pad(linhas[0]).map((c, i) => c || `Coluna ${i + 1}`);
    const corpo = linhas.slice(1).map(pad);
    if (corpo.length > MAX_LINHAS) {
      throw new BadRequestException(`A planilha tem ${corpo.length.toLocaleString('pt-BR')} linhas; o limite por envio é ${MAX_LINHAS.toLocaleString('pt-BR')}. Divida o arquivo em partes.`);
    }
    const ncmNumerico = Array.from({ length: colunas }, (_, c) => numericos.slice(1).some((r) => r[c]));
    return { cabecalho, linhas: corpo, ncmNumerico, formato };
  }

  // ── Mapeamento ───────────────────────────────────────────────────────

  detectarMapeamento(cabecalho: string[]): Mapeamento {
    const norm = cabecalho.map(normCab);
    const usado = new Set<number>();
    const map: Mapeamento = {};
    for (const campo of CAMPOS) {
      let idx = norm.findIndex((n, i) => !usado.has(i) && SINONIMOS[campo].includes(n));
      if (idx < 0) idx = norm.findIndex((n, i) => !usado.has(i) && n.length >= 3 && SINONIMOS[campo].some((s) => s.length >= 4 && n.includes(s)));
      map[campo] = idx >= 0 ? idx : null;
      if (idx >= 0) usado.add(idx);
    }
    return map;
  }

  /** De-para contábil enviado pelo cliente (xlsx/csv): chave (cClassTrib ou grupo sugerido) -> conta. */
  async lerPlanoContas(file: Express.Multer.File): Promise<PlanoContas> {
    const p = await this.lerArquivo(file);
    return montarPlanoContas((file.originalname || 'de-para').slice(0, 120), p.cabecalho, p.linhas);
  }

  async previa(file: Express.Multer.File) {
    const p = await this.lerArquivo(file);
    const mapeamento = this.detectarMapeamento(p.cabecalho);
    return {
      formato: p.formato,
      total_linhas: p.linhas.length,
      colunas: p.cabecalho.map((nome, indice) => ({ indice, nome, exemplo: p.linhas.find((l) => l[indice])?.[indice] ?? '' })),
      mapeamento,
      previa: p.linhas.slice(0, 10),
      campos: CAMPOS.map((c) => ({ campo: c, rotulo: ROTULOS[c], obrigatorio: ['codigo', 'descricao', 'ncm'].includes(c) })),
    };
  }

  // ── Validação ────────────────────────────────────────────────────────

  async validar(file: Express.Multer.File, mapeamentoInformado?: Mapeamento, limiteLinhas?: number, opcoes: OpcoesValidacao = OPCOES_PADRAO, plano: PlanoContas | null = null) {
    const p = await this.lerArquivo(file);
    const mapa = { ...this.detectarMapeamento(p.cabecalho), ...(mapeamentoInformado || {}) };
    if (mapa.ncm === null || mapa.ncm === undefined) {
      throw new BadRequestException('Não identifiquei a coluna do NCM. Indique qual coluna contém o NCM e envie novamente.');
    }
    const g = (l: string[], c: Campo) => (mapa[c] === null || mapa[c] === undefined ? '' : (l[mapa[c] as number] ?? '').trim());

    const truncado = limiteLinhas && p.linhas.length > limiteLinhas ? p.linhas.length : 0;
    const origem = (limiteLinhas ? p.linhas.slice(0, limiteLinhas) : p.linhas).map((l, i) => ({ l, linha: i + 2 }));
    if ((opcoes.dataInicio || opcoes.dataFim) && mapa.data_cadastro == null) throw new BadRequestException('Mapeie a coluna de data para aplicar o período.');
    if (opcoes.gruposContabeis && mapa.grupo_contabil == null) throw new BadRequestException('Mapeie a coluna do grupo/conta contábil atual para a análise contábil.');
    if (opcoes.principioAtivo && mapa.principio_ativo == null) throw new BadRequestException('Mapeie a coluna de princípio ativo.');
    if (opcoes.duplicidades && (mapa.descricao == null || mapa.unidade == null)) throw new BadRequestException('Mapeie descrição e unidade para analisar duplicidades.');
    // Período: quem tem data fora da janela sai da análise (e vai para `fora_periodo`). Quem não tem data legível
    // CONTINUA na análise, sinalizado — uma data em branco numa base de 50 mil linhas não pode derrubar a validação
    // nem fazer um produto ativo sumir.
    const periodoAtivo = Boolean(opcoes.dataInicio || opcoes.dataFim);
    const classificadas = origem.map(({ l, linha }) => {
      if (!periodoAtivo) return { l, linha, data: null as string | null, bruto: '', periodo: null as LinhaResultado['periodo'] | 'FORA' };
      const bruto = g(l, 'data_cadastro');
      const lida = lerDataMovimento(bruto);
      const dentro = lida.data !== null && (!opcoes.dataInicio || lida.data >= opcoes.dataInicio) && (!opcoes.dataFim || lida.data <= opcoes.dataFim);
      const periodo: LinhaResultado['periodo'] | 'FORA' = lida.data ? (dentro ? 'DENTRO' : 'FORA') : lida.invalida ? 'DATA_INVALIDA' : 'SEM_DATA';
      return { l, linha, data: lida.data, bruto, periodo };
    });
    const selecionadas = classificadas.filter((x) => x.periodo !== 'FORA');
    const foraDoPeriodo: ForaDoPeriodo[] = classificadas.filter((x) => x.periodo === 'FORA').map((x) => ({
      linha: x.linha, codigo: g(x.l, 'codigo'), descricao: g(x.l, 'descricao'), ncm_original: g(x.l, 'ncm'), ultima_mov: x.data as string,
    }));
    const linhas = selecionadas.map(x => x.l);

    const [{ lista, classes }, ncmRows] = await Promise.all([
      this.classificacao.base(),
      this.prisma.ncm.findMany({ select: { codigo: true, status: true, descricao: true } }),
    ]);
    const tabNcm = new Map(ncmRows.map((n) => [n.codigo, n]));
    const catalogoCarregado = tabNcm.size > 100;

    const cont = { codigo: new Map<string, number>(), descNcm: new Map<string, number>() };
    linhas.forEach((l) => {
      const c = g(l, 'codigo').toLowerCase();
      if (c) cont.codigo.set(c, (cont.codigo.get(c) || 0) + 1);
      const dn = `${g(l, 'descricao').toLowerCase()}|${soDigitos(g(l, 'ncm'))}`;
      if (dn.length > 1) cont.descNcm.set(dn, (cont.descNcm.get(dn) || 0) + 1);
    });

    // Índice invertido limita candidatos; nunca compara todos os pares de 50 mil itens.
    const indice = new Map<string, number[]>();
    const termos = linhas.map(l => normalizarProduto(g(l, 'descricao')).split(' ').filter(t => t.length > 2));
    termos.forEach((ts, i) => { for (const t of new Set(ts)) { const k = normalizarProduto(g(linhas[i], 'unidade')) + '|' + t; const a = indice.get(k) || []; a.push(i); indice.set(k, a); } });
    const exatos = new Map<string, number[]>();
    const chaveExata = (l: string[]) => normalizarProduto(g(l, 'descricao')) + '|' + normalizarProduto(g(l, 'unidade'));
    linhas.forEach((l, i) => { if (g(l, 'descricao') && g(l, 'unidade')) { const a = exatos.get(chaveExata(l)) || []; a.push(i); exatos.set(chaveExata(l), a); } });
    const resultado: LinhaResultado[] = linhas.map((l, i) => {
      const problemas: Problema[] = [];
      const codigo = g(l, 'codigo');
      const descricao = g(l, 'descricao');
      const ncmOriginal = g(l, 'ncm');
      let ncm = soDigitos(ncmOriginal);
      const informado = g(l, 'c_class_trib');

      if (!codigo) problemas.push({ codigo: 'CODIGO_AUSENTE', severidade: 'alerta', mensagem: 'Produto sem código.' });
      if (!descricao) problemas.push({ codigo: 'DESCRICAO_AUSENTE', severidade: 'alerta', mensagem: 'Produto sem descrição.' });

      if (!ncm) {
        problemas.push({ codigo: 'NCM_AUSENTE', severidade: 'erro', mensagem: 'NCM não informado.' });
      } else {
        // NCM de 7 dígitos: o Excel/CSV costuma comer o zero à esquerda (capítulos 01 a 09 — justamente os alimentos dos anexos). Restaura se a coluna é
        // numérica ou se a versão com zero existe na tabela oficial (nesse caso a correção é praticamente certa).
        if (ncm.length === 7 && (p.ncmNumerico[mapa.ncm as number] || (catalogoCarregado && tabNcm.has('0' + ncm)))) {
          ncm = ncm.padStart(8, '0');
          problemas.push({ codigo: 'NCM_ZERO_RESTAURADO', severidade: 'info', mensagem: `O zero à esquerda do NCM foi perdido na planilha; corrigido para ${ncm}.` });
        }
        if (ncm.length !== 8) {
          // SAP Business One: OITM.NCMCode é um número interno (chave da tabela ONCM), não o NCM — confirmado na documentação do SDK.
          const sapInterno = opcoes.erps.some((e) => /sap/i.test(e)) && /^\d{1,6}$/.test(ncmOriginal.trim());
          problemas.push(sapInterno
            ? { codigo: 'NCM_CHAVE_SAP', severidade: 'erro', mensagem: `"${ncmOriginal}" parece o código interno do NCM no SAP Business One (OITM.NCMCode, chave da tabela ONCM), não o NCM. Exporte o texto do NCM (ONCM.NcmCode) junto com o item.` }
            : { codigo: 'NCM_FORMATO', severidade: 'erro', mensagem: `NCM "${ncmOriginal}" tem ${ncm.length} dígitos; o correto são 8.` });
        } else if (catalogoCarregado) {
          const t = tabNcm.get(ncm);
          if (!t) problemas.push({ codigo: 'NCM_INEXISTENTE', severidade: 'erro', mensagem: `NCM ${ncm} não existe na tabela oficial vigente.` });
          else if (t.status !== 'Ativo') problemas.push({ codigo: 'NCM_INATIVO', severidade: 'erro', mensagem: `NCM ${ncm} não está mais vigente.` });
        }
      }

      const c = codigo.toLowerCase();
      if (c && (cont.codigo.get(c) || 0) > 1) {
        problemas.push({ codigo: 'CODIGO_DUPLICADO', severidade: 'alerta', mensagem: `Código "${codigo}" aparece ${cont.codigo.get(c)} vezes.` });
      }
      const unidade = g(l, 'unidade');
      const principio_ativo = g(l, 'principio_ativo');
      const candidatos = new Set<number>();
      if (opcoes.duplicidades && descricao && unidade) {
        for (const j of (exatos.get(chaveExata(l)) || []).slice(0, 21)) if (j !== i) candidatos.add(j);
        for (const t of termos[i]) for (const j of (indice.get(normalizarProduto(unidade) + '|' + t) || []).slice(0, 250)) candidatos.add(j);
      }
      const candidatos_duplicidade: number[] = [];
      let exata = false;
      for (const j of candidatos) {
        if (j === i) continue;
        const outro = linhas[j];
        const paOutro = g(outro, 'principio_ativo');
        if (opcoes.principioAtivo && (!principio_ativo || !paOutro || normalizarProduto(principio_ativo) !== normalizarProduto(paOutro))) continue;
        const igual = chaveExata(l) === chaveExata(outro);
        const a = new Set(termos[i]); const b = new Set(termos[j]);
        const inter = [...a].filter(t => b.has(t)).length;
        const similar = inter / Math.max(1, new Set([...a, ...b]).size);
        // Números diferentes (concentração, dose, embalagem) impedem sugestão aproximada.
        const nums = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) || []).join('|');
        if (!igual && (similar < 0.65 || nums(descricao) !== nums(g(outro, 'descricao')))) continue;
        candidatos_duplicidade.push(selecionadas[j].linha); exata ||= igual;
        if (candidatos_duplicidade.length >= 20) break;
      }
      if (candidatos_duplicidade.length) problemas.push({ codigo: exata ? 'DUPLICIDADE_EXATA' : 'POSSIVEL_DUPLICIDADE', severidade: 'alerta', mensagem: (exata ? 'Descrição e unidade iguais' : 'Descrição semelhante e mesma unidade') + ' — revisar linhas ' + candidatos_duplicidade.join(', ') + (opcoes.principioAtivo ? '; princípio ativo coincidente' : '') + '. Nenhum cadastro foi excluído.' });

      let sugestao: LinhaResultado['sugestao'] = null;
      if (opcoes.cClassTrib && ncm.length === 8) {
        const av = avaliarNcm(ncm, lista);
        const cmp = compararComDeclarado(informado, av, classes);
        const alvo = av.esperado || (av.ambiguo ? null : null);
        const info = alvo ? classes.get(alvo) : null;
        sugestao = {
          c_class_trib: alvo,
          descricao: info?.descricao_oficial ?? (av.ambiguo ? `Possíveis: ${av.classes.join(', ')}` : null),
          reducao: alvo ? Math.max(Number(info?.pct_reducao_ibs ?? 0), Number(info?.pct_reducao_cbs ?? 0)) : 0,
          confianca: textoConfianca(av.confianca),
          ambiguo: av.ambiguo,
          anexo: av.matches[0] ? `Anexo ${av.matches[0].anexo}${av.matches[0].item_lei ? `, item ${av.matches[0].item_lei}` : ''}` : null,
        };
        // NCM válido que não aparece em nenhum anexo consultado: sugere a classe padrão (tributação integral) em vez de deixar em branco,
        // marcada como "padrão" — não prova ausência de benefício por outra base legal (produtor rural, regime específico...).
        const ncmValido = !catalogoCarregado || tabNcm.get(ncm)?.status === 'Ativo';
        if (!av.encontrado && ncmValido && classes.has('000001')) {
          sugestao = { c_class_trib: '000001', descricao: classes.get('000001')?.descricao_oficial ?? null, reducao: 0, confianca: 'Padrão (NCM fora dos anexos consultados)', ambiguo: false, anexo: null, padrao: true };
        }
        if (informado) {
          if (cmp.severidade === 'alta') problemas.push({ codigo: cmp.codigo, severidade: 'erro', mensagem: cmp.mensagem });
          else if (cmp.severidade === 'alerta') problemas.push({ codigo: cmp.codigo, severidade: 'alerta', mensagem: cmp.mensagem });
          else if (cmp.severidade === 'info') problemas.push({ codigo: cmp.codigo, severidade: 'info', mensagem: cmp.mensagem });
        } else if (av.encontrado && !av.ambiguo) {
          const pct = Math.round(Number(info?.pct_reducao_ibs ?? 0) * 100);
          problemas.push({
            codigo: 'CLASSE_SUGERIDA', severidade: 'info',
            mensagem: `Sugestão de classificação: ${av.esperado}${pct ? ` (redução de ${pct}%)` : ''} — confiança ${textoConfianca(av.confianca).split(' ')[0].toLowerCase()}.`,
          });
        } else if (av.ambiguo) {
          problemas.push({ codigo: 'AMBIGUO_REVISAR', severidade: 'info', mensagem: `O NCM cobre produtos com tratamentos diferentes (${av.classes.join(', ')}); revise conforme o produto.` });
        }
      }

      // Grupos (como é x como deveria) e conta contábil (atual x do de-para do cliente) — sempre sugestão, nunca alteração.
      const grupoRef = grupoSugeridoDe(sugestao, classes);
      const grupo_atual = g(l, 'grupo_produto');
      const grupo_sugerido = opcoes.grupos ? grupoRef : null;
      const grupo_flag: FlagComparacao | null = opcoes.grupos ? compararGrupo(grupo_atual, grupoRef) : null;
      const contaAtual = g(l, 'grupo_contabil');
      let conta_sugerida: string | null = null;
      let conta_flag: FlagComparacao | null = null;
      if (opcoes.gruposContabeis) {
        if (!plano) conta_flag = 'SEM_PLANO';
        else {
          conta_sugerida = (sugestao?.c_class_trib && plano.regras[sugestao.c_class_trib]) || (grupoRef && plano.regras[chavePlano(grupoRef)]) || null;
          const codigo = conta_sugerida ? conta_sugerida.split(' — ')[0] : '';
          conta_flag = !conta_sugerida ? 'SEM_REGRA' : !contaAtual ? 'SEM_ATUAL' : igualTexto(contaAtual, conta_sugerida) || igualTexto(contaAtual, codigo) ? 'IGUAL' : 'DIFERENTE';
        }
      }

      const periodo = selecionadas[i].periodo === 'FORA' ? null : selecionadas[i].periodo;
      if (periodo === 'DATA_INVALIDA') problemas.push({ codigo: 'DATA_INVALIDA', severidade: 'alerta', mensagem: `Data "${selecionadas[i].bruto}" não reconhecida (esperado dia/mês/ano); mantido na análise.` });
      if (periodo === 'SEM_DATA') problemas.push({ codigo: 'SEM_DATA_MOVIMENTO', severidade: 'info', mensagem: 'Sem data de movimentação; mantido na análise por segurança.' });

      const situacao: LinhaResultado['situacao'] = problemas.some((x) => x.severidade === 'erro') ? 'ERRO' : problemas.some((x) => x.severidade === 'alerta') ? 'ALERTA' : 'OK';
      return { linha: selecionadas[i].linha, unidade, principio_ativo, grupo_contabil: g(l, 'grupo_contabil'), grupo_atual, grupo_sugerido, grupo_flag, conta_sugerida, conta_flag, candidatos_duplicidade, codigo, descricao, ncm_original: ncmOriginal, ncm, situacao, problemas, sugestao, c_class_trib_informado: informado, ultima_mov: selecionadas[i].data, periodo };
    });

    const resumo = {
      grupos: opcoes.grupos ? resumirGrupos(resultado) : null,
      periodo: periodoAtivo
        ? {
            inicio: opcoes.dataInicio, fim: opcoes.dataFim, base: origem.length,
            dentro: resultado.filter((r) => r.periodo === 'DENTRO').length,
            fora: foraDoPeriodo.length,
            sem_data: resultado.filter((r) => r.periodo === 'SEM_DATA').length,
            data_invalida: resultado.filter((r) => r.periodo === 'DATA_INVALIDA').length,
          }
        : null,
      total: resultado.length,
      ok: resultado.filter((r) => r.situacao === 'OK').length,
      alerta: resultado.filter((r) => r.situacao === 'ALERTA').length,
      erro: resultado.filter((r) => r.situacao === 'ERRO').length,
      com_sugestao: resultado.filter((r) => r.sugestao?.c_class_trib && !r.sugestao.padrao).length,
      tributacao_padrao: resultado.filter((r) => r.sugestao?.padrao).length,
      catalogo_ncm_carregado: catalogoCarregado,
      linhas_no_arquivo: truncado || resultado.length,
      truncado: Boolean(truncado),
      por_problema: Object.entries(
        resultado.flatMap((r) => r.problemas).reduce<Record<string, number>>((a, pb) => ((a[pb.codigo] = (a[pb.codigo] || 0) + 1), a), {}),
      ).sort((a, b) => b[1] - a[1]).map(([codigo, qtd]) => ({ codigo, qtd })),
    };
    return { mapeamento: mapa, opcoes, resumo, itens: resultado, fora_periodo: foraDoPeriodo, avisos: [
      ...(opcoes.erps.length ? ['ERPs registrados como contexto. Não foram aplicadas regras específicas de ERP sem um perfil homologado.'] : []),
      ...(opcoes.gruposContabeis ? [plano ? `Conta sugerida conforme o de-para enviado (${plano.nome}, ${plano.linhas} regras). Sem regra para o item, nenhuma conta é sugerida; o grupo/conta atual foi preservado.` : 'Análise contábil sem de-para: envie o plano de contas/de-para da empresa para ver a conta sugerida. O grupo atual foi preservado.'] : []),
      ...(opcoes.duplicidades ? ['Duplicidades são candidatos para revisão. Princípio ativo deve incluir concentração e formulação; não substitui a decisão sobre o cadastro.'] : []),
    ] };
  }

  // ── Exportação ───────────────────────────────────────────────────────

  async exportarXlsx(file: Express.Multer.File, mapeamento?: Mapeamento, opcoes: OpcoesValidacao = OPCOES_PADRAO, excluir: number[] = [], salvo?: Awaited<ReturnType<ProdutosService['validar']>>, plano: PlanoContas | null = null): Promise<Buffer> {
    const r = salvo || await this.validar(file, mapeamento, undefined, opcoes, plano);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'InTAX — FAL Agro';
    const ws = wb.addWorksheet('Resultado', { views: [{ state: 'frozen', ySplit: 1 }] });
    const per = r.resumo.periodo;
    const dataBr = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
    const ROT_FLAG: Record<FlagComparacao, string> = { IGUAL: 'Igual', DIFERENTE: 'Diferente', SEM_ATUAL: 'Sem valor atual', SEM_SUGESTAO: 'Sem sugestão', SEM_REGRA: 'Sem regra no de-para', SEM_PLANO: 'Sem de-para enviado' };
    const ROT_PERIODO = { DENTRO: 'Dentro', SEM_DATA: 'Sem data', DATA_INVALIDA: 'Data inválida' } as const;
    ws.columns = [
      { header: 'Linha', key: 'linha', width: 8 },
      { header: 'Código', key: 'codigo', width: 16 },
      { header: 'Descrição', key: 'descricao', width: 44 },
      { header: 'NCM informado', key: 'ncm_original', width: 16, style: { numFmt: '@' } },
      { header: 'NCM corrigido', key: 'ncm', width: 14, style: { numFmt: '@' } },
      { header: 'Situação', key: 'situacao', width: 12 },
      { header: 'Problemas encontrados', key: 'problemas', width: 70 },
      { header: 'cClassTrib informado', key: 'informado', width: 18, style: { numFmt: '@' } },
      { header: 'cClassTrib sugerido', key: 'sugerido', width: 18, style: { numFmt: '@' } },
      { header: 'Redução sugerida', key: 'reducao', width: 16 },
      { header: 'Confiança', key: 'confianca', width: 26 },
      { header: 'Base na lei', key: 'anexo', width: 20 },
      { header: 'Unidade', key: 'unidade', width: 12 },
      { header: 'Princípio ativo', key: 'principio_ativo', width: 35 },
      { header: 'Grupo contábil atual', key: 'grupo_contabil', width: 22 },
      { header: 'Linhas para revisão de duplicidade', key: 'candidatos', width: 35 },
      ...(r.opcoes.grupos ? [
        { header: 'Grupo atual', key: 'grupo_atual', width: 26 }, { header: 'Grupo sugerido (tratamento tributário)', key: 'grupo_sugerido', width: 44 }, { header: 'Flag grupo', key: 'grupo_flag', width: 18 },
      ] : []),
      ...(r.opcoes.gruposContabeis ? [
        { header: 'Conta contábil sugerida', key: 'conta_sugerida', width: 34 }, { header: 'Flag conta', key: 'conta_flag', width: 20 },
      ] : []),
      ...(per ? [
        { header: 'Última movimentação', key: 'ultima_mov', width: 20 },
        { header: 'No período', key: 'periodo', width: 16 },
      ] : []),
    ];
    const cor = { OK: 'FFE8F5E9', ALERTA: 'FFFFF8E1', ERRO: 'FFFDECEA' } as const;
    r.itens.forEach((it) => {
      const row = ws.addRow({
        ultima_mov: dataBr(it.ultima_mov), periodo: it.periodo ? ROT_PERIODO[it.periodo] : '',
        grupo_atual: it.grupo_atual, grupo_sugerido: it.grupo_sugerido ?? '', grupo_flag: it.grupo_flag ? ROT_FLAG[it.grupo_flag] : '',
        conta_sugerida: it.conta_sugerida ?? '', conta_flag: it.conta_flag ? ROT_FLAG[it.conta_flag] : '',
        unidade: it.unidade, principio_ativo: it.principio_ativo, grupo_contabil: it.grupo_contabil, candidatos: it.candidatos_duplicidade.join(', '),
        linha: it.linha, codigo: it.codigo, descricao: it.descricao, ncm_original: it.ncm_original, ncm: it.ncm,
        situacao: it.situacao === 'OK' ? 'OK' : it.situacao === 'ALERTA' ? 'Atenção' : 'Corrigir',
        problemas: it.problemas.filter((p) => p.severidade !== 'info' || p.codigo === 'CLASSE_SUGERIDA').map((p) => p.mensagem).join(' | '),
        informado: it.c_class_trib_informado, sugerido: it.sugestao?.c_class_trib ?? '',
        reducao: it.sugestao?.c_class_trib ? `${Math.round(it.sugestao.reducao * 100)}%` : '',
        confianca: it.sugestao?.c_class_trib ? it.sugestao.confianca : '', anexo: it.sugestao?.anexo ?? '',
      });
      row.getCell('situacao').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor[it.situacao] } };
    });
    const cab = ws.getRow(1);
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A2E' } };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

    // Quem não movimentou no período não entra no saneamento: vai para aba própria (candidatos a inativar no ERP).
    if (per && r.fora_periodo.length) {
      const fora = wb.addWorksheet('Sem movimento no período', { views: [{ state: 'frozen', ySplit: 1 }] });
      fora.columns = [
        { header: 'Linha', key: 'linha', width: 8 }, { header: 'Código', key: 'codigo', width: 16 }, { header: 'Descrição', key: 'descricao', width: 44 },
        { header: 'NCM informado', key: 'ncm', width: 16, style: { numFmt: '@' } }, { header: 'Última movimentação', key: 'mov', width: 20 },
      ];
      r.fora_periodo.forEach((f) => fora.addRow({ linha: f.linha, codigo: f.codigo, descricao: f.descricao, ncm: f.ncm_original, mov: dataBr(f.ultima_mov) }));
      const cabF = fora.getRow(1);
      cabF.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cabF.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A2E' } };
      fora.autoFilter = { from: 'A1', to: 'E1' };
    }

    if (excluir.length) {
      const exclusoes = new Set(excluir);
      const permitidas = new Set(r.itens.filter(i => i.candidatos_duplicidade.length).map(i => i.linha));
      if (excluir.some(i => !Number.isInteger(i) || !permitidas.has(i))) throw new BadRequestException('Selecione somente linhas com indicação de duplicidade para a planilha saneada.');
      const original = await this.lerArquivo(file);
      const saneada = wb.addWorksheet('Cadastro saneado');
      saneada.addRow(original.cabecalho);
      const linhasAnalisadas = new Set(r.itens.map(i => i.linha));
      original.linhas.forEach((linha, i) => { if (linhasAnalisadas.has(i + 2) && !exclusoes.has(i + 2)) saneada.addRow(linha); });
      const decisoes = wb.addWorksheet('Exclusões confirmadas');
      decisoes.addRow(['Linha original', 'Código', 'Descrição', 'Motivo']);
      r.itens.filter(i => exclusoes.has(i.linha)).forEach(i => decisoes.addRow([i.linha, i.codigo, i.descricao, 'Duplicidade selecionada pelo usuário; removida apenas da cópia saneada.']));
    }
    const rs = wb.addWorksheet('Resumo');
    rs.columns = [{ width: 44 }, { width: 16 }];
    rs.addRows([
      ['Resumo da validação de cadastro', ''],
      ...(per ? [
        ['Período de movimentação', `${per.inicio ? dataBr(per.inicio) : '…'} a ${per.fim ? dataBr(per.fim) : '…'}`],
        ['Produtos na base enviada', per.base],
        ['Movimentaram no período', per.dentro],
        ['Sem movimento no período (aba própria)', per.fora],
        ['Sem data de movimentação (mantidos na análise)', per.sem_data],
        ['Data não reconhecida (mantidos na análise)', per.data_invalida],
        ['', ''],
      ] : []),
      [per ? 'Produtos no escopo do saneamento' : 'Produtos analisados', r.resumo.total],
      ['Sem problemas', r.resumo.ok],
      ['Com atenção', r.resumo.alerta],
      ['A corrigir', r.resumo.erro],
      ['Com benefício identificado nos anexos (classe sugerida)', r.resumo.com_sugestao],
      ['Sem benefício nos anexos consultados (padrão 000001)', r.resumo.tributacao_padrao],
      ['', ''],
      ['Aviso: as sugestões são orientativas, baseadas nos anexos da LC 214/2025 já mapeados.', ''],
      ['A classificação fiscal é responsabilidade do contribuinte e deve ser validada por um especialista.', ''],
    ]);
    rs.getRow(1).font = { bold: true, size: 13 };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ── Modelo ───────────────────────────────────────────────────────────

  async modeloXlsx(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'InTAX — FAL Agro';
    const ws = wb.addWorksheet('Produtos', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Codigo', key: 'a', width: 16, style: { numFmt: '@' } },
      { header: 'Descricao', key: 'b', width: 48 },
      { header: 'NCM', key: 'c', width: 14, style: { numFmt: '@' } },
      { header: 'Unidade', key: 'd', width: 10 },
      { header: 'Origem', key: 'e', width: 10 },
      { header: 'cClassTrib', key: 'f', width: 14, style: { numFmt: '@' } },
    ];
    ws.addRow({ a: 'RAC-001', b: 'Ração para bovinos, saco 25 kg', c: '23099010', d: 'SC', e: '0', f: '' });
    ws.addRow({ a: 'MIL-010', b: 'Milho em grão', c: '10059010', d: 'KG', e: '0', f: '' });
    const cab = ws.getRow(1);
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A2E' } };
    for (let i = 2; i <= 1000; i++) {
      ws.getCell(`A${i}`).numFmt = '@';
      ws.getCell(`C${i}`).numFmt = '@';
      ws.getCell(`F${i}`).numFmt = '@';
    }
    const inst = wb.addWorksheet('Instruções');
    inst.columns = [{ width: 110 }];
    inst.addRows([
      ['Como preencher'],
      ['1. Uma linha por produto. Não altere os nomes das colunas da primeira linha.'],
      ['2. Obrigatórias: Codigo, Descricao e NCM. As demais são opcionais.'],
      ['3. NCM: 8 dígitos, com ou sem pontos (ex.: 23099010 ou 2309.90.10). As colunas já estão como texto para não perder o zero à esquerda.'],
      ['4. cClassTrib: informe apenas se o produto já tem a classificação atual no ERP — usamos para conferir com o NCM.'],
      ['5. Se a sua planilha vem direto do ERP, não precisa usar este modelo: envie como está e indique as colunas na tela.'],
      ['6. Apague as duas linhas de exemplo antes de enviar.'],
    ]);
    inst.getRow(1).font = { bold: true, size: 13 };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
