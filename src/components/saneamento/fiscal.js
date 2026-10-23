// Revisão fiscal do grupo saneado (passo 8): lê o que a validação da base já trouxe de cada item (NCM, cClassTrib informado e a sugestão pelos anexos da LC 214),
// separa o que está certo do que pede decisão e monta a matriz do grupo (proposta, fundamento, validação e pendências). Só SUGERE: nada é alterado no cadastro nem
// no ERP, e a sugestão é leitura dos anexos consultados, não parecer: onde o enquadramento depende dos requisitos do produto, o item vai para revisão. Funções puras.
import { dataBr, grupoDe } from "./logica";

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soDigitos = (s) => String(s ?? "").replace(/\D/g, "");
const pct = (v) => `${Math.round(Number(v || 0) * 100)}%`;

/**
 * Situações fiscais, da mais grave à mais tranquila. `decide` = o item precisa de uma decisão do analista antes de o grupo ser concluído.
 * `tom` pinta o selo (r vermelho, a âmbar, b azul, g verde, n neutro).
 */
export const SITUACOES = {
  NCM: { rotulo: "NCM a corrigir", tom: "r", decide: true, acoes: ["NCM", "REVISAR"] },
  BENEFICIO: { rotulo: "Possível benefício não aproveitado", tom: "r", decide: true, acoes: ["ACEITAR", "MANTER", "REVISAR"] },
  REDUCAO_MAIOR: { rotulo: "Redução informada maior que a esperada", tom: "a", decide: true, acoes: ["ACEITAR", "MANTER", "REVISAR"] },
  SEM_AMPARO: { rotulo: "Redução sem amparo nos anexos consultados", tom: "a", decide: true, acoes: ["ACEITAR", "MANTER", "REVISAR"] },
  DIVERGENTE: { rotulo: "Classe diferente da esperada (mesma redução)", tom: "b", decide: true, acoes: ["ACEITAR", "MANTER", "REVISAR"] },
  SEM_CLASSE: { rotulo: "Sem cClassTrib informado (há sugestão)", tom: "b", decide: true, acoes: ["ACEITAR", "REVISAR"] },
  REFERENCIA: { rotulo: "Anexo cita o capítulo ou a posição: revisar os requisitos do item", tom: "a", decide: true, acoes: ["MANTER", "REVISAR"] },
  AMBIGUO: { rotulo: "NCM com tratamentos diferentes: escolher conforme o produto", tom: "a", decide: true, acoes: ["ACEITAR", "MANTER", "REVISAR"] },
  SERVICO: { rotulo: "Parece serviço: classificar por NBS e LC 116", tom: "a", decide: true, acoes: ["REVISAR"] },
  PADRAO: { rotulo: "Sem enquadramento nos anexos consultados (tributação padrão)", tom: "n", decide: false, acoes: [] },
  CONFERE: { rotulo: "Confere com o esperado", tom: "g", decide: false, acoes: [] },
  SEM_ANALISE: { rotulo: "Sem análise de cClassTrib nesta base", tom: "n", decide: false, acoes: [] },
};
export const ORDEM_SITUACOES = Object.keys(SITUACOES);

export const ACOES = {
  ACEITAR: "Adotar a classe sugerida",
  MANTER: "Manter a classe informada (com fundamento)",
  REVISAR: "Revisar com especialista",
  NCM: "Informar o NCM correto",
};
/** Ações que só valem com uma justificativa escrita (o sistema não conclui sozinho que a classe informada tem amparo). */
const EXIGE_FUNDAMENTO = { MANTER: ["REDUCAO_MAIOR", "SEM_AMPARO", "BENEFICIO", "REFERENCIA", "AMBIGUO", "DIVERGENTE"] };

