import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Confirmações do sistema em janela própria, no lugar de window.confirm.
 *
 * Por quê: o navegador embutido do app Claude (e outros painéis/webviews) bloqueia os diálogos nativos e devolve "não" na hora, sem mostrar nada —
 * qualquer botão "Excluir" que dependia de confirm() parecia não fazer nada. Esta janela funciona em qualquer navegador.
 *
 * Uso:  const confirmar = useConfirmar();
 *       if (!(await confirmar({ titulo: "Excluir o grupo?", descricao: "...", rotulo: "Excluir" }))) return;
 * (aceita também só um texto: await confirmar("Tem certeza?")). `perigoso: false` deixa o botão de confirmar na cor normal.
 */
const Contexto = createContext(null);

export function ConfirmProvider({ children }) {
  const [pedido, setPedido] = useState(null);
  const resolverRef = useRef(null);

  const confirmar = useCallback((opcoes) => new Promise((resolver) => {
    const o = typeof opcoes === "string" ? { descricao: opcoes } : (opcoes || {});
    resolverRef.current?.(false); // um pedido novo cancela o anterior
    resolverRef.current = resolver;
    setPedido({ titulo: o.titulo || "Confirmar", descricao: o.descricao || "", rotulo: o.rotulo || "Confirmar", perigoso: o.perigoso !== false });
  }), []);

  const responder = (valor) => {
    const r = resolverRef.current; resolverRef.current = null; setPedido(null); r?.(valor);
  };

  return (
    <Contexto.Provider value={confirmar}>
      {children}
      <AlertDialog open={!!pedido} onOpenChange={(v) => { if (!v) responder(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pedido?.titulo}</AlertDialogTitle>
            <AlertDialogDescription asChild><div className="text-sm text-muted-foreground whitespace-pre-line">{pedido?.descricao}</div></AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <button type="button" onClick={() => responder(false)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted">Cancelar</button>
            <button type="button" onClick={() => responder(true)} className={`px-4 py-2 rounded-md text-sm font-medium ${pedido?.perigoso ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>{pedido?.rotulo}</button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Contexto.Provider>
  );
}

/** Devolve a função de confirmação. Sem o provedor (ex.: teste isolado de um componente), cai no diálogo nativo. */
export function useConfirmar() {
  const confirmar = useContext(Contexto);
  return confirmar || ((opcoes) => Promise.resolve(window.confirm(typeof opcoes === "string" ? opcoes : (opcoes?.descricao || opcoes?.titulo || "Confirmar?"))));
}
