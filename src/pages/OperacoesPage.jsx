import React, { useState, useMemo } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useSimuladorData } from "@/hooks/useSimuladorData";
import { BRL } from "@/lib/format";
import OperacaoForm from "@/components/operacoes/OperacaoForm";
import OperacaoCalcDetail from "@/components/operacoes/OperacaoCalcDetail";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import PageHeader from "@/components/PageHeader";

export default function OperacoesPage() {
  const { id: grupoId } = useParams();
  // Quando esta página é renderizada dentro de EmpresaWorkroom (rota
  // .../empresas/:empresaId/operacoes), o Outlet já traz a empresa — trava o
  // filtro nela em vez de misturar todas as empresas do grupo.
  const { empresa: empresaTravada } = useOutletContext() || {};
  const { operacoesCalculadas, empresas, transicao, classTrib, cenarioAtivo, config, isLoading } = useSimuladorData();
  const qc = useQueryClient();
  const { data: grupo } = useQuery({
    queryKey: ["grupo", grupoId],
    queryFn: () => base44.entities.Grupo.get(grupoId),
    enabled: !!grupoId,
  });
  const grupoNumero = grupo?.numero;
  const grupoEmpresaIds = useMemo(() => {
    if (!grupoId || !grupoNumero) return null;
    return new Set(empresas.filter(e => e.grupo === grupoNumero).map(e => e.id_empresa));
  }, [empresas, grupoId, grupoNumero]);
  const hasEmpresas = grupoEmpresaIds ? grupoEmpresaIds.size > 0 : empresas.length > 0;
  const [editing, setEditing] = useState(null); // operacao being edited (or "new")
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [filterEmpresa, setFilterEmpresa] = useState("");
  const [filterAno, setFilterAno] = useState("");
  const filtroEmpresaEfetivo = empresaTravada ? empresaTravada.id_empresa : filterEmpresa;

  const transicaoMap = useMemo(() => new Map(transicao.map((t) => [t.ano, t])), [transicao]);
  const classTribMap = useMemo(() => new Map(classTrib.map((c) => [c.c_class_trib, c])), [classTrib]);
  const empresaMap = useMemo(() => new Map(empresas.map((e) => [e.id_empresa, e])), [empresas]);

  const grupoOps = grupoEmpresaIds
    ? operacoesCalculadas.filter(oc => grupoEmpresaIds.has(oc.op.empresa_id))
    : operacoesCalculadas;
  const filtered = grupoOps.filter((oc) => {
    if (filtroEmpresaEfetivo && oc.op.empresa_id !== filtroEmpresaEfetivo) return false;
    if (filterAno && String(oc.op.ano) !== filterAno) return false;
    return true;
  });

  const anos = [...new Set(grupoOps.map((oc) => oc.op.ano))].sort();

  const handleSave = async (form) => {
    if (editing === "new") {
      await base44.entities.Operacao.create(form);
    } else {
      await base44.entities.Operacao.update(editing.id, form);
    }
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["operacoes"] });
  };

  const handleDelete = async (op) => {
    if (!confirm(`Excluir ${op.id_operacao}?`)) return;
    await base44.entities.Operacao.delete(op.id);
    qc.invalidateQueries({ queryKey: ["operacoes"] });
  };

  if (isLoading || (grupoId && grupoNumero === undefined)) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Só mostra o próprio cabeçalho quando alcançada direto pelo grupo —
          dentro do workspace de uma empresa, o EmpresaWorkroom já mostra um. */}
      {!empresaTravada && (
        <PageHeader
          crumbs={[
            { label: "DataHub", to: "/" },
            { label: grupo?.nome || "Grupo", to: `/workroom/${grupoId}` },
            { label: "Operações" },
          ]}
        />
      )}
    <div className="p-6 lg:p-8 max-w-screen-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-heading font-semibold">
              Operações {empresaTravada ? `· ${empresaTravada.id_empresa}` : (grupoId ? `· ${grupoNumero || ""}` : "")}
            </h1>
            <InfoTooltip pagina="operacoes" chave="header" />
          </div>
          <p className="text-sm text-muted-foreground">
            {filtered.length} lançamentos · motor calcula sistema atual, IBS/CBS, transição, margem e caixa
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!hasEmpresas && (
            <span className="text-xs text-destructive">Cadastre uma empresa primeiro</span>
          )}
          <button
            onClick={() => { if (hasEmpresas) { setEditing("new"); setOpen(true); } }}
            disabled={!hasEmpresas}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Nova operação
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {empresaTravada ? (
          <span className="px-3 py-1.5 text-sm rounded-md border border-border bg-muted/40 text-muted-foreground">
            {empresaTravada.id_empresa} — {empresaTravada.razao_social}
          </span>
        ) : (
          <select value={filterEmpresa} onChange={(e) => setFilterEmpresa(e.target.value)} className="px-3 py-1.5 text-sm rounded-md border border-border bg-background">
            <option value="">Todas as empresas</option>
            {(grupoEmpresaIds ? empresas.filter(e => grupoEmpresaIds.has(e.id_empresa)) : empresas).map((em) => <option key={em.id} value={em.id_empresa}>{em.id_empresa} — {em.razao_social}</option>)}
          </select>
        )}
        <select value={filterAno} onChange={(e) => setFilterAno(e.target.value)} className="px-3 py-1.5 text-sm rounded-md border border-border bg-background">
          <option value="">Todos os anos</option>
          {anos.map((a) => <option key={a} value={String(a)}>{a}</option>)}
        </select>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2.5 pl-4 pr-3 font-medium w-8"></th>
                <th className="py-2.5 pr-4 font-medium">ID</th>
                <th className="py-2.5 pr-4 font-medium">Empresa</th>
                <th className="py-2.5 pr-4 font-medium">Ano</th>
                <th className="py-2.5 pr-4 font-medium">Dir.</th>
                <th className="py-2.5 pr-4 font-medium">Descrição</th>
                <th className="py-2.5 pr-4 font-medium text-right">Valor bruto</th>
                <th className="py-2.5 pr-4 font-medium text-right">Trib. atuais</th>
                <th className="py-2.5 pr-4 font-medium text-right">IBS/CBS</th>
                <th className="py-2.5 pr-4 font-medium text-right">Carga trans.</th>
                <th className="py-2.5 pr-4 font-medium text-right">Funding</th>
                <th className="py-2.5 pr-4 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((oc) => {
                const op = oc.op;
                const isOpen = expanded === op.id;
                return (
                  <React.Fragment key={op.id}>
                    <tr
                      className="border-t border-border/50 hover:bg-muted/20 cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : op.id)}
                    >
                      <td className="py-2.5 pl-4 pr-3 text-muted-foreground">
                        <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      </td>
                      <td className="py-2.5 pr-4 font-medium">{op.id_operacao}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">
                        {empresaMap.get(op.empresa_id)?.id_empresa || op.empresa_id}
                      </td>
                      <td className="py-2.5 pr-4">{op.ano}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${op.direcao === "Entrada" ? "bg-chart-2/15 text-chart-2" : "bg-chart-1/15 text-chart-1"}`}>
                          {op.direcao}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 max-w-[220px] truncate text-muted-foreground">{op.descricao}</td>
                      <td className="py-2.5 pr-4 text-right">{BRL(op.valor_bruto)}</td>
                      <td className="py-2.5 pr-4 text-right">{BRL(oc.sistemaAtual.tributosLiquidos)}</td>
                      <td className="py-2.5 pr-4 text-right">{BRL(oc.ibsCbs.ibsCbsLiquido)}</td>
                      <td className="py-2.5 pr-4 text-right">{BRL(oc.transicao.cargaTotalTransicao)}</td>
                      <td className="py-2.5 pr-4 text-right text-destructive">{BRL(oc.caixa.fundingTributario)}</td>
                      <td className="py-2.5 pr-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <button onClick={() => { setEditing(op); setOpen(true); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(op)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-border/50">
                        <td colSpan={12} className="p-4 bg-muted/20">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <OperacaoCalcDetail calc={oc} />
                            <div className="space-y-2 text-sm">
                              <div><span className="text-muted-foreground">cClassTrib:</span> {op.c_class_trib} · <span className="text-muted-foreground">CST:</span> {op.cst_ibs_cbs}</div>
                              <div><span className="text-muted-foreground">NCM:</span> {op.ncm || "—"} · <span className="text-muted-foreground">CFOP:</span> {op.cfop_servico || "—"}</div>
                              <div><span className="text-muted-foreground">UF origem→destino:</span> {op.uf_origem} → {op.uf_destino}</div>
                              {op.observacao_dfe && <div className="text-muted-foreground text-xs pt-2 border-t border-border/40">{op.observacao_dfe}</div>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-muted-foreground">
                    Nenhuma operação encontrada. Clique em “Nova operação”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Nova operação" : `Editar ${editing?.id_operacao || ""}`}</DialogTitle>
          </DialogHeader>
          <OperacaoForm
            initial={editing === "new" ? (empresaTravada ? { empresa_id: empresaTravada.id_empresa } : {}) : editing}
            empresas={empresaTravada ? [empresaTravada] : empresas}
            onSave={handleSave}
            onCancel={() => { setOpen(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}