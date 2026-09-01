import React from "react";
import { Building2, Pencil, Trash2, ChevronRight } from "lucide-react";

export default function EmpresaCard({ empresa, onClick, onEdit, onDelete }) {
  return (
    <div
      onClick={onClick}
      className="rounded-xl border border-border bg-card overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
    >
      <div className="bg-sidebar px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-mono text-muted-foreground shrink-0">{empresa.id_empresa || "—"}</span>
          <h3 className="font-heading font-semibold text-sm text-foreground truncate">{empresa.razao_social}</h3>
        </div>
        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate">{empresa.regime_atual || "Regime não informado"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{[empresa.setor, empresa.uf].filter(Boolean).join(" · ") || "—"}</span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-[11px] text-muted-foreground">{empresa.status || "Ativa"}</span>
          <div className="flex items-center gap-1">
            {onEdit && (
              <button onClick={(e) => { e.stopPropagation(); onEdit(empresa); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button onClick={(e) => { e.stopPropagation(); onDelete(empresa); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
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
