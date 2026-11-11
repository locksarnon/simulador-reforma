/** Propostas comerciais: rótulos, cores e contas da tela. As regras ficam no servidor (backend/src/propostas). */
export const SERVICOS = { BPO_FISCAL: "BPO fiscal", DIAGNOSTICO_PONTUAL: "Diagnóstico pontual", OUTRO: "Outro serviço" };
export const STATUS = { RASCUNHO: "Rascunho", ENVIADA: "Enviada", ACEITA: "Aceita", RECUSADA: "Recusada" };
export const TOM_DO_STATUS = {
  RASCUNHO: "bg-muted text-muted-foreground",
  ENVIADA: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  ACEITA: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  RECUSADA: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};
export const MODULOS_HONORARIO = { XML: "Captura de XML", MONITORAMENTO: "Monitoramento fiscal", OBRIGACOES: "Obrigações e agenda", TAREFAS: "Processos e tarefas", ARQUIVOS: "Arquivos e documentos" };
export const COMPLEXIDADES = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta" };
export const REGIMES_HONORARIO = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "Produtor rural PF"];

export const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Mensal (itens recorrentes) e único (o resto), como o servidor calcula. */
export function totaisDosItens(itens) {
  const soma = (f) => Math.round((itens || []).filter(f).reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0) * 100) / 100;
  return { mensal: soma((i) => i.recorrente), unico: soma((i) => !i.recorrente) };
}

/** Data de validade padrão: 15 dias a partir de hoje. */
export function validadePadrao(agora = new Date()) {
  return new Date(agora.getTime() + 15 * 86_400_000).toISOString().slice(0, 10);
}
