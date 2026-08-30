import { Building2, ChevronRight, Calendar, Pencil, Trash2 } from "lucide-react";

export default function GrupoCard({ grupo, onClick, onEdit, onDelete }) {
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