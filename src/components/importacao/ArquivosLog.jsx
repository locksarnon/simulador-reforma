import React from "react";
import { FileText, AlertTriangle, CheckCircle2, XCircle, Minus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/plural";
import TabelaPadrao from "@/components/TabelaPadrao";

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
  IGNORADO: { label: "Ignorado", color: "bg-muted text-muted-foreground border-border", icon: Minus },
  ERRO_PROCESSAMENTO: { label: "Erro", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
};

export default function ArquivosLog({ arquivos }) {
  if (!arquivos || arquivos.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="font-heading font-medium text-sm">Log de Arquivos</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{plural(arquivos.length, "arquivo processado", "arquivos processados")}</p>
      </div>
      <div className="p-3">
        <TabelaPadrao id="importacao-xml-arquivos" ariaLabel="Log de arquivos" linhas={arquivos}
          colunas={[
            { chave: "nome_original", rotulo: "Arquivo", render: (a) => <span className="inline-flex items-center gap-1.5 font-medium"><FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />{a.nome_original}</span> },
            { chave: "tipo_xml", rotulo: "Tipo", valor: (a) => a.tipo_xml || "—" },
            { chave: "chave_nfe", rotulo: "Chave", valor: (a) => a.chave_nfe || "—", render: (a) => <span className="font-mono text-[11px] text-muted-foreground">{a.chave_nfe || "—"}</span> },
            { chave: "numero_nf", rotulo: "Número", alinhar: "direita", valor: (a) => (a.numero_nf ? Number(a.numero_nf) || a.numero_nf : null), render: (a) => a.numero_nf || "—" },
            { chave: "serie", rotulo: "Série", alinhar: "direita", valor: (a) => (a.serie ? Number(a.serie) || a.serie : null), render: (a) => a.serie || "—" },
            { chave: "data_emissao", rotulo: "Data", tipo: "data", render: (a) => (a.data_emissao ? new Date(a.data_emissao).toLocaleDateString("pt-BR") : "—") },
            { chave: "situacao_fiscal", rotulo: "Situação", valor: (a) => (SITUACAO_CONFIG[a.situacao_fiscal] || SITUACAO_CONFIG.IGNORADO).label, render: (a) => { const cfg = SITUACAO_CONFIG[a.situacao_fiscal] || SITUACAO_CONFIG.IGNORADO; const Icon = cfg.icon; return <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium", cfg.color)}><Icon className="w-3 h-3" />{cfg.label}</span>; } },
            { chave: "erro_processamento", rotulo: "Erro", quebrar: true, render: (a) => <span className="text-[11px] text-muted-foreground">{a.erro_processamento || ""}</span> },
            { chave: "cstat", rotulo: "cStat", valor: (a) => a.cstat || "—", render: (a) => <span className="font-mono text-muted-foreground">{a.cstat || "—"}</span> },
            { chave: "xmotivo", rotulo: "xMotivo", valor: (a) => a.xmotivo || "—" },
            { chave: "ambiente", rotulo: "Amb.", valor: (a) => (a.ambiente === "1" ? "Prod" : a.ambiente === "2" ? "Homol" : "—") },
            { chave: "qtd_itens", rotulo: "Itens", tipo: "numero", alinhar: "direita", valor: (a) => a.qtd_itens || 0 },
            { chave: "motivo_duplicidade", rotulo: "Duplicidade", valor: (a) => a.motivo_duplicidade || "—" },
          ]}
        />
      </div>
    </div>
  );
}