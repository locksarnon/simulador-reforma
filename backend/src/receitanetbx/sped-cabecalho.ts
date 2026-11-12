import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Registro 0000 da escrituração (o próprio arquivo transmitido à Receita): período e se é original ou retificadora.
 * - EFD ICMS/IPI: |0000|COD_VER|COD_FIN|DT_INI|DT_FIN|... (COD_FIN 0 = original, 1 = substituta/retificadora)
 * - EFD-Contribuições: |0000|COD_VER|TIPO_ESCRIT|IND_SIT_ESP|NUM_REC_ANTERIOR|DT_INI|DT_FIN|... (TIPO_ESCRIT 0 = original, 1 = retificadora)
 * - ECD e ECF: as duas primeiras datas do registro são o início e o fim do período.
 */
export type Cabecalho = { inicio: string; fim: string; retificadora: boolean | null };

const iso = (d: string) => `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;

/** Texto do arquivo (latin1); se vier compactado (ZIP), o primeiro arquivo de dentro. */
export function textoDoSped(buf: Buffer): string {
  if (buf.subarray(0, 2).toString('latin1') !== 'PK') return buf.subarray(0, 200_000).toString('latin1');
  const pasta = mkdtempSync(join(tmpdir(), 'sped-'));
  try {
    const zip = join(pasta, 'a.zip');
    writeFileSync(zip, buf);
    return execFileSync('unzip', ['-p', zip], { maxBuffer: 64 * 1024 * 1024 }).subarray(0, 200_000).toString('latin1');
  } catch { return ''; } finally { rmSync(pasta, { recursive: true, force: true }); }
}

export function lerCabecalho(texto: string, escrituracao: string): Cabecalho | null {
  const linha = texto.split(/\r?\n/).find((l) => l.startsWith('|0000|'));
  if (!linha) return null;
  const c = linha.split('|');
  const datas = c.filter((x) => /^\d{8}$/.test(x) && Number(x.slice(2, 4)) >= 1 && Number(x.slice(2, 4)) <= 12);
  if (datas.length < 2) return null;
  let retificadora: boolean | null = null;
  if (escrituracao === 'EFD_ICMS_IPI' || escrituracao === 'EFD_CONTRIBUICOES') retificadora = c[3] === '1' ? true : c[3] === '0' ? false : null;
  return { inicio: iso(datas[0]), fim: iso(datas[1]), retificadora };
}

/** Competência do arquivo: AAAA-MM nas EFD (mensais), AAAA na ECD e na ECF. */
export const competenciaDe = (cab: Cabecalho, anual: boolean) => (anual ? cab.fim.slice(0, 4) : cab.inicio.slice(0, 7));
