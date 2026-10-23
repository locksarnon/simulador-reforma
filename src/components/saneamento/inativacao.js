// Inativação por data de uso. O corte por data SELECIONA candidatos para avaliação: não autoriza inativar nada. A inativação só nasce de uma aprovação expressa:
//  (1) em lote, por grupo de itens, com uma LISTA FECHADA de códigos, a base e a data analisadas, as verificações feitas, o aprovador e a justificativa; ou
//  (2) item a item (decisão individual), onde ficam os itens com saldo, documento aberto ou dependência ainda não esclarecida.
// A aprovação em lote cobre só os itens da lista aprovada: item novo (outra extração, outro corte) não é coberto e pede nova aprovação; o item retirado da lista não volta a
// ser coberto ao ser devolvido (a lista fechada só cresce com nova aprovação). A decisão individual vale para o item como estava (saldo e última movimentação): se mudou, a
// decisão pede nova avaliação. Tudo o que é retirado, devolvido, substituído ou revogado fica no histórico. Nada é gravado no ERP: a ferramenta só registra a aprovação e gera a
// tarefa de execução, que as equipes confirmam com evidência. Funções puras.
import { grupoDe } from "./logica";
import { idItem, origemCompleta, textoOrigem } from "./identidade";

export const MIN_NOTA = 5; export const MIN_JUSTIFICATIVA = 10;

/** Verificações exigidas para aprovar um lote: a movimentação é conferida na própria base (se algum item da lista não tem data, o analista atesta); as demais o analista atesta, com a nota do que conferiu e onde. */
export const VERIFICACOES = [
  { id: "movimentacao", titulo: "Última movimentação conferida na base analisada", auto: true },
  { id: "saldo", titulo: "Saldo em estoque conferido" },
  { id: "documentos", titulo: "Documentos abertos conferidos (pedidos, notas e ordens)" },
  { id: "dependencias", titulo: "Vínculos conferidos (cartilhas, planos de manutenção e estruturas)" },
];
export const MOTIVOS_EXCECAO = { DOCUMENTO: "Documento aberto", DEPENDENCIA: "Dependência não esclarecida (cartilha, plano de manutenção, estrutura)", OUTRO: "Outro motivo" };
export const ROT_SITUACAO = {
  LOTE: "Aprovado em lote", INATIVAR: "Decisão individual: inativar", MANTER: "Decisão individual: manter ativo",
  AGUARDA_LISTA: "Elegível: aguarda a aprovação da lista", SALDO: "Com saldo: decisão individual", EXCECAO: "Retirado da lista: decisão individual", SEM_IDENTIDADE: "Sem código que o identifique: não pode ser aprovado",
};

export const inativacaoVazia = () => ({ lotes: {}, individuais: {}, excecoes: {}, historico: [] });
const norm = (x) => ({ ...inativacaoVazia(), ...(x || {}), lotes: { ...(x?.lotes || {}) }, individuais: { ...(x?.individuais || {}) }, excecoes: { ...(x?.excecoes || {}) }, historico: [...(x?.historico || [])] });
const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
const temSaldoNaoZero = (it) => num(it.saldo) != null && num(it.saldo) !== 0;
const saldoLido = (it) => num(it.saldo) != null;

/** Como o item estava quando a decisão individual foi tomada: o saldo e a última movimentação (a justificativa fala do saldo que ele tinha). */
export const instantaneoInativacao = (it) => ({ saldo: num(it?.saldo), ultima_mov: String(it?.ultima_mov ?? "") });
/** A decisão individual foi tomada com o item de outro jeito (saldo ou última movimentação diferentes de hoje)? Então não vale: o item volta a aguardar decisão. */
export const individualDesatualizada = (ind, it) => !!ind?.antes && (ind.antes.saldo !== num(it?.saldo) || String(ind.antes.ultima_mov ?? "") !== String(it?.ultima_mov ?? ""));

