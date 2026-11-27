/**
 * Exportação padrão das listas (molde Lista de docs/estrutura-de-telas.md): Excel, PDF ou CSV, só com as colunas escolhidas.
 * colunas: [{ chave, rotulo, valor?: (linha) => texto|número }]. O arquivo é montado no navegador.
 */
import { plural } from "./plural";
import { cabecalhoFalExcel, carregarLogoFal, logoFalNasPaginasPdf, TOPO_ABAIXO_DA_LOGO_MM } from "./marcaFal";
const valorDa = (c, l) => {
  const v = c.valor ? c.valor(l) : l[c.chave];
  return v === null || v === undefined ? "" : v;
};

/** Texto CSV com ";" (o Excel em português abre direto), aspas quando preciso e BOM para os acentos. */
export function montarCsv(colunas, linhas) {
  const cel = (v) => { const s = String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [colunas.map((c) => cel(c.rotulo)).join(";"), ...linhas.map((l) => colunas.map((c) => cel(valorDa(c, l))).join(";"))].join("\r\n");
}

function baixarBlob(blob, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Excel com a logo da FAL na linha 1 e os títulos na linha seguinte (quem lê de volta, como a importação de empresas, pula a linha em branco). */
export async function montarXlsx(titulo, colunas, linhas) {
  const [ExcelJS, logo] = await Promise.all([import("exceljs").then((m) => m.default), carregarLogoFal()]);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(titulo.slice(0, 31).replace(/[\\/?*[\]:]/g, "-") || "Lista");
  const h = cabecalhoFalExcel(wb, ws, logo) + 1;
  ws.addRow(colunas.map((c) => c.rotulo));
  ws.getRow(h).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(h).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E764D" } };
  for (const l of linhas) ws.addRow(colunas.map((c) => valorDa(c, l)));
  ws.columns.forEach((col, i) => { col.width = Math.min(60, Math.max(10, String(colunas[i].rotulo).length + 2, ...linhas.slice(0, 200).map((l) => String(valorDa(colunas[i], l)).length + 2))); });
  ws.autoFilter = { from: { row: h, column: 1 }, to: { row: h, column: colunas.length } };
  ws.views = [{ state: "frozen", ySplit: h }];
  return wb.xlsx.writeBuffer();
}

/** PDF com a logo da FAL no alto de todas as páginas (o conteúdo começa abaixo dela). */
export async function montarPdf(titulo, colunas, linhas) {
  const [{ jsPDF }, logo] = await Promise.all([import("jspdf"), carregarLogoFal()]);
  const doc = new jsPDF({ orientation: colunas.length > 5 ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const M = 12;
  const w = (larguraPagina - M * 2) / colunas.length;
  const TOPO = TOPO_ABAIXO_DA_LOGO_MM;
  let y = TOPO;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(titulo, M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(110);
  doc.text(`${plural(linhas.length, "linha", "linhas")} · gerado em ${new Date().toLocaleString("pt-BR")}`, M, y + 5);
  y += 12;
  const cabecalho = () => { doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(0); colunas.forEach((c, i) => doc.text(doc.splitTextToSize(c.rotulo, w - 2)[0], M + i * w, y)); y += 2; doc.setDrawColor(200); doc.line(M, y, larguraPagina - M, y); y += 4; doc.setFont("helvetica", "normal"); };
  cabecalho();
  for (const l of linhas) {
    const celulas = colunas.map((c) => doc.splitTextToSize(String(valorDa(c, l)), w - 2).slice(0, 3));
    const altura = Math.max(...celulas.map((x) => x.length)) * 3.4 + 1.5;
    if (y + altura > alturaPagina - 10) { doc.addPage(); y = TOPO; cabecalho(); }
    celulas.forEach((linhasCel, i) => doc.text(linhasCel, M + i * w, y));
    y += altura;
  }
  logoFalNasPaginasPdf(doc, logo, { margem: M });
  return doc.output("arraybuffer");
}

/** Gera e baixa o arquivo no formato escolhido. */
export async function exportarLista({ titulo, colunas, linhas, formato }) {
  const nome = `${String(titulo).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "lista"}-${new Date().toISOString().slice(0, 10)}`;
  if (formato === "csv") return baixarBlob(new Blob([montarCsv(colunas, linhas)], { type: "text/csv;charset=utf-8" }), `${nome}.csv`);
  if (formato === "pdf") return baixarBlob(new Blob([await montarPdf(titulo, colunas, linhas)], { type: "application/pdf" }), `${nome}.pdf`);
  return baixarBlob(new Blob([await montarXlsx(titulo, colunas, linhas)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${nome}.xlsx`);
}
