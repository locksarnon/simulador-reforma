import React, { useState, useMemo } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useSimuladorData } from "@/hooks/useSimuladorData";
import { BRL } from "@/lib/format";
import OperacaoForm from "@/components/operacoes/OperacaoForm";
import OperacaoCalcDetail from "@/components/operacoes/OperacaoCalcDetail";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ChevronRight, ArrowLeftRight } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import LimparDadosButton from "@/components/LimparDadosButton";
import TituloPagina from "@/components/TituloPagina";
import { useConfirmar } from "@/components/ConfirmProvider";

export default function OperacoesPage() {
  const confirmar = useConfirmar();
  const { id: grupoId } = useParams();
  // Quando esta página é renderizada dentro de EmpresaWorkroom (rota
  // .../empresas/:empresaId/operacoes), o Outlet já traz a empresa — trava o
  // filtro nela em vez de misturar todas as empresas do grupo.
  const { empresa: empresaTravada } = useOutletContext() || {};
  const { operacoesCalculadas, empresas, transicao, classTrib, cenarioAtivo, config, isLoading } = useSimuladorData();
  const qc = useQueryClient();
  const { data: grupo } = useQuery({
    queryKey: ["grupo", grupoId],
    queryFn: () => api.entities.Grupo.get(grupoId),
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
  // Catálogo de CST (descrição oficial), para explicar o código que veio no XML.
  const { data: cstLista = [] } = useQuery({ queryKey: ["cst-ibs-cbs"], queryFn: () => api.entities.CstIbsCbs.list(), staleTime: 10 * 60_000 });
  const cstMap = useMemo(() => new Map(cstLista.map((c) => [String(c.cst), c])), [cstLista]);
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
      await api.entities.Operacao.create(form);
    } else {
      await api.entities.Operacao.update(editing.id, form);
    }
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["operacoes"] });
  };

  const handleDelete = async (op) => {
    if (!(await confirmar({ titulo: "Confirmar exclusão", descricao: `Excluir a operação ${op.id_operacao}?`, rotulo: "Excluir" }))) return;
    await api.entities.Operacao.delete(op.id);
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
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <TituloPagina icon={ArrowLeftRight} ajuda={<InfoTooltip pagina="operacoes" chave="header" />}>
              Operações {empresaTravada ? `· ${empresaTravada.id_empresa}` : (grupoId ? `· ${grupoNumero || ""}` : "")}
            </TituloPagina>
          <p className="text-sm text-muted-foreground">
            {filtered.length} lançamentos · motor calcula sistema atual, IBS/CBS, transição, margem e caixa
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!hasEmpresas && (
            <span className="text-xs text-destructive">Cadastre uma empresa primeiro</span>
          )}
          {grupoId && (
            <LimparDadosButton
              tela="operacoes" grupoId={grupoId} empresaId={empresaTravada?.id}
              rotulo={empresaTravada ? "Limpar operações desta empresa" : "Limpar operações"}
              oQueApaga={empresaTravada
                ? `Apaga todas as operações de ${empresaTravada.razao_social}. Itens de XML ligados a elas voltam a ficar não confirmados.`
                : "Apaga todas as operações das empresas deste workroom. Itens de XML ligados a elas voltam a ficar não confirmados."}
            />
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

      <TabelaPadrao id="operacoes" ariaLabel="Operações" linhas={filtered} chaveLinha={(oc) => oc.op.id}
        vazio="Nenhuma operação encontrada. Clique em “Nova operação”."
        aoClicarLinha={(oc) => setExpanded(expanded === oc.op.id ? null : oc.op.id)}
        destaqueLinha={(oc) => (expanded === oc.op.id ? "bg-primary/5" : "")}
        colunas={[
          { chave: "id_operacao", rotulo: "ID", valor: (oc) => oc.op.id_operacao, render: (oc) => <span className="inline-flex items-center gap-1 font-medium"><ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded === oc.op.id ? "rotate-90" : ""}`} />{oc.op.id_operacao}</span> },
          { chave: "empresa", rotulo: "Empresa", valor: (oc) => empresaMap.get(oc.op.empresa_id)?.id_empresa || oc.op.empresa_id, render: (oc) => <span className="text-muted-foreground">{empresaMap.get(oc.op.empresa_id)?.id_empresa || oc.op.empresa_id}</span> },
          { chave: "ano", rotulo: "Ano", alinhar: "direita", valor: (oc) => Number(oc.op.ano) || null, render: (oc) => oc.op.ano },
          { chave: "direcao", rotulo: "Dir.", valor: (oc) => oc.op.direcao, render: (oc) => <span className={`text-xs px-1.5 py-0.5 rounded ${oc.op.direcao === "Entrada" ? "bg-chart-2/15 text-chart-2" : "bg-chart-1/15 text-chart-1"}`}>{oc.op.direcao}</span> },
          { chave: "descricao", rotulo: "Descrição", valor: (oc) => oc.op.descricao || "", render: (oc) => <span className="text-muted-foreground">{oc.op.descricao}</span> },
          { chave: "valor_bruto", rotulo: "Valor bruto", alinhar: "direita", valor: (oc) => oc.op.valor_bruto, render: (oc) => BRL(oc.op.valor_bruto) },
          { chave: "tributos", rotulo: "Trib. atuais", alinhar: "direita", valor: (oc) => oc.sistemaAtual.tributosLiquidos, render: (oc) => BRL(oc.sistemaAtual.tributosLiquidos) },
          { chave: "ibs_cbs", rotulo: "IBS/CBS", alinhar: "direita", valor: (oc) => oc.ibsCbs.ibsCbsLiquido, render: (oc) => BRL(oc.ibsCbs.ibsCbsLiquido) },
          { chave: "carga", rotulo: "Carga trans.", alinhar: "direita", valor: (oc) => oc.transicao.cargaTotalTransicao, render: (oc) => BRL(oc.transicao.cargaTotalTransicao) },
          { chave: "funding", rotulo: "Funding", alinhar: "direita", valor: (oc) => oc.caixa.fundingTributario, render: (oc) => <span className="text-destructive">{BRL(oc.caixa.fundingTributario)}</span> },
        ]}
        documentos={(oc) => (
          <div className="flex justify-end gap-1">
            <button type="button" onClick={() => { setEditing(oc.op); setOpen(true); }} aria-label={`Editar ${oc.op.id_operacao}`} title="Editar" className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => handleDelete(oc.op)} aria-label={`Excluir ${oc.op.id_operacao}`} title="Excluir" className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      />
      {/* Detalhe da operação clicada, logo abaixo da tabela. */}
      {filtered.filter((oc) => oc.op.id === expanded).map((oc) => {
                        const op = oc.op;
                        return (
                      <section key={op.id} aria-label={`Detalhe da operação ${op.id_operacao}`} className="rounded-lg border border-border bg-muted/20 p-4">
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <h3 className="text-sm font-semibold">Operação {op.id_operacao}</h3>
                            <button type="button" onClick={() => setExpanded(null)} className="text-xs text-muted-foreground hover:text-foreground">Fechar</button>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <OperacaoCalcDetail calc={oc} />
                            <div className="space-y-2 text-sm">
                              <div><span className="text-muted-foreground">cClassTrib:</span> {op.c_class_trib} · <span className="text-muted-foreground">CST:</span> {op.cst_ibs_cbs}</div>
                              {classTribMap.get(op.c_class_trib) && (
                                <div className="text-xs rounded-md border border-border/60 p-2 space-y-0.5">
                                  <p><span className="font-medium">cClassTrib {op.c_class_trib}:</span> {classTribMap.get(op.c_class_trib).descricao_oficial}</p>
                                  <p className="text-muted-foreground">Redução de IBS {((classTribMap.get(op.c_class_trib).pct_reducao_ibs || 0) * 100).toFixed(0)}% · CBS {((classTribMap.get(op.c_class_trib).pct_reducao_cbs || 0) * 100).toFixed(0)}% (catálogo {classTribMap.get(op.c_class_trib).fonte ? "oficial" : "do sistema"})</p>
                                </div>
                              )}
                              {cstMap.get(String(op.cst_ibs_cbs)) && (
                                <div className="text-xs rounded-md border border-border/60 p-2">
                                  <span className="font-medium">CST {op.cst_ibs_cbs}:</span> {cstMap.get(String(op.cst_ibs_cbs)).descricao_oficial}
                                </div>
                              )}
                              <div><span className="text-muted-foreground">NCM:</span> {op.ncm || "—"} · <span className="text-muted-foreground">CFOP:</span> {op.cfop_servico || "—"}</div>
                              <div><span className="text-muted-foreground">UF origem→destino:</span> {op.uf_origem} → {op.uf_destino}</div>
                              {op.observacao_dfe && <div className="text-muted-foreground text-xs pt-2 border-t border-border/40">{op.observacao_dfe}</div>}
                            </div>
                          </div>
                      </section>
                        );
      })}

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