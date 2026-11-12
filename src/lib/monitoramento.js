import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

/** Os níveis do resultado de cada consulta, com a cor do selo e a ordem de gravidade. */
export const NIVEIS = {
  CRITICO: { rotulo: "Crítico", peso: 3, tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", ponto: "bg-red-500" },
  ATENCAO: { rotulo: "Atenção", peso: 2, tom: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", ponto: "bg-amber-500" },
  OK: { rotulo: "Em dia", peso: 1, tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", ponto: "bg-emerald-500" },
  INFO: { rotulo: "Informativo", peso: 0, tom: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300", ponto: "bg-sky-500" },
};
export const SEM_CONSULTA = { rotulo: "Sem consulta", tom: "bg-muted text-muted-foreground", ponto: "bg-muted-foreground/30" };

export const MODOS = {
  DESLIGADO: { rotulo: "Desligado", texto: "Consultas desligadas." },
  DEMONSTRACAO: { rotulo: "Demonstração", texto: "Dados fictícios do Serpro." },
  PRODUCAO: { rotulo: "Produção", texto: "Consultas reais ao Integra Contador." },
};

/** Estado do monitoramento (modo, contrato, grupos e catálogo de serviços). */
export const useEstadoMonitoramento = () => useQuery({ queryKey: ["monitoramento", "estado"], queryFn: () => api.get("/monitoramento/estado"), staleTime: 60_000 });

const so = (v) => String(v ?? "").replace(/\D/g, "");
/** Como a célula de uma tabela de resultado aparece: data, competência e moeda no formato brasileiro. */
export function formatarCelula(valor, tipo) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (tipo === "moeda" && typeof valor === "number") return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (tipo === "data") { const s = so(valor); return s.length >= 8 ? `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : String(valor); }
  if (tipo === "periodo") { const s = so(valor); return s.length === 6 ? `${s.slice(4, 6)}/${s.slice(0, 4)}` : String(valor); }
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

/** Pior nível de uma lista (CRITICO > ATENCAO > OK > INFO); undefined sem nenhum. */
export function piorNivel(niveis) {
  return (niveis || []).filter(Boolean).reduce((p, n) => (!p || (NIVEIS[n]?.peso ?? -1) > (NIVEIS[p]?.peso ?? -1) ? n : p), undefined);
}

/** Cor da nota de saúde fiscal (0 a 100). */
export const tomDaNota = (n) => (n >= 85 ? "text-emerald-700 dark:text-emerald-400" : n >= 60 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400");

/** Os serviços de um grupo, separados em "indicados para o regime" e "outros". */
export function servicosDoGrupo(servicos, grupo, indicados) {
  const doGrupo = (servicos || []).filter((s) => s.grupo === grupo);
  const set = new Set(indicados || []);
  return { indicados: doGrupo.filter((s) => set.has(s.chave)), outros: doGrupo.filter((s) => !set.has(s.chave)) };
}

/** Quando foi a consulta, em texto curto. */
export function quandoConsultou(data) {
  if (!data) return "nunca";
  return new Date(data).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
