import React from "react";
import { FileText, AlertTriangle, CheckCircle2, XCircle, Minus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const SITUACAO_CONFIG = {
  AUTORIZADO: { label: "Autorizado", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  AUTORIZADO_FORA_PRAZO: { label: "Autorizado fora do prazo", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  CANCELADO: { label: "Cancelado", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
  HOMOLOGACAO: { label: "Homologação", color: "bg-amber-100 text-amber-700 border-amber-200", icon: AlertTriangle },
  SEM_PROTOCOLO: { label: "Sem protocolo", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
  DUPLICADO_HASH: { label: "Duplicado (hash)", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Minus },
  DUPLICADO_CHAVE: { label: "Duplicado (chave)", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Minus },
  INVALIDO: { label: "Inválido", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
  EVENTO_PROCESSADO: { label: "Evento processado", color: "bg-orange-100 text-orange-700 border-orange-200", icon: Clock },
  EVENTO_PENDENTE: { label: "Evento pendente", color: "bg-orange-100 text-orange-700 border-orange-200", icon: Clock },
  IGNORADO: { label: "Ignorado", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Minus },
  ERRO_PROCESSAMENTO: { label: "Erro", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
};

export default function ArquivosLog({ arquivos }) {
  if (!arquivos || arquivos.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="font-heading font-medium text-sm">Log de Arquivos</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{arquivos.length} arquivo(s) processado(s)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Arquivo</th>
              <th className="text-left font-medium px-4 py-2.5">Tipo</th>
              <th className="text-left font-medium px-4 py-2.5">Chave</th>
              <th className="text-left font-medium px-4 py-2.5">Nº/Série</th>
              <th className="text-left font-medium px-4 py-2.5">Data</th>
              <th className="text-left font-medium px-4 py-2.5">Situação</th>
              <th className="text-left font-medium px-4 py-2.5">cStat</th>
              <th className="text-left font-medium px-4 py-2.5">xMotivo</th>
              <th className="text-left font-medium px-4 py-2.5">Amb.</th>
              <th className="text-right font-medium px-4 py-2.5">Itens</th>
              <th className="text-left font-medium px-4 py-2.5">Duplicidade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {arquivos.map((a) => {
              const cfg = SITUACAO_CONFIG[a.situacao_fiscal] || SITUACAO_CONFIG.IGNORADO;
              const Icon = cfg.icon;
              return (
                <tr key={a.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate max-w-[180px] font-medium" title={a.nome_original}>
                        {a.nome_original}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.tipo_xml || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground" title={a.chave_nfe}>
                    {a.chave_nfe ? `${a.chave_nfe.substring(0, 22)}...` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {a.numero_nf || "—"}<span className="text-muted-foreground/60">/{a.serie || "—"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {a.data_emissao ? new Date(a.data_emissao).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium", cfg.color)}>
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono">{a.cstat || "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground max-w-[160px] truncate" title={a.xmotivo}>
                    {a.xmotivo || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {a.ambiente === "1" ? "Prod" : a.ambiente === "2" ? "Homol" : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{a.qtd_itens || 0}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-[10px]">{a.motivo_duplicidade || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}