// Planilhas geradas no navegador: a biblioteca exceljs só é carregada quando alguém pede um arquivo (não pesa no resto do sistema).
// Toda aba leva a logo da FAL na linha 1 (regra da ferramenta, src/lib/marcaFal.js); o conteúdo começa abaixo dela. Exceção: aba de carga no ERP
// (`cargaNoErp`), sem a logo e com os títulos na linha 1.
import { cabecalhoFalExcel } from "@/lib/marcaFal";

export async function carregarExcelJS() {
  const mod = await import("exceljs");
  return mod.default || mod;
}

/** Baixa um arquivo .xlsx a partir do conteúdo (buffer) gerado pelo exceljs. */
export function baixarXlsx(buf, nomeArquivo) {
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = nomeArquivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Aba de tabela no padrão: logo da FAL na linha 1, títulos (negrito) na linha seguinte, painel congelado até os títulos e filtro neles.
 * `colunas` = [[título, chave, largura]]. Depois, `ws.addRows(objetos)` escreve as linhas pelas chaves. Devolve o número da linha dos títulos.
 * `cargaNoErp`: aba de carga no ERP — sem a logo, títulos na linha 1 (congelamento e filtro nela).
 */
export function tabelaComLogo(wb, ws, logo, colunas, { xSplit = 0, quebrarTitulos = false, cargaNoErp = false } = {}) {
  const linha = cabecalhoFalExcel(wb, ws, logo, { cargaNoErp }) + 1;
  ws.columns = colunas.map(([, key, width]) => ({ key, width }));
  const cab = ws.addRow(colunas.map(([titulo]) => titulo));
  cab.font = { bold: true };
  if (quebrarTitulos) cab.alignment = { vertical: "middle", wrapText: true };
  ws.views = [{ state: "frozen", ...(xSplit ? { xSplit } : {}), ySplit: linha }];
  ws.autoFilter = { from: { row: linha, column: 1 }, to: { row: linha, column: colunas.length } };
  return linha;
}
