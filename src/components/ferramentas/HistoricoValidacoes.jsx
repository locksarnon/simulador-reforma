import React, { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Th, ordenarPor, useOrdenacao } from "@/components/saneamento/ui";

const dataBr = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
/** Resumo curto dos parâmetros usados na análise, para distinguir uma da outra na lista. */
function resumoParametros(p) {
  if (!p) return "—";
  const partes = [];
  if (p.cClassTrib) partes.push("cClassTrib");
  if (p.duplicidades) partes.push("duplicidades");
  if (p.principioAtivo) partes.push("princípio ativo");
  if (p.gruposContabeis) partes.push("grupos");
  if (p.dataInicio || p.dataFim) partes.push(`período ${p.dataInicio ? dataBr(p.dataInicio) : "…"}–${p.dataFim ? dataBr(p.dataFim) : "hoje"}`);
  if (p.erps?.length) partes.push(p.erps.join("/"));
  return partes.join(" · ") || "só NCM";
}
const fmtTamanho = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Validações já feitas: reabre o resultado, baixa a planilha corrigida ou exclui (quem enviou ou administrador). */
export default function HistoricoValidacoes({ onAbrir, abrindo, empresaId }) {
  const confirmar = useConfirmar();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: lista = [], isLoading } = useQuery({ queryKey: ["validacoes-cadastro", empresaId], queryFn: () => api.get("/produtos/validacoes", { empresa_id: empresaId }) });

  const [ord, ordenar] = useOrdenacao();
  const ordenada = useMemo(() => ordenarPor(lista, ord, {
    atualizada: (v) => v.updatedAt || v.createdAt, situacao: (v) => (v.status === "RASCUNHO" ? 0 : 1), arquivo: (v) => v.nome_arquivo, parametros: (v) => resumoParametros(v.parametros), enviado: (v) => v.criado_por,
    total: (v) => v.total, ok: (v) => v.itens_ok, alerta: (v) => v.itens_alerta, erro: (v) => v.itens_erro,
  }), [lista, ord]);

  const excluir = async (v) => {
    if (!(await confirmar({ titulo: "Excluir a validação?", descricao: `Excluir a validação de "${v.nome_arquivo}"? O arquivo guardado também será apagado, e projetos de saneamento que usam esta base ficam sem base vinculada.`, rotulo: "Excluir" }))) return;
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
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="font-heading font-semibold text-sm">Análises realizadas</h3>
        <p className="text-xs text-muted-foreground">Cada planilha enviada é salva automaticamente desde o upload. Retome um rascunho de onde parou, reabra o resultado ou ajuste os parâmetros e refaça.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted-foreground border-b border-border"><Th chave="atualizada" ord={ord} onOrdenar={ordenar} className="py-1.5 pr-3">Atualizada</Th><Th chave="situacao" ord={ord} onOrdenar={ordenar} className="pr-3">Situação</Th><Th chave="arquivo" ord={ord} onOrdenar={ordenar} className="pr-3">Arquivo</Th><Th chave="parametros" ord={ord} onOrdenar={ordenar} className="pr-3">Parâmetros</Th><Th chave="enviado" ord={ord} onOrdenar={ordenar} className="pr-3">Enviado por</Th><Th chave="total" ord={ord} onOrdenar={ordenar} className="pr-3 text-right">Itens</Th><Th chave="ok" ord={ord} onOrdenar={ordenar} className="pr-3 text-right">OK</Th><Th chave="alerta" ord={ord} onOrdenar={ordenar} className="pr-3 text-right">Atenção</Th><Th chave="erro" ord={ord} onOrdenar={ordenar} className="pr-3 text-right">Corrigir</Th><th /></tr></thead>
          <tbody>{ordenada.map((v) => (
            <tr key={v.id} className="border-b border-border/50 last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap">{new Date(v.updatedAt || v.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
              <td className="pr-3 whitespace-nowrap"><span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${v.status === "RASCUNHO" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"}`}>{v.status === "RASCUNHO" ? "Rascunho" : "Processada"}</span></td>
              <td className="pr-3" title={fmtTamanho(v.tamanho)}>{v.nome_arquivo}</td>
              <td className="pr-3 text-muted-foreground max-w-[220px] truncate" title={resumoParametros(v.parametros)}>{resumoParametros(v.parametros)}</td>
              <td className="pr-3 text-muted-foreground">{v.criado_por}</td>
              <td className="pr-3 text-right tabular-nums">{v.total.toLocaleString("pt-BR")}</td>
              <td className="pr-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{v.itens_ok.toLocaleString("pt-BR")}</td>
              <td className="pr-3 text-right tabular-nums text-amber-700 dark:text-amber-400">{v.itens_alerta.toLocaleString("pt-BR")}</td>
              <td className="pr-3 text-right tabular-nums text-red-700 dark:text-red-400">{v.itens_erro.toLocaleString("pt-BR")}</td>
              <td className="py-2 whitespace-nowrap text-right">
                <button type="button" onClick={() => onAbrir(v)} disabled={abrindo === v.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted mr-1">{abrindo === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderOpen className="w-3 h-3" />} {v.status === "RASCUNHO" ? "Retomar" : "Abrir"}</button>
                {v.status !== "RASCUNHO" && <button type="button" onClick={() => baixar(v)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted mr-1" title="Planilha corrigida"><Download className="w-3 h-3" /></button>}
                {(user?.role === "admin" || user?.email === v.criado_por) && <button type="button" onClick={() => excluir(v)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted text-red-600" title="Excluir"><Trash2 className="w-3 h-3" /></button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
