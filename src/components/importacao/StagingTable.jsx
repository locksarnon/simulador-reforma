import React, { useState, useMemo } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Minus, Link2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// O enum ResultadoFinalXML no schema tem CONFIRMADO e ESTORNADO além destes
// 5 — faltavam aqui, então um item já importado (CONFIRMADO) caía no
// fallback BLOQUEADO abaixo e aparecia com badge vermelho "Bloqueado",
// como se tivesse dado erro, quando na verdade já virou Operação com sucesso.
const RESULTADO_CONFIG = {
  IMPORTAVEL: { label: "Importável", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  IMPORTAVEL_COM_ALERTA: { label: "Importável c/ alerta", color: "bg-amber-100 text-amber-700 border-amber-200" },
  BLOQUEADO: { label: "Bloqueado", color: "bg-red-100 text-red-700 border-red-200" },
  CANCELADO: { label: "Cancelado", color: "bg-gray-100 text-gray-600 border-gray-200" },
  DUPLICADO: { label: "Duplicado", color: "bg-blue-100 text-blue-700 border-blue-200" },
  CONFIRMADO: { label: "Já importado", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  ESTORNADO: { label: "Estornado", color: "bg-orange-100 text-orange-700 border-orange-200" },
};

const FILTROS = [
  { value: "TODOS", label: "Todos" },
  { value: "IMPORTAVEL", label: "Importável" },
  { value: "IMPORTAVEL_COM_ALERTA", label: "Importável c/ alerta" },
  { value: "BLOQUEADO", label: "Bloqueado" },
  { value: "DUPLICADO", label: "Duplicado" },
  { value: "CANCELADO", label: "Cancelado" },
  { value: "CONFIRMADO", label: "Já importado" },
];

const PAGE_SIZE = 50;

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

/**
 * Staging de itens importados de XML. Pensada para volumes pequenos (uma
 * dúzia de notas) até grandes (centenas/milhares — ex.: 12 meses de
 * faturamento real de uma empresa): filtro por status pra pular direto pro
 * que precisa de atenção humana, e paginação (por GRUPO de item, não por
 * linha solta, pra nunca partir um par intercompany entre páginas).
 */
export default function StagingTable({ itens, empresaMap, selectedIds, onToggleSelect, onOpenDrawer }) {
  const [filtro, setFiltro] = useState("TODOS");
  const [pagina, setPagina] = useState(0);

  const itensFiltrados = useMemo(
    () => (filtro === "TODOS" ? itens : (itens || []).filter((it) => it.resultado_final === filtro)),
    [itens, filtro]
  );

  // Agrupa intercompany por chave_nfe + numero_item — cada grupo é 1 ou 2 linhas.
  const grupos = useMemo(() => {
    const map = {};
    for (const it of itensFiltrados) {
      const key = `${it.chave_nfe}|${it.numero_item}`;
      if (!map[key]) map[key] = [];
      map[key].push(it);
    }
    return Object.entries(map);
  }, [itensFiltrados]);

  const totalPaginas = Math.max(1, Math.ceil(grupos.length / PAGE_SIZE));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const gruposPagina = grupos.slice(paginaAtual * PAGE_SIZE, (paginaAtual + 1) * PAGE_SIZE);

  const mudarFiltro = (v) => { setFiltro(v); setPagina(0); };

  if (!itens || itens.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-heading font-medium text-sm">Staging de Itens</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {itensFiltrados.length} de {itens.length} perspectiva(s) · Clique nos ícones de validação para detalhar
          </p>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {FILTROS.map((f) => (
            <button
              key={f.value}
              onClick={() => mudarFiltro(f.value)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                filtro === f.value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
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
            {gruposPagina.map(([key, group]) => {
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
            {gruposPagina.length === 0 && (
              <tr>
                <td colSpan={15} className="py-8 text-center text-muted-foreground">
                  Nenhum item com esse status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPaginas > 1 && (
        <div className="px-5 py-2.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>Página {paginaAtual + 1} de {totalPaginas} · {grupos.length} item(ns) filtrado(s)</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
              disabled={paginaAtual === 0}
              className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
              disabled={paginaAtual >= totalPaginas - 1}
              className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function safeParse(str) {
  try { return JSON.parse(str || "[]"); } catch { return []; }
}