/** A decisão individual de inativar só vale com a justificativa (para o item com saldo, ela diz como o saldo foi tratado). */
export const individualValida = (d) => !!d && (d.acao === "MANTER" || (d.acao === "INATIVAR" && String(d.justificativa ?? "").trim().length >= MIN_JUSTIFICATIVA));

/**
 * Candidatos à inativação (os que o corte deixou fora do escopo), agrupados pelo grupo de itens, cada um com a sua situação para entrar numa lista:
 * ELEGIVEL (pode entrar na lista fechada), SALDO (saldo diferente de zero: decisão individual), EXCECAO (o analista retirou da lista: documento aberto ou dependência),
 * SEM_IDENTIDADE (sem código, ou código repetido na base: não dá para aprovar nada sobre ele). `individual` é a decisão individual que ainda vale para o item de hoje;
 * `individualAntiga`, a que foi tomada com o item de outro jeito. Devolve { grupos: [{ grupo, candidatos, elegiveis, individuais, semIdentidade }], total }.
 */
export function candidatosDaInativacao(escopo, indice, inativacao) {
  const ina = norm(inativacao); const porGrupo = new Map();
  for (const it of escopo?.fora || []) {
    const id = idItem(it); const g = grupoDe(it);
    const situacao = !id || indice.repetidos.has(id) ? "SEM_IDENTIDADE" : ina.excecoes[id] ? "EXCECAO" : temSaldoNaoZero(it) ? "SALDO" : "ELEGIVEL";
    const ind = situacao === "SEM_IDENTIDADE" ? null : ina.individuais[id]; const antiga = !!ind && individualDesatualizada(ind, it);
    const a = porGrupo.get(g) || { grupo: g, candidatos: [] }; a.candidatos.push({ it, id, situacao, individual: ind && !antiga ? ind : null, individualAntiga: ind && antiga ? ind : null }); porGrupo.set(g, a);
  }
  const grupos = [...porGrupo.values()].map((g) => ({ ...g, elegiveis: g.candidatos.filter((c) => c.situacao === "ELEGIVEL" && !c.individual),
    individuais: g.candidatos.filter((c) => c.situacao === "SALDO" || c.situacao === "EXCECAO" || c.individual || c.individualAntiga), semIdentidade: g.candidatos.filter((c) => c.situacao === "SEM_IDENTIDADE") }))
    .sort((a, b) => b.candidatos.length - a.candidatos.length || a.grupo.localeCompare(b.grupo, "pt-BR"));
  return { grupos, total: grupos.reduce((n, g) => n + g.candidatos.length, 0) };
}

/** A situação de um candidato diante das aprovações: decisão individual (vale sobre tudo, enquanto o item estiver como na decisão), lote aprovado (só se ele estava na lista e continua elegível) ou ainda sem aprovação. */
export function situacaoDoCandidato(c, grupo, inativacao) {
  if (c.situacao === "SEM_IDENTIDADE") return "SEM_IDENTIDADE";
  const ind = c.individual;
  if (ind?.acao === "INATIVAR" && individualValida(ind)) return "INATIVAR"; // sem a justificativa escrita a decisão ainda não vale: o item segue aguardando
  if (ind?.acao === "MANTER") return "MANTER";
  if (c.situacao === "SALDO" || c.situacao === "EXCECAO") return c.situacao;
  const lote = inativacao?.lotes?.[grupo]; return lote && lote.itens.includes(c.id) ? "LOTE" : "AGUARDA_LISTA";
}

