import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, CircleOff, Loader2, TriangleAlert, Clock } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import PageHeader from "@/components/PageHeader";

export const ESTADOS = {
  ATIVO: { rotulo: "Ligada", icone: CheckCircle2, tom: "text-emerald-700 dark:text-emerald-400" },
  NAO_CONFIGURADO: { rotulo: "Não configurada", icone: CircleDashed, tom: "text-amber-700 dark:text-amber-400" },
  DESLIGADO: { rotulo: "Desligada", icone: CircleOff, tom: "text-muted-foreground" },
  COM_PROBLEMA: { rotulo: "Com problema", icone: TriangleAlert, tom: "text-red-700 dark:text-red-400" },
  PREVISTO: { rotulo: "Prevista", icone: Clock, tom: "text-sky-700 dark:text-sky-400" },
};

/** Administração > Integrações: o estado de cada conexão do InTAX, nunca o segredo. */
export default function IntegracoesPagina() {
  const { user } = useAuth();
  const { data = [], isLoading, error, refetch, isFetching } = useQuery({ queryKey: ["integracoes"], queryFn: () => api.get("/integracoes"), enabled: user?.role === "admin" });
  const crumbs = [{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Integrações" }];
  if (user?.role !== "admin") return <div><PageHeader crumbs={crumbs} title="Integrações" /><p role="alert" className="p-8 text-sm">Somente administradores veem as integrações.</p></div>;
  return (
    <div>
      <PageHeader crumbs={crumbs} title="Integrações" subtitle="Se cada conexão está ligada e o que falta. Chaves, senhas e tokens ficam só no servidor e nunca aparecem aqui." actions={<button type="button" onClick={() => refetch()} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">{isFetching ? "Conferindo…" : "Conferir de novo"}</button>} />
      <div className="px-6 lg:px-8 py-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Conferindo…</p>}
        {error && <p role="alert" className="text-sm">Não foi possível conferir as integrações.</p>}
        {data.map((i) => {
          const e = ESTADOS[i.estado] || ESTADOS.DESLIGADO;
          const Icone = e.icone;
          return (
            <section key={i.id} className="rounded-xl border border-border bg-card p-4 space-y-1.5" aria-label={i.nome}>
              <div className="flex items-start gap-2">
                <h2 className="flex-1 font-heading text-sm font-semibold">{i.nome}</h2>
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${e.tom}`}><Icone className="h-4 w-4" aria-hidden="true" />{e.rotulo}{i.fase ? ` (fase ${i.fase})` : ""}</span>
              </div>
              <p className="text-xs text-muted-foreground">{i.para_que}</p>
              <p className="text-sm">{i.detalhe}</p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
