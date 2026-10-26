// Execução (passo 5): as decisões aprovadas viram tarefas para o administrativo (SAP) e, quando há movimento físico, para o almoxarifado
// (realocações físicas). A tarefa só conta como concluída quando todas as frentes aplicáveis confirmam COM evidência; sem prova, continua
// pendente. Nada é gravado no SAP nem no físico por esta ferramenta: ela emite as listas, recebe as confirmações e registra as divergências.
// Funções puras (sem React); a geração do XLSX fica em listasFinais.js.
import { CRITERIOS, dataBr, dataDoCorte, grupoDe } from "./logica";
import { fatorDaDecisao, numeroBr } from "./unidades";
import { chaveTexto, lerMatriz } from "./respostaCliente";
import { chaveDe, idItem, indexar, itemPorId, partirChave } from "./identidade";
import { coerenciaDaDecisao } from "./aprovacao";
import { inativacoesAprovadas } from "./inativacao";

export const FRENTES = { adm: "Administrativo (SAP)", alm: "Almoxarifado (físico)" };

/** Tipos de tarefa. `almPadrao`: o almoxarifado participa por padrão (só existe frente física onde há o que fazer: `comoAlm`). */
export const TIPOS_TAREFA = {
  unificacao: { titulo: "Unificar códigos duplicados", almPadrao: true,
    comoAdm: "Transferir o saldo e o histórico para o código mantido, atualizar os vínculos (cartilhas, planos de manutenção, documentos abertos) e inativar o código de origem.",
    comoAlm: "Realocar o saldo físico do código de origem para o endereço do código mantido e trocar a identificação (etiqueta)." },
  descricao: { titulo: "Corrigir descrição", almPadrao: false,
    comoAdm: "Alterar a descrição no cadastro (a original fica registrada).", comoAlm: "Atualizar a etiqueta do endereço, se ela traz a descrição." },
  unidade: { titulo: "Ajustar unidade de estoque", almPadrao: true,
    comoAdm: "Passar a unidade de estoque para a proposta, cadastrar a unidade de compra com os itens por unidade de compra e converter o saldo. Se o SAP não permitir a troca (item com movimentação), tratar como de/para ou novo cadastro, conforme o piloto.",
    comoAlm: "Recontar o saldo físico na nova unidade e trocar a identificação do endereço." },
  grafia: { titulo: "Padronizar a grafia da unidade", almPadrao: false, comoAdm: "Trocar a grafia da unidade no cadastro.", comoAlm: "" },
  inativacao: { titulo: "Inativar item aprovado por data de uso", almPadrao: false,
    comoAdm: "Inativar o item no cadastro, conforme a aprovação registrada (lote com lista fechada ou decisão individual).", comoAlm: "Segregar e identificar o saldo físico, se houver." },
  outro: { titulo: "Tratar conforme o critério", almPadrao: false, comoAdm: "Tratar o item conforme o critério aprovado no passo De/para.", comoAlm: "" },
};
export const ORDEM_TIPOS = Object.keys(TIPOS_TAREFA);

/** Configuração efetiva de cada tipo: `incluir` (padrão sim) e se o almoxarifado participa (padrão do tipo; sem receita física, nunca). */
export function tiposEfetivos(tipos) {
  return Object.fromEntries(ORDEM_TIPOS.map((t) => {
    const base = TIPOS_TAREFA[t]; const cfg = tipos?.[t] || {};
    return [t, { incluir: cfg.incluir !== false, alm: !!base.comoAlm && (cfg.alm ?? base.almPadrao) }];
  }));
}

/** O que foi proposto e aprovado nos critérios sem receita própria (NCM e classe; grupo), em uma frase. */
const propostaTxt = (p) => {
  if (!p) return ""; const partes = [];
  if (p.ncm) partes.push(`NCM ${p.ncm}`); if (p.cClassTrib) partes.push(`cClassTrib ${p.cClassTrib}`); if (p.grupo) partes.push(`grupo "${p.grupo}"`);
  return partes.length ? ` Proposta aprovada: ${partes.join("; ")}.` : "";
};