/** O que a lista fechada de um grupo cobre hoje, e o que mudou desde a aprovação: novos elegíveis (fora da aprovação) e itens da lista que não valem mais. */
export function coberturaDoLote(grupoCand, inativacao) {
  const lote = norm(inativacao).lotes[grupoCand.grupo]; if (!lote) return null;
  const naLista = new Set(lote.itens); const elegiveis = new Set(grupoCand.elegiveis.map((c) => c.id)); const candidatosHoje = new Map(grupoCand.candidatos.map((c) => [c.id, c]));
  const cobertos = grupoCand.elegiveis.filter((c) => naLista.has(c.id)).map((c) => c.id);
  const novos = grupoCand.elegiveis.filter((c) => !naLista.has(c.id)).map((c) => c.id);
  const motivo = (id) => { const c = candidatosHoje.get(id); return !c ? "não é mais candidato nesta base (movimentação mais recente, corte diferente ou fora da base)" : c.individual ? "tem decisão individual" : c.situacao === "SALDO" ? "passou a ter saldo" : c.situacao === "EXCECAO" ? "foi retirado da lista" : "não tem mais como ser identificado"; };
  const naoValemMais = lote.itens.filter((id) => !elegiveis.has(id)).map((id) => ({ id, motivo: motivo(id) }));
  return { lote, cobertos, novos, naoValemMais, completa: novos.length === 0 && naoValemMais.length === 0 };
}

/**
 * Os itens com a inativação aprovada, que viram tarefa de execução: [{ it, id, via: "LOTE" | "INDIVIDUAL", por, em, grupo, detalhe }]. Só os candidatos de hoje: o item que
 * deixou de ser candidato não é inativado por aprovação antiga.
 */
export function inativacoesAprovadas(inativacao, escopo, indice) {
  const ina = norm(inativacao); const saida = [];
  for (const g of candidatosDaInativacao(escopo, indice, ina).grupos) {
    for (const c of g.candidatos) {
      const s = situacaoDoCandidato(c, g.grupo, ina);
      if (s === "INATIVAR") { const d = c.individual; saida.push({ it: c.it, id: c.id, via: "INDIVIDUAL", por: d.por || "", em: d.em || "", grupo: g.grupo, detalhe: d.justificativa || "" }); }
      else if (s === "LOTE") { const l = ina.lotes[g.grupo]; saida.push({ it: c.it, id: c.id, via: "LOTE", por: l.por || "", em: l.em || "", grupo: g.grupo, detalhe: l.justificativa || "" }); }
    }
  }
  return saida;
}

/**
 * Confere se o lote pode ser aprovado e devolve { ok, faltas }. `dados`: { lista (códigos), justificativa, verificacoes, origem, extraidaEm, base, saldoLidoEmTodos, semDataNaLista }.
 * As verificações de documentos e de vínculos sempre pedem a atestação com a nota; a de saldo só quando algum item da lista não tem saldo lido na base; a de movimentação só
 * quando algum item da lista não tem data de movimentação na base (a ferramenta não tem o que conferir nele).
 */
export function validarAprovacaoLote({ lista = [], justificativa = "", verificacoes = {}, origem, extraidaEm = "", base, saldoLidoEmTodos = false, semDataNaLista = 0 } = {}) {
  const faltas = [];
  if (!lista.length) faltas.push("A lista está vazia: não há item elegível para aprovar.");
  if (!origemCompleta(origem)) faltas.push("Declare a origem dos dados (ERP, instância e empresa).");
  if (!base?.id) faltas.push("O projeto não tem base vinculada.");
  if (!extraidaEm) faltas.push("Informe a data da extração da base analisada.");
  const atesta = (id, titulo) => { const v = verificacoes[id]; if (!v?.feito || String(v.nota ?? "").trim().length < MIN_NOTA) faltas.push(`${titulo}: marque como feito e escreva o que foi conferido e onde (ao menos ${MIN_NOTA} caracteres).`); };
  if (semDataNaLista > 0) atesta("movimentacao", `Última movimentação (${semDataNaLista === 1 ? "1 item da lista não tem" : `${semDataNaLista} itens da lista não têm`} data na base)`);
  if (!saldoLidoEmTodos) atesta("saldo", "Saldo em estoque");
  atesta("documentos", "Documentos abertos"); atesta("dependencias", "Vínculos (cartilhas, planos de manutenção, estruturas)");
  if (String(justificativa).trim().length < MIN_JUSTIFICATIVA) faltas.push(`Escreva a justificativa da aprovação (ao menos ${MIN_JUSTIFICATIVA} caracteres).`);
  return { ok: faltas.length === 0, faltas };
}