const NCM_ERRO = ["NCM_AUSENTE", "NCM_FORMATO", "NCM_CHAVE_SAP", "NCM_INEXISTENTE", "NCM_INATIVO"];
const temProblema = (it, ...codigos) => !!it.problemas?.some((p) => codigos.includes(p.codigo));
const mensagemDe = (it, ...codigos) => (it.problemas || []).filter((p) => codigos.includes(p.codigo)).map((p) => p.mensagem).join(" | ");

/** Item que parece serviço (descrição ou unidade): a classificação é por NBS e LC 116, fora dos anexos de produtos. */
export const pareceServico = (it) => /^\s*(servicos?|mao[\s-]+de[\s-]+obra)\b/.test(semAcento(it.descricao)) || ["sv", "servico", "servicos"].includes(semAcento(it.unidade).replace(/[^a-z]/g, ""));

/** Catálogo de classes (várias versões por classe): vale a vigente (status Ativo); sem ela, a de vigência mais recente. */
export function mapaClasses(linhas) {
  const m = new Map();
  for (const r of linhas || []) {
    const k = String(r.c_class_trib ?? "").trim(); if (!k) continue;
    const a = m.get(k); const ativo = r.status === "Ativo";
    if (!a || (ativo && a.status !== "Ativo") || (ativo === (a.status === "Ativo") && String(r.vigencia_inicio || "") > String(a.vigencia_inicio || ""))) m.set(k, r);
  }
  return m;
}

/** A situação fiscal do item, na ordem de gravidade. */
export function situacaoFiscal(it) {
  if (pareceServico(it)) return "SERVICO";
  if (temProblema(it, ...NCM_ERRO) || soDigitos(it.ncm).length !== 8) return "NCM";
  const s = it.sugestao;
  if (!s) return "SEM_ANALISE";
  if (temProblema(it, "BENEFICIO_POSSIVELMENTE_PERDIDO")) return "BENEFICIO";
  if (temProblema(it, "REDUCAO_MAIOR_QUE_ESPERADO")) return "REDUCAO_MAIOR";
  if (temProblema(it, "SEM_AMPARO_NO_ANEXO")) return "SEM_AMPARO";
  if (temProblema(it, "CLASSE_DIVERGENTE")) return "DIVERGENTE";
  if (s.referencia) return "REFERENCIA";
  if (s.ambiguo) return "AMBIGUO";
  if (s.padrao) return "PADRAO";
  if (s.c_class_trib && !String(it.c_class_trib_informado ?? "").trim()) return "SEM_CLASSE";
  return "CONFERE";
}

/** Texto do que fazer em cada situação (proposta), sem concluir o que depende do produto. */
function propostaDe(sit, l) {
  switch (sit) {
    case "NCM": return "Corrigir o NCM (8 dígitos vigentes na tabela oficial) e refazer a análise";
    case "BENEFICIO": return `Adotar a classe ${l.sugerida}${l.reducao ? ` (redução de ${l.reducao})` : ""} ou fundamentar a classe informada`;
    case "REDUCAO_MAIOR": return `Conferir o amparo da redução informada; o esperado para o NCM é ${l.sugerida || "outra classe"}`;
    case "SEM_AMPARO": return "Confirmar a base legal da redução informada (pode haver outra base além dos anexos consultados)";
    case "DIVERGENTE": return `Conferir o enquadramento; esperado ${l.sugerida}`;
    case "SEM_CLASSE": return `Informar a classe ${l.sugerida}${l.reducao ? ` (redução de ${l.reducao})` : ""}`;
    case "REFERENCIA": return "Ler o item do anexo e decidir conforme os requisitos do produto";
    case "AMBIGUO": return "Escolher a classe conforme o produto entre as possíveis do NCM";
    case "SERVICO": return "Classificar por NBS e LC 116 na ferramenta de classificação de serviços";
    case "PADRAO": return "Manter a tributação padrão, salvo outra base legal";
    case "CONFERE": return "Nada a fazer";
    default: return "Rodar a análise de cClassTrib na importação da base";
  }
}

