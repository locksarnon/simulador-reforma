// Relatórios do Repositório de XML: colunas de cada um, o texto de cada célula na tela e nos arquivos, e os arquivos (CSV e Excel).
// O Excel é montado no navegador; o exceljs só é carregado quando alguém pede o arquivo.
import { carregarExcelJS, baixarXlsx } from "@/components/saneamento/arquivoXlsx";
import { fmtDoc, ORIGENS } from "./formatos";

const FUSO = "America/Sao_Paulo";

// ---------------------------------------------------------------- colunas

/** tipo: texto | data | documento | moeda | quantidade | inteiro | situacao | origem | simnao. `largura` é a da coluna no Excel. */
export const COLUNAS_GERAL = [
  { chave: "data_emissao", titulo: "Emissão", tipo: "data", largura: 12 },
  { chave: "documento", titulo: "Documento", tipo: "texto", largura: 12 },
  { chave: "numero", titulo: "Número", tipo: "texto", largura: 11 },
  { chave: "serie", titulo: "Série", tipo: "texto", largura: 7 },
  { chave: "emitente_nome", titulo: "Emitente", tipo: "texto", largura: 42 },
  { chave: "emitente_doc", titulo: "CNPJ/CPF do emitente", tipo: "documento", largura: 22 },
  { chave: "destinatario_doc", titulo: "CNPJ/CPF do destinatário", tipo: "documento", largura: 22 },
  { chave: "valor_total", titulo: "Valor (R$)", tipo: "moeda", largura: 15 },
  { chave: "situacao", titulo: "Situação", tipo: "situacao", largura: 13 },
  { chave: "origem", titulo: "Origem", tipo: "origem", largura: 12 },
  { chave: "importado", titulo: "No importador", tipo: "simnao", largura: 14 },
  { chave: "chave", titulo: "Chave de acesso", tipo: "texto", largura: 50 },
];

/** Colunas que a tela mostra no Geral (o Excel e o CSV levam todas). */
export const CHAVES_GERAL_NA_TELA = ["data_emissao", "documento", "numero", "emitente_nome", "valor_total", "situacao", "origem", "importado"];

export const COLUNAS_RESUMO_GERAL = [
  { chave: "documento", titulo: "Documento", tipo: "texto", largura: 14 },
  { chave: "total", titulo: "Total", tipo: "inteiro", largura: 10 },
  { chave: "autorizadas", titulo: "Autorizadas", tipo: "inteiro", largura: 13 },
  { chave: "canceladas", titulo: "Canceladas", tipo: "inteiro", largura: 13 },
  { chave: "denegadas", titulo: "Denegadas", tipo: "inteiro", largura: 13 },
  { chave: "sem_situacao", titulo: "Sem situação", tipo: "inteiro", largura: 14 },
  { chave: "valor_autorizadas", titulo: "Valor das autorizadas (R$)", tipo: "moeda", largura: 26 },
];

const ITENS = [
  { chave: "data_emissao", titulo: "Emissão", tipo: "data", largura: 12 },
  { chave: "numero", titulo: "NF", tipo: "texto", largura: 11 },
  { chave: "serie", titulo: "Série", tipo: "texto", largura: 7 },
  { chave: "emitente_nome", titulo: "Emitente", tipo: "texto", largura: 38 },
  { chave: "emitente_doc", titulo: "CNPJ/CPF do emitente", tipo: "documento", largura: 22 },
  { chave: "item", titulo: "Item", tipo: "texto", largura: 6 },
  { chave: "codigo", titulo: "Código", tipo: "texto", largura: 14 },
  { chave: "descricao", titulo: "Descrição", tipo: "texto", largura: 48 },
  { chave: "ncm", titulo: "NCM", tipo: "texto", largura: 11 },
  { chave: "cfop", titulo: "CFOP", tipo: "texto", largura: 8 },
  { chave: "unidade", titulo: "Un.", tipo: "texto", largura: 6 },
  { chave: "quantidade", titulo: "Quantidade", tipo: "quantidade", largura: 14 },
  { chave: "valor_unitario", titulo: "Valor unitário (R$)", tipo: "moeda", largura: 17 },
  { chave: "valor_total", titulo: "Valor total (R$)", tipo: "moeda", largura: 16 },
  { chave: "desconto", titulo: "Desconto (R$)", tipo: "moeda", largura: 14 },
  { chave: "valor_icms", titulo: "ICMS (R$)", tipo: "moeda", largura: 13 },
  { chave: "valor_ipi", titulo: "IPI (R$)", tipo: "moeda", largura: 13 },
  { chave: "chave", titulo: "Chave de acesso", tipo: "texto", largura: 50 },
];

