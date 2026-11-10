import { inflateRawSync } from 'zlib';

export type EntradaZip = { nome: string; buffer: Buffer };
export type ResultadoZip = { entradas: EntradaZip[]; ignorados: { nome: string; motivo: string }[] };
export type LimitesZip = {
  /** Quantidade máxima de arquivos .xml dentro do ZIP. */
  maxEntradas: number;
  /** Total máximo descompactado, somando todos os .xml. */
  maxTotal: number;
  /** Tamanho máximo de cada .xml descompactado. */
  maxPorArquivo: number;
};

/** ZIP quebrado, de formato que não lemos (ZIP64) ou acima dos limites: o envio inteiro é recusado. */
export class ZipInvalidoError extends Error {}

const ASSINATURA_FIM = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_LOCAL = 0x04034b50;

const nomeBase = (caminho: string) => caminho.split(/[\\/]/).pop() || caminho;
const megas = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10}`.replace(/\.0$/, '');

/**
 * Lê os arquivos .xml de um ZIP sem confiar nos tamanhos declarados nele: o remetente controla esses números, e um arquivo
 * "pequeno" no diretório do ZIP pode inflar para gigabytes (bomba de descompressão) e travar o servidor em CPU síncrona.
 * Aqui só o tamanho REAL descompactado conta: a descompressão usa o limite de saída do zlib (`maxOutputLength`) e para no
 * primeiro byte além do limite do arquivo. O trabalho fica limitado a `maxPorArquivo` por arquivo e `maxTotal` no ZIP.
 *
 * Usa o diretório central (o único que traz os tamanhos certos também nos ZIPs com "data descriptor", como os de Java).
 * ZIP64 e arquivos com senha não são lidos.
 */
export function lerXmlsDoZip(zip: Buffer, limites: LimitesZip): ResultadoZip {
  const invalido = (motivo = 'ZIP inválido') => new ZipInvalidoError(motivo);

  // Fim do diretório central: nos últimos 22 bytes mais o comentário (até 65.535).
  let fim = -1;
  const menor = Math.max(0, zip.length - 22 - 0xffff);
  for (let i = zip.length - 22; i >= menor; i -= 1) {
    if (zip.readUInt32LE(i) === ASSINATURA_FIM) { fim = i; break; }
  }
  if (fim < 0) throw invalido();
  const total = zip.readUInt16LE(fim + 10);
  const inicioCentral = zip.readUInt32LE(fim + 16);
  if (total === 0xffff || inicioCentral === 0xffffffff) throw invalido('ZIP64 não suportado');

  const entradas: EntradaZip[] = [];
  const ignorados: ResultadoZip['ignorados'] = [];
  let contados = 0;
  let somaTotal = 0;
  let p = inicioCentral;
  for (let n = 0; n < total; n += 1) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== ASSINATURA_CENTRAL) throw invalido();
    const flags = zip.readUInt16LE(p + 8);
    const metodo = zip.readUInt16LE(p + 10);
    const tamComprimido = zip.readUInt32LE(p + 20);
    const nomeLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const comentarioLen = zip.readUInt16LE(p + 32);
    const deslocamentoLocal = zip.readUInt32LE(p + 42);
    if (p + 46 + nomeLen > zip.length) throw invalido();
    const caminho = zip.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nomeLen);
    p += 46 + nomeLen + extraLen + comentarioLen;

    if (!caminho.toLowerCase().endsWith('.xml') || caminho.startsWith('__MACOSX/')) continue;
    contados += 1;
    if (contados > limites.maxEntradas) throw invalido('limite de arquivos');
    const nome = nomeBase(caminho);
    if (flags & 1) { ignorados.push({ nome, motivo: 'arquivo protegido por senha dentro do ZIP' }); continue; }
    if (tamComprimido === 0xffffffff || deslocamentoLocal === 0xffffffff) throw invalido('ZIP64 não suportado');

    // Cabeçalho local: só para achar onde os dados começam (os tamanhos dele podem estar zerados nos ZIPs com data descriptor).
    if (deslocamentoLocal + 30 > zip.length || zip.readUInt32LE(deslocamentoLocal) !== ASSINATURA_LOCAL) throw invalido();
    const inicio = deslocamentoLocal + 30 + zip.readUInt16LE(deslocamentoLocal + 26) + zip.readUInt16LE(deslocamentoLocal + 28);
    if (inicio > zip.length || inicio + tamComprimido > zip.length) throw invalido();
    const dados = zip.subarray(inicio, inicio + tamComprimido);

    let xml: Buffer;
    if (metodo === 0) {
      if (tamComprimido > limites.maxPorArquivo) { ignorados.push({ nome, motivo: `maior que ${megas(limites.maxPorArquivo)} MB` }); continue; }
      xml = Buffer.from(dados);
    } else if (metodo === 8) {
      try {
        xml = inflateRawSync(dados, { maxOutputLength: limites.maxPorArquivo });
      } catch (e) {
        const grande = (e as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE';
        ignorados.push({ nome, motivo: grande ? `maior que ${megas(limites.maxPorArquivo)} MB` : 'arquivo corrompido dentro do ZIP' });
        continue;
      }
    } else {
      ignorados.push({ nome, motivo: 'método de compressão do ZIP não suportado' });
      continue;
    }
    somaTotal += xml.length;
    if (somaTotal > limites.maxTotal) throw invalido('limite de tamanho');
    entradas.push({ nome, buffer: xml });
  }
  return { entradas, ignorados };
}
