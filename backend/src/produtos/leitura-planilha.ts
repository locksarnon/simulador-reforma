import { BadRequestException, HttpException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { Readable } from 'stream';

/**
 * Leitura de planilhas (XLSX e CSV) em FLUXO: cada linha é entregue a quem chamou e descartada, em vez de montar a planilha inteira na memória.
 *
 * Por que: o leitor "carrega tudo" do ExcelJS cria um objeto por célula e, em exportações de ERP com centenas de colunas ou com formatação até o fim
 * da grade (1.048.576 linhas x 16.384 colunas declaradas), estourava a memória do Node e derrubava o servidor (erro 502 para todos os usuários).
 * No fluxo, uma base de 30 mil itens lê em segundos e com dezenas de MB, e só as colunas de interesse são guardadas.
 */

export const MAX_LINHAS = 50_000;

export type Planilha = { cabecalho: string[]; linhas: string[][]; ncmNumerico: boolean[]; formato: 'xlsx' | 'csv' };
/** Resumo para a tela de colunas: não guarda as linhas, só o necessário para mostrar e mapear. */
export type Previa = { formato: 'xlsx' | 'csv'; cabecalho: string[]; total: number; exemplos: string[]; amostra: string[][] };

type Arquivo = { buffer: Buffer; originalname?: string };
/** `valores` de uma linha; `deslocamento` é 1 no XLSX (o ExcelJS numera as colunas a partir de 1) e 0 no CSV. */
type AoLinha = (valores: unknown[], deslocamento: 0 | 1) => void;

/** Texto de uma célula, qualquer que seja o tipo guardado no arquivo. */
export function textoCelula(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return textoCelula(o.result);
    if ('richText' in o) return (o.richText as { text: string }[]).map((t) => t.text).join('');
    if ('text' in o) return String(o.text);
    if ('formula' in o) return String(o.formula ?? ''); // fórmula sem resultado guardado (ex.: "--Outros" lido como fórmula)
    if ('error' in o) return String(o.error);
    return '';
  }
  return String(v).trim();
}

const vazio = (v: unknown) => v === null || v === undefined || v === '';
/** Quantas colunas a linha realmente usa (ignora células só formatadas, sem valor, no fim da linha). */
function larguraUtil(valores: unknown[], deslocamento: number): number {
  let w = valores.length - deslocamento;
  while (w > 0 && vazio(valores[w - 1 + deslocamento])) w--;
  return w;
}

async function percorrerXlsx(buf: Buffer, aoLinha: AoLinha): Promise<void> {
  try {
    const leitor = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from([buf]), {
      worksheets: 'emit', sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'cache', entries: 'ignore',
    });
    // Só a primeira aba com dados vale. As demais são percorridas até o fim e descartadas: interromper a leitura no meio deixaria
    // arquivos temporários do ExcelJS para trás.
    let alvo = -1; let k = -1;
    for await (const aba of leitor) {
      k++;
      for await (const linha of aba) {
        const valores = linha.values as unknown[];
        if (!valores || !valores.some((v) => !vazio(v))) continue; // linha em branco
        if (alvo < 0) alvo = k;
        if (k === alvo) aoLinha(valores, 1);
      }
    }
  } catch (e) {
    if (e instanceof HttpException) throw e;
    throw new BadRequestException('Não consegui abrir o Excel. Confirme que o arquivo não está corrompido ou protegido por senha.');
  }
}

function percorrerCsv(buf: Buffer, aoLinha: AoLinha): void {
  let txt = buf.toString('utf8');
  if (txt.includes('�')) txt = buf.toString('latin1'); // ERPs brasileiros costumam exportar em Latin-1
  const primeira = txt.split(/\r?\n/, 1)[0] || '';
  const cont = (c: string) => primeira.split(c).length - 1;
  const delimitador = [';', '\t', ',', '|'].sort((a, b) => cont(b) - cont(a))[0];
  try {
    // on_record devolve null para o registro não ser acumulado: a linha é entregue e esquecida.
    parse(txt, {
      delimiter: delimitador, bom: true, relax_column_count: true, skip_empty_lines: true, relax_quotes: true, trim: true,
      on_record: (registro: string[]) => { aoLinha(registro, 0); return null; },
    });
  } catch (e) {
    if (e instanceof HttpException) throw e;
    throw new BadRequestException('Não consegui ler o CSV. Confira o separador (; ou ,) e as aspas do arquivo.');
  }
}

/** Confere o tipo do arquivo e devolve o formato. */
export function formatoDoArquivo(file: Arquivo): 'xlsx' | 'csv' {
  if (!file?.buffer?.length) throw new BadRequestException('Arquivo vazio ou não enviado.');
  const nome = (file.originalname || '').toLowerCase();
  if (nome.endsWith('.xlsx')) return 'xlsx';
  if (nome.endsWith('.csv') || nome.endsWith('.txt')) return 'csv';
  if (nome.endsWith('.xls')) throw new BadRequestException('O formato .xls (Excel antigo) não é suportado. Salve a planilha como .xlsx ou .csv e envie novamente.');
  throw new BadRequestException('Formato não reconhecido. Envie um arquivo .xlsx ou .csv.');
}

