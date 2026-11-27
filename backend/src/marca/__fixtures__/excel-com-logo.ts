import type ExcelJS from 'exceljs';
import { expect } from 'vitest';
import { LINHAS_LOGO_FAL } from '../logo-fal';

/**
 * Para os testes de conteúdo das planilhas: confere que cada aba visível tem a logo da FAL na linha 1 (imagem ancorada na linha 1 e a
 * linha sem valor nenhum) e tira essa linha, para as conferências por posição valerem a partir do conteúdo (títulos na linha 1).
 * O congelamento de painéis e o filtro NÃO são ajustados aqui: o teste que os confere vê os números reais do arquivo.
 */
export function tirarLinhaDaLogo<T extends ExcelJS.Workbook>(wb: T): T {
  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== 'visible') continue;
    expect(ws.getImages().length, `logo da FAL na aba "${ws.name}"`).toBeGreaterThanOrEqual(1);
    expect(ws.getImages()[0].range.tl.nativeRow, `logo na linha 1 da aba "${ws.name}"`).toBe(0);
    for (let r = 1; r <= LINHAS_LOGO_FAL; r++) expect(ws.getRow(r).cellCount, `linha da logo sem valor na aba "${ws.name}"`).toBe(0);
    ws.spliceRows(1, LINHAS_LOGO_FAL);
  }
  return wb;
}
