// Matriz fiscal do grupo em Excel (passo 8): uma linha por item, com a proposta, o fundamento, a validação e as pendências, e um resumo por grupo.
// Funções puras (sem React); o download fica em gerarXlsxFiscal().
import { baixarXlsx, carregarExcelJS } from "./arquivoXlsx";
import { COLUNAS_MATRIZ, ORDEM_SITUACOES, SITUACOES } from "./fiscal";
import { dataBr } from "./logica";

const TONS = { r: "FFF8D7DA", a: "FFFFF3CD", b: "FFDCE6F1", g: "FFE2EFDA", n: "FFEDEDED" };
const QUEBRAR = ["descricao", "descricaoClasse", "confianca", "fundamento", "rotuloSituacao", "proposta", "obs", "validacao"];

export const NOTAS_FISCAIS = [
  "A classe sugerida vem da correlação do NCM com os anexos da LC 214/2025 consultados: é sugestão para revisão, não parecer, e nada foi alterado no cadastro nem no ERP.",
  "Onde o anexo cita o capítulo ou a posição inteira, ou o NCM abrange produtos com tratamentos diferentes, o enquadramento depende dos requisitos do produto: o item fica para revisão, sem classe sugerida.",
  "Sem enquadramento nos anexos consultados não significa ausência de benefício: pode haver outra base legal (produtor rural, regime específico).",
  "CST e redução vêm do catálogo de classes do InTAX (versão vigente). Esta revisão classifica o produto; o CST e o cClassTrib de cada operação (exportação, devolução, entre outras) podem ser outros e seguem na validação das operações.",
  "Itens que parecem serviço não usam os anexos de produtos: classificar por NBS e LC 116 na ferramenta de classificação de serviços.",
];

/**
 * Monta o workbook (separado do download para poder ser testado). `linhas` vem de linhasMatriz(); `resumos` é [{ grupo, resumo, concluida: { por, em } | null }],
 * de resumoFiscal() por grupo.
 */
export function criarWorkbookFiscal(ExcelJS, { linhas, resumos, nomeProjeto = "", nomeBase = "" }) {
  const wb = new ExcelJS.Workbook(); wb.created = new Date();
  const ws = wb.addWorksheet("Matriz fiscal");
  ws.columns = COLUNAS_MATRIZ.map(([titulo, chave, largura]) => ({ header: titulo, key: chave, width: largura }));
  ws.addRows(linhas);
  COLUNAS_MATRIZ.forEach(([, chave], i) => { ws.getColumn(i + 1).alignment = { vertical: "top", wrapText: QUEBRAR.includes(chave) }; });
  ws.getRow(1).font = { bold: true }; ws.getRow(1).alignment = { vertical: "middle", wrapText: true };
  const iSit = COLUNAS_MATRIZ.findIndex(([, k]) => k === "rotuloSituacao") + 1;
  linhas.forEach((l, i) => { ws.getCell(i + 2, iSit).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TONS[SITUACOES[l.situacao].tom] } }; });
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS_MATRIZ.length } };

  const rs = wb.addWorksheet("Resumo");
  const cab = ["Grupo", "Itens", ...ORDEM_SITUACOES.map((s) => SITUACOES[s].rotulo), "A decidir", "A revisar com especialista", "Decididos", "Revisão fiscal", "Concluída por", "Em"];
  rs.columns = cab.map((_, i) => ({ width: i === 0 ? 30 : i < 2 ? 10 : i < 2 + ORDEM_SITUACOES.length ? 18 : 16 }));
  rs.addRow(["Projeto", nomeProjeto]); rs.addRow(["Base importada", nomeBase]); rs.addRow(["Gerado em", new Date().toLocaleString("pt-BR")]); rs.addRow([]);
  const hr = rs.addRow(cab); hr.font = { bold: true }; hr.alignment = { wrapText: true, vertical: "middle" };
  for (const { grupo, resumo: r, concluida } of resumos) {
    rs.addRow([grupo, r.total, ...ORDEM_SITUACOES.map((s) => r.porSit[s]), r.pendentes, r.revisar, r.decididos, concluida ? "Concluída" : r.pendentes ? "Em revisão" : "Pronta para concluir", concluida?.por || "", concluida?.em ? dataBr(concluida.em) : ""]);
  }
  rs.addRow([]); rs.addRow(["Como ler"]).font = { bold: true };
  for (const n of NOTAS_FISCAIS) { const r = rs.addRow([n]); rs.mergeCells(r.number, 1, r.number, 8); r.alignment = { wrapText: true, vertical: "top" }; r.height = 32; }
  rs.getColumn(1).font = { bold: true };
  return wb;
}

/** Gera e baixa o Excel da matriz fiscal. A biblioteca é carregada só nesta hora. */
export async function gerarXlsxFiscal(dados, nomeArquivo) {
  const ExcelJS = await carregarExcelJS();
  baixarXlsx(await criarWorkbookFiscal(ExcelJS, dados).xlsx.writeBuffer(), nomeArquivo);
}
