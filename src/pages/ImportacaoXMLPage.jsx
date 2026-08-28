import React, { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CheckCircle2, AlertTriangle, Download, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import InfoTooltip from "@/components/InfoTooltip";
import { useImportacaoXML } from "@/hooks/useImportacaoXML";
import DropzoneXML from "@/components/importacao/DropzoneXML";
import ArquivosLog from "@/components/importacao/ArquivosLog";
import StagingTable from "@/components/importacao/StagingTable";
import ValidacaoDrawer from "@/components/importacao/ValidacaoDrawer";

export default function ImportacaoXMLPage() {
  const { id } = useParams();
  const imp = useImportacaoXML(id);
  const [selectedIds, setSelectedIds] = useState([]);
  const [drawerItem, setDrawerItem] = useState(null);
  const [drawerCamada, setDrawerCamada] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const isProcessing = imp.lote?.status === "RECEBIDO" || imp.lote?.status === "PROCESSANDO";

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
    () => imp.itens.filter((it) => it.resultado_final === "IMPORTAVEL" || it.resultado_final === "IMPORTAVEL_COM_ALERTA"),
    [imp.itens]
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
    for (const it of imp.itens) {
      if (it.resultado_final === "IMPORTAVEL") c.importaveis++;
      else if (it.resultado_final === "IMPORTAVEL_COM_ALERTA") c.alerta++;
      else if (it.resultado_final === "BLOQUEADO") c.bloqueados++;
      else if (it.resultado_final === "DUPLICADO") c.duplicados++;
      else if (it.resultado_final === "CANCELADO") c.cancelados++;
    }
    return c;
  }, [imp.itens]);

  return (
    <div className="px-6 lg:px-8 pb-12">
      <div className="max-w-7xl mx-auto space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-heading font-semibold text-base">Importação XML — Validador DF-e</h2>
            <InfoTooltip pagina="importacao" chave="header" />
          </div>
          <p className="text-sm text-muted-foreground">
            Upload de NF-e/NFC-e com processamento backend, 4 camadas de validação e staging auditável.
          </p>
        </div>

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

        {imp.itens.length > 0 && (
          <>
            <StagingTable
              itens={imp.itens}
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