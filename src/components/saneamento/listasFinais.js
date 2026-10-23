// Listas finais do saneamento: lista final corrigida, desduplicações, análises, itens inativados por data de uso e execução (tarefas e confirmações).
// Funções puras (sem React nem arquivo): montam as linhas; a geração do XLSX fica em gerarXlsx().
import { CRITERIOS, dataBr, dataDoCorte, decisoesDoTrabalho, grupoDe } from "./logica";
import { calcularAchados, contarAchados, criteriosAprovados, naoAplicavelDe, situacaoCriterio } from "./analise";
import { COLUNAS_LISTA } from "./respostaCliente";
import { baixarXlsx, carregarExcelJS } from "./arquivoXlsx";
import { fatorDaDecisao, numeroBr } from "./unidades";
import { saldoNaEscala } from "./conjuntos";
import { COLUNAS_EXECUCAO, COLUNAS_FRENTE, FRENTES, LARGURAS_FRENTE, ROT_SITUACAO_GERAL, gerarTarefas, linhasExecucao, resumoExecucao, situacaoPorLinha } from "./execucao";

const ROT_STATUS = { PROP: "Encaminhado (aguarda decisão)", APR: "Aprovado", REJ: "Rejeitado" };
const NIVEL_ROT = { EXATA: "Idêntico", MUITO_PROVAVEL: "Indicação alta", POSSIVEL: "Indicação possível" };
const decisaoDe = (estado, linha, critId) => estado?.decisoes?.[`${linha}|${critId}`] || null;
/** Texto da proposta de um achado: a sugestão e, na conversão de unidade, a unidade de compra e o "itens por unidade de compra". */
const propostaDoAchado = (a) => {
  if (!a.sugerida) return "";
  const e = a.extra;
  if (e?.tipo !== "conversao") return a.sugerida;
  const itens = e.fator != null ? `${numeroBr(e.fator)}${e.evidencia === "descricao" ? " (confirmar)" : ""}` : "a informar";
  return `${a.sugerida} · unidade de compra ${String(e.de).toUpperCase()} · itens por unidade de compra: ${itens}`;
};

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

/** Linhas que saem da lista final porque a unificação foi aprovada (o item é unificado em outro código): não precisam de classificação fiscal própria. */
export function linhasQueSaem(estado, itens) {
  return new Set(unificacoesAprovadas(estado, itens).filter((u) => u.d.status === "APR" && u.destinoLinha != null && u.destinoLinha !== u.origem.linha).map((u) => u.origem.linha));
}

/**
 * Monta todas as listas. `escopo` vem de aplicarEscopo (emEscopo/fora) e `testes` de criarTestes.
 * Nada aqui altera o cadastro: são relatórios do que foi proposto, aprovado ou deixado de fora.
 */
