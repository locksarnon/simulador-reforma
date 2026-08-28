import { Building2, ChevronRight, Calendar, Pencil, Trash2 } from "lucide-react";

const statusStyles = {
  "Crítico": "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  "Pendente": "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300",
  "Saudável": "bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300",
};

export default function GrupoCard({ grupo, onClick, onEdit, onDelete }) {
  const score = grupo.ifme_consolidado || 0;
  const meta = grupo.ifme_meta || 3;
  const pctScore = Math.min(100, (score / meta) * 100);
  const status = grupo.status_ifme || "Pendente";

  return (
    <div
      onClick={onClick}
      className="rounded-xl border border-border bg-card overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
    >
      <div className="bg-sidebar px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-mono text-muted-foreground shrink-0">{grupo.numero || "—"}</span>
          <h3 className="font-heading font-semibold text-sm text-foreground truncate">{grupo.nome}</h3>
        </div>
        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>

      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="w-3.5 h-3.5" />
          <span className="truncate">{grupo.tipo || "—"}</span>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">IFME™ Consolidado</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-heading font-bold">{score.toFixed(2)}</span>
            <span className="text-sm text-muted-foreground">/ {meta.toFixed(2)}</span>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${statusStyles[status] || statusStyles["Pendente"]}`}>
              {status}
            </span>
          </div>
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pctScore}%` }} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          {grupo.updated_date && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(grupo.updated_date).toLocaleDateString("pt-BR")}
            </span>
          )}
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(grupo); }}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                title="Editar grupo"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(grupo); }}
                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                title="Excluir grupo"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <span className="text-xs text-primary font-medium flex items-center gap-1 group-hover:gap-2 transition-all ml-1">
              Abrir <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}