/** O saldo foi lido na base para todos os itens da lista (então a verificação de saldo é automática)? */
export const saldoLidoEmTodos = (itensDaLista) => itensDaLista.length > 0 && itensDaLista.every(saldoLido);
/** Quantos itens da lista não têm data de última movimentação na base (a movimentação deles só o analista pode atestar). */
export const semDataNaLista = (itensDaLista) => itensDaLista.filter((it) => !it.ultima_mov).length;

/**
 * Aprova a lista fechada de um grupo: guarda os códigos, a base e a data analisadas, a origem, o corte, as verificações (a de movimentação e, se o saldo foi lido, a de saldo,
 * feitas pela ferramenta), o aprovador e a justificativa. Uma aprovação anterior do mesmo grupo vai para o histórico (a nova substitui, e a lista nova também é fechada).
 */
export function aprovarLote(inativacao, grupo, { lista, justificativa, verificacoes = {}, base, origem = "", extraidaEm, corte, semData, por, em, saldoLidoEmTodos: saldoAuto = false, semDataNaLista: semData0 = 0 }) {
  const ina = norm(inativacao);
  if (ina.lotes[grupo]) ina.historico.push({ tipo: "LOTE_SUBSTITUIDO", grupo, lote: ina.lotes[grupo], em, por, motivo: "nova aprovação do grupo" });
  const v = { ...verificacoes };
  v.movimentacao = semData0 > 0 ? { ...(verificacoes.movimentacao || {}), feito: true, por, em }
    : { feito: true, auto: true, por: "ferramenta", em, nota: `Última movimentação lida da base ${base?.arquivo || ""}${extraidaEm ? ` (extração de ${extraidaEm.split("-").reverse().join("/")})` : ""}.` };
  if (saldoAuto) v.saldo = { feito: true, auto: true, por: "ferramenta", em, nota: "Saldo lido da base para todos os itens da lista (nenhum com saldo diferente de zero)." };
  ina.lotes[grupo] = { grupo, por, em, justificativa: String(justificativa).trim(), base: { id: base?.id, arquivo: base?.arquivo || "" }, origem: typeof origem === "string" ? origem : textoOrigem(origem), extraidaEm, corte, semData, verificacoes: v, itens: [...new Set(lista)] };
  return ina;
}

/** Revoga a aprovação em lote de um grupo: ela vai para o histórico (com quem revogou, quando e por quê) e os itens voltam a aguardar aprovação. */
export function revogarLote(inativacao, grupo, { por, em, motivo = "" }) {
  const ina = norm(inativacao); if (!ina.lotes[grupo]) return ina;
  ina.historico.push({ tipo: "LOTE_REVOGADO", grupo, lote: ina.lotes[grupo], por, em, motivo }); delete ina.lotes[grupo];
  return ina;
}

/**
 * Retira códigos da lista (documento aberto, dependência não esclarecida ou outro motivo): eles ficam para decisão individual e SAEM da lista fechada já aprovada (a aprovação
 * atestou que não havia documento aberto; o item só volta a ser coberto numa nova aprovação). Cada retirada fica no histórico.
 */
/** Tira o código de toda lista fechada que o contém; cada saída fica no histórico. */
function tirarDosLotes(ina, id, { motivo, nota = "", por, em }) {
  for (const [g, l] of Object.entries(ina.lotes)) {
    if (!l.itens.includes(id)) continue;
    ina.lotes[g] = { ...l, itens: l.itens.filter((x) => x !== id) };
    ina.historico.push({ tipo: "ITEM_RETIRADO_DA_LISTA", grupo: g, id, motivo, nota: String(nota).trim(), por, em });
  }
}
/** A aprovação que ficou sem nenhum item deixa de existir (fica no histórico). */
function fecharLotesVazios(ina, { por, em }) {
  for (const [g, l] of Object.entries(ina.lotes)) if (!l.itens.length) { ina.historico.push({ tipo: "LOTE_ESVAZIADO", grupo: g, lote: l, por, em }); delete ina.lotes[g]; }
}
export function retirarDaLista(inativacao, ids, { motivo, nota = "", por, em }) {
  const ina = norm(inativacao);
  for (const id of ids) { ina.excecoes[id] = { motivo, nota: String(nota).trim(), por, em }; tirarDosLotes(ina, id, { motivo, nota, por, em }); }
  fecharLotesVazios(ina, { por, em });
  return ina;
}
/**
 * Devolve códigos à lista elegível. Eles NÃO voltam à lista fechada já aprovada: aparecem como novos elegíveis, que pedem nova aprovação. Fica no histórico. Aprovação salva
 * antes de a lista encolher na retirada ainda traz o código: ele sai dela agora, para a devolução não o aprovar de novo.
 */
