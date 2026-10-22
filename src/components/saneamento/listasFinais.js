// Listas finais do saneamento: lista final corrigida, desduplicações, análises e itens inativados por data de uso.
// Funções puras (sem React nem arquivo): montam as linhas; a geração do XLSX fica em gerarXlsx().
import { CRITERIOS, achadosDoCriterio, criterioAprovado, grupoDe } from "./logica";
import { COLUNAS_LISTA } from "./respostaCliente";

const dataBr = (d) => (d ? String(d).split("-").reverse().join("/") : "");
const ROT_STATUS = { PROP: "Proposto (aguarda decisão)", APR: "Aprovado", REJ: "Rejeitado" };
const NIVEL_ROT = { EXATA: "Idêntico", MUITO_PROVAVEL: "Indicação alta", POSSIVEL: "Indicação possível" };
const decisaoDe = (estado, linha, critId) => estado?.decisoes?.[`${linha}|${critId}`] || null;

/** Itens que saem do cadastro ativo por duplicidade aprovada: o item encaminhado, aprovado e com destino diferente dele mesmo. */
export function unificacoesAprovadas(estado, itens) {
  const porLinha = new Map(itens.map((i) => [i.linha, i]));
  const saida = [];
  for (const [k, d] of Object.entries(estado?.decisoes || {})) {
    const [linha, crit] = k.split("|");
    if (crit !== "duplicidade") continue;
    const origem = porLinha.get(Number(linha)); if (!origem) continue;
    const destinoLinha = d.destino ?? origem.duplicidade?.mestre ?? null;
    saida.push({ d, origem, destino: destinoLinha != null ? porLinha.get(destinoLinha) || null : null, destinoLinha });
  }
  return saida;
}

/**
 * Monta todas as listas. `escopo` vem de aplicarEscopo (emEscopo/fora) e `testes` de criarTestes.
 * Nada aqui altera o cadastro: são relatórios do que foi proposto, aprovado ou deixado de fora.
 */
