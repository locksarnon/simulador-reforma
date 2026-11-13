import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { acharArquivo } from './sped-download.service';

describe('arquivo baixado pelo ReceitanetBX', () => {
  // O Windows não aceita "?" em nome de pasta: este caso roda no Linux (servidor).
  it.skipIf(process.platform === 'win32')('acha o arquivo quando o Java gravou "?" no lugar das letras acentuadas da pasta', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'bx-'));
    const pasta = join(raiz, 'downloads', '03687013103', 'Escritura??o Fiscal Digital');
    mkdirSync(pasta, { recursive: true });
    const nome = '58509112000152-128845198-20260101-20260131-0-ABC-SPED-EFD.txt';
    writeFileSync(join(pasta, nome), '|0000|');
    const informado = join(raiz, 'downloads', '03687013103', 'Escrituração Fiscal Digital', nome);
    expect(await acharArquivo(informado, raiz)).toBe(join(pasta, nome));
    expect(await acharArquivo(join(raiz, 'outra', 'nao-existe.txt'), raiz)).toBeNull();
  });

  it('sem o caminho exato, acha pelo nome do arquivo dentro da pasta do serviço', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'bx-'));
    const pasta = join(raiz, 'downloads', 'Escritura__o');
    mkdirSync(pasta, { recursive: true });
    writeFileSync(join(pasta, 'X-SPED-EFD.txt'), '|0000|');
    expect(await acharArquivo(join(raiz, 'downloads', 'Escrituração', 'X-SPED-EFD.txt'), raiz)).toBe(join(pasta, 'X-SPED-EFD.txt'));
  });
});
