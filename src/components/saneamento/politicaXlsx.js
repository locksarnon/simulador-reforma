// Política de uso em Excel e em JSON (passo 8): as regras por procedimento, as regras por grupo, o padrão de descrição, as unidades e o resumo da aprovação.
// Funções puras (sem React); os downloads ficam em gerarXlsxPolitica() e baixarJsonPolitica().
import { baixarXlsx, carregarExcelJS } from "./arquivoXlsx";
import { COLUNAS_REGRAS, linhasRegras } from "./politica";
import { ROTULO_REGRAS, dataBr } from "./logica";

const rotuloSemExemplo = (r) => r.replace(/ \(ex\.:.*\)$/, "");

/** Monta o workbook da política (separado do download para poder ser testado). */
export function criarWorkbookPolitica(ExcelJS, politica, { nomeProjeto = "", nomeBase = "" } = {}) {
  const wb = new ExcelJS.Workbook(); wb.created = new Date();
  const tabela = (ws, colunas, linhas, quebrar = []) => {
    ws.columns = colunas.map(([titulo, chave, largura]) => ({ header: titulo, key: chave, width: largura }));
    ws.addRows(linhas);
    colunas.forEach(([, chave], i) => { ws.getColumn(i + 1).alignment = { vertical: "top", wrapText: quebrar.includes(chave) }; });
    ws.getRow(1).font = { bold: true }; ws.getRow(1).alignment = { vertical: "middle", wrapText: true };
    ws.views = [{ state: "frozen", ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  };
  const e = politica.estruturada;

  const resumo = wb.addWorksheet("Resumo"); resumo.columns = [{ width: 34 }, { width: 100 }];
  [["Política de uso dos estoques", ""], ["Projeto", nomeProjeto], ["Base importada", nomeBase], ["Situação", politica.situacao], ["Aprovada por", politica.aprovada ? `${politica.aprovada.por} em ${dataBr(politica.aprovada.em)}` : "—"], ["Gerada em", new Date().toLocaleString("pt-BR")], [],
    ["Pendências", politica.pendencias.length ? "" : "nenhuma"], ...politica.pendencias.map((p) => ["", p]), [],
    ["Atenção", e.aviso]].forEach((l) => resumo.addRow(l));
  resumo.getRow(1).font = { bold: true, size: 13 }; resumo.getColumn(1).font = { bold: true }; resumo.getColumn(2).alignment = { vertical: "top", wrapText: true };

  tabela(wb.addWorksheet("Procedimentos e regras"), COLUNAS_REGRAS, linhasRegras(politica), ["texto", "origem", "evidencia", "controle"]);
  tabela(wb.addWorksheet("Por grupo"), [["Grupo", "grupo", 32], ["Itens em escopo", "itens", 14], ["Saneado", "saneado", 12], ["Revisão fiscal", "fiscal", 20], ["Critérios pendentes no grupo", "criteriosPendentes", 18], ["Regra do grupo", "regra", 70]],
    politica.porGrupo.map((g) => ({ ...g, saneado: g.saneado ? "Sim" : "Não" })), ["regra"]);

  const pd = wb.addWorksheet("Padrão de descrição"); pd.columns = [{ width: 52 }, { width: 40 }];
  pd.addRow(["Formato", e.descricao.formato]); pd.addRow(["Limite de caracteres (SAP B1, a confirmar)", e.descricao.limiteCaracteres]); pd.addRow([]);
  pd.addRow(["Regra de formato", "Ligada"]).font = { bold: true };
  for (const [k, ligada] of Object.entries(e.descricao.regrasDeFormato)) pd.addRow([rotuloSemExemplo(ROTULO_REGRAS[k] || k), ligada ? "Sim" : "Não"]);
  pd.addRow([]); pd.addRow(["Abreviação aprovada", "Palavra completa"]).font = { bold: true };
  for (const [de, para] of Object.entries(e.descricao.abreviacoesAprovadas)) pd.addRow([de.toUpperCase(), para]);

  const un = wb.addWorksheet("Unidades"); un.columns = [{ width: 26 }, { width: 14 }, { width: 80 }];
  un.addRow(["Política", e.unidade.politica]); un.addRow([]); un.addRow(["Medida", "Nome da unidade de estoque"]).font = { bold: true };
  for (const [medida, nome] of Object.entries(e.unidade.nomesPadrao)) un.addRow([medida, nome]);
  un.addRow([]); const h = un.addRow(["Unidade na base", "Itens", "Como a política trata"]); h.font = { bold: true };
  for (const t of e.unidade.tabela) un.addRow([t.unidade, t.itens, t.tratamento]);
  un.getColumn(3).alignment = { wrapText: true, vertical: "top" };
  return wb;
}

/** Gera e baixa o Excel da política. A biblioteca é carregada só nesta hora. */
export async function gerarXlsxPolitica(politica, meta, nomeArquivo) {
  const ExcelJS = await carregarExcelJS();
  baixarXlsx(await criarWorkbookPolitica(ExcelJS, politica, meta).xlsx.writeBuffer(), nomeArquivo);
}

/** Baixa a política estruturada (JSON legível), para configurar o módulo de cadastro automático do cliente. */
export function baixarJsonPolitica(politica, nomeArquivo) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(politica.estruturada, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = nomeArquivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
