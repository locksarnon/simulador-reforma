// Inativação por data de uso. O corte por data SELECIONA candidatos para avaliação: não autoriza inativar nada. A inativação só nasce de uma aprovação expressa:
//  (1) em lote, por grupo de itens, com uma LISTA FECHADA de códigos, a base e a data analisadas, as verificações feitas, o aprovador e a justificativa; ou
//  (2) item a item (decisão individual), onde ficam os itens com saldo, documento aberto ou dependência ainda não esclarecida.
// A aprovação em lote cobre só os itens da lista aprovada: item novo (outra extração, outro corte) não é coberto e pede nova aprovação. Nada é gravado no ERP: a ferramenta
// só registra a aprovação e gera a tarefa de execução, que as equipes confirmam com evidência. Funções puras.
import { grupoDe } from "./logica";
import { idItem, origemCompleta } from "./identidade";

export const MIN_NOTA = 5; export const MIN_JUSTIFICATIVA = 10;

/** Verificações exigidas para aprovar um lote: a movimentação é conferida na própria base; as demais o analista atesta, com a nota do que conferiu e onde. */
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
const temSaldoNaoZero = (it) => it.saldo != null && Number.isFinite(Number(it.saldo)) && Number(it.saldo) !== 0;
const saldoLido = (it) => it.saldo != null && Number.isFinite(Number(it.saldo));

/**
 * Candidatos à inativação (os que o corte deixou fora do escopo), agrupados pelo grupo de itens, cada um com a sua situação para entrar numa lista:
 * ELEGIVEL (pode entrar na lista fechada), SALDO (saldo diferente de zero: decisão individual), EXCECAO (o analista retirou da lista: documento aberto ou dependência),
 * SEM_IDENTIDADE (sem código, ou código repetido na base: não dá para aprovar nada sobre ele). Devolve { grupos: [{ grupo, candidatos, ... }], total }.
 */
export function candidatosDaInativacao(escopo, indice, inativacao) {
  const ina = norm(inativacao); const porGrupo = new Map();
  for (const it of escopo?.fora || []) {
    const id = idItem(it); const g = grupoDe(it);
    const situacao = !id || indice.repetidos.has(id) ? "SEM_IDENTIDADE" : ina.excecoes[id] ? "EXCECAO" : temSaldoNaoZero(it) ? "SALDO" : "ELEGIVEL";
    const a = porGrupo.get(g) || { grupo: g, candidatos: [] }; a.candidatos.push({ it, id, situacao }); porGrupo.set(g, a);
  }
  const grupos = [...porGrupo.values()].map((g) => ({ ...g, elegiveis: g.candidatos.filter((c) => c.situacao === "ELEGIVEL"), individuais: g.candidatos.filter((c) => c.situacao === "SALDO" || c.situacao === "EXCECAO"), semIdentidade: g.candidatos.filter((c) => c.situacao === "SEM_IDENTIDADE") }))
    .sort((a, b) => b.candidatos.length - a.candidatos.length || a.grupo.localeCompare(b.grupo, "pt-BR"));
  return { grupos, total: grupos.reduce((n, g) => n + g.candidatos.length, 0) };
}

/** A situação de um candidato diante das aprovações: decisão individual (vale sobre tudo), lote aprovado (só se ele estava na lista e continua elegível) ou ainda sem aprovação. */
export function situacaoDoCandidato(c, grupo, inativacao) {
  const ina = norm(inativacao); const ind = ina.individuais[c.id];
  if (c.situacao === "SEM_IDENTIDADE") return "SEM_IDENTIDADE";
  if (ind?.acao === "INATIVAR" && individualValida(ind)) return "INATIVAR"; // sem a justificativa escrita a decisão ainda não vale: o item segue aguardando
  if (ind?.acao === "MANTER") return "MANTER";
  if (c.situacao === "SALDO" || c.situacao === "EXCECAO") return c.situacao;
  const lote = ina.lotes[grupo]; return lote && lote.itens.includes(c.id) ? "LOTE" : "AGUARDA_LISTA";
}

/** O que a lista fechada de um grupo cobre hoje, e o que mudou desde a aprovação: novos elegíveis (fora da aprovação) e itens da lista que não valem mais. */
export function coberturaDoLote(grupoCand, inativacao) {
  const lote = norm(inativacao).lotes[grupoCand.grupo]; if (!lote) return null;
  const naLista = new Set(lote.itens); const elegiveis = new Set(grupoCand.elegiveis.map((c) => c.id)); const candidatosHoje = new Map(grupoCand.candidatos.map((c) => [c.id, c]));
  const cobertos = grupoCand.elegiveis.filter((c) => naLista.has(c.id)).map((c) => c.id);
  const novos = grupoCand.elegiveis.filter((c) => !naLista.has(c.id)).map((c) => c.id);
  const naoValemMais = lote.itens.filter((id) => !elegiveis.has(id)).map((id) => ({ id, motivo: !candidatosHoje.has(id) ? "não é mais candidato nesta base (movimentação mais recente, corte diferente ou fora da base)" : candidatosHoje.get(id).situacao === "SALDO" ? "passou a ter saldo" : candidatosHoje.get(id).situacao === "EXCECAO" ? "foi retirado da lista" : "não tem mais como ser identificado" }));
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
      if (s === "INATIVAR") { const d = ina.individuais[c.id]; saida.push({ it: c.it, id: c.id, via: "INDIVIDUAL", por: d.por || "", em: d.em || "", grupo: g.grupo, detalhe: d.justificativa || "" }); }
      else if (s === "LOTE") { const l = ina.lotes[g.grupo]; saida.push({ it: c.it, id: c.id, via: "LOTE", por: l.por || "", em: l.em || "", grupo: g.grupo, detalhe: l.justificativa || "" }); }
    }
  }
  return saida;
}