export function montarListas({ nomeProjeto, nomeBase, estado: estadoBruto, itens, escopo, testes, escalaSaldo = 1, cobertura = {} }) {
  const estado = { ...estadoBruto, decisoes: decisoesDoTrabalho(estadoBruto?.decisoes, escopo) }; // decisões de grupos fora do saneamento ficam guardadas e fora das listas
  const corte = dataDoCorte(estado?.params); // DD/MM/AAAA do parâmetro de saneamento ("" = sem corte)
  const uni = unificacoesAprovadas(estado, itens);
  // Execução: tarefas das decisões aprovadas (e dos itens inativados) e a confirmação de cada frente, conciliadas com a evidência
  const { tarefas } = gerarTarefas({ decisoes: estado?.decisoes, tipos: estado?.execucao?.tipos, itens, escopo, params: estado?.params });
  const registros = estado?.execucao?.registros || {};
  const situacaoItem = situacaoPorLinha(tarefas, registros);
  const saemPorUnificacao = linhasQueSaem(estado, itens);

  // 1) Lista final corrigida: itens em escopo que permanecem, com a descrição final aprovada
  const finalCorrigida = [];
  for (const it of escopo.emEscopo) {
    if (saemPorUnificacao.has(it.linha)) continue;
    const dp = decisaoDe(estado, it.linha, "padrao");
    const aplicada = dp && dp.status === "APR" ? (dp.final || dp.sugerida) : null;
    const du = decisaoDe(estado, it.linha, "unidade");
    const unidade = du && du.status === "APR" && du.para ? du : null; // unidade de estoque aprovada
    const conversao = unidade && unidade.tipo === "conversao";
    finalCorrigida.push({
      linha: it.linha, codigo: it.codigo, original: it.descricao, final: aplicada || it.descricao,
      mudanca: [aplicada && aplicada !== it.descricao ? "Descrição corrigida" : "", unidade ? "Unidade de estoque ajustada" : ""].filter(Boolean).join(" + ") || "Mantido",
      origem: dp && dp.status === "APR" ? (dp.origemFinal === "cliente" ? "Ajustada pelo cliente" : "Sugestão aprovada") : "",
      unidade: it.unidade, unidadeProposta: unidade ? unidade.para : "", unidadeCompra: conversao ? unidade.de : "", itensPorCompra: conversao ? (fatorDaDecisao(unidade) ?? "a informar") : "",
      grupo: grupoDe(it), ncm: it.ncm || it.ncm_original || "", ultima_mov: dataBr(it.ultima_mov), execucao: ROT_SITUACAO_GERAL[situacaoItem.get(it.linha)] || "",
    });
  }

  // 2) Desduplicações (aprovadas, rejeitadas e ainda em decisão)
  const desduplicacoes = uni.map(({ d, origem, destino, destinoLinha }) => {
    const cand = origem.duplicidade?.candidatos?.find((c) => c.linha === destinoLinha) || origem.duplicidade?.candidatos?.[0];
    return {
      grupo: d.grupo || grupoDe(origem), codigoOrigem: origem.codigo, descricaoOrigem: origem.descricao, unidadeOrigem: origem.unidade, saldoOrigem: saldoNaEscala(origem.saldo, escalaSaldo) ?? "",
      codigoDestino: destino ? destino.codigo : "", descricaoDestino: destino ? destino.descricao : "", saldoDestino: destino ? saldoNaEscala(destino.saldo, escalaSaldo) ?? "" : "",
      acao: destinoLinha != null && destinoLinha !== origem.linha ? "Unificar no código mantido" : "Código mantido (sem baixa)",
      nivel: origem.duplicidade ? NIVEL_ROT[origem.duplicidade.nivel] : "", similaridade: cand ? cand.score : "", motivos: cand ? cand.motivos.join("; ") : "",
      decisao: ROT_STATUS[d.status] || d.status, aprovador: d.decididoPor || "", data: dataBr(d.decididoEm),
    };
  }).sort((a, b) => (a.decisao > b.decisao ? 1 : -1));

  // 3) Análises: achados dos critérios aprovados, com a decisão tomada
  const analises = [];
  const achadosPorCriterio = calcularAchados(escopo.emEscopo, testes);
  const contagemCriterios = contarAchados(achadosPorCriterio, escopo.emEscopo.length, cobertura);
  const aprovados = criteriosAprovados(estado, contagemCriterios); // inclui os aprovados automaticamente (sem achados)
  for (const c of aprovados.filter((x) => x.auto)) {
    for (const a of achadosPorCriterio[c.id] || []) {
      const d = decisaoDe(estado, a.item.linha, c.id);
      analises.push({
        criterio: c.titulo, grupo: grupoDe(a.item), codigo: a.item.codigo, descricao: a.item.descricao, achado: a.motivo, proposta: propostaDoAchado(a),
        decisao: d ? ROT_STATUS[d.status] || d.status : "Não encaminhado", aprovador: d?.decididoPor || "", data: dataBr(d?.decididoEm),
      });
    }
  }

  // 4) Itens inativados por data de uso (fora do escopo pelo parâmetro de saneamento)
  const inativados = escopo.fora.map((it) => ({
    codigo: it.codigo, descricao: it.descricao, unidade: it.unidade, grupo: grupoDe(it), ultima_mov: dataBr(it.ultima_mov), criterio: it.ultima_mov ? `não movimentado desde ${corte}` : `sem data de movimentação, tratado como anterior a ${corte}`,
  }));

  const execucao = linhasExecucao(tarefas, registros); const rex = resumoExecucao(tarefas, registros);
  const contagem = {
    tarefas: rex.total, concluidas: rex.CONCLUIDA, emAndamento: rex.EM_ANDAMENTO, pendentes: rex.PENDENTE, divergencias: rex.DIVERGENCIA,
    universo: itens.length, emEscopo: escopo.emEscopo.length, inativados: inativados.length, semData: escopo.semData.length, semDataFora: escopo.resumo.semDataFora, semDataEmEscopo: escopo.semData.length - escopo.resumo.semDataFora,
    gruposFora: new Set((escopo.foraGrupos || []).map(grupoDe)).size, itensForaGrupos: (escopo.foraGrupos || []).length,
    unificacoesAprovadas: desduplicacoes.filter((x) => x.decisao === "Aprovado" && x.acao.startsWith("Unificar")).length,
    unificacoesPendentes: desduplicacoes.filter((x) => x.decisao.startsWith("Encaminhado")).length,
    descricoesCorrigidas: finalCorrigida.filter((x) => x.mudanca.includes("Descrição corrigida")).length,
    unidadesAjustadas: finalCorrigida.filter((x) => x.unidadeProposta).length,
    listaFinal: finalCorrigida.length, achados: analises.length,
  };
  const resumo = [
    ["Projeto", nomeProjeto], ["Base importada", nomeBase || ""], ["Gerado em", new Date().toLocaleString("pt-BR")], ["", ""],
    ["Parâmetro de saneamento", corte ? `desconsiderar itens não movimentados desde ${corte}${contagem.semDataFora ? "; itens sem data de movimentação tratados como anteriores à data" : ""}` : "sem corte"],
    ["Universo (códigos)", contagem.universo],
    ...(contagem.itensForaGrupos ? [["Grupos fora do saneamento (não marcados na triagem)", contagem.gruposFora], ["Itens dos grupos fora do saneamento", contagem.itensForaGrupos]] : []),
    ["Em escopo", contagem.emEscopo], ["Inativados por data de uso (fora do escopo)", contagem.inativados], ["Itens sem data de movimentação legível", contagem.semData], ["  Mantidos no escopo (sinalizados)", contagem.semDataEmEscopo], ["  Tratados como anteriores à data (fora do escopo)", contagem.semDataFora],
    ["Lista final corrigida (códigos)", contagem.listaFinal], ["Descrições corrigidas (aprovadas)", contagem.descricoesCorrigidas], ["Unidades de estoque ajustadas (aprovadas)", contagem.unidadesAjustadas],
    ["Unificações aprovadas", contagem.unificacoesAprovadas], ["Unificações ainda em decisão", contagem.unificacoesPendentes], ["Achados nos critérios aprovados", contagem.achados], ["", ""],
    ["Tarefas de execução (decisões aprovadas e itens inativados)", contagem.tarefas], ["  Concluídas (todas as frentes, com evidência)", contagem.concluidas], ["  Em andamento", contagem.emAndamento], ["  Pendentes", contagem.pendentes], ["  Com divergência", contagem.divergencias], ["", ""],
    ["Critérios aprovados", aprovados.length ? "" : "nenhum"],
    ...aprovados.map((c) => [`  ${c.titulo}`, situacaoCriterio(estado, c, contagemCriterios) === "AUTO" ? "aprovado automaticamente (sem achados na base)" : `aprovado por ${estado.criterios[c.id]?.por || "—"} em ${dataBr(estado.criterios[c.id]?.em)}`]),
    ...(() => {
      const sem = CRITERIOS.map((c) => [c, situacaoCriterio(estado, c, contagemCriterios)]).filter(([, st]) => st === "NAO_APLICAVEL" || st === "SEM_ANALISE");
      return sem.length ? [["Critérios fora do trabalho", ""], ...sem.map(([c, st]) => [`  ${c.titulo}`, st === "NAO_APLICAVEL" ? `não se aplica ao projeto: ${naoAplicavelDe(estado, c).justificativa}` : "pendente: a análise de que o teste depende não foi executada nesta base"])] : [];
    })(),
    ["", ""],
    ["Atenção", "Estas listas refletem as decisões registradas no sistema. A execução no SAP e no físico é conferida nos passos de execução e conferência; nenhum cadastro foi alterado por esta ferramenta."],
  ];
  return { resumo, finalCorrigida, desduplicacoes, analises, inativados, execucao, contagem };
}

