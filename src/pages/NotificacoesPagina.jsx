import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import { LinhaDeAviso } from "@/components/SinoNotificacoes";
import { CATEGORIAS } from "@/lib/notificacoes";

/** Central de notificações: todos os avisos da pessoa, por categoria, com "só não lidas" e marcar como lidas. */
export default function NotificacoesPagina() {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [categoria, setCategoria] = useState("");
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["notificacoes", "central", categoria, soNaoLidas],
    queryFn: () => api.get("/notificacoes", { limite: 200, ...(categoria ? { categoria } : {}), ...(soNaoLidas ? { nao_lidas: 1 } : {}) }),
  });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["notificacoes"] });
  const lida = useMutation({ mutationFn: (id) => api.post(`/notificacoes/${id}/lida`, {}), onSuccess: recarregar });
  const todas = useMutation({ mutationFn: () => api.post(`/notificacoes/lidas${categoria ? `?categoria=${categoria}` : ""}`, {}), onSuccess: recarregar });
  const abrir = (n) => { if (!n.lida_em) lida.mutate(n.id); if (n.link) navegar(n.link); };
  const naoLidas = data.filter((n) => !n.lida_em).length;

  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Notificações" }]} title="Notificações" subtitle="Os avisos do sistema para você: tarefas, agenda, certificados, documentos, captura de XML e acessos. Os lidos há mais de 90 dias saem sozinhos." />
      <div className="px-6 lg:px-8 py-6 max-w-3xl space-y-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Categoria">
          <button type="button" aria-pressed={!categoria} onClick={() => setCategoria("")} className={`rounded-full border px-3 py-1 text-xs ${!categoria ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>Todas</button>
          {Object.entries(CATEGORIAS).map(([k, c]) => (
            <button key={k} type="button" aria-pressed={categoria === k} onClick={() => setCategoria(k)} className={`rounded-full border px-3 py-1 text-xs ${categoria === k ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>{c.rotulo}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={soNaoLidas} onChange={(e) => setSoNaoLidas(e.target.checked)} /> Só as não lidas</label>
          <button type="button" onClick={() => todas.mutate()} disabled={!naoLidas || todas.isPending} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-50"><CheckCheck className="h-4 w-4" aria-hidden="true" /> Marcar {categoria ? "estas" : "todas"} como lidas</button>
        </div>
        <div className="rounded-xl border border-border bg-card divide-y divide-border/60 overflow-hidden">
          {isLoading && <p className="px-4 py-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
          {error && <p role="alert" className="px-4 py-8 text-center text-sm">Não foi possível carregar as notificações.</p>}
          {!isLoading && !error && data.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{soNaoLidas || categoria ? "Nada com esses filtros." : "Nenhuma notificação por enquanto. Quando houver tarefa atribuída a você, prazo vencendo ou certificado perto de vencer, o aviso aparece aqui e no sino."}</p>}
          {data.map((n) => <LinhaDeAviso key={n.id} n={n} aoAbrir={abrir} />)}
        </div>
      </div>
    </div>
  );
}