// O que fazer em cada frente, com os dados do item.
const INSTRUCAO = {
  unificacao: (t) => ({
    adm: `Unificar no código ${t.dados.destinoCodigo || "mantido"}${t.dados.destinoDescricao ? ` (${t.dados.destinoDescricao})` : ""}: transferir saldo e histórico, atualizar os vínculos (cartilhas, planos de manutenção, documentos abertos) e inativar o código de origem ${t.codigo}.${t.dados.observacao?.length ? ` A variante do código de origem é observação, não produto: registrar no campo adicional do código mantido: ${t.dados.observacao.join(", ")}.` : ""}`,
    alm: `Realocar o saldo físico do código ${t.codigo} para o endereço do código ${t.dados.destinoCodigo || "mantido"} e trocar a identificação (etiqueta).` }),
  descricao: (t) => ({ adm: `Alterar a descrição para: ${t.dados.descricaoFinal}`, alm: `Atualizar a etiqueta do endereço, se ela traz a descrição: ${t.dados.descricaoFinal}` }),
  unidade: (t) => ({
    adm: `Unidade de estoque: ${t.dados.unidadeDe} → ${t.dados.unidadePara}. Unidade de compra: ${t.dados.unidadeDe}; itens por unidade de compra: ${t.dados.itensPorCompra != null ? numeroBr(t.dados.itensPorCompra) : "a informar"}. Se o SAP não permitir a troca (item com movimentação), tratar como de/para ou novo cadastro, conforme o piloto.`,
    alm: `Recontar o saldo físico em ${t.dados.unidadePara} e trocar a identificação do endereço.` }),
  grafia: (t) => ({ adm: `Trocar a grafia da unidade: ${t.dados.unidadeDe} → ${t.dados.unidadePara}.`, alm: "" }),
  inativacao: (t) => ({ adm: `Inativar o item (${t.dados.corte}). Aprovação: ${t.dados.aprovacao}.`, alm: TIPOS_TAREFA.inativacao.comoAlm }),
  outro: (t) => ({ adm: `Tratar conforme o critério "${t.dados.criterio}" (aprovado no passo De/para).${propostaTxt(t.dados.proposto)}`, alm: "" }),
};

const comparavel = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * O que a tarefa manda fazer, em uma linha comparável: a confirmação das equipes (feito, evidência, divergência) vale só para essa alteração. Se a decisão for descartada e
 * outra alteração for aprovada para o mesmo item e critério, a confirmação da anterior NÃO passa para a nova (o id da tarefa é o mesmo; a alteração, não).
 */
export function alteracaoDaTarefa(tipo, dados) {
  switch (tipo) {
    case "unificacao": return `unificar:${dados.destinoCodigo}`;
    case "descricao": return `descricao:${dados.descricaoFinal}`;
    case "unidade": return `unidade:${dados.unidadeDe}>${dados.unidadePara}:${dados.itensPorCompra ?? ""}`;
    case "grafia": return `grafia:${dados.unidadeDe}>${dados.unidadePara}`;
    case "inativacao": return "inativar"; // a alteração é inativar o item; a aprovação (lote ou individual) pode ser refeita sem perder a confirmação do que já foi executado
    default: return `outro:${dados.criterio}:${dados.proposto ? JSON.stringify(dados.proposto) : ""}`;
  }
}

