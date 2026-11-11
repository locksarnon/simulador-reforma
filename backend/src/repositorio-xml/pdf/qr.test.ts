import { describe, expect, it } from 'vitest';
import { matrizQr } from './qr';

const FINDER = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
const recorte = (m: boolean[][], linha: number, coluna: number) => FINDER.map((_, i) => m[linha + i].slice(coluna, coluna + 7).map((b) => (b ? '1' : '0')).join(''));

describe('matrizQr', () => {
  it('é quadrada, de versão válida, com os três localizadores e a linha de sincronismo', () => {
    const m = matrizQr('https://www.nfce.fazenda.exemplo.gov.br/consulta?p=51261112345678000195650010000001231000000010|2|1|1|ABC');
    const n = m.length;
    expect((n - 17) % 4).toBe(0);
    expect(m.every((l) => l.length === n)).toBe(true);
    expect(recorte(m, 0, 0)).toEqual(FINDER);
    expect(recorte(m, 0, n - 7)).toEqual(FINDER);
    expect(recorte(m, n - 7, 0)).toEqual(FINDER);
    // linha 6 entre os localizadores: módulos escuros e claros alternados
    for (let c = 8; c <= n - 9; c += 1) expect(m[6][c], `coluna ${c}`).toBe(c % 2 === 0);
  });

  it('usa a menor versão que comporta o texto, em modo binário e no nível M (capacidades da ISO/IEC 18004)', () => {
    expect(matrizQr('a'.repeat(14)).length).toBe(21); // versão 1: até 14 bytes
    expect(matrizQr('a'.repeat(15)).length).toBe(25); // versão 2
    expect(matrizQr('a'.repeat(106)).length).toBe(41); // versão 6: até 106 bytes
    expect(matrizQr('a'.repeat(107)).length).toBe(45); // versão 7
  });

  it('o texto vai em UTF-8: letra acentuada ocupa 2 bytes', () => {
    expect(matrizQr('á'.repeat(7)).length).toBe(21); // 14 bytes cabem na versão 1
    expect(matrizQr('á'.repeat(8)).length).toBe(25); // 16 bytes pedem a versão 2
  });

  it('correção de erros mais forte pede versão igual ou maior, e o mesmo texto dá sempre a mesma matriz', () => {
    const texto = 'consulta de teste 0123456789 abcdefghij';
    const tamanhos = (['L', 'M', 'Q', 'H'] as const).map((nivel) => matrizQr(texto, nivel).length);
    expect([...tamanhos].sort((a, b) => a - b)).toEqual(tamanhos);
    expect(matrizQr(texto)).toEqual(matrizQr(texto));
    expect(matrizQr(texto)).not.toEqual(matrizQr(`${texto}!`));
  });
});