export function montarListas({ nomeProjeto, nomeBase, estado, itens, escopo, testes }) {
  const params = estado?.params || {};
  const uni = unificacoesAprovadas(estado, itens);
  const saemPorUnificacao = new Set(uni.filter((u) => u.d.status === "APR" && u.destinoLinha != null && u.destinoLinha !== u.origem.linha).map((u) => u.origem.linha));

  // 1) Lista final corrigida: itens em escopo que permanecem, com a descrição final aprovada
  const finalCorrigida = [];
  for (const it of escopo.emEscopo) {
    if (saemPorUnificacao.has(it.linha)) continue;
    const dp = decisaoDe(estado, it.linha, "padrao");
    const aplicada = dp && dp.status === "APR" ? (dp.final || dp.sugerida) : null;
    finalCorrigida.push({
      linha: it.linha, codigo: it.codigo, original: it.descricao, final: aplicada || it.descricao,
      mudanca: aplicada && aplicada !== it.descricao ? "Descrição corrigida" : "Mantido",
      origem: dp && dp.status === "APR" ? (dp.origemFinal === "cliente" ? "Ajustada pelo cliente" : "Sugestão aprovada") : "",
      unidade: it.unidade, grupo: grupoDe(it), ncm: it.ncm || it.ncm_original || "", ultima_mov: dataBr(it.ultima_mov),
    });
  }

  // 2) Desduplicações (aprovadas, rejeitadas e ainda em decisão)
  const desduplicacoes = uni.map(({ d, origem, destino, destinoLinha }) => {
    const cand = origem.duplicidade?.candidatos?.find((c) => c.linha === destinoLinha) || origem.duplicidade?.candidatos?.[0];
    return {
      grupo: d.grupo || grupoDe(origem), codigoOrigem: origem.codigo, descricaoOrigem: origem.descricao, unidadeOrigem: origem.unidade,
      codigoDestino: destino ? destino.codigo : "", descricaoDestino: destino ? destino.descricao : "",
      acao: destinoLinha != null && destinoLinha !== origem.linha ? "Unificar no código mantido" : "Código mantido (sem baixa)",
      nivel: origem.duplicidade ? NIVEL_ROT[origem.duplicidade.nivel] : "", similaridade: cand ? cand.score : "", motivos: cand ? cand.motivos.join("; ") : "",
      decisao: ROT_STATUS[d.status] || d.status, aprovador: d.decididoPor || "", data: dataBr(d.decididoEm),
    };
  }).sort((a, b) => (a.decisao > b.decisao ? 1 : -1));

  // 3) Análises: achados dos critérios aprovados, com a decisão tomada
  const analises = [];
  const aprovados = CRITERIOS.filter((c) => criterioAprovado(estado, c.id) && c.auto);
  for (const c of aprovados) {
    for (const a of achadosDoCriterio(c, escopo.emEscopo, testes)) {
      const d = decisaoDe(estado, a.item.linha, c.id);
      analises.push({
        criterio: c.titulo, grupo: grupoDe(a.item), codigo: a.item.codigo, descricao: a.item.descricao, achado: a.motivo, proposta: a.sugerida || "",
        decisao: d ? ROT_STATUS[d.status] || d.status : "Sem encaminhamento", aprovador: d?.decididoPor || "", data: dataBr(d?.decididoEm),
      });
    }
  }

  // 4) Itens inativados por data de uso (fora do escopo pelo parâmetro de saneamento)
  const criterioTxt = (motivos) => motivos.map((m) => (m === "ate" ? `movimento até ${dataBr(params.ate)}` : `parado há mais de ${params.dias} dias (data-base ${dataBr(params.dataBase)})`)).join(" e ");
  const inativados = escopo.fora.map((f) => ({
    codigo: f.item.codigo, descricao: f.item.descricao, unidade: f.item.unidade, grupo: grupoDe(f.item), ultima_mov: dataBr(f.item.ultima_mov), criterio: criterioTxt(f.motivos),
  }));

  const contagem = {
    universo: itens.length, emEscopo: escopo.emEscopo.length, inativados: inativados.length, semData: escopo.semData.length,
    unificacoesAprovadas: desduplicacoes.filter((x) => x.decisao === "Aprovado" && x.acao.startsWith("Unificar")).length,
    unificacoesPendentes: desduplicacoes.filter((x) => x.decisao.startsWith("Proposto")).length,
    descricoesCorrigidas: finalCorrigida.filter((x) => x.mudanca === "Descrição corrigida").length,
    listaFinal: finalCorrigida.length, achados: analises.length,
  };
  const resumo = [
    ["Projeto", nomeProjeto], ["Base importada", nomeBase || ""], ["Gerado em", new Date().toLocaleString("pt-BR")], ["", ""],
    ["Parâmetro de saneamento", [params.ateOn ? `desconsiderar movimentados até ${dataBr(params.ate)}` : "", params.diasOn ? `desconsiderar sem movimento há mais de ${params.dias} dias (data-base ${dataBr(params.dataBase)})` : ""].filter(Boolean).join(" · ") || "sem corte"],
    ["Universo (códigos)", contagem.universo], ["Em escopo", contagem.emEscopo], ["Inativados por data de uso (fora do escopo)", contagem.inativados], ["Em escopo sem data de movimentação legível", contagem.semData],
    ["Lista final corrigida (códigos)", contagem.listaFinal], ["Descrições corrigidas (aprovadas)", contagem.descricoesCorrigidas],
    ["Unificações aprovadas", contagem.unificacoesAprovadas], ["Unificações ainda em decisão", contagem.unificacoesPendentes], ["Achados nos critérios aprovados", contagem.achados], ["", ""],
    ["Critérios aprovados", aprovados.length ? "" : "nenhum"],
    ...CRITERIOS.filter((c) => criterioAprovado(estado, c.id)).map((c) => [`  ${c.titulo}`, `aprovado por ${estado.criterios[c.id].por || "—"} em ${dataBr(estado.criterios[c.id].em)}`]),
    ["", ""],
    ["Atenção", "Estas listas refletem as decisões registradas no sistema. A execução no SAP e no físico é conferida nos passos de execução e conferência; nenhum cadastro foi alterado por esta ferramenta."],
  ];
  return { resumo, finalCorrigida, desduplicacoes, analises, inativados, contagem };
}