const ABAS = {
  resumo: { nome: "Resumo" },
  final: { nome: "Lista final corrigida", colunas: [["Código", "codigo", 14], ["Descrição original", "original", 46], ["Descrição final", "final", 46], ["Mudança", "mudanca", 20], ["Origem da correção", "origem", 22], ["Unidade de estoque (atual)", "unidade", 16], ["Unidade de estoque (proposta)", "unidadeProposta", 18], ["Unidade de compra (proposta)", "unidadeCompra", 18], ["Itens por unidade de compra", "itensPorCompra", 16], ["Grupo", "grupo", 30], ["NCM", "ncm", 14], ["Última movimentação", "ultima_mov", 16], ["Execução", "execucao", 18]], fonte: "finalCorrigida" },
  dedup: { nome: "Desduplicações", colunas: [["Grupo", "grupo", 28], ["Código de origem", "codigoOrigem", 14], ["Descrição de origem", "descricaoOrigem", 44], ["Unidade", "unidadeOrigem", 10], ["Saldo de origem", "saldoOrigem", 14], ["Ação", "acao", 26], ["Código mantido", "codigoDestino", 14], ["Descrição do mantido", "descricaoDestino", 44], ["Saldo do mantido", "saldoDestino", 14], ["Indicação", "nivel", 16], ["Pontuação de similaridade", "similaridade", 14], ["Motivos", "motivos", 50], ["Decisão", "decisao", 22], ["Aprovador", "aprovador", 24], ["Data", "data", 12]], fonte: "desduplicacoes" },
  analises: { nome: "Análises", colunas: [["Critério", "criterio", 26], ["Grupo", "grupo", 28], ["Código", "codigo", 14], ["Descrição", "descricao", 44], ["Achado", "achado", 60], ["Proposta", "proposta", 44], ["Decisão", "decisao", 24], ["Aprovador", "aprovador", 24], ["Data", "data", 12]], fonte: "analises" },
  inativados: { nome: "Inativados por data de uso", colunas: [["Código", "codigo", 14], ["Descrição", "descricao", 46], ["Unidade", "unidade", 12], ["Grupo", "grupo", 30], ["Última movimentação", "ultima_mov", 16], ["Critério de corte", "criterio", 50]], fonte: "inativados" },
  execucao: { nome: "Execução", colunas: COLUNAS_EXECUCAO, fonte: "execucao" },
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

/** Gera e baixa o XLSX com as abas pedidas. A biblioteca é carregada só nesta hora (não pesa no resto do sistema). */
export async function gerarXlsx(listas, ids, nomeArquivo) {
  const ExcelJS = await carregarExcelJS();
  baixarXlsx(await criarWorkbook(ExcelJS, listas, ids).xlsx.writeBuffer(), nomeArquivo);
}

/** Planilha das sugestões de descrição para o cliente: ele responde OK ou escreve ao lado como deve ficar. */
export async function gerarListaCliente(linhas, nomeArquivo) {
  const ExcelJS = await carregarExcelJS();
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Sugestões de descrição");
  ws.columns = COLUNAS_LISTA.map((h, i) => ({ header: h, key: "c" + i, width: [14, 46, 46, 22, 46, 28][i] }));
  ws.addRows(linhas);
  ws.getRow(1).font = { bold: true }; ws.getRow(1).alignment = { wrapText: true, vertical: "top" }; ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS_LISTA.length } };
  const instr = wb.addWorksheet("Como responder");
  instr.columns = [{ width: 110 }];
  ["Para cada linha: se concordar com a descrição sugerida, escreva OK na coluna de resposta.", "Se não concordar, escreva na coluna 'Como deve ficar' a descrição que deseja. Não precisa preencher a resposta.", "Se quiser manter a descrição atual, escreva NÃO.", "Linhas sem resposta continuam aguardando. Não altere a coluna Código.", "Nenhuma alteração é feita no cadastro por esta planilha: ela só registra a decisão."].forEach((t) => instr.addRow([t]));
  baixarXlsx(await wb.xlsx.writeBuffer(), nomeArquivo);
}

