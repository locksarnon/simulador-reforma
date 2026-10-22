// Planilhas geradas no navegador: a biblioteca exceljs só é carregada quando alguém pede um arquivo (não pesa no resto do sistema).
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