/** O tipo e os dados da tarefa que nasce de uma decisão aprovada, ou null quando não há nada a executar (código mantido, cadastro que já está como o aprovado). */
export function tarefaDaDecisao(crit, d, it, indice) {
  const tituloCriterio = (id) => CRITERIOS.find((c) => c.id === id)?.titulo ?? id;
  if (crit === "duplicidade") {
    const destinoId = d.destino ?? (it.duplicidade?.mestre != null ? idItem(indice.porLinha.get(it.duplicidade.mestre)) : null);
    if (!destinoId || destinoId === idItem(it)) return null; // código mantido: nada a unificar
    const dest = itemPorId(indice, destinoId);
    const observacao = d.observacao ?? it.duplicidade?.observacao?.palavras ?? []; // a variante (cor, tipo, apresentação) do item que sai é observação: vai para o campo adicional do mantido
    return { tipo: "unificacao", dados: { destinoCodigo: destinoId, destinoDescricao: dest?.descricao ?? d.destinoAntes?.descricao ?? "", ...(observacao.length ? { observacao } : {}) } };
  }
  if (crit === "padrao") {
    const final = d.final || d.sugerida;
    if (!final || final === it.descricao) return null;
    return { tipo: "descricao", dados: { descricaoFinal: final } };
  }
  if (crit === "unidade" && d.para) {
    if (comparavel(it.unidade) === comparavel(d.para)) return null; // a unidade já é a aprovada
    const conversao = d.tipo === "conversao";
    return { tipo: conversao ? "unidade" : "grafia", dados: { unidadeDe: d.de || it.unidade, unidadePara: d.para, itensPorCompra: conversao ? fatorDaDecisao(d) : null } };
  }
  return { tipo: "outro", dados: { criterio: tituloCriterio(crit), proposto: d.proposto ?? null } };
}

/**
 * Tarefas de execução: uma por decisão APROVADA (ausência de resposta não é aprovação) e uma por inativação APROVADA (em lote, com lista fechada, ou individualmente): o corte
 * por data só seleciona candidatos e nunca gera tarefa sozinho.
 * Devolve { tarefas, geradasPorTipo }: `tarefas` já sem os tipos que o analista tirou da execução; `geradasPorTipo` conta tudo o que foi gerado.
 * O id da tarefa é a chave da decisão ("código|critério"); a inativação usa "código|inativacao". A tarefa nasce do que foi aprovado para o código do item: se o cadastro
 * dele mudou para outra coisa desde a aprovação, ela não cobre o que está lá e não gera tarefa; se o cadastro já está como o aprovado, não há o que executar; se o item não
 * está mais na base, a tarefa sai do que foi guardado na aprovação. Cada tarefa leva a `alteracao` aprovada: a confirmação só vale para ela.
 */
export function gerarTarefas({ decisoes, tipos, itens, escopo, params, inativacao }) {
  const cfg = tiposEfetivos(tipos);
  const indice = indexar(itens);
  const brutas = [];
  const nova = (tipo, id, it, grupo, dados) => brutas.push({ id, linha: it.linha ?? null, item: idItem(it), tipo, grupo: grupo || grupoDe(it), codigo: it.codigo, descricao: it.descricao, dados, alteracao: alteracaoDaTarefa(tipo, dados), ...(it.ausenteNaBase ? { ausenteNaBase: true } : {}) });
  for (const [k, d] of Object.entries(decisoes || {})) {
    if (d?.status !== "APR") continue;
    const { id, crit } = partirChave(k);
    if (!id || indice.repetidos.has(id)) continue; // sem código, ou código repetido na base: não dá para saber de qual item é a decisão
    let it = indice.porId.get(id);
    if (it) { const coer = coerenciaDaDecisao(d, crit, it, indice, decisoes); if (!coer.ok || coer.estado === "REFLETIDA") continue; }
    else if (d.antes) it = { codigo: id, descricao: d.antes.descricao ?? "", unidade: d.antes.unidade ?? "", grupo_atual: d.grupo, ausenteNaBase: true };
    else continue;
    const t = tarefaDaDecisao(crit, d, it, indice); if (t) nova(t.tipo, k, it, d.grupo, t.dados);
  }
  const corte = dataDoCorte(params);
  for (const a of inativacoesAprovadas(inativacao, escopo, indice)) {
    nova("inativacao", chaveDe(a.it, "inativacao"), a.it, null, {
      corte: a.it.ultima_mov ? `não movimentado desde ${corte}` : `sem data de movimentação, tratado como anterior a ${corte}`, ultimaMov: a.it.ultima_mov,
      aprovacao: a.via === "LOTE" ? `lista fechada do grupo ${a.grupo}, aprovada por ${a.por} em ${dataBr(a.em)}` : `decisão individual de ${a.por} em ${dataBr(a.em)}`,
    });
  }
  const geradasPorTipo = {};
  for (const t of brutas) geradasPorTipo[t.tipo] = (geradasPorTipo[t.tipo] || 0) + 1;
  const tarefas = brutas.filter((t) => cfg[t.tipo].incluir).map((t) => {
    const i = INSTRUCAO[t.tipo](t); const alm = cfg[t.tipo].alm;
    const aviso = t.ausenteNaBase ? " Atenção: o item não está na base atual; confirme no ERP antes de executar." : "";
    return { ...t, aplica: { adm: true, alm }, instrucao: { adm: i.adm + aviso, alm: alm ? i.alm : "" } };
  });
  tarefas.sort((a, b) => a.grupo.localeCompare(b.grupo, "pt-BR") || ORDEM_TIPOS.indexOf(a.tipo) - ORDEM_TIPOS.indexOf(b.tipo) || (a.linha ?? 1e12) - (b.linha ?? 1e12) || String(a.item).localeCompare(String(b.item)));
  return { tarefas, geradasPorTipo };
}

