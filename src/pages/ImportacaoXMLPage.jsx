import React, { useState, useMemo } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, AlertTriangle, Download, FileSearch, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import InfoTooltip from "@/components/InfoTooltip";
import PageHeader from "@/components/PageHeader";
import { base44 } from "@/api/base44Client";
import { useImportacaoXML } from "@/hooks/useImportacaoXML";
import DropzoneXML from "@/components/importacao/DropzoneXML";
import ArquivosLog from "@/components/importacao/ArquivosLog";
import StagingTable from "@/components/importacao/StagingTable";
import ValidacaoDrawer from "@/components/importacao/ValidacaoDrawer";

export default function ImportacaoXMLPage() {
  const { id } = useParams();
  // Quando aninhada em EmpresaWorkroom (.../empresas/:empresaId/importacao-xml),
  // o Outlet traz a empresa — a "trava" pedida: por padrão só mostra os itens
  // dela, escondendo o resto do grupo atrás de um toggle explícito.
  const { grupo: grupoCtx, empresa: empresaTravada } = useOutletContext() || {};
  const { data: grupo } = useQuery({
    queryKey: ["grupo", id],
    queryFn: () => base44.entities.Grupo.get(id),
    enabled: !!id && !grupoCtx,
  });
  const grupoNumero = grupoCtx?.numero || grupo?.numero;
  const grupoNome = grupoCtx?.nome || grupo?.nome;
  const { data: empresasDoGrupo = [] } = useQuery({
    queryKey: ["empresas", grupoNumero],
    queryFn: () => base44.entities.Empresa.filter({ grupo: grupoNumero }),
    enabled: !!grupoNumero,
  });
  const empresaMap = useMemo(() => new Map(empresasDoGrupo.map((e) => [e.id_empresa, e])), [empresasDoGrupo]);
  const [mostrarOutras, setMostrarOutras] = useState(false);

  const imp = useImportacaoXML(id);
  const [selectedIds, setSelectedIds] = useState([]);
  const [drawerItem, setDrawerItem] = useState(null);
  const [drawerCamada, setDrawerCamada] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [reprocessando, setReprocessando] = useState(false);

  const itensVisiveis = useMemo(() => {
    if (!empresaTravada || mostrarOutras) return imp.itens;
    return imp.itens.filter((it) => it.empresa_id === empresaTravada.id_empresa);
  }, [imp.itens, empresaTravada, mostrarOutras]);
  const outrasCount = useMemo(() => {
    if (!empresaTravada) return 0;
    return imp.itens.filter((it) => it.empresa_id && it.empresa_id !== empresaTravada.id_empresa).length;
  }, [imp.itens, empresaTravada]);

  const isProcessing = imp.lote?.status === "RECEBIDO" || imp.lote?.status === "PROCESSANDO";
  const temFalha = imp.lote?.status === "FALHOU" || imp.lote?.status === "PROCESSADO_COM_FALHAS";

  const handleReprocessar = async () => {
    setReprocessando(true);
    try {
      await imp.reprocessarLote();
    } finally {
      setReprocessando(false);
    }
  };

  const toggleSelect = (itemId, grupo) => {
    setSelectedIds((prev) => {
      if (grupo && grupo.length === 2) {
        // Intercompany: seleção vinculada.
        const allIds = grupo.map((g) => g.id);
        const allSelected = allIds.every((i) => prev.includes(i));
        if (allSelected) return prev.filter((i) => !allIds.includes(i));
        return [...new Set([...prev, ...allIds])];
      }
      if (prev.includes(itemId)) return prev.filter((i) => i !== itemId);
      return [...prev, itemId];
    });
  };

  const openDrawer = (item, camada) => {
    setDrawerItem(item);
    setDrawerCamada(camada);
  };

  const selecionaveis = useMemo(
    () => itensVisiveis.filter((it) => it.resultado_final === "IMPORTAVEL" || it.resultado_final === "IMPORTAVEL_COM_ALERTA"),
    [itensVisiveis]
  );
  const selecionadosItens = useMemo(
    () => selecionaveis.filter((it) => selectedIds.includes(it.id)),
    [selecionaveis, selectedIds]
  );
  const temAlertas = selecionadosItens.some((it) => it.resultado_final === "IMPORTAVEL_COM_ALERTA");

  const handleImportar = async () => {
    if (temAlertas && !confirmOpen) {
      setConfirmOpen(true);
      return;
    }
    setConfirmando(true);
    try {
      await imp.confirmarImportacao(selectedIds);
      setSelectedIds([]);
      setConfirmOpen(false);
    } finally {
      setConfirmando(false);
    }
  };

  const contadores = useMemo(() => {
    const c = { importaveis: 0, alerta: 0, bloqueados: 0, duplicados: 0, cancelados: 0 };
    for (const it of itensVisiveis) {
      if (it.resultado_final === "IMPORTAVEL") c.importaveis++;
      else if (it.resultado_final === "IMPORTAVEL_COM_ALERTA") c.alerta++;
      else if (it.resultado_final === "BLOQUEADO") c.bloqueados++;
      else if (it.resultado_final === "DUPLICADO") c.duplicados++;
      else if (it.resultado_final === "CANCELADO") c.cancelados++;
    }
    return c;
  }, [itensVisiveis]);

  return (
    <div>
      {/* Só mostra o próprio cabeçalho quando alcançada direto pelo grupo —
          dentro do workspace de uma empresa, o EmpresaWorkroom já mostra um. */}
      {!empresaTravada && (
        <PageHeader
          crumbs={[
            { label: "DataHub", to: "/" },
            { label: grupoNome || "Grupo", to: `/workroom/${id}` },
            { label: "Importação XML" },
          ]}
        />
      )}
    <div className="px-6 lg:px-8 py-6 pb-12">
      <div className="max-w-screen-2xl mx-auto space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-heading font-semibold text-base">
              Importação XML {empresaTravada ? `· ${empresaTravada.id_empresa}` : ""}
            </h2>
            <InfoTooltip pagina="importacao" chave="header" />
          </div>
          <p className="text-sm text-muted-foreground">
            {empresaTravada
              ? `Notas em que ${empresaTravada.razao_social} aparece como emitente ou destinatária. O lote continua sendo do grupo — se houver transferência interna com outra empresa, ela fica escondida por padrão.`
              : "Upload de NF-e/NFC-e com processamento backend, 4 camadas de validação e staging auditável."}
          </p>
        </div>

        {empresaTravada && outrasCount > 0 && (
          <button
            onClick={() => setMostrarOutras((v) => !v)}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5 w-fit"
          >
            <Users className="w-3.5 h-3.5" />
            {mostrarOutras
              ? "Ocultar operações de outras empresas do grupo"
              : `Mostrar também ${outrasCount} operação(ões) de outras empresas deste grupo (transferência interna)`}
          </button>
        )}

        {/* Resumo do lote */}
        {imp.lote && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <ResumoCard label="Arquivos válidos" value={imp.lote.arquivos_validos || 0} icon={CheckCircle2} color="text-emerald-500" />
            <ResumoCard label="Importáveis" value={contadores.importaveis} icon={CheckCircle2} color="text-emerald-500" />
            <ResumoCard label="Com alerta" value={contadores.alerta} icon={AlertTriangle} color="text-amber-500" />
            <ResumoCard label="Bloqueados" value={contadores.bloqueados} icon={AlertTriangle} color="text-red-500" />
            <ResumoCard label="Duplicados" value={contadores.duplicados} icon={FileSearch} color="text-blue-500" />
            <ResumoCard label="Cancelados" value={contadores.cancelados} icon={AlertTriangle} color="text-gray-500" />
          </div>
        )}

        {/* Status de processamento */}
        {isProcessing && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-primary/5 border border-primary/20">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
            <p className="text-sm text-foreground">
              Processando lote... {imp.lote?.status === "PROCESSANDO" ? "Validando arquivos e itens." : "Aguardando início."}
            </p>
          </div>
        )}

        {temFalha && (
          <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
            <p className="text-sm text-foreground">
              Este lote teve arquivos que falharam ({imp.lote.arquivos_invalidos || 0} de {imp.lote.total_arquivos || 0}).
              Reprocessar retoma só o que falhou, sem reenviar os arquivos que já foram concluídos.
            </p>
            <Button onClick={handleReprocessar} disabled={reprocessando} variant="outline" className="gap-2 shrink-0">
              {reprocessando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Reprocessar
            </Button>
          </div>
        )}

        {imp.error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-xs text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{imp.error}</p>
          </div>
        )}

        <DropzoneXML
          files={imp.selectedFiles}
          onAddFiles={imp.addFiles}
          onRemoveFile={imp.removeFile}
          onClear={imp.clearFiles}
          uploading={imp.uploading}
          uploadProgress={imp.uploadProgress}
          onEnviar={imp.enviarProcessamento}
          disabled={isProcessing}
        />

        {imp.arquivos.length > 0 && <ArquivosLog arquivos={imp.arquivos} />}

        {itensVisiveis.length > 0 && (
          <>
            <StagingTable
              itens={itensVisiveis}
              empresaMap={empresaMap}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onOpenDrawer={openDrawer}
            />
            <div className="flex justify-end">
              <Button
                onClick={handleImportar}
                disabled={selecionadosItens.length === 0 || confirmando}
                className="gap-2"
              >
                {confirmando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Importar selecionados ({selecionadosItens.length})
              </Button>
            </div>
          </>
        )}

        {/* Modal de confirmação para alertas */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar importação com alertas</DialogTitle>
              <DialogDescription>
                Existem {selecionadosItens.filter((i) => i.resultado_final === "IMPORTAVEL_COM_ALERTA").length} item(ns) com alertas não bloqueantes.
                Deseja continuar a importação?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={confirmando}>
                Cancelar
              </Button>
              <Button onClick={handleImportar} disabled={confirmando} className="gap-2">
                {confirmando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirmar importação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ValidacaoDrawer
          item={drawerItem}
          camada={drawerCamada}
          open={!!drawerItem}
          onClose={() => setDrawerItem(null)}
        />
      </div>
    </div>
    </div>
  );
}

function ResumoCard({ label, value, icon: Icon, color }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-lg font-heading font-semibold tabular-nums">{value}</p>
    </div>
  );
}