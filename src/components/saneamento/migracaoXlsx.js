// Relatório da migração em Excel: o que vinculou ao código do item, o que ficou ambíguo e o que não foi encontrado na base original, com o motivo de cada um. O código vai como
// TEXTO (formato de célula de texto), para os zeros à esquerda nunca se perderem. Funções puras; o download fica em gerarXlsxMigracao().
import { baixarXlsx, carregarExcelJS } from "./arquivoXlsx";
import { ROT_RESULTADO, ROT_TIPO } from "./migracao";
import { textoOrigem } from "./identidade";

const COLUNAS = [["Tipo", "tipo", 22], ["Chave antiga (linha|critério)", "chaveAntiga", 24], ["Critério", "criterio", 16], ["Linha na base original", "linha", 12], ["Código do item (texto)", "codigo", 20], ["Grupo", "grupo", 26], ["Descrição", "descricao", 44], ["Resultado", "resultado", 34], ["Motivo", "motivo", 70], ["Chave nova (código|critério)", "chaveNova", 26]];
const dataBr = (d) => (d ? String(d).split("-").reverse().join("/") : "—");

/** Monta o workbook da migração: aba Resumo e uma aba por resultado (as linhas ficam na ordem em que foram conferidas). */
export function criarWorkbookMigracao(ExcelJS, relatorio, { nomeProjeto = "" } = {}) {
  const wb = new ExcelJS.Workbook(); wb.created = new Date();
  const t = relatorio.totais; const v = relatorio.verificacao;
  const resumo = wb.addWorksheet("Resumo"); resumo.columns = [{ width: 46 }, { width: 100 }];
  const conta = (x) => `${x.total} no total: ${x.vinculadas} vinculadas, ${x.ambiguas} ambíguas, ${x.naoEncontradas} não encontradas`;
  [["Relatório da migração para o código do item", ""], ["Projeto", nomeProjeto], ["Origem dos dados", textoOrigem(relatorio.origem)], ["Base original usada", relatorio.base?.arquivo || "—"], ["Migração feita por", `${relatorio.por || "—"} em ${dataBr(relatorio.geradoEm)}`], [],
    ["Decisões", conta(t.decisoes)], ["Confirmações de execução", conta(t.execucao)], ["Decisões fiscais", conta(t.fiscal)], [],
    ["Conferência da base", v ? `${v.mensagem} (${v.verificacoes} conferências, ${v.falhas} falhas)` : "sem base original: nada foi migrado"],
    [],
    ["Como ler", "Vinculada = a decisão foi ligada ao código do item que a linha tinha na base original. Ambígua = não há como ligar com segurança (item sem código, código repetido, conferência que falhou ou base que não confere) e a decisão fica guardada, intacta, no legado do projeto, pendente de revisão. Não encontrada = a linha não existe na base. Nenhuma decisão antiga foi reconstruída pelo número da linha de outra base."],
    ["Atenção", "A migração só organiza o que já estava no projeto: nada foi alterado no cadastro nem no ERP, e as decisões ambíguas precisam ser avaliadas de novo."]].forEach((l) => resumo.addRow(l));
  resumo.getRow(1).font = { bold: true, size: 13 }; resumo.getColumn(1).font = { bold: true }; resumo.getColumn(2).alignment = { vertical: "top", wrapText: true };

  const aba = (nome, linhas) => {
    const ws = wb.addWorksheet(nome); ws.columns = COLUNAS.map(([titulo, chave, largura]) => ({ header: titulo, key: chave, width: largura }));
    for (const l of linhas) ws.addRow({ ...l, tipo: ROT_TIPO[l.tipo] || l.tipo, resultado: ROT_RESULTADO[l.resultado] || l.resultado, codigo: String(l.codigo ?? ""), linha: l.linha ?? "" });
    ws.getColumn(5).numFmt = "@"; // o código é texto: zeros à esquerda ficam
    COLUNAS.forEach(([, chave], i) => { ws.getColumn(i + 1).alignment = { vertical: "top", wrapText: ["descricao", "motivo"].includes(chave) }; });
    ws.getRow(1).font = { bold: true }; ws.getRow(1).alignment = { vertical: "middle", wrapText: true };
    ws.views = [{ state: "frozen", ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS.length } };
  };
  aba("Vinculadas", relatorio.linhas.filter((l) => l.resultado === "VINCULADA"));
  aba("Ambíguas", relatorio.linhas.filter((l) => l.resultado === "AMBIGUA"));
  aba("Não encontradas", relatorio.linhas.filter((l) => l.resultado === "NAO_ENCONTRADA"));
  return wb;
}

/** Gera e baixa o relatório da migração. A biblioteca é carregada só nesta hora. */
export async function gerarXlsxMigracao(relatorio, meta, nomeArquivo) {
  const ExcelJS = await carregarExcelJS();
  baixarXlsx(await criarWorkbookMigracao(ExcelJS, relatorio, meta).xlsx.writeBuffer(), nomeArquivo);
}

/** O que ficou pendente no legado do projeto, no mesmo formato do relatório (para baixar depois da migração). */
export function relatorioDoLegado(estado) {
  const l = estado?.legado; const m = estado?.migracao; if (!l) return null;
  const linhas = l.linhas || []; const conta = (tipo) => { const x = linhas.filter((r) => r.tipo === tipo); return { total: x.length, vinculadas: 0, ambiguas: x.filter((r) => r.resultado === "AMBIGUA").length, naoEncontradas: x.filter((r) => r.resultado === "NAO_ENCONTRADA").length }; };
  return { geradoEm: m?.em || l.geradoEm || "", por: m?.por || l.por || "", base: l.base || m?.base || null, origem: estado.origem || {}, totais: { decisoes: conta("decisao"), execucao: conta("execucao"), fiscal: conta("fiscal") }, verificacao: m?.verificacao ? { ...m.verificacao, mensagem: "Pendências guardadas no legado do projeto." } : null, linhas };
}
