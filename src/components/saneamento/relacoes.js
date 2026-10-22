// Relações da triagem: cada cartão (universo, fora do escopo, em escopo, sem data legível) abre a lista dos itens e permite emitir o Excel dela.
// Funções puras (sem React nem arquivo): a geração do XLSX fica em gerarRelacao().
import { dataBr, grupoDe } from "./logica";
import { baixarXlsx, carregarExcelJS } from "./arquivoXlsx";

export const RELACOES = {
  universo: { titulo: "Universo", arquivo: "universo" },
  fora: { titulo: "Fora do escopo", arquivo: "fora-do-escopo" },
  emEscopo: { titulo: "Em escopo", arquivo: "em-escopo" },
  semData: { titulo: "Sem data legível", arquivo: "sem-data-legivel" },
};

/** O que a relação reúne, em uma frase. `corte` é a data do parâmetro de saneamento em DD/MM/AAAA ("" = sem corte). */
export function descricaoRelacao(id, corte) {
  switch (id) {
    case "universo": return "Todos os itens da base importada.";
    case "fora": return corte ? `Itens não movimentados desde ${corte}: ficam fora do trabalho.` : "Sem corte definido: nenhum item fica fora do trabalho.";
    case "emEscopo": return "Itens que entram no trabalho (inclui os sem data de movimentação legível).";
    default: return "Itens sem data de última movimentação legível: continuam no escopo, sinalizados.";
  }
}

/** Itens de cada relação. Os números dos cartões (aplicarEscopo().resumo) são os tamanhos destas listas. */
export function itensDaRelacao(id, itens, escopo) {
  if (id === "universo") return itens;
  if (id === "fora") return escopo.fora;
  if (id === "emEscopo") return escopo.emEscopo;
  const semData = new Set(escopo.semData);
  return itens.filter((it) => semData.has(it.linha));
}

/** Função que diz a situação de um item no escopo: fora (com a data do corte), em escopo sem data legível, ou em escopo. */
export function criarSituacao(escopo, corte) {
  const fora = new Set(escopo.fora.map((it) => it.linha)); const semData = new Set(escopo.semData);
  return (it) => (fora.has(it.linha) ? `Fora do escopo (não movimentado desde ${corte})` : semData.has(it.linha) ? "Em escopo, sem data de movimentação legível" : "Em escopo");
}

export const COLUNAS_RELACAO = [
  ["Código", "codigo", 16], ["Descrição", "descricao", 54], ["Unidade", "unidade", 12], ["Grupo", "grupo", 30], ["NCM", "ncm", 14],
  ["Última movimentação", "ultima_mov", 18], ["Situação", "situacao", 46], ["Linha da planilha", "linha", 14],
];

/** Uma linha de planilha por item da relação. */
export function linhasRelacao(lista, escopo, corte) {
  const situacao = criarSituacao(escopo, corte);
  return lista.map((it) => ({
    codigo: it.codigo, descricao: it.descricao, unidade: it.unidade, grupo: grupoDe(it), ncm: it.ncm || it.ncm_original || "",
    ultima_mov: dataBr(it.ultima_mov), situacao: situacao(it), linha: it.linha,
  }));
}

/** Monta o workbook da relação (separado do download para poder ser testado): a lista e uma aba de resumo. */
export function criarWorkbookRelacao(ExcelJS, { id, lista, escopo, corte, nomeProjeto, nomeBase, filtro = "" }) {
  const wb = new ExcelJS.Workbook(); wb.created = new Date();
  const ws = wb.addWorksheet(RELACOES[id].titulo);
  ws.columns = COLUNAS_RELACAO.map(([titulo, chave, largura]) => ({ header: titulo, key: chave, width: largura }));
  ws.addRows(linhasRelacao(lista, escopo, corte));
  ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS_RELACAO.length } };
  const resumo = wb.addWorksheet("Resumo");
  resumo.columns = [{ width: 32 }, { width: 90 }];
  [
    ["Relação", RELACOES[id].titulo], ["O que reúne", descricaoRelacao(id, corte)], ...(filtro ? [["Filtro aplicado na tela", filtro]] : []),
    ["Itens nesta planilha", lista.length], ["Projeto", nomeProjeto || ""], ["Base importada", nomeBase || ""],
    ["Parâmetro de saneamento", corte ? `desconsiderar itens não movimentados desde ${corte}` : "sem corte"], ["Gerado em", new Date().toLocaleString("pt-BR")],
    ["Atenção", "Relação para conferência: nenhum cadastro foi alterado por esta ferramenta."],
  ].forEach((l) => resumo.addRow(l));
  resumo.getColumn(1).font = { bold: true };
  return wb;
}

/** Gera e baixa o Excel da relação. */
export async function gerarRelacao(args, nomeArquivo) {
  const ExcelJS = await carregarExcelJS();
  baixarXlsx(await criarWorkbookRelacao(ExcelJS, args).xlsx.writeBuffer(), nomeArquivo);
}
