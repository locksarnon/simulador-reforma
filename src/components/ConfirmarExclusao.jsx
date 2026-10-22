import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Confirmação de exclusão em janela própria. Não usa window.confirm: navegadores embutidos (apps, painéis) bloqueiam esse diálogo em silêncio e o
 * botão de excluir parece "não funcionar". Se a exclusão falhar, o motivo aparece dentro da janela, que continua aberta.
 *
 * onConfirmar: async; se lançar erro, a mensagem é mostrada. onFechar: chamado ao cancelar e depois de excluir com sucesso.
 */
export default function ConfirmarExclusao({ aberto, titulo, rotuloConfirmar = "Excluir", onFechar, onConfirmar, children }) {
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => { if (aberto) { setErro(""); setExecutando(false); } }, [aberto]);

  const confirmar = async () => {
    setExecutando(true); setErro("");
    try { await onConfirmar(); onFechar(); }
    catch (e) { setErro(e?.message || "Não foi possível concluir."); }
    finally { setExecutando(false); }
  };

  return (
    <AlertDialog open={!!aberto} onOpenChange={(v) => { if (!v && !executando) onFechar(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription asChild><div className="space-y-3 text-sm text-muted-foreground">{children}</div></AlertDialogDescription>
        </AlertDialogHeader>
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <AlertDialogFooter>
          <button type="button" disabled={executando} onClick={onFechar} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50">Cancelar</button>
          <button type="button" disabled={executando} onClick={confirmar} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50">
            {executando && <Loader2 className="w-4 h-4 animate-spin" />} {rotuloConfirmar}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
