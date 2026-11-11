import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const RESULTADOS = { OK: "Entrou", FALHA: "Senha errada", INATIVO: "Conta desativada", BLOQUEADO_IP: "IP não permitido" };
const TOM = { OK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", FALHA: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", INATIVO: "bg-muted text-muted-foreground", BLOQUEADO_IP: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" };
const quando = (v) => new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" });

/** Resume o navegador a partir do user-agent (o texto inteiro vai no title). */
export function navegadorDe(ua) {
  const s = String(ua || "");
  if (!s) return "—";
  const so = /Windows/.test(s) ? "Windows" : /Android/.test(s) ? "Android" : /iPhone|iPad/.test(s) ? "iOS" : /Mac OS/.test(s) ? "macOS" : /Linux/.test(s) ? "Linux" : "";
  const nav = /Edg\//.test(s) ? "Edge" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : /curl/i.test(s) ? "curl" : "Outro";
  return [nav, so].filter(Boolean).join(" · ");
}

export function RegistroDeAcesso() {
  const [filtros, setFiltros] = useState({ resultado: "", email: "" });
  // O e-mail só vira consulta depois que a pessoa para de digitar: uma consulta por tecla seria desperdício.
  const [emailBusca, setEmailBusca] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setEmailBusca(filtros.email.trim()), 350);
    return () => clearTimeout(t);
  }, [filtros.email]);
  const consulta = { resultado: filtros.resultado, email: emailBusca };
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ["acessos-log", consulta], queryFn: () => api.get("/acessos/log", { ...consulta, limite: 200 }) });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Resultado</span>
          <select className={campo} value={filtros.resultado} onChange={(e) => setFiltros((f) => ({ ...f, resultado: e.target.value }))}>
            <option value="">Todos</option>{Object.entries(RESULTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="space-y-1 flex-1 min-w-[180px]"><span className="block text-xs text-muted-foreground">E-mail</span>
          <input type="search" className={`${campo} w-full`} value={filtros.email} onChange={(e) => setFiltros((f) => ({ ...f, email: e.target.value }))} /></label>
        <button type="button" onClick={() => refetch()} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">{isFetching ? "Atualizando…" : "Atualizar"}</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-[13px] leading-5" aria-label="Registro de acesso">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-3 py-2">Quando</th><th className="px-3 py-2">E-mail</th><th className="px-3 py-2">Resultado</th><th className="px-3 py-2">IP</th><th className="px-3 py-2">Navegador</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</td></tr>}
            {error && <tr><td colSpan={5} className="py-8 text-center" role="alert">Não foi possível carregar o registro.</td></tr>}
            {data && data.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Nenhuma tentativa de entrada com esses filtros.</td></tr>}
            {(data || []).map((l) => (
              <tr key={l.id} className="border-b border-border/60 hover:bg-muted/40">
                <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{quando(l.createdAt)}</td>
                <td className="px-3 py-1.5">{l.email}</td>
                <td className="px-3 py-1.5"><span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${TOM[l.resultado] || "bg-muted"}`}>{RESULTADOS[l.resultado] || l.resultado}</span></td>
                <td className="px-3 py-1.5 tabular-nums">{l.ip || "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground" title={l.user_agent || undefined}>{navegadorDe(l.user_agent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Mostra as 200 tentativas mais recentes. O último acesso de cada pessoa também aparece em Usuários e acessos.</p>
    </div>
  );
}

export function IpsPermitidos() {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const { data, isLoading, error } = useQuery({ queryKey: ["acessos-ips"], queryFn: () => api.get("/acessos/ips") });
  const [novo, setNovo] = useState({ faixa: "", descricao: "" });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["acessos-ips"] });
  const falha = (titulo) => (e) => toast({ title: titulo, description: e.message, variant: "destructive" });
  const adicionar = useMutation({ mutationFn: (corpo) => api.post("/acessos/ips", corpo), onSuccess: () => { setNovo({ faixa: "", descricao: "" }); recarregar(); toast({ title: "Endereço adicionado" }); }, onError: falha("Não foi possível adicionar") });
  const remover = useMutation({ mutationFn: (id) => api.delete(`/acessos/ips/${id}`), onSuccess: () => { recarregar(); toast({ title: "Endereço removido" }); }, onError: falha("Não foi possível remover") });
  const restricao = useMutation({ mutationFn: (ativo) => api.put("/acessos/restricao", { ativo }), onSuccess: (_r, ativo) => { recarregar(); toast({ title: ativo ? "Restrição ligada" : "Restrição desligada" }); }, onError: falha("Não foi possível mudar a restrição") });

  const ligar = async () => {
    if (await confirmar({ titulo: "Ligar a restrição por IP?", descricao: "Depois disso, só os endereços da lista conseguem entrar no InTAX. Confira que o seu está na lista. Se alguém ficar sem acesso, o servidor pode desligar a restrição com IP_ALLOWLIST_OFF=1.", rotulo: "Ligar", perigoso: false })) restricao.mutate(true);
  };
  if (isLoading) return <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>;
  if (error || !data) return <p role="alert" className="text-sm">Não foi possível carregar a lista de IPs.</p>;
  return (
    <div className="space-y-4 max-w-3xl">
      <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 ${data.ativo ? "border-emerald-400/60" : "border-border"} bg-card`}>
        {data.ativo ? <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" /> : <ShieldAlert className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
        <div className="flex-1 min-w-[220px] text-sm">
          <p className="font-medium">{data.ativo ? "Restrição por IP ligada" : "Restrição por IP desligada"}</p>
          <p className="text-xs text-muted-foreground">{data.ativo ? "Só os endereços da lista entram." : "Qualquer endereço entra. Ligue só depois de cadastrar os IPs do escritório."} Seu IP agora: <strong className="tabular-nums">{data.ip_atual || "não identificado"}</strong></p>
          {data.desligada_pelo_servidor && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">O servidor está com IP_ALLOWLIST_OFF=1: a restrição não vale, mesmo ligada aqui.</p>}
        </div>
        {data.ativo
          ? <button type="button" onClick={() => restricao.mutate(false)} disabled={restricao.isPending} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60">Desligar</button>
          : <button type="button" onClick={ligar} disabled={restricao.isPending || data.ips.length === 0} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60" title={data.ips.length === 0 ? "Adicione um endereço antes" : undefined}>Ligar a restrição</button>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); adicionar.mutate(novo); }} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3 text-sm">
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">IP ou faixa (ex.: 200.10.20.0/24)</span><input className={`${campo} w-56`} value={novo.faixa} onChange={(e) => setNovo((n) => ({ ...n, faixa: e.target.value }))} required /></label>
        <label className="space-y-1 flex-1 min-w-[160px]"><span className="block text-xs text-muted-foreground">Descrição (opcional)</span><input className={`${campo} w-full`} value={novo.descricao} maxLength={120} onChange={(e) => setNovo((n) => ({ ...n, descricao: e.target.value }))} placeholder="Escritório, casa da Maria…" /></label>
        {data.ip_atual && <button type="button" onClick={() => setNovo((n) => ({ ...n, faixa: data.ip_atual }))} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Usar o meu IP</button>}
        <button type="submit" disabled={adicionar.isPending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-60"><Plus className="h-4 w-4" aria-hidden="true" /> Adicionar</button>
      </form>

      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {data.ips.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Nenhum endereço cadastrado.</li>}
        {data.ips.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <code className="tabular-nums">{i.faixa}</code>
            <span className="flex-1 text-muted-foreground">{i.descricao || ""}</span>
            <span className="text-xs text-muted-foreground">{i.criado_por ? `por ${i.criado_por}` : ""}</span>
            <button type="button" onClick={() => remover.mutate(i.id)} className="rounded p-1.5 text-destructive hover:bg-destructive/10" aria-label={`Remover ${i.faixa}`} title="Remover"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Administração > Registro de acesso e IPs: quem tentou entrar e a restrição por endereço IP. Só administradores. */
export default function AcessosPagina() {
  const { user } = useAuth();
  const crumbs = [{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Registro de acesso e IPs" }];
  if (user?.role !== "admin") return <div><PageHeader crumbs={crumbs} title="Registro de acesso e IPs" /><p role="alert" className="p-8 text-sm">Somente administradores veem o registro de acesso.</p></div>;
  return (
    <div>
      <PageHeader crumbs={crumbs} title="Registro de acesso e IPs" subtitle="Cada tentativa de entrar no InTAX e, se quiser, a lista de endereços IP que podem entrar." />
      <div className="px-6 lg:px-8 py-6">
        <Tabs defaultValue="registro" className="space-y-4">
          <TabsList><TabsTrigger value="registro">Registro de acesso</TabsTrigger><TabsTrigger value="ips">IPs permitidos</TabsTrigger></TabsList>
          <TabsContent value="registro"><RegistroDeAcesso /></TabsContent>
          <TabsContent value="ips"><IpsPermitidos /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
