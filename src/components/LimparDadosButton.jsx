import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Botão "Limpar dados" para recomeçar um teste. Sempre pede a prévia ao
 * servidor (quantos registros/arquivos vão embora) e só apaga depois que a
 * pessoa digita a frase de confirmação — o servidor confere a frase de novo.
 *
 * tela: 'importacao-xml' | 'operacoes' | 'empresas' | 'workroom' | 'validacoes' | 'analises' (lista "Análises salvas" da empresa) | 'saneamento' (projetos e bases da empresa)
 * escopo: { grupo_id, empresa_id? } — o servidor nunca apaga fora dele ('analises' e 'saneamento' exigem a empresa).
 */
export default function LimparDadosButton({ tela, grupoId, empresaId, rotulo = "Limpar dados", oQueApaga, className = "" }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [previa, setPrevia] = useState(null);
  const [frase, setFrase] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [apagando, setApagando] = useState(false);

  const corpo = { tela, grupo_id: grupoId, empresa_id: empresaId };

  const abrir = async () => {
    setFrase(""); setPrevia(null); setAberto(true); setCarregando(true);
    try {
      setPrevia(await api.post("/limpeza/previa", corpo));
    } catch (e) {
      toast({ title: "Não foi possível verificar o que será apagado", description: e.message, variant: "destructive" });
      setAberto(false);
    } finally {
      setCarregando(false);
    }
  };

  const apagar = async () => {
    setApagando(true);
    try {
      const r = await api.post("/limpeza/executar", { ...corpo, confirmacao: frase });
      qc.invalidateQueries();
      toast({ title: "Dados apagados", description: r.arquivos_com_falha ? `${r.arquivos_com_falha} arquivo(s) não saíram do armazenamento.` : undefined });
      setAberto(false);
    } catch (e) {
      toast({ title: "Não foi possível apagar", description: e.message, variant: "destructive" });
    } finally {
      setApagando(false);
    }
  };

  const itens = previa ? Object.entries(previa.contagens) : [];
  const fraseOk = previa && frase.trim().toUpperCase() === previa.frase;

  return (
    <>
      <button type="button" onClick={abrir} className={`inline-flex items-center gap-2 px-3 py-2 rounded-md border border-destructive/40 text-destructive text-sm hover:bg-destructive/5 ${className}`}>
        <Trash2 className="w-4 h-4" /> {rotulo}
      </button>
      <AlertDialog open={aberto} onOpenChange={(v) => !apagando && setAberto(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar dados para recomeçar o teste?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                {oQueApaga && <p>{oQueApaga}</p>}
                {carregando && <p className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Contando o que será apagado…</p>}
                {previa && itens.length === 0 && <p className="font-medium text-foreground">Não há nada para apagar aqui.</p>}
                {itens.length > 0 && (
                  <ul className="rounded-md border border-border bg-muted/30 p-3 space-y-1 text-foreground">
                    {itens.map(([k, v]) => <li key={k} className="flex justify-between gap-4"><span>{k}</span><span className="tabular-nums font-medium">{v}</span></li>)}
                  </ul>
                )}
                {itens.length > 0 && (
                  <>
                    <p className="font-medium text-destructive">Esta ação não pode ser desfeita.</p>
                    <label className="block text-foreground">
                      Digite <b>{previa.frase}</b> para confirmar
                      <input value={frase} onChange={(e) => setFrase(e.target.value)} autoFocus className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm" />
                    </label>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <button type="button" disabled={apagando} onClick={() => setAberto(false)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted disabled:opacity-50">Cancelar</button>
            {itens.length > 0 && (
              <button type="button" disabled={!fraseOk || apagando} onClick={apagar} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50">
                {apagando && <Loader2 className="w-4 h-4 animate-spin" />} Apagar definitivamente
              </button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
