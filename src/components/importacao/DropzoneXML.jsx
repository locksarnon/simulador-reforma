import React, { useRef, useState } from "react";
import { UploadCloud, FileText, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import InfoTooltip from "@/components/InfoTooltip";

const MAX_FILES = 5000;

export default function DropzoneXML({ files, onAddFiles, onRemoveFile, onClear, uploading, uploadProgress, onEnviar, disabled }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (uploading || disabled) return;
    onAddFiles(e.dataTransfer.files);
  };

  const handleSelect = (e) => {
    if (uploading || disabled) return;
    onAddFiles(e.target.files);
    e.target.value = "";
  };

  const podeEnviar = files.length > 0 && !uploading && !disabled;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-heading font-medium text-sm">Upload de XML (NF-e / NFC-e)</h3>
        <InfoTooltip pagina="importacao" chave="header" />
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xml"
          multiple
          onChange={handleSelect}
          className="hidden"
        />
        <UploadCloud className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-foreground font-medium">
          Arraste arquivos .xml aqui ou clique para selecionar
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Até {MAX_FILES.toLocaleString("pt-BR")} arquivos · 2MB por arquivo · Processamento seguro no backend
        </p>
      </div>

      {uploading && uploadProgress.total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Enviando arquivos para processamento...</span>
            <span className="font-medium">{uploadProgress.current} / {uploadProgress.total}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{files.length} arquivo(s) selecionado(s)</p>
            <button onClick={onClear} className="text-xs text-muted-foreground hover:text-destructive">
              Limpar todos
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5">
            {files.map((f, idx) => (
              <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-xs">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate font-medium">{f.name}</span>
                <span className="text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveFile(idx); }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onEnviar} disabled={!podeEnviar} className="gap-2">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {uploading ? "Enviando para processamento..." : "Enviar para processamento"}
        </Button>
      </div>
    </div>
  );
}