import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, Minus } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const CAMADA_LABELS = {
  documental: "Documental",
  cadastral: "Cadastral",
  tributaria: "Tributária",
  operacional: "Operacional",
};

const STATUS_CONFIG = {
  CONFORME: { label: "Conforme", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50 border-emerald-200" },
  NAO_CONFORME: { label: "Não conforme", icon: XCircle, color: "text-red-500", bg: "bg-red-50 border-red-200" },
  ALERTA: { label: "Alerta", icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50 border-amber-200" },
  PENDENTE: { label: "Pendente", icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50 border-amber-200" },
  NAO_APLICAVEL: { label: "Não aplicável", icon: Minus, color: "text-muted-foreground", bg: "bg-muted/30 border-border" },
};

export default function ValidacaoDrawer({ item, camada, open, onClose }) {
  if (!item) return null;

  const jsonField = {
    documental: "validacao_documental_json",
    cadastral: "validacao_cadastral_json",
    tributaria: "validacao_tributaria_json",
    operacional: "validacao_operacional_json",
  }[camada];

  let checks = [];
  try { checks = JSON.parse(item[jsonField] || "[]"); } catch { checks = []; }

  let snapshot = {};
  try { snapshot = JSON.parse(item.snapshot_versoes_json || "{}"); } catch { snapshot = {}; }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">
            Validação {CAMADA_LABELS[camada] || ""}
          </SheetTitle>
          <SheetDescription>
            Item #{item.numero_item} · {item.perspectiva === "EMITENTE" ? "Emitente" : "Destinatário"} ·{" "}
            {item.direcao === "Saida" ? "Saída" : "Entrada"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
            <p><span className="text-muted-foreground">Descrição:</span> {item.descricao || "—"}</p>
            <p><span className="text-muted-foreground">NCM:</span> {item.ncm || "—"} · <span className="text-muted-foreground">CFOP:</span> {item.cfop_servico || "—"}</p>
            <p><span className="text-muted-foreground">Valor bruto:</span> R$ {(item.valor_bruto || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            <p><span className="text-muted-foreground">Resultado:</span> {item.resultado_final}</p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Checks ({checks.length})
            </h4>
            {checks.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Nenhum check registrado.</p>
            )}
            {checks.map((c, idx) => {
              const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.NAO_APLICAVEL;
              const Icon = cfg.icon;
              return (
                <div key={idx} className={cn("rounded-lg border p-3", cfg.bg)}>
                  <div className="flex items-start gap-2">
                    <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", cfg.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background border border-border">
                          {c.codigo}
                        </code>
                        <span className={cn("text-[10px] font-medium", cfg.color)}>{cfg.label}</span>
                        {c.bloqueante && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                            Bloqueante
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-1 text-foreground">{c.mensagem}</p>
                      {c.campo_relacionado && (
                        <p className="text-[10px] text-muted-foreground mt-1">Campo: {c.campo_relacionado}</p>
                      )}
                      {c.evidencias && c.evidencias.length > 0 && (
                        <div className="mt-1.5 text-[10px] text-muted-foreground">
                          Evidências: {c.evidencias.join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {Object.keys(snapshot).length > 0 && (
            <div className="rounded-lg border border-border p-3 text-[10px] text-muted-foreground space-y-0.5">
              <p className="font-medium text-foreground mb-1">Snapshot de versões</p>
              <p>Regras: {snapshot.versao_regras}</p>
              <p>CST: {snapshot.versao_catalogo_cst} · cClassTrib: {snapshot.versao_catalogo_class_trib} · cCredPres: {snapshot.versao_catalogo_cred_pres}</p>
              <p>Validado em: {snapshot.validado_em ? new Date(snapshot.validado_em).toLocaleString("pt-BR") : "—"}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}