/**
 * A confirmação das equipes que vale para a alteração de HOJE da tarefa: o registro de uma frente carimbado com outra alteração (a decisão foi descartada e outra, aprovada)
 * é descartado da leitura. Registro sem carimbo (anterior a esta regra) vale como está.
 */
export function registroEfetivo(tarefa, registro) {
  if (!registro) return undefined; const alt = tarefa?.alteracao; if (!alt) return registro;
  const vale = (r) => (r && (!r.alteracao || r.alteracao === alt) ? r : undefined);
  const adm = vale(registro.adm); const alm = vale(registro.alm);
  return adm || alm ? { ...registro, adm, alm } : undefined;
}
/** Há confirmação guardada de OUTRA alteração (a anterior) numa frente da tarefa: é avisada na tela e nunca conta como feita. */
export const confirmacaoObsoleta = (tarefa, registro, frente) => { const r = registro?.[frente]; return !!(r && r.alteracao && tarefa?.alteracao && r.alteracao !== tarefa.alteracao); };

// ── Situação ──
export const ROT_SITUACAO_FRENTE = { NA: "Não se aplica", PENDENTE: "Pendente", SEM_EVIDENCIA: "Feito, sem evidência (pendente)", FEITO: "Confirmado", DIVERGENCIA: "Divergência" };
export const ROT_SITUACAO_GERAL = { CONCLUIDA: "Concluída", EM_ANDAMENTO: "Em andamento", PENDENTE: "Pendente", DIVERGENCIA: "Com divergência" };

/** Situação de uma frente: NA | PENDENTE | SEM_EVIDENCIA | FEITO | DIVERGENCIA. Feito sem evidência não conta: casos sem prova permanecem pendentes. */
export function situacaoFrente(aplica, reg) {
  if (!aplica) return "NA";
  if (reg?.status === "DIV") return "DIVERGENCIA";
  if (reg?.status === "FEITO") return String(reg.evidencia ?? "").trim() ? "FEITO" : "SEM_EVIDENCIA";
  return "PENDENTE";
}

/** Situação da tarefa: de cada frente e a geral (concluída só com todas as frentes aplicáveis confirmadas). */
export function situacaoTarefa(tarefa, registroBruto) {
  const registro = registroEfetivo(tarefa, registroBruto); // a confirmação de outra alteração não conta
  const adm = situacaoFrente(tarefa.aplica.adm, registro?.adm); const alm = situacaoFrente(tarefa.aplica.alm, registro?.alm);
  const aplicaveis = [adm, alm].filter((s) => s !== "NA");
  const geral = aplicaveis.includes("DIVERGENCIA") ? "DIVERGENCIA"
    : aplicaveis.every((s) => s === "FEITO") ? "CONCLUIDA"
      : aplicaveis.some((s) => s === "FEITO" || s === "SEM_EVIDENCIA") ? "EM_ANDAMENTO" : "PENDENTE";
  return { adm, alm, geral };
}