const SOMAS = [
  { chave: "notas", titulo: "Notas", tipo: "inteiro", largura: 9 },
  { chave: "itens", titulo: "Itens", tipo: "inteiro", largura: 9 },
];
const VALORES = [
  { chave: "valor_total", titulo: "Valor total (R$)", tipo: "moeda", largura: 16 },
  { chave: "desconto", titulo: "Desconto (R$)", tipo: "moeda", largura: 14 },
  { chave: "valor_icms", titulo: "ICMS (R$)", tipo: "moeda", largura: 13 },
  { chave: "valor_ipi", titulo: "IPI (R$)", tipo: "moeda", largura: 13 },
];

/** Colunas do relatório de Produtos conforme o agrupamento (itens soltos, por produto, por NCM ou por CFOP). */
export function colunasProdutos(modo) {
  if (modo === "produto") {
    return [
      { chave: "descricao", titulo: "Produto", tipo: "texto", largura: 52 },
      { chave: "unidade", titulo: "Un.", tipo: "texto", largura: 6 },
      { chave: "ncm", titulo: "NCM", tipo: "texto", largura: 16 },
      { chave: "cfop", titulo: "CFOP", tipo: "texto", largura: 12 },
      ...SOMAS,
      { chave: "quantidade", titulo: "Quantidade", tipo: "quantidade", largura: 14 },
      ...VALORES,
    ];
  }
  if (modo === "ncm") return [{ chave: "chave", titulo: "NCM", tipo: "texto", largura: 14 }, { chave: "produtos", titulo: "Produtos", tipo: "inteiro", largura: 10 }, ...SOMAS, ...VALORES];
  if (modo === "cfop") return [{ chave: "chave", titulo: "CFOP", tipo: "texto", largura: 12 }, { chave: "produtos", titulo: "Produtos", tipo: "inteiro", largura: 10 }, ...SOMAS, ...VALORES];
  return ITENS;
}

export const CHAVES_ITENS_NA_TELA = ["data_emissao", "numero", "emitente_nome", "codigo", "descricao", "ncm", "cfop", "unidade", "quantidade", "valor_total"];

// ---------------------------------------------------------------- células

const numeroBR = (n, minimo, maximo) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: minimo, maximumFractionDigits: maximo });

/** AAAA-MM-DD da data no horário de Brasília (a data de emissão vem em UTC no banco). */
export function dataLocal(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: FUSO });
}

const capitalizar = (txt) => (txt ? txt.charAt(0) + txt.slice(1).toLowerCase() : "");

/** Texto da célula, como aparece na tela e no CSV (o CSV tira só o ponto de milhar). */
export function textoDaCelula(coluna, linha, { csv = false } = {}) {
  const v = linha[coluna.chave];
  switch (coluna.tipo) {
    case "data": { const d = dataLocal(v); return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : ""; }
    case "documento": return v ? fmtDoc(v) : "";
    case "moeda": return v == null || v === "" ? "" : csv ? Number(v).toFixed(2).replace(".", ",") : numeroBR(v, 2, 2);
    case "quantidade": return v == null || v === "" ? "" : csv ? String(Number(v)).replace(".", ",") : numeroBR(v, 0, 4);
    case "inteiro": return v == null || v === "" ? "" : csv ? String(v) : numeroBR(v, 0, 0);
    case "situacao": return capitalizar(v);
    case "origem": return ORIGENS[v] || v || "";
    case "simnao": return v ? "Sim" : "Não";
    default: return v == null ? "" : String(v);
  }
}

