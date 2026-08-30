import { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const MAX_FILES = 5000;
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const UPLOAD_CONCURRENCY = 10;

export function useImportacaoXML(grupoId) {
  const qc = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [loteId, setLoteId] = useState(null);
  const [error, setError] = useState(null);

  const addFiles = useCallback((files) => {
    setError(null);
    const valid = [];
    const errs = [];
    for (const f of Array.from(files)) {
      if (!f.name.toLowerCase().endsWith(".xml")) {
        errs.push(`${f.name}: extensão inválida (apenas .xml)`);
        continue;
      }
      if (f.size > MAX_SIZE) {
        errs.push(`${f.name}: excede 2MB`);
        continue;
      }
      valid.push(f);
    }
    if (errs.length) setError(errs.join("; "));
    if (valid.length) {
      setSelectedFiles((prev) => {
        const total = prev.length + valid.length;
        if (total > MAX_FILES) {
          setError(`Limite de ${MAX_FILES} arquivos excedido.`);
          return prev;
        }
        return [...prev, ...valid];
      });
    }
  }, []);

  const removeFile = useCallback((idx) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clearFiles = useCallback(() => setSelectedFiles([]), []);

  const enviarProcessamento = useCallback(async () => {
    if (!grupoId || selectedFiles.length === 0) return;
    setUploading(true);
    setError(null);
    setUploadProgress({ current: 0, total: selectedFiles.length });
    try {
      // 1. Upload dos arquivos para storage em paralelo (concurrency 10).
      const arquivosRefs = [];
      for (let i = 0; i < selectedFiles.length; i += UPLOAD_CONCURRENCY) {
        const batch = selectedFiles.slice(i, i + UPLOAD_CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (f) => {
            const { file_url, storage_key } = await base44.integrations.Core.UploadFile({ file: f });
            return { nome: f.name, file_url, storage_key, tamanho: f.size };
          })
        );
        arquivosRefs.push(...results);
        setUploadProgress({ current: Math.min(i + UPLOAD_CONCURRENCY, selectedFiles.length), total: selectedFiles.length });
      }

      // 2. Gera idempotency_key (UUID v4 client-side).
      const idempotency_key = crypto.randomUUID
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
          });

      // 3. Envia para processamento backend.
      const resp = await base44.functions.invoke("processarLoteXML", {
        grupo_id: grupoId,
        idempotency_key,
        arquivos: arquivosRefs,
      });
      setLoteId(resp.data.lote_id);
      setSelectedFiles([]);
      qc.invalidateQueries({ queryKey: ["lote-xml", resp.data.lote_id] });
    } catch (err) {
      setError(String(err?.response?.data?.error || err?.message || err));
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  }, [grupoId, selectedFiles, qc]);

  // Poll do lote.
  const loteQuery = useQuery({
    queryKey: ["lote-xml", loteId],
    queryFn: () => base44.entities.ImportacaoXMLLote.get(loteId),
    enabled: !!loteId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "RECEBIDO" || status === "PROCESSANDO" ? 2000 : false;
    },
  });

  const arquivosQuery = useQuery({
    queryKey: ["arquivos-xml", loteId],
    queryFn: () => base44.entities.ImportacaoXMLArquivo.filter({ lote_id: loteId }),
    enabled: !!loteId && loteQuery.data?.status !== "RECEBIDO" && loteQuery.data?.status !== "PROCESSANDO",
  });

  const itensQuery = useQuery({
    queryKey: ["itens-xml", loteId],
    queryFn: () => base44.entities.ImportacaoXMLItem.filter({ lote_id: loteId }),
    enabled: !!loteId && loteQuery.data?.status !== "RECEBIDO" && loteQuery.data?.status !== "PROCESSANDO",
  });

  const confirmarImportacao = useCallback(async (perspectivasIds) => {
    const resp = await base44.functions.invoke("confirmarImportacaoXML", {
      lote_id: loteId,
      perspectivas_ids: perspectivasIds,
    });
    qc.invalidateQueries({ queryKey: ["itens-xml", loteId] });
    qc.invalidateQueries({ queryKey: ["lote-xml", loteId] });
    qc.invalidateQueries({ queryKey: ["operacoes"] });
    return resp.data;
  }, [loteId, qc]);

  // Retoma um lote que ficou FALHOU/PROCESSADO_COM_FALHAS sem precisar
  // reenviar os arquivos — o backend re-assina as URLs a partir da
  // storage_key já salva e reprocessa só o que não deu certo.
  const reprocessarLote = useCallback(async (idDoLote) => {
    const alvo = idDoLote || loteId;
    const resp = await base44.functions.invoke("reprocessarLoteXML", { lote_id: alvo });
    qc.invalidateQueries({ queryKey: ["lote-xml", alvo] });
    qc.invalidateQueries({ queryKey: ["arquivos-xml", alvo] });
    return resp.data;
  }, [loteId, qc]);

  return {
    selectedFiles, addFiles, removeFile, clearFiles,
    uploading, uploadProgress, enviarProcessamento, error,
    loteId, lote: loteQuery.data, loteLoading: loteQuery.isLoading,
    arquivos: arquivosQuery.data || [], itens: itensQuery.data || [],
    confirmarImportacao, reprocessarLote,
  };
}