const zerado = () => ({ total: 0, CONCLUIDA: 0, EM_ANDAMENTO: 0, PENDENTE: 0, DIVERGENCIA: 0, semEvidencia: 0, adm: { total: 0, feitas: 0 }, alm: { total: 0, feitas: 0 } });
function somar(r, s) {
  r.total += 1; r[s.geral] += 1;
  for (const f of ["adm", "alm"]) { if (s[f] === "NA") continue; r[f].total += 1; if (s[f] === "FEITO") r[f].feitas += 1; if (s[f] === "SEM_EVIDENCIA") r.semEvidencia += 1; }
}

/** Totais gerais e por grupo (lote) e, dentro do lote, por tipo de tarefa. Os grupos seguem a ordem das tarefas. */
export function resumoExecucao(tarefas, registros) {
  const geral = zerado(); const grupos = new Map();
  for (const t of tarefas) {
    const s = situacaoTarefa(t, registros?.[t.id]);
    let g = grupos.get(t.grupo); if (!g) { g = { grupo: t.grupo, ...zerado(), tipos: new Map() }; grupos.set(t.grupo, g); }
    let tp = g.tipos.get(t.tipo); if (!tp) { tp = { tipo: t.tipo, ...zerado() }; g.tipos.set(t.tipo, tp); }
    somar(geral, s); somar(g, s); somar(tp, s);
  }
  return { ...geral, grupos: [...grupos.values()].map((g) => ({ ...g, tipos: [...g.tipos.values()] })) };
}

/** Situação de cada item (linha da base) para a lista final corrigida: a pior entre as tarefas dele. */
export function situacaoPorLinha(tarefas, registros) {
  const por = new Map();
  for (const t of tarefas) { if (t.linha == null) continue; const s = situacaoTarefa(t, registros?.[t.id]).geral; const l = por.get(t.linha) ?? []; l.push(s); por.set(t.linha, l); }
  const saida = new Map();
  for (const [linha, lista] of por) saida.set(linha, lista.includes("DIVERGENCIA") ? "DIVERGENCIA" : lista.every((s) => s === "CONCLUIDA") ? "CONCLUIDA" : lista.some((s) => s === "CONCLUIDA" || s === "EM_ANDAMENTO") ? "EM_ANDAMENTO" : "PENDENTE");
  return saida;
}

// ── Listas por frente (o que vai para o administrativo e para o almoxarifado) ──
const COLUNAS_BASE = ["ID da tarefa", "Frente", "Lote (grupo)", "Tarefa", "Código", "Descrição atual", "O que fazer"];
/** Última coluna da planilha: a alteração aprovada que a linha pede. A resposta só vale se ela ainda for a alteração aprovada da tarefa (a decisão pode ter mudado depois da emissão). */
export const COLUNA_ALTERACAO = "Alteração aprovada (não altere)";
export const COLUNAS_FRENTE = {
  adm: [...COLUNAS_BASE, "Resposta (FEITO ou DIVERGÊNCIA)", "Evidência (documento no SAP, foto ou link)", "Observação", COLUNA_ALTERACAO],
  alm: [...COLUNAS_BASE, "Endereço de origem", "Endereço de destino", "Quantidade realocada", "Resposta (FEITO ou DIVERGÊNCIA)", "Evidência (foto, etiqueta, documento ou link)", "Observação", COLUNA_ALTERACAO],
};
export const LARGURAS_FRENTE = { adm: [14, 22, 28, 28, 14, 44, 70, 18, 40, 36, 30], alm: [14, 22, 28, 28, 14, 44, 70, 18, 18, 14, 18, 40, 36, 30] };