async function percorrer(file: Arquivo, aoLinha: AoLinha): Promise<'xlsx' | 'csv'> {
  const formato = formatoDoArquivo(file);
  if (formato === 'xlsx') await percorrerXlsx(file.buffer, aoLinha); else percorrerCsv(file.buffer, aoLinha);
  return formato;
}

/**
 * Lê a planilha. Com `colunas`, só essas colunas são guardadas (as linhas continuam com os mesmos índices, mas as demais ficam vazias):
 * é assim que uma exportação de 250 colunas cabe na memória. O cabeçalho sempre vem inteiro.
 */
export async function lerPlanilha(file: Arquivo, colunas?: number[] | null): Promise<Planilha> {
  const manter = colunas ? [...new Set(colunas.filter((c) => Number.isInteger(c) && c >= 0))].sort((a, b) => a - b) : null;
  let cab: string[] | null = null; let largura = 0; let total = 0;
  const linhas: string[][] = []; const numerico: boolean[] = [];
  const formato = await percorrer(file, (valores, off) => {
    const w = larguraUtil(valores, off);
    if (!cab) { cab = Array.from({ length: w }, (_, i) => textoCelula(valores[i + off])); largura = w; return; }
    total++; if (w > largura) largura = w;
    if (manter) for (const c of manter) { if (c < w && typeof valores[c + off] === 'number') numerico[c] = true; }
    else for (let i = 0; i < w; i++) if (typeof valores[i + off] === 'number') numerico[i] = true;
    if (linhas.length > MAX_LINHAS) return; // acima do limite só conta; o erro sai depois, sem encher a memória
    const r: string[] = manter ? [] : new Array<string>(w).fill('');
    if (manter) { for (const c of manter) if (c < w) { const t = textoCelula(valores[c + off]); if (t) r[c] = t; } }
    else for (let i = 0; i < w; i++) r[i] = textoCelula(valores[i + off]);
    linhas.push(r);
  });
  if (!cab) throw new BadRequestException('A planilha está vazia.');
  if (total < 1) throw new BadRequestException('A planilha precisa ter o cabeçalho e ao menos uma linha de produto.');
  if (total > MAX_LINHAS) throw new BadRequestException(`A planilha tem ${total.toLocaleString('pt-BR')} linhas; o limite por envio é ${MAX_LINHAS.toLocaleString('pt-BR')}. Divida o arquivo em partes.`);
  const cabecalho = Array.from({ length: largura }, (_, i) => (cab as string[])[i] || `Coluna ${i + 1}`);
  if (!manter) for (const r of linhas) while (r.length < largura) r.push('');
  return { cabecalho, linhas, ncmNumerico: Array.from({ length: largura }, (_, i) => !!numerico[i]), formato };
}

/** Cabeçalho, total de linhas, primeiro valor de cada coluna e as 10 primeiras linhas — sem guardar a planilha. */
export async function lerPrevia(file: Arquivo): Promise<Previa> {
  let cab: string[] | null = null; let largura = 0; let total = 0;
  const exemplos: string[] = []; const faltam = new Set<number>(); const amostra: string[][] = [];
  const formato = await percorrer(file, (valores, off) => {
    const w = larguraUtil(valores, off);
    if (!cab) { cab = Array.from({ length: w }, (_, i) => textoCelula(valores[i + off])); largura = w; for (let i = 0; i < w; i++) faltam.add(i); return; }
    total++;
    if (w > largura) { for (let i = largura; i < w; i++) faltam.add(i); largura = w; }
    if (amostra.length < 10) amostra.push(Array.from({ length: w }, (_, i) => textoCelula(valores[i + off])));
    for (const i of faltam) { const t = textoCelula(valores[i + off]); if (t) { exemplos[i] = t; faltam.delete(i); } }
  });
  if (!cab) throw new BadRequestException('A planilha está vazia.');
  if (total < 1) throw new BadRequestException('A planilha precisa ter o cabeçalho e ao menos uma linha de produto.');
  if (total > MAX_LINHAS) throw new BadRequestException(`A planilha tem ${total.toLocaleString('pt-BR')} linhas; o limite por envio é ${MAX_LINHAS.toLocaleString('pt-BR')}. Divida o arquivo em partes.`);
  const cabecalho = Array.from({ length: largura }, (_, i) => (cab as string[])[i] || `Coluna ${i + 1}`);
  const pad = (r: string[]) => Array.from({ length: largura }, (_, i) => r[i] ?? '');
  return { formato, cabecalho, total, exemplos: Array.from({ length: largura }, (_, i) => exemplos[i] ?? ''), amostra: amostra.map(pad) };
}
