import { AlertTriangle, CalendarDays, FileBadge, FolderOpen, Info, ListChecks, ShieldAlert } from "lucide-react";

/** As 7 categorias do sino, na ordem dos filtros da central. As chaves espelham o servidor (backend/src/notificacoes). */
export const CATEGORIAS = {
  TAREFA: { rotulo: "Tarefas", icone: ListChecks },
  AGENDA: { rotulo: "Agenda e obrigações", icone: CalendarDays },
  CERTIFICADO: { rotulo: "Certificados", icone: FileBadge },
  DOCUMENTO: { rotulo: "Documentos", icone: FolderOpen },
  CAPTURA: { rotulo: "Captura de XML", icone: AlertTriangle },
  ACESSO: { rotulo: "Acessos", icone: ShieldAlert },
  SISTEMA: { rotulo: "Sistema", icone: Info },
};

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias" ou a data. */
export function quandoFoi(data, agora = new Date()) {
  const ms = agora.getTime() - new Date(data).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  return new Date(data).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** O número do selo do sino: até 99, depois "99+". */
export const seloDoSino = (n) => (!n ? "" : n > 99 ? "99+" : String(n));