/** Leitura fiscal de um item: o que está informado, o que os anexos sugerem, o fundamento e a proposta. `classes` vem de mapaClasses(). */
export function leituraFiscal(it, classes = new Map()) {
  const sit = situacaoFiscal(it); const s = it.sugestao || null;
  const informada = String(it.c_class_trib_informado ?? "").trim(); const sugerida = s?.c_class_trib || "";
  const infoSug = sugerida ? classes.get(sugerida) : null; const infoInf = informada ? classes.get(informada) : null;
  const fundamento = s?.anexo ? `${s.anexo} da LC 214/2025` : s?.padrao ? "sem enquadramento nos anexos consultados da LC 214/2025 (não indica, por si só, ausência de benefício por outra base legal)" : "";
  const l = {
    linha: it.linha, codigo: it.codigo || "", descricao: it.descricao || "", unidade: it.unidade || "", grupo: grupoDe(it),
    ncmOriginal: it.ncm_original || "", ncm: it.ncm || "", ncmCorrigido: soDigitos(it.ncm).length === 8 && soDigitos(it.ncm) !== soDigitos(it.ncm_original),
    informada, sugerida, reducao: sugerida && s ? pct(s.reducao) : "", confianca: sugerida || s?.referencia ? s?.confianca || "" : "", fundamento,
    cstSugerida: infoSug?.cst || "", cstInformada: infoInf?.cst || "", descricaoClasse: infoSug?.descricao_oficial || s?.descricao || "",
    reducaoIbs: infoSug ? pct(infoSug.pct_reducao_ibs) : "", reducaoCbs: infoSug ? pct(infoSug.pct_reducao_cbs) : "",
    situacao: sit,
    mensagem: mensagemDe(it, ...NCM_ERRO, "BENEFICIO_POSSIVELMENTE_PERDIDO", "REDUCAO_MAIOR_QUE_ESPERADO", "SEM_AMPARO_NO_ANEXO", "CLASSE_DIVERGENTE", "REFERENCIA_ANEXO", "AMBIGUO_REVISAR"),
  };
  l.proposta = propostaDe(sit, l);
  return l;
}

/** A decisão é válida para a situação? MANTER em casos de alerta exige o fundamento escrito; NCM exige 8 dígitos; ACEITAR exige classe sugerida. */
export function decisaoValida(sit, leitura, d) {
  if (!d || !SITUACOES[sit]?.acoes.includes(d.acao)) return false;
  if (d.acao === "NCM") return soDigitos(d.ncm).length === 8;
  if (d.acao === "ACEITAR") return !!leitura.sugerida;
  if (d.acao === "MANTER") return !EXIGE_FUNDAMENTO.MANTER.includes(sit) || String(d.obs ?? "").trim().length >= 5;
  return true;
}

/** Classe e NCM que valem para o item depois da decisão (vazio quando ainda não há como afirmar). */
export function resultadoFiscal(l, d) {
  const sit = l.situacao; const decide = SITUACOES[sit].decide;
  if (!decide) return { classe: l.informada || l.sugerida, ncm: l.ncm, validacao: sit === "SEM_ANALISE" ? "Sem análise de cClassTrib" : sit === "PADRAO" ? "Tributação padrão (sem enquadramento nos anexos consultados)" : "Confere" };
  if (!decisaoValida(sit, l, d)) return { classe: "", ncm: l.ncm, validacao: d ? "Decisão incompleta" : "Pendente de decisão" };
  if (d.acao === "REVISAR") return { classe: "", ncm: l.ncm, validacao: "A revisar com especialista" };
  if (d.acao === "NCM") return { classe: l.informada || "", ncm: soDigitos(d.ncm), validacao: "NCM informado pelo analista (validar ao refazer a análise)" };
  return { classe: d.acao === "ACEITAR" ? l.sugerida : l.informada, ncm: l.ncm, validacao: `Decidido pelo analista: ${d.acao === "ACEITAR" ? "classe sugerida adotada" : "classe informada mantida"}` };
}

