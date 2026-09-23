import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../prisma/prisma.service';
import { ClassificacaoService } from '../classificacao/classificacao.service';
import { avaliarNcm, compararComDeclarado, soDigitos, textoConfianca } from '../classificacao/ncm-classe';

export const CAMPOS = ['codigo', 'descricao', 'ncm', 'unidade', 'origem', 'c_class_trib'] as const;
export type Campo = (typeof CAMPOS)[number];
export type Mapeamento = Partial<Record<Campo, number | null>>;

export const ROTULOS: Record<Campo, string> = {
  codigo: 'Código do produto',
  descricao: 'Descrição',
  ncm: 'NCM',
  unidade: 'Unidade',
  origem: 'Origem',
  c_class_trib: 'cClassTrib atual',
};

/** Nomes de coluna (já normalizados) que cada ERP costuma usar. */
const SINONIMOS: Record<Campo, string[]> = {
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
  sugestao: { c_class_trib: string | null; descricao: string | null; reducao: number; confianca: string; ambiguo: boolean; anexo: string | null } | null;
  c_class_trib_informado: string;
};

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

  async validar(file: Express.Multer.File, mapeamentoInformado?: Mapeamento, limiteLinhas?: number) {
    const p = await this.lerArquivo(file);
    const mapa = { ...this.detectarMapeamento(p.cabecalho), ...(mapeamentoInformado || {}) };
    if (mapa.ncm === null || mapa.ncm === undefined) {
      throw new BadRequestException('Não identifiquei a coluna do NCM. Indique qual coluna contém o NCM e envie novamente.');
    }
    const g = (l: string[], c: Campo) => (mapa[c] === null || mapa[c] === undefined ? '' : (l[mapa[c] as number] ?? '').trim());

    const truncado = limiteLinhas && p.linhas.length > limiteLinhas ? p.linhas.length : 0;
    const linhas = limiteLinhas ? p.linhas.slice(0, limiteLinhas) : p.linhas;

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
        if (ncm.length === 7 && p.ncmNumerico[mapa.ncm as number]) {
          ncm = ncm.padStart(8, '0');
          problemas.push({ codigo: 'NCM_ZERO_RESTAURADO', severidade: 'info', mensagem: `O Excel removeu o zero à esquerda; corrigido para ${ncm}.` });
        }
        if (ncm.length !== 8) {
          problemas.push({ codigo: 'NCM_FORMATO', severidade: 'erro', mensagem: `NCM "${ncmOriginal}" tem ${ncm.length} dígitos; o correto são 8.` });
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
      const dn = `${descricao.toLowerCase()}|${ncm}`;
      if (descricao && (cont.descNcm.get(dn) || 0) > 1 && !(c && (cont.codigo.get(c) || 0) > 1)) {
        problemas.push({ codigo: 'PRODUTO_DUPLICADO', severidade: 'alerta', mensagem: 'Mesma descrição e NCM em mais de um código.' });
      }

      let sugestao: LinhaResultado['sugestao'] = null;
      if (ncm.length === 8) {
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

      const situacao: LinhaResultado['situacao'] = problemas.some((x) => x.severidade === 'erro') ? 'ERRO' : problemas.some((x) => x.severidade === 'alerta') ? 'ALERTA' : 'OK';
      return { linha: i + 2, codigo, descricao, ncm_original: ncmOriginal, ncm, situacao, problemas, sugestao, c_class_trib_informado: informado };
    });

    const resumo = {
      total: resultado.length,
      ok: resultado.filter((r) => r.situacao === 'OK').length,
      alerta: resultado.filter((r) => r.situacao === 'ALERTA').length,
      erro: resultado.filter((r) => r.situacao === 'ERRO').length,
      com_sugestao: resultado.filter((r) => r.sugestao?.c_class_trib).length,
      catalogo_ncm_carregado: catalogoCarregado,
      linhas_no_arquivo: truncado || resultado.length,
      truncado: Boolean(truncado),
      por_problema: Object.entries(
        resultado.flatMap((r) => r.problemas).reduce<Record<string, number>>((a, pb) => ((a[pb.codigo] = (a[pb.codigo] || 0) + 1), a), {}),
      ).sort((a, b) => b[1] - a[1]).map(([codigo, qtd]) => ({ codigo, qtd })),
    };
    return { mapeamento: mapa, resumo, itens: resultado };
  }

  // ── Exportação ───────────────────────────────────────────────────────

  async exportarXlsx(file: Express.Multer.File, mapeamento?: Mapeamento): Promise<Buffer> {
    const r = await this.validar(file, mapeamento);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'InTAX — FAL Agro';
    const ws = wb.addWorksheet('Resultado', { views: [{ state: 'frozen', ySplit: 1 }] });
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
    ];
    const cor = { OK: 'FFE8F5E9', ALERTA: 'FFFFF8E1', ERRO: 'FFFDECEA' } as const;
    r.itens.forEach((it) => {
      const row = ws.addRow({
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
    ws.autoFilter = { from: 'A1', to: 'L1' };

    const rs = wb.addWorksheet('Resumo');
    rs.columns = [{ width: 44 }, { width: 16 }];
    rs.addRows([
      ['Resumo da validação de cadastro', ''],
      ['Produtos analisados', r.resumo.total],
      ['Sem problemas', r.resumo.ok],
      ['Com atenção', r.resumo.alerta],
      ['A corrigir', r.resumo.erro],
      ['Com classificação sugerida', r.resumo.com_sugestao],
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