const ABAS = {
  resumo: { nome: "Resumo" },
  final: { nome: "Lista final corrigida", colunas: [["Código", "codigo", 14], ["Descrição original", "original", 46], ["Descrição final", "final", 46], ["Mudança", "mudanca", 20], ["Origem da correção", "origem", 22], ["Unidade", "unidade", 12], ["Grupo", "grupo", 30], ["NCM", "ncm", 14], ["Última movimentação", "ultima_mov", 16]], fonte: "finalCorrigida" },
  dedup: { nome: "Desduplicações", colunas: [["Grupo", "grupo", 28], ["Código de origem", "codigoOrigem", 14], ["Descrição de origem", "descricaoOrigem", 44], ["Unidade", "unidadeOrigem", 10], ["Ação", "acao", 26], ["Código mantido", "codigoDestino", 14], ["Descrição do mantido", "descricaoDestino", 44], ["Indicação", "nivel", 16], ["Pontuação de similaridade", "similaridade", 14], ["Motivos", "motivos", 50], ["Decisão", "decisao", 22], ["Aprovador", "aprovador", 24], ["Data", "data", 12]], fonte: "desduplicacoes" },
  analises: { nome: "Análises", colunas: [["Critério", "criterio", 26], ["Grupo", "grupo", 28], ["Código", "codigo", 14], ["Descrição", "descricao", 44], ["Achado", "achado", 60], ["Proposta", "proposta", 44], ["Decisão", "decisao", 24], ["Aprovador", "aprovador", 24], ["Data", "data", 12]], fonte: "analises" },
  inativados: { nome: "Inativados por data de uso", colunas: [["Código", "codigo", 14], ["Descrição", "descricao", 46], ["Unidade", "unidade", 12], ["Grupo", "grupo", 30], ["Última movimentação", "ultima_mov", 16], ["Critério de corte", "criterio", 50]], fonte: "inativados" },
};
export const ABAS_DISPONIVEIS = Object.entries(ABAS).map(([id, a]) => ({ id, nome: a.nome }));

/** Monta o workbook com as abas pedidas (separado do download para poder ser testado). */
export function criarWorkbook(ExcelJS, listas, ids) {
  const wb = new ExcelJS.Workbook(); wb.created = new Date();
  for (const id of ids) {
    const a = ABAS[id]; const ws = wb.addWorksheet(a.nome);
    if (id === "resumo") {
      ws.columns = [{ width: 46 }, { width: 90 }];
      listas.resumo.forEach((l) => ws.addRow(l));
      ws.getColumn(1).font = { bold: true };
      continue;
    }
    ws.columns = a.colunas.map(([titulo, chave, largura]) => ({ header: titulo, key: chave, width: largura }));
    ws.addRows(listas[a.fonte]);
    ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: a.colunas.length } };
  }
  return wb;
}

function baixar(buf, nomeArquivo) {
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = nomeArquivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Gera e baixa o XLSX com as abas pedidas. A biblioteca é carregada só nesta hora (não pesa no resto do sistema). */
export async function gerarXlsx(listas, ids, nomeArquivo) {
  const mod = await import("exceljs"); const ExcelJS = mod.default || mod;
  baixar(await criarWorkbook(ExcelJS, listas, ids).xlsx.writeBuffer(), nomeArquivo);
}

/** Planilha das sugestões de descrição para o cliente: ele responde OK ou escreve ao lado como deve ficar. */
export async function gerarListaCliente(linhas, nomeArquivo) {
  const mod = await import("exceljs"); const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Sugestões de descrição");
  ws.columns = COLUNAS_LISTA.map((h, i) => ({ header: h, key: "c" + i, width: [14, 46, 46, 22, 46, 28][i] }));
  ws.addRows(linhas);
  ws.getRow(1).font = { bold: true }; ws.getRow(1).alignment = { wrapText: true, vertical: "top" }; ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS_LISTA.length } };
  const instr = wb.addWorksheet("Como responder");
  instr.columns = [{ width: 110 }];
  ["Para cada linha: se concordar com a descrição sugerida, escreva OK na coluna de resposta.", "Se não concordar, escreva na coluna 'Como deve ficar' a descrição que deseja. Não precisa preencher a resposta.", "Se quiser manter a descrição atual, escreva NÃO.", "Linhas sem resposta continuam aguardando. Não altere a coluna Código.", "Nenhuma alteração é feita no cadastro por esta planilha: ela só registra a decisão."].forEach((t) => instr.addRow([t]));
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = nomeArquivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
