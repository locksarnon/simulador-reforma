import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, Minus, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

const RESULTADO_CONFIG = {
  IMPORTAVEL: { label: "Importável", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  IMPORTAVEL_COM_ALERTA: { label: "Importável c/ alerta", color: "bg-amber-100 text-amber-700 border-amber-200" },
  BLOQUEADO: { label: "Bloqueado", color: "bg-red-100 text-red-700 border-red-200" },
  CANCELADO: { label: "Cancelado", color: "bg-gray-100 text-gray-600 border-gray-200" },
  DUPLICADO: { label: "Duplicado", color: "bg-blue-100 text-blue-700 border-blue-200" },
};

function StatusIcon({ checks }) {
  if (!checks || checks.length === 0) return <Minus className="w-4 h-4 text-muted-foreground/40" />;
  const hasBloqueante = checks.some((c) => c.bloqueante && c.status === "NAO_CONFORME");
  const hasAlerta = checks.some((c) => c.status === "ALERTA" || c.status === "PENDENTE");
  const hasNaoConforme = checks.some((c) => c.status === "NAO_CONFORME");
  if (hasBloqueante) return <XCircle className="w-4 h-4 text-red-500" />;
  if (hasAlerta) return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  if (hasNaoConforme) return <XCircle className="w-4 h-4 text-red-400" />;
  return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
}

export default function StagingTable({ itens, empresaMap, selectedIds, onToggleSelect, onOpenDrawer }) {
  if (!itens || itens.length === 0) return null;

  // Agrupa intercompany por chave_nfe + numero_item.
  const grupos = {};
  for (const it of itens) {
    const key = `${it.chave_nfe}|${it.numero_item}`;
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(it);
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="font-heading font-medium text-sm">Staging de Itens</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {itens.length} perspectiva(s) · Clique nos ícones de validação para detalhar
        </p>
      </div>
      <div className="overflow-x-auto max-h-[600px]">
        <table className="w-full text-xs min-w-[900px]">
          <thead className="bg-muted/50 text-muted-foreground sticky top-0">
            <tr>
              <th className="px-3 py-2.5 w-8"></th>
              <th className="text-left font-medium px-3 py-2.5 w-8"></th>
              <th className="text-left font-medium px-3 py-2.5">Item</th>
              <th className="text-left font-medium px-3 py-2.5">Empresa</th>
              <th className="text-left font-medium px-3 py-2.5">Persp.</th>
              <th className="text-left font-medium px-3 py-2.5">Direção</th>
              <th className="text-left font-medium px-3 py-2.5">Rel.</th>
              <th className="text-left font-medium px-3 py-2.5">NCM/NBS</th>
              <th className="text-left font-medium px-3 py-2.5">CFOP</th>
              <th className="text-right font-medium px-3 py-2.5">Valor</th>
              <th className="text-center font-medium px-2 py-2.5" title="Documental">DOC</th>
              <th className="text-center font-medium px-2 py-2.5" title="Cadastral">CAD</th>
              <th className="text-center font-medium px-2 py-2.5" title="Tributária">TRIB</th>
              <th className="text-center font-medium px-2 py-2.5" title="Operacional">OPER</th>
              <th className="text-left font-medium px-3 py-2.5">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Object.entries(grupos).map(([key, group]) => {
              const isIntercompany = group.length === 2;
              return group.map((it, idx) => {
                const cfg = RESULTADO_CONFIG[it.resultado_final] || RESULTADO_CONFIG.BLOQUEADO;
                const podeSelecionar = it.resultado_final === "IMPORTAVEL" || it.resultado_final === "IMPORTAVEL_COM_ALERTA";
                const docChecks = safeParse(it.validacao_documental_json);
                const cadChecks = safeParse(it.validacao_cadastral_json);
                const tribChecks = safeParse(it.validacao_tributaria_json);
                const operChecks = safeParse(it.validacao_operacional_json);
                const checked = selectedIds.includes(it.id);
                return (
                  <tr key={it.id} className={cn("hover:bg-muted/30", isIntercompany && idx === 1 && "border-t-0")}>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!podeSelecionar}
                        onChange={() => onToggleSelect(it.id, isIntercompany ? group : null)}
                        className="w-3.5 h-3.5 rounded cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {isIntercompany && <Link2 className="w-3.5 h-3.5 text-primary mx-auto" />}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[10px] text-muted-foreground">#{it.numero_item}</span>
                      <span className="block truncate max-w-[160px]" title={it.descricao}>{it.descricao || "—"}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[160px]" title={empresaMap?.get(it.empresa_id)?.razao_social || it.empresa_id}>
                      {it.empresa_id ? (empresaMap?.get(it.empresa_id)?.razao_social || it.empresa_id) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{it.perspectiva === "EMITENTE" ? "Emit." : "Dest."}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
                        it.direcao === "Saida" ? "bg-violet-100 text-violet-700" : "bg-cyan-100 text-cyan-700")}>
                        {it.direcao === "Saida" ? "Saída" : "Entrada"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-[10px]">
                      {it.tipo_relacionamento === "INTERCOMPANY" ? "Interco" :
                       it.tipo_relacionamento === "TRANSFERENCIA_INTERNA" ? "Transf." : "Terceiro"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[10px] text-muted-foreground">{it.ncm || it.nbs || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-[10px] text-muted-foreground">{it.cfop_servico || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {(it.valor_bruto || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-2.5 text-center cursor-pointer hover:bg-muted/50" onClick={() => onOpenDrawer(it, "documental")}>
                      <StatusIcon checks={docChecks} />
                    </td>
                    <td className="px-2 py-2.5 text-center cursor-pointer hover:bg-muted/50" onClick={() => onOpenDrawer(it, "cadastral")}>
                      <StatusIcon checks={cadChecks} />
                    </td>
                    <td className="px-2 py-2.5 text-center cursor-pointer hover:bg-muted/50" onClick={() => onOpenDrawer(it, "tributaria")}>
                      <StatusIcon checks={tribChecks} />
                    </td>
                    <td className="px-2 py-2.5 text-center cursor-pointer hover:bg-muted/50" onClick={() => onOpenDrawer(it, "operacional")}>
                      <StatusIcon checks={operChecks} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("inline-block px-2 py-0.5 rounded-full border text-[10px] font-medium", cfg.color)}>
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function safeParse(str) {
  try { return JSON.parse(str || "[]"); } catch { return []; }
}