import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { arquivarCliente, CHAVES_APOS_ARQUIVAR, TEXTO_ARQUIVAR } from "@/lib/arquivamento";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Archive, Building2 } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";
import PageHeader from "@/components/PageHeader";
import LimparDadosButton from "@/components/LimparDadosButton";
import EmpresaFormDialog from "@/components/empresas/EmpresaFormDialog";
import TituloPagina from "@/components/TituloPagina";
import TabelaPadrao from "@/components/TabelaPadrao";
import { useConfirmar } from "@/components/ConfirmProvider";

export default function EmpresasPage() {
  const confirmar = useConfirmar();
  const { id: grupoId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: grupo } = useQuery({
    queryKey: ["grupo", grupoId],
    queryFn: () => api.entities.Grupo.get(grupoId),
    enabled: !!grupoId,
  });
  const grupoNumero = grupo?.numero;
  const { data, isLoading } = useQuery({
    queryKey: ["empresas", grupoNumero],
    queryFn: () => grupoNumero
      ? api.entities.Empresa.filter({ grupo: grupoNumero })
      : api.entities.Empresa.list(),
    enabled: grupoNumero !== undefined,
  });
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const del = async (em) => {
    if (!(await confirmar({ titulo: `Arquivar ${em.razao_social}?`, descricao: TEXTO_ARQUIVAR, rotulo: "Arquivar" }))) return;
    await arquivarCliente(em.id);
    CHAVES_APOS_ARQUIVAR.forEach((k) => qc.invalidateQueries({ queryKey: k }));
  };

  const start = (em) => { setEditing(em); setOpen(true); };

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: "DataHub", to: "/" },
          { label: grupo?.nome || "Grupo", to: `/workroom/${grupoId}` },
          { label: "Empresas" },
        ]}
      />
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <TituloPagina icon={Building2} ajuda={<InfoTooltip pagina="empresas" chave="header" />}>Empresas do Grupo</TituloPagina>
          <p className="text-sm text-muted-foreground">Vinculadas a {grupoNumero || "—"} · clique numa empresa para abrir o workspace dela</p>
        </div>
        <div className="flex items-center gap-3">
          {grupoId && (
            <LimparDadosButton
              tela="empresas" grupoId={grupoId} rotulo="Limpar empresas"
              oQueApaga="Apaga todas as empresas deste workroom e tudo ligado a elas: operações, regras de CFOP, simulações salvas e o vínculo dos itens de XML (os itens ficam sem empresa)."
            />
          )}
          <button onClick={() => start("new")} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Nova empresa
          </button>
        </div>
      </div>

      <TabelaPadrao id="empresas-do-grupo" ariaLabel="Empresas" linhas={data || []} vazio="Nenhuma empresa cadastrada."
        aoClicarLinha={grupoId ? (em) => navigate(`/workroom/${grupoId}/empresas/${em.id}`) : undefined}
        colunas={[
          { chave: "id_empresa", rotulo: "ID", render: (em) => <span className="font-medium">{em.id_empresa}</span> },
          { chave: "razao_social", rotulo: "Razão social" },
          { chave: "grupo", rotulo: "Grupo", render: (em) => <span className="text-muted-foreground">{em.grupo}</span> },
          { chave: "regime_atual", rotulo: "Regime", render: (em) => <span className="text-muted-foreground">{em.regime_atual}</span> },
          { chave: "setor", rotulo: "Setor", render: (em) => <span className="text-muted-foreground">{em.setor}</span> },
          { chave: "uf", rotulo: "UF" },
          { chave: "contribuinte_ibs_cbs", rotulo: "IBS/CBS", render: (em) => <span className={`text-xs px-1.5 py-0.5 rounded ${em.contribuinte_ibs_cbs === "Sim" ? "bg-chart-2/15 text-chart-2" : "bg-muted text-muted-foreground"}`}>{em.contribuinte_ibs_cbs}</span> },
          { chave: "status", rotulo: "Status", render: (em) => <span className="text-muted-foreground">{em.status}</span> },
        ]}
        documentos={(em) => (
          <div className="flex justify-end gap-1">
            <button type="button" onClick={() => start(em)} aria-label={`Editar ${em.razao_social}`} title="Editar" className="p-1 rounded hover:bg-muted text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => del(em)} aria-label={`Arquivar ${em.razao_social}`} title="Arquivar" className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Archive className="w-3.5 h-3.5" /></button>
          </div>
        )}
      />

      <EmpresaFormDialog open={open} onOpenChange={setOpen} editing={editing} grupoNumero={grupoNumero} />
    </div>
    </div>
  );
}