/**
 * Confere se o lote pode ser aprovado e devolve { ok, faltas }. `dados`: { lista (códigos), justificativa, verificacoes, origem, extraidaEm, base, saldoLidoEmTodos }.
 * As verificações de documentos e de vínculos sempre pedem a atestação com a nota; a de saldo só quando algum item da lista não tem saldo lido na base.
 */
export function validarAprovacaoLote({ lista = [], justificativa = "", verificacoes = {}, origem, extraidaEm = "", base, saldoLidoEmTodos = false } = {}) {
  const faltas = [];
  if (!lista.length) faltas.push("A lista está vazia: não há item elegível para aprovar.");
  if (!origemCompleta(origem)) faltas.push("Declare a origem dos dados (ERP, instância e empresa).");
  if (!base?.id) faltas.push("O projeto não tem base vinculada.");
  if (!extraidaEm) faltas.push("Informe a data da extração da base analisada.");
  const atesta = (id, titulo) => { const v = verificacoes[id]; if (!v?.feito || String(v.nota ?? "").trim().length < MIN_NOTA) faltas.push(`${titulo}: marque como feito e escreva o que foi conferido e onde (ao menos ${MIN_NOTA} caracteres).`); };
  if (!saldoLidoEmTodos) atesta("saldo", "Saldo em estoque");
  atesta("documentos", "Documentos abertos"); atesta("dependencias", "Vínculos (cartilhas, planos de manutenção, estruturas)");
  if (String(justificativa).trim().length < MIN_JUSTIFICATIVA) faltas.push(`Escreva a justificativa da aprovação (ao menos ${MIN_JUSTIFICATIVA} caracteres).`);
  return { ok: faltas.length === 0, faltas };
}

/** O saldo foi lido na base para todos os itens da lista (então a verificação de saldo é automática)? */
export const saldoLidoEmTodos = (itensDaLista) => itensDaLista.length > 0 && itensDaLista.every(saldoLido);

/**
 * Aprova a lista fechada de um grupo: guarda os códigos, a base e a data analisadas, o corte, as verificações (a de movimentação e, se o saldo foi lido, a de saldo, feitas pela
 * ferramenta), o aprovador e a justificativa. Uma aprovação anterior do mesmo grupo vai para o histórico (a nova substitui, e a lista nova também é fechada).
 */
export function aprovarLote(inativacao, grupo, { lista, justificativa, verificacoes = {}, base, extraidaEm, corte, semData, por, em, saldoLidoEmTodos: saldoAuto = false }) {
  const ina = norm(inativacao);
  if (ina.lotes[grupo]) ina.historico.push({ tipo: "LOTE_SUBSTITUIDO", grupo, lote: ina.lotes[grupo], em, por, motivo: "nova aprovação do grupo" });
  const v = { ...verificacoes, movimentacao: { feito: true, auto: true, por: "ferramenta", em, nota: `Última movimentação lida da base ${base?.arquivo || ""}${extraidaEm ? ` (extração de ${extraidaEm.split("-").reverse().join("/")})` : ""}.` } };
  if (saldoAuto) v.saldo = { feito: true, auto: true, por: "ferramenta", em, nota: "Saldo lido da base para todos os itens da lista (nenhum com saldo diferente de zero)." };
  ina.lotes[grupo] = { grupo, por, em, justificativa: String(justificativa).trim(), base: { id: base?.id, arquivo: base?.arquivo || "" }, extraidaEm, corte, semData, verificacoes: v, itens: [...new Set(lista)] };
  return ina;
}

/** Revoga a aprovação em lote de um grupo: ela vai para o histórico (com quem revogou, quando e por quê) e os itens voltam a aguardar aprovação. */
export function revogarLote(inativacao, grupo, { por, em, motivo = "" }) {
  const ina = norm(inativacao); if (!ina.lotes[grupo]) return ina;
  ina.historico.push({ tipo: "LOTE_REVOGADO", grupo, lote: ina.lotes[grupo], por, em, motivo }); delete ina.lotes[grupo];
  return ina;
}

/** Retira códigos da lista (documento aberto, dependência não esclarecida ou outro motivo): eles ficam para decisão individual. */
export function retirarDaLista(inativacao, ids, { motivo, nota = "", por, em }) {
  const ina = norm(inativacao);
  for (const id of ids) ina.excecoes[id] = { motivo, nota: String(nota).trim(), por, em };
  return ina;
}
export function devolverALista(inativacao, ids) { const ina = norm(inativacao); for (const id of ids) delete ina.excecoes[id]; return ina; }

/** Decisão individual de um item: INATIVAR (com a justificativa) ou MANTER; `acao` null desfaz a decisão. */
export function decidirIndividual(inativacao, id, { acao, justificativa = "", por, em }) {
  const ina = norm(inativacao);
  if (!acao) { delete ina.individuais[id]; return ina; }
  ina.individuais[id] = { acao, justificativa: String(justificativa).trim(), por, em };
  return ina;
}
/** A decisão individual de inativar só vale com a justificativa (para o item com saldo, ela diz como o saldo foi tratado). */
export const individualValida = (d) => !!d && (d.acao === "MANTER" || (d.acao === "INATIVAR" && String(d.justificativa ?? "").trim().length >= MIN_JUSTIFICATIVA));

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