/** Planilha de uma frente (administrativo ou almoxarifado): as tarefas a executar, com as colunas de resposta em branco e a aba de instruções. */
export async function gerarListaFrente(frente, linhas, nomeArquivo) {
  const ExcelJS = await carregarExcelJS();
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(`Tarefas - ${FRENTES[frente]}`.slice(0, 31));
  ws.columns = COLUNAS_FRENTE[frente].map((h, i) => ({ header: h, key: "c" + i, width: LARGURAS_FRENTE[frente][i] }));
  ws.addRows(linhas);
  ws.getRow(1).font = { bold: true }; ws.getRow(1).alignment = { wrapText: true, vertical: "top" }; ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.getColumn(7).alignment = { wrapText: true, vertical: "top" }; // "O que fazer"
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS_FRENTE[frente].length } };
  const instr = wb.addWorksheet("Como responder");
  instr.columns = [{ width: 110 }];
  [
    "Para cada linha: escreva FEITO quando a tarefa estiver concluída e informe a evidência (número do documento no SAP, foto, etiqueta ou link).",
    "Se não foi possível concluir, escreva DIVERGÊNCIA e explique na observação.",
    "FEITO sem evidência não conta como concluído: a tarefa continua pendente.",
    ...(frente === "alm" ? ["Almoxarifado: informe também o endereço de origem, o endereço de destino e a quantidade realocada."] : []),
    "Não altere a coluna ID da tarefa. Linhas sem resposta continuam pendentes.",
    "Nenhuma alteração é feita no SAP nem no físico por esta planilha: ela só registra a confirmação.",
  ].forEach((t) => instr.addRow([t]));
  baixarXlsx(await wb.xlsx.writeBuffer(), nomeArquivo);
}