/**
 * Itens do grupo que entram na revisão fiscal: os em escopo do grupo que não saem por unificação aprovada (o item que será unificado em outro não precisa
 * de classificação própria). `saem` é o conjunto das linhas que saem.
 */
export const itensDoGrupoFiscal = (emEscopo, grupo, saem) => emEscopo.filter((it) => grupoDe(it) === grupo && !(saem && saem.has(it.linha)));

/** Totais do grupo a partir das leituras já feitas: itens por situação, pendências (a decidir + decisões incompletas), a revisar com especialista e decididos. */
export function resumoDeLeituras(leituras, decisoes) {
  const porSit = Object.fromEntries(ORDEM_SITUACOES.map((s) => [s, 0]));
  let pendentes = 0; let revisar = 0; let decididos = 0;
  for (const l of leituras) {
    porSit[l.situacao] += 1;
    if (!SITUACOES[l.situacao].decide) continue;
    const d = decisoes?.[l.linha];
    if (!decisaoValida(l.situacao, l, d)) pendentes += 1; else if (d.acao === "REVISAR") revisar += 1; else decididos += 1;
  }
  return { total: leituras.length, porSit, pendentes, revisar, decididos, precisaDecidir: ORDEM_SITUACOES.filter((s) => SITUACOES[s].decide).reduce((a, s) => a + porSit[s], 0) };
}
export const resumoFiscal = (itens, classes, decisoes) => resumoDeLeituras(itens.map((it) => leituraFiscal(it, classes)), decisoes);

/** O grupo pode ser concluído sem nenhum item aguardando decisão (os "a revisar com especialista" ficam como pendência registrada). */
export const podeConcluir = (resumo) => resumo.total > 0 && resumo.pendentes === 0;

/** Colunas da matriz fiscal (planilha): [título, chave, largura]. */
export const COLUNAS_MATRIZ = [
  ["Grupo", "grupo", 28], ["Código", "codigo", 14], ["Descrição", "descricao", 46], ["Unidade", "unidade", 10], ["NCM informado", "ncmOriginal", 14], ["NCM (corrigido/validado)", "ncmFinal", 16],
  ["cClassTrib informado", "informada", 14], ["CST (informado)", "cstInformada", 11], ["cClassTrib sugerido (anexos LC 214)", "sugerida", 16], ["CST (sugerido)", "cstSugerida", 11], ["Descrição da classe sugerida", "descricaoClasse", 40],
  ["Redução IBS", "reducaoIbs", 10], ["Redução CBS", "reducaoCbs", 10], ["Confiança", "confianca", 30], ["Fundamento", "fundamento", 40], ["Situação", "rotuloSituacao", 36], ["Proposta", "proposta", 50],
  ["Decisão do analista", "decisao", 28], ["Classe que vale", "classeFinal", 14], ["Fundamento do analista", "obs", 40], ["Validação", "validacao", 36], ["Revisor", "por", 24], ["Data", "em", 12], ["Linha da planilha", "linha", 10],
];

/** Linhas da matriz fiscal de um conjunto de itens (todas as situações), na ordem de gravidade e depois pela linha da planilha. */
export function linhasMatriz(itens, classes, decisoes) {
  const linhas = itens.map((it) => {
    const l = leituraFiscal(it, classes); const d = decisoes?.[it.linha]; const r = resultadoFiscal(l, d);
    return { ...l, ncmFinal: r.ncm, rotuloSituacao: SITUACOES[l.situacao].rotulo, decisao: d && SITUACOES[l.situacao].decide ? ACOES[d.acao] || "" : "", classeFinal: r.classe, obs: d?.obs || "", validacao: r.validacao, por: d?.por || "", em: d?.em ? dataBr(d.em) : "" };
  });
  return linhas.sort((a, b) => ORDEM_SITUACOES.indexOf(a.situacao) - ORDEM_SITUACOES.indexOf(b.situacao) || a.grupo.localeCompare(b.grupo, "pt-BR") || a.linha - b.linha);
}
