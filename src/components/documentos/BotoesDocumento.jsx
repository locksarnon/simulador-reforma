import { Download, Eye } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";

const falhar = (t) => (e) => toast({ title: t, description: e.message, variant: "destructive" });

/** Botões Ver e Baixar de um arquivo (sempre no fim da linha). */
export default function BotoesDocumento({ url, nome, ver = true, rotulo }) {
  return (
    <span className="inline-flex items-center gap-1">
      {ver && <button type="button" onClick={() => api.visualizar("GET", `${url}${url.includes("?") ? "&" : "?"}ver=1`).catch(falhar("Não foi possível abrir"))} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-muted" aria-label={`Ver ${rotulo || nome}`} title="Visualizar"><Eye className="h-3 w-3" aria-hidden="true" /> Ver</button>}
      <button type="button" onClick={() => api.baixar("GET", url, { nome }).catch(falhar("Não foi possível baixar"))} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-muted" aria-label={`Baixar ${rotulo || nome}`} title="Baixar"><Download className="h-3 w-3" aria-hidden="true" /> Baixar</button>
    </span>
  );
}