export function devolverALista(inativacao, ids, { por, em } = {}) {
  const ina = norm(inativacao);
  for (const id of ids) {
    const exc = ina.excecoes[id]; if (!exc) continue;
    tirarDosLotes(ina, id, { motivo: exc.motivo, nota: exc.nota, por: exc.por ?? por, em: exc.em ?? em });
    ina.historico.push({ tipo: "ITEM_DEVOLVIDO_A_LISTA", id, excecao: exc, por, em }); delete ina.excecoes[id];
  }
  fecharLotesVazios(ina, { por, em });
  return ina;
}

/**
 * Decisão individual de um item: INATIVAR (com a justificativa) ou MANTER; `acao` null desfaz a decisão. Guarda como o item estava (`item`: saldo e última movimentação):
 * a decisão só vale enquanto ele estiver assim. Trocar ou desfazer uma decisão guarda a anterior no histórico.
 */
export function decidirIndividual(inativacao, id, { acao, justificativa = "", por, em, item } = {}) {
  const ina = norm(inativacao); const ant = ina.individuais[id];
  if (!acao) { if (ant) ina.historico.push({ tipo: "INDIVIDUAL_REMOVIDA", id, anterior: ant, por, em }); delete ina.individuais[id]; return ina; }
  const antiga = !!ant && !!item && individualDesatualizada(ant, item); // a decisão de antes foi tomada com o item de outro jeito
  if (ant && (ant.acao !== acao || antiga)) ina.historico.push({ tipo: "INDIVIDUAL_SUBSTITUIDA", id, anterior: ant, por, em });
  ina.individuais[id] = { acao, justificativa: String(justificativa).trim(), por, em, ...(item ? { antes: instantaneoInativacao(item) } : ant?.antes ? { antes: ant.antes } : {}) };
  return ina;
}

/** Lista os códigos digitados ou colados (um por linha, vírgula, ponto e vírgula ou tabulação), como texto, sem repetir. */
export function lerCodigos(texto) {
  return [...new Set(String(texto ?? "").split(/[\n\r,;\t]+/).map((x) => x.trim()).filter(Boolean))];
}

/** Resumo para as telas e relatórios: candidatos, aprovados (lote e individual), a decidir e fora da aprovação. */
export function resumoInativacao(inativacao, escopo, indice) {
  const ina = norm(inativacao); const { grupos, total } = candidatosDaInativacao(escopo, indice, ina);
  const r = { candidatos: total, lote: 0, individualInativar: 0, individualManter: 0, aguardaLista: 0, individuaisPendentes: 0, semIdentidade: 0, lotesAprovados: Object.keys(ina.lotes).length, grupos: grupos.length };
  for (const g of grupos) for (const c of g.candidatos) {
    const s = situacaoDoCandidato(c, g.grupo, ina);
    if (s === "LOTE") r.lote += 1; else if (s === "INATIVAR") r.individualInativar += 1; else if (s === "MANTER") r.individualManter += 1; else if (s === "AGUARDA_LISTA") r.aguardaLista += 1; else if (s === "SEM_IDENTIDADE") r.semIdentidade += 1; else r.individuaisPendentes += 1;
  }
  r.aprovados = r.lote + r.individualInativar; r.aguardando = r.aguardaLista + r.individuaisPendentes;
  return r;
}
