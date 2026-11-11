/**
 * Tarefas e processos recorrentes: rótulos, cores e as contas de prazo que a tela usa. As regras de verdade (validação, geração das
 * tarefas) ficam no servidor (backend/src/tarefas); aqui só se monta a tela. O prazo é uma data, sem hora, e o "hoje" é o de Brasília.
 */
export const STATUS = { ABERTA: "A fazer", EM_ANDAMENTO: "Em andamento", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };
export const STATUS_ABERTOS = ["ABERTA", "EM_ANDAMENTO"];
export const PRIORIDADES = { BAIXA: "Baixa", NORMAL: "Normal", ALTA: "Alta", URGENTE: "Urgente" };
export const TOM_DA_PRIORIDADE = {
  BAIXA: "bg-muted text-muted-foreground",
  NORMAL: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  ALTA: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  URGENTE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};
export const RECORRENCIAS = { MENSAL: "Todo mês", TRIMESTRAL: "Todo trimestre (jan, abr, jul, out)", ANUAL: "Uma vez por ano" };
export const ESCOPOS = { POR_EMPRESA_BPO: "Uma tarefa por empresa do BPO fiscal", GERAL: "Uma tarefa só, do escritório" };
export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const DIA_MS = 86_400_000;

/** A data de hoje em Brasília, como "AAAA-MM-DD". */
export function hojeBR(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** O mês de hoje, como "AAAA-MM" (valor do campo de mês e da competência). */
export const competenciaAtual = (agora = new Date()) => hojeBR(agora).slice(0, 7);

/** Dias entre hoje e o prazo (negativo = atrasado). O prazo vem do servidor como "2026-11-20T00:00:00.000Z". */
export function diasAte(prazo, hoje = hojeBR()) {
  if (!prazo) return null;
  return Math.round((Date.parse(String(prazo).slice(0, 10)) - Date.parse(hoje)) / DIA_MS);
}

/** Como o prazo aparece na linha: o texto e o tom (atrasada, hoje, breve, normal, nenhum). */
export function situacaoDoPrazo(tarefa, hoje = hojeBR()) {
  const d = diasAte(tarefa?.prazo, hoje);
  if (d === null) return { texto: "Sem prazo", tom: "nenhum" };
  if (!STATUS_ABERTOS.includes(tarefa.status)) return { texto: fmtData(tarefa.prazo), tom: "normal" };
  if (d < 0) return { texto: `Atrasada há ${-d} dia${d === -1 ? "" : "s"}`, tom: "atrasada" };
  if (d === 0) return { texto: "Vence hoje", tom: "hoje" };
  if (d === 1) return { texto: "Vence amanhã", tom: "breve" };
  if (d <= 7) return { texto: `Vence em ${d} dias`, tom: "breve" };
  return { texto: fmtData(tarefa.prazo), tom: "normal" };
}

export const TOM_DO_PRAZO = {
  atrasada: "text-red-700 dark:text-red-400 font-medium",
  hoje: "text-amber-700 dark:text-amber-400 font-medium",
  breve: "text-foreground",
  normal: "text-muted-foreground",
  nenhum: "text-muted-foreground",
};

export const fmtData = (v) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

/** "2026-11" → "novembro de 2026". */
export function nomeDaCompetencia(c) {
  const m = /^(\d{4})-(\d{2})$/.exec(c || "");
  return m ? `${MESES[Number(m[2]) - 1]} de ${m[1]}` : c || "";
}

/** O que o texto de busca casa: título, descrição e nome da empresa, sem acento nem maiúsculas. */
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Filtros da lista de tarefas (feitos no navegador, sobre as tarefas já carregadas):
 * busca, responsável ("", "eu", "sem" ou id), empresa (id) e atalho de prazo ("", "atrasadas", "hoje", "semana").
 */
export function filtrarTarefas(tarefas, { busca = "", responsavel = "", empresa = "", atalho = "" } = {}, { usuarioId, nomeDaEmpresa, hoje = hojeBR() } = {}) {
  const t = semAcento(busca).trim();
  return (tarefas || []).filter((x) => {
    if (responsavel === "eu" && x.responsavel !== usuarioId) return false;
    if (responsavel === "sem" && x.responsavel) return false;
    if (responsavel && responsavel !== "eu" && responsavel !== "sem" && x.responsavel !== responsavel) return false;
    if (empresa && x.empresa_id !== empresa) return false;
    if (atalho) {
      const d = diasAte(x.prazo, hoje);
      if (d === null || !STATUS_ABERTOS.includes(x.status)) return false;
      if (atalho === "atrasadas" && d >= 0) return false;
      if (atalho === "hoje" && d !== 0) return false;
      if (atalho === "semana" && (d < 0 || d > 6)) return false;
    }
    if (!t) return true;
    return semAcento(x.titulo).includes(t) || semAcento(x.descricao).includes(t) || semAcento(nomeDaEmpresa?.(x.empresa_id)).includes(t);
  });
}

/** Resumo de um processo recorrente em uma frase: "Todo mês, dia 20" / "Uma vez por ano, em março, dia 31". */
export function descreverRecorrencia(p) {
  if (p.recorrencia === "ANUAL") return `Uma vez por ano, em ${MESES[(p.mes || 1) - 1]}, dia ${p.dia}`;
  return `${RECORRENCIAS[p.recorrencia] || p.recorrencia}, dia ${p.dia}`;
}
