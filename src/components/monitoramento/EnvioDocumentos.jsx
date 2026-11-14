import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Mail } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const LIMITE_PADRAO = 18 * 1024 * 1024;
/** Tamanho em KB/MB para a tela. Relatório do InTAX (gerado na hora) não tem tamanho conhecido: estima 150 KB. */
export const ESTIMATIVA_RELATORIO = 150 * 1024;
export const tamanhoTexto = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/**
 * Barra dos documentos marcados: Baixar (ZIP) e Enviar por e-mail, com o total e o limite do e-mail à vista.
 * `marcados` = [{ item: { tipo, ... }, nome, tamanho }]. O envio e o download ficam registrados no histórico.
 */
export default function EnvioDocumentos({ empresaId, base: baseInformada, marcados, aoConcluir, invalidar = [] }) {
  const base = baseInformada || `/monitoramento/empresas/${empresaId}`;
  const qc = useQueryClient();
  const limite = useQuery({ queryKey: ["monitoramento", "limite-email"], queryFn: () => api.get("/monitoramento/documentos/limite-email"), staleTime: Infinity });
  const bytes = limite.data?.bytes || LIMITE_PADRAO;
  const total = marcados.reduce((s, m) => s + (m.tamanho ?? ESTIMATIVA_RELATORIO), 0);
  const passou = total > bytes;
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ para: "", assunto: "", mensagem: "" });
  const atualizar = () => { for (const k of invalidar) qc.invalidateQueries({ queryKey: k }); };
  const zip = useMutation({
    mutationFn: () => api.baixar("POST", `${base}/documentos/zip`, { body: { itens: marcados.map((m) => m.item) }, nome: "documentos.zip" }),
    onSuccess: () => { atualizar(); aoConcluir?.(); },
    onError: (e) => toast({ title: "Não foi possível baixar", description: e.message, variant: "destructive" }),
  });
  const enviar = useMutation({
    mutationFn: () => api.post(`${base}/documentos/email`, { ...f, itens: marcados.map((m) => m.item) }),
    onSuccess: (r) => { atualizar(); setAberto(false); aoConcluir?.(); toast({ title: "E-mail enviado", description: `${r.anexos} anexo(s) para ${r.para.join(", ")}.` }); },
    onError: (e) => toast({ title: "Não foi possível enviar", description: e.message, variant: "destructive" }),
  });
  if (!marcados.length) return <span className="text-xs text-muted-foreground">Marque os documentos para baixar ou enviar por e-mail.</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <span className={`tabular-nums ${passou ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}>{marcados.length} marcado(s) · {tamanhoTexto(total)} de {tamanhoTexto(bytes)} por e-mail</span>
      <button type="button" disabled={zip.isPending} onClick={() => zip.mutate()} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 hover:bg-muted disabled:opacity-60">{zip.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}Baixar (ZIP)</button>
      <button type="button" disabled={passou} title={passou ? "Acima do limite do e-mail: desmarque alguns ou baixe em ZIP" : undefined} onClick={() => setAberto(true)} className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 font-medium text-primary-foreground disabled:opacity-60"><Mail className="h-3.5 w-3.5" aria-hidden="true" />Enviar por e-mail</button>
      <Dialog open={aberto} onOpenChange={(v) => !enviar.isPending && setAberto(v)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar por e-mail</DialogTitle>
            <DialogDescription>{marcados.length} documento(s), {tamanhoTexto(total)} (limite {tamanhoTexto(bytes)}).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="block space-y-1"><span className="text-xs text-muted-foreground">Para (separe por vírgula)</span><input type="text" value={f.para} onChange={(e) => setF({ ...f, para: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2" placeholder="cliente@empresa.com.br" /></label>
            <label className="block space-y-1"><span className="text-xs text-muted-foreground">Assunto</span><input type="text" value={f.assunto} onChange={(e) => setF({ ...f, assunto: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2" placeholder="Documentos do cliente" /></label>
            <label className="block space-y-1"><span className="text-xs text-muted-foreground">Mensagem</span><textarea rows={3} value={f.mensagem} onChange={(e) => setF({ ...f, mensagem: e.target.value })} className="w-full rounded-md border border-input bg-background px-2 py-1.5" /></label>
            <ul className="max-h-32 overflow-y-auto rounded-md border border-border px-2 py-1 text-xs">
              {marcados.map((m, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{m.nome}</span><span className="shrink-0 tabular-nums text-muted-foreground">{m.tamanho != null ? tamanhoTexto(m.tamanho) : "~" + tamanhoTexto(ESTIMATIVA_RELATORIO)}</span></li>)}
            </ul>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setAberto(false)} disabled={enviar.isPending} className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted">Cancelar</button>
            <button type="button" onClick={() => enviar.mutate()} disabled={enviar.isPending || !f.para.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{enviar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Enviar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}