/** Linhas da lista de uma frente: as tarefas aplicáveis a ela que ainda não estão confirmadas com evidência (inclui as com divergência, para nova resposta). */
export function linhasListaFrente(frente, tarefas, registros) {
  return tarefas.filter((t) => t.aplica[frente] && situacaoFrente(true, registroEfetivo(t, registros?.[t.id])?.[frente]) !== "FEITO").map((t) => {
    const base = [t.id, FRENTES[frente], t.grupo, TIPOS_TAREFA[t.tipo].titulo, t.codigo, t.descricao, t.instrucao[frente]];
    const resto = Array(COLUNAS_FRENTE[frente].length - base.length).fill(""); resto[resto.length - 1] = t.alteracao || "";
    return [...base, ...resto];
  });
}

export const COLUNAS_EXECUCAO = [
  ["Lote (grupo)", "grupo", 28], ["Tarefa", "tarefa", 28], ["Código", "codigo", 14], ["Descrição atual", "descricao", 44], ["O que fazer (administrativo)", "instrucaoAdm", 60],
  ["Administrativo", "adm", 24], ["Evidência do administrativo", "evidAdm", 36], ["Observação do administrativo", "obsAdm", 32], ["Confirmado por (administrativo)", "quemAdm", 30],
  ["Almoxarifado", "alm", 24], ["Endereço de origem", "origem", 18], ["Endereço de destino", "destino", 18], ["Quantidade realocada", "qtd", 14],
  ["Evidência do almoxarifado", "evidAlm", 36], ["Observação do almoxarifado", "obsAlm", 32], ["Confirmado por (almoxarifado)", "quemAlm", 30], ["Situação da tarefa", "situacao", 20],
];
const quando = (reg) => (reg?.por || reg?.em ? [reg.por, reg.em ? String(reg.em).split("-").reverse().join("/") : ""].filter(Boolean).join(" em ") : "");

/** Linhas da aba "Execução" das listas finais: todas as tarefas, com a situação de cada frente, a evidência e a divergência. */
export function linhasExecucao(tarefas, registros) {
  return tarefas.map((t) => {
    const r = registroEfetivo(t, registros?.[t.id]) || {}; const s = situacaoTarefa(t, registros?.[t.id]);
    return {
      grupo: t.grupo, tarefa: TIPOS_TAREFA[t.tipo].titulo, codigo: t.codigo, descricao: t.descricao, instrucaoAdm: t.instrucao.adm,
      adm: ROT_SITUACAO_FRENTE[s.adm], evidAdm: r.adm?.evidencia || "", obsAdm: r.adm?.obs || "", quemAdm: quando(r.adm),
      alm: ROT_SITUACAO_FRENTE[s.alm], origem: r.alm?.origem || "", destino: r.alm?.destino || "", qtd: r.alm?.qtd ?? "", evidAlm: r.alm?.evidencia || "", obsAlm: r.alm?.obs || "", quemAlm: quando(r.alm),
      situacao: ROT_SITUACAO_GERAL[s.geral],
    };
  });
}

// ── Resposta das equipes ──
const RE_FEITO = /^(feit|ok$|sim$|x$|conclu|realiz|execut|confirm)/; const RE_DIV = /^(diverg|nao|problema|pendencia|impediment)/;
/** "FEITO" (feito, ok, concluído, realizado...), "DIV" (divergência, não, problema...) ou null (sem resposta: continua pendente). */
export function interpretarRespostaExecucao(resposta) {
  const k = chaveTexto(resposta);
  return RE_FEITO.test(k) ? "FEITO" : RE_DIV.test(k) ? "DIV" : null;
}
const frenteDe = (txt) => { const k = chaveTexto(txt); return k.includes("almox") ? "alm" : k.includes("admin") ? "adm" : null; };

