import type ExcelJS from 'exceljs';
import { expect } from 'vitest';
import { LINHAS_LOGO_FAL } from '../logo-fal';

/**
 * Exceção aprovada da regra da logo: abas de dados feitas para CARGA NO ERP (SAP DTW e ferramentas parecidas esperam os títulos na linha 1)
 * saem SEM a logo, com os títulos na linha 1 e os dados a partir da linha 2. Esta é a lista fechada (arquivo gerador → abas e motivo): a trava
 * (logo-fal.test.ts) reprova quem usar `cargaNoErp` / `abasDeCargaNoErp` fora dela, e os testes de cada gerador conferem que essas abas saem
 * sem imagem e que o Resumo e as demais abas continuam com a logo.
 */
export const ABAS_DE_CARGA_NO_ERP: Record<string, { abas: string[]; motivo: string }> = {
  'saneamento-estoques/entregaveis/excel.ts': {
    abas: ['Cadastro saneado', 'De para e equivalências', 'Unificações', 'Inativações', 'Equivalências'],
    motivo:
      'Cadastro saneado = a base do ERP inteira já saneada (carga de cadastro, oItems); De para e equivalências e as listas Unificações / ' +
      'Inativações / Equivalências = código que sai → código que fica, a base das cargas de unificação e inativação no ERP',
  },
  'produtos/produtos.service.ts': {
    abas: ['Cadastro saneado'],
    motivo: 'cópia da planilha do ERP sem as duplicidades excluídas, para carregar de volta no ERP',
  },
};
/** Nomes de todas as abas de carga no ERP (sem a logo). */
export const NOMES_DE_CARGA_NO_ERP = new Set(Object.values(ABAS_DE_CARGA_NO_ERP).flatMap((x) => x.abas));

/** Aba de carga no ERP: sem imagem nenhuma e com os títulos já na linha 1. */
export function semLogoDeCargaNoErp(ws: ExcelJS.Worksheet): void {
  expect(ws.getImages(), `aba de carga no ERP "${ws.name}" sem a logo`).toHaveLength(0);
  expect(ws.getRow(1).cellCount, `títulos na linha 1 da aba de carga no ERP "${ws.name}"`).toBeGreaterThan(0);
}

/**
 * Para os testes de conteúdo das planilhas: confere que cada aba visível tem a logo da FAL na linha 1 (imagem ancorada na linha 1 e a
 * linha sem valor nenhum) e tira essa linha, para as conferências por posição valerem a partir do conteúdo (títulos na linha 1).
 * As abas de carga no ERP (NOMES_DE_CARGA_NO_ERP) são conferidas ao contrário: sem imagem e com os títulos já na linha 1 (nada a tirar).
 * O congelamento de painéis e o filtro NÃO são ajustados aqui: o teste que os confere vê os números reais do arquivo.
 */
export function tirarLinhaDaLogo<T extends ExcelJS.Workbook>(wb: T): T {
  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== 'visible') continue;
    if (NOMES_DE_CARGA_NO_ERP.has(ws.name)) { semLogoDeCargaNoErp(ws); continue; }
    expect(ws.getImages().length, `logo da FAL na aba "${ws.name}"`).toBeGreaterThanOrEqual(1);
    expect(ws.getImages()[0].range.tl.nativeRow, `logo na linha 1 da aba "${ws.name}"`).toBe(0);
    for (let r = 1; r <= LINHAS_LOGO_FAL; r++) expect(ws.getRow(r).cellCount, `linha da logo sem valor na aba "${ws.name}"`).toBe(0);
    ws.spliceRows(1, LINHAS_LOGO_FAL);
  }
  return wb;
}