/** Valor da célula no Excel: data de verdade, número de verdade (para ordenar e somar) e texto onde é texto. */
export function valorDoExcel(coluna, linha) {
  const v = linha[coluna.chave];
  switch (coluna.tipo) {
    case "data": { const d = dataLocal(v); return d ? new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))) : null; }
    case "moeda": case "quantidade": case "inteiro": return v == null || v === "" ? null : Number(v);
    default: return textoDaCelula(coluna, linha) || null;
  }
}

const FORMATO_DO_EXCEL = { data: "dd/mm/yyyy", moeda: "#,##0.00", quantidade: "#,##0.####", inteiro: "#,##0" };

// ---------------------------------------------------------------- arquivos

const escaparCsv = (txt) => (/[";\r\n]/.test(txt) ? `"${txt.replace(/"/g, '""')}"` : txt);

/** CSV para o Excel em português: ponto e vírgula, vírgula decimal, aspas onde precisa. O BOM (UTF-8) é posto ao baixar. */
export function linhasParaCsv(colunas, linhas) {
  const corpo = linhas.map((l) => colunas.map((c) => escaparCsv(textoDaCelula(c, l, { csv: true }))).join(";"));
  return [colunas.map((c) => escaparCsv(c.titulo)).join(";"), ...corpo].join("\r\n");
}

export function baixarCsv(texto, nomeArquivo) {
  const url = URL.createObjectURL(new Blob([`﻿${texto}`], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = nomeArquivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Nome do arquivo: relatorio-<qual>-<empresa>-<de>-a-<ate>.<extensão>, sem caractere que atrapalhe. */
export function nomeDoArquivo({ qual, empresa, de, ate, extensao }) {
  const limpo = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "").slice(0, 40);
  const periodo = [de, ate].filter(Boolean).join("-a-");
  return [`relatorio-${qual}`, limpo(empresa?.id_empresa || empresa?.razao_social || "empresa"), periodo].filter(Boolean).join("-") + `.${extensao}`;
}

const COR = { verde: "FF1E764D", texto: "FF1F2A24", suave: "FF5B6B62", borda: "FFD5DDD8", faixa: "FFF3F6F4" };
const FONTE = "Arial";

function cabecalhoDaPlanilha(ws, { titulo, linhasDeTexto = [], colunas }) {
  ws.getCell("A1").value = titulo;
  ws.getCell("A1").font = { name: FONTE, size: 14, bold: true, color: { argb: COR.verde } };
  linhasDeTexto.forEach((txt, i) => {
    const c = ws.getCell(`A${i + 2}`);
    c.value = txt;
    c.font = { name: FONTE, size: 9.5, color: { argb: COR.suave } };
  });
  const linhaDoCabecalho = linhasDeTexto.length + 3;
  colunas.forEach((col, i) => {
    const c = ws.getCell(linhaDoCabecalho, i + 1);
    c.value = col.titulo;
    c.font = { name: FONTE, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.verde } };
    c.alignment = { vertical: "middle", horizontal: ["moeda", "quantidade", "inteiro"].includes(col.tipo) ? "right" : "left", wrapText: true };
    ws.getColumn(i + 1).width = col.largura;
  });
  ws.getRow(linhaDoCabecalho).height = 28;
  return linhaDoCabecalho;
}

function preencherLinhas(ws, colunas, linhas, primeira) {
  linhas.forEach((l, r) => {
    colunas.forEach((col, i) => {
      const c = ws.getCell(primeira + r, i + 1);
      c.value = valorDoExcel(col, l);
      c.font = { name: FONTE, size: 10, color: { argb: COR.texto } };
      c.border = { bottom: { style: "thin", color: { argb: COR.borda } } };
      if (FORMATO_DO_EXCEL[col.tipo]) c.numFmt = FORMATO_DO_EXCEL[col.tipo];
      if (["moeda", "quantidade", "inteiro"].includes(col.tipo)) c.alignment = { horizontal: "right" };
      if (r % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.faixa } };
    });
  });
}

/** Linha de totais que soma só o que está visível quando a pessoa filtra no Excel (SUBTOTAL 109), com o valor já calculado. */
function linhaDeTotais(ws, colunas, linhas, primeira) {
  if (!linhas.length) return;
  const ultima = primeira + linhas.length - 1;
  const linhaDoTotal = ultima + 1;
  const rotulo = ws.getCell(linhaDoTotal, 1);
  rotulo.value = "Total";
  rotulo.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.texto } };
  colunas.forEach((col, i) => {
    if (col.tipo !== "moeda" || ["valor_unitario"].includes(col.chave)) return;
    const letra = ws.getColumn(i + 1).letter;
    const c = ws.getCell(linhaDoTotal, i + 1);
    c.value = { formula: `SUBTOTAL(109,${letra}${primeira}:${letra}${ultima})`, result: linhas.reduce((a, l) => a + (Number(l[col.chave]) || 0), 0) };
    c.numFmt = FORMATO_DO_EXCEL.moeda;
    c.font = { name: FONTE, size: 10, bold: true, color: { argb: COR.texto } };
    c.alignment = { horizontal: "right" };
    c.border = { top: { style: "thin", color: { argb: COR.texto } } };
  });
}

/**
 * Planilha do relatório. `abas` é uma lista de { nome, titulo, linhasDeTexto, colunas, linhas, totais }: cada uma vira uma aba, com
 * cabeçalho verde, filtro automático e a primeira linha de dados congelada. Devolve o workbook (quem chama escreve o arquivo).
 */
export function montarPlanilha(ExcelJS, abas) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "InTAX";
  wb.created = new Date();
  for (const aba of abas) {
    const ws = wb.addWorksheet(aba.nome, { properties: { tabColor: { argb: COR.verde } } });
    const cab = cabecalhoDaPlanilha(ws, aba);
    preencherLinhas(ws, aba.colunas, aba.linhas, cab + 1);
    if (aba.totais !== false) linhaDeTotais(ws, aba.colunas, aba.linhas, cab + 1);
    if (aba.linhas.length) ws.autoFilter = { from: { row: cab, column: 1 }, to: { row: cab + aba.linhas.length, column: aba.colunas.length } };
    ws.views = [{ state: "frozen", ySplit: cab, showGridLines: false }];
  }
  return wb;
}

export async function baixarPlanilha(abas, nomeArquivo) {
  const ExcelJS = await carregarExcelJS();
  const buf = await montarPlanilha(ExcelJS, abas).xlsx.writeBuffer();
  baixarXlsx(buf, nomeArquivo);
}

// ---------------------------------------------------------------- período padrão

/** Do primeiro dia do mês até hoje, no formato do campo de data (AAAA-MM-DD). */
export function periodoPadrao(hoje = new Date()) {
  const dois = (n) => String(n).padStart(2, "0");
  const y = hoje.getFullYear();
  const m = dois(hoje.getMonth() + 1);
  return { de: `${y}-${m}-01`, ate: `${y}-${m}-${dois(hoje.getDate())}` };
}

/** Texto do filtro para o cabeçalho do arquivo, por exemplo "Período: 01/11/2026 a 30/11/2026". */
export function textoDoPeriodo(de, ate) {
  const f = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
  if (de && ate) return `Período de emissão: ${f(de)} a ${f(ate)}`;
  if (de) return `Emissão a partir de ${f(de)}`;
  if (ate) return `Emissão até ${f(ate)}`;
  return "Período de emissão: todos";
}