/** Acha as colunas da planilha devolvida, mesmo que a ordem ou o texto do título tenham mudado um pouco. */
export function mapearColunasExecucao(cabecalho) {
  const nomes = cabecalho.map(chaveTexto);
  const acha = (...ops) => nomes.findIndex((n) => ops.some((o) => n.includes(o)));
  const id = acha("iddatarefa", "idtarefa"); const resposta = acha("resposta");
  return { id, resposta, frente: acha("frente"), evidencia: acha("evidencia"), obs: acha("observacao"), origem: acha("enderecodeorigem"), destino: acha("enderecodedestino"), qtd: acha("quantidaderealocada", "quantidade"), alteracao: acha("alteracaoaprovada"), ok: id >= 0 && resposta >= 0 };
}

/** Lê a planilha devolvida (xlsx ou csv) e devolve [{ id, frente, resposta, evidencia, obs, origem, destino, qtd, alteracao }]. */
export async function lerRespostaExecucao(file) {
  const matriz = await lerMatriz(file);
  if (!matriz.length) throw new Error("A planilha está vazia.");
  const c = mapearColunasExecucao(matriz[0].map(String));
  if (!c.ok) throw new Error('Não encontrei as colunas "ID da tarefa" e "Resposta" na primeira linha. Use a planilha emitida pelo sistema.');
  const padrao = c.origem >= 0 ? "alm" : "adm"; // sem coluna de frente, a lista do almoxarifado é a que tem endereços
  const col = (r, i) => (i >= 0 ? r[i] : "");
  return matriz.slice(1).map((r) => ({
    id: col(r, c.id), frente: frenteDe(col(r, c.frente)) ?? padrao, resposta: col(r, c.resposta), evidencia: col(r, c.evidencia), obs: col(r, c.obs),
    origem: col(r, c.origem), destino: col(r, c.destino), qtd: col(r, c.qtd), alteracao: String(col(r, c.alteracao) ?? "").trim(),
  }));
}

/**
 * Aplica as respostas sobre os registros de execução. Resposta em branco continua pendente; FEITO sem evidência é registrado mas não conta;
 * linha de uma frente que não se aplica à tarefa, ou de tarefa que não existe mais, é avisada e ignorada. A linha traz a alteração aprovada para a qual foi emitida: se a decisão
 * mudou depois (outro texto, outro código que fica, outro fator), a resposta é da alteração antiga e NÃO vale para a nova (vai para `desatualizadas`). Planilha sem essa coluna
 * (emitida antes desta regra) segue como antes.
 */
export function aplicarRespostaExecucao(registros, tarefas, linhas, { quem, hoje }) {
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const novos = { ...registros };
  const resumo = { feitas: 0, divergencias: 0, semResposta: 0, semEvidencia: 0, naoEncontradas: [], naoAplicaveis: 0, desatualizadas: [] };
  for (const l of linhas) {
    const id = String(l.id ?? "").trim(); if (!id) continue;
    const t = porId.get(id); if (!t) { resumo.naoEncontradas.push(id); continue; }
    if (!t.aplica[l.frente]) { resumo.naoAplicaveis += 1; continue; }
    const status = interpretarRespostaExecucao(l.resposta); if (!status) { resumo.semResposta += 1; continue; }
    const daLinha = String(l.alteracao ?? "").trim(); if (daLinha && t.alteracao && daLinha !== t.alteracao) { resumo.desatualizadas.push(id); continue; }
    const evidencia = String(l.evidencia ?? "").trim();
    const reg = { status, por: `planilha (${FRENTES[l.frente]})`, em: hoje, registradoPor: quem, via: "planilha", evidencia, obs: String(l.obs ?? "").trim(), ...(t.alteracao ? { alteracao: t.alteracao } : {}) };
    if (l.frente === "alm") {
      for (const [k, v] of [["origem", l.origem], ["destino", l.destino], ["qtd", l.qtd]]) { const x = String(v ?? "").trim(); if (x) reg[k] = x; }
    }
    novos[id] = { ...(novos[id] || {}), [l.frente]: reg };
    if (status === "DIV") resumo.divergencias += 1; else { resumo.feitas += 1; if (!evidencia) resumo.semEvidencia += 1; }
  }
  return { registros: novos, resumo };
}
