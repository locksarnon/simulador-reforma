import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { api } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";

const fmtTamanho = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Validações já feitas: reabre o resultado, baixa a planilha corrigida ou exclui (quem enviou ou administrador). */
export default function HistoricoValidacoes({ onAbrir, abrindo }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: lista = [], isLoading } = useQuery({ queryKey: ["validacoes-cadastro"], queryFn: () => api.get("/produtos/validacoes") });

  const excluir = async (v) => {
    if (!window.confirm(`Excluir a validação de "${v.nome_arquivo}"? O arquivo guardado também será apagado.`)) return;
    try {
      await api.delete(`/produtos/validacoes/${v.id}`);
      toast({ title: "Validação excluída" });
      qc.invalidateQueries({ queryKey: ["validacoes-cadastro"] });
    } catch (e) {
      toast({ title: "Não foi possível excluir", description: e.message, variant: "destructive" });
    }
  };

  const baixar = (v) => api.baixar("GET", `/produtos/validacoes/${v.id}/exportar`, { nome: `validado-${v.nome_arquivo.replace(/\.[^.]+$/, "")}.xlsx` })
    .catch((e) => toast({ title: "Não foi possível baixar", description: e.message, variant: "destructive" }));

  if (isLoading || lista.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div>
        <h3 className="font-heading font-semibold text-sm">Validações salvas</h3>
        <p className="text-xs text-muted-foreground">Cada planilha validada fica guardada aqui. Abra para rever o resultado ou exclua quando quiser.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-1.5 pr-3">Quando</th><th className="pr-3">Arquivo</th><th className="pr-3">Enviado por</th><th className="pr-3 text-right">Itens</th><th className="pr-3 text-right">OK</th><th className="pr-3 text-right">Atenção</th><th className="pr-3 text-right">Corrigir</th><th /></tr></thead>
          <tbody>{lista.map((v) => (
            <tr key={v.id} className="border-b border-border/50 last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap">{new Date(v.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
              <td className="pr-3" title={fmtTamanho(v.tamanho)}>{v.nome_arquivo}</td>
              <td className="pr-3 text-muted-foreground">{v.criado_por}</td>
              <td className="pr-3 text-right tabular-nums">{v.total.toLocaleString("pt-BR")}</td>
              <td className="pr-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{v.itens_ok.toLocaleString("pt-BR")}</td>
              <td className="pr-3 text-right tabular-nums text-amber-700 dark:text-amber-400">{v.itens_alerta.toLocaleString("pt-BR")}</td>
              <td className="pr-3 text-right tabular-nums text-red-700 dark:text-red-400">{v.itens_erro.toLocaleString("pt-BR")}</td>
              <td className="py-2 whitespace-nowrap text-right">
                <button type="button" onClick={() => onAbrir(v)} disabled={abrindo === v.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted mr-1">{abrindo === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderOpen className="w-3 h-3" />} Abrir</button>
                <button type="button" onClick={() => baixar(v)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted mr-1" title="Planilha corrigida"><Download className="w-3 h-3" /></button>
                {(user?.role === "admin" || user?.email === v.criado_por) && <button type="button" onClick={() => excluir(v)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted text-red-600" title="Excluir"><Trash2 className="w-3 h-3" /></button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
