import { useMemo, useState } from "react";
import TabelaPadrao from "@/components/TabelaPadrao";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import { CATEGORIAS } from "@/lib/notificacoes";
import ListaDePrevistas from "@/components/ListaDePrevistas";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ORIGENS = { COMUNICADO: "Comunicado", AVISO: "Aviso do sistema" };
const SITUACOES_ENVIO = { ENVIADO: "Enviado", FALHA: "Falha" };
const TOM = { ENVIADO: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", FALHA: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", BLOQUEADO: "bg-muted text-muted-foreground" };

export function AbaEnvios({ empresas }) {
  const [f, setF] = useState({ status: "", origem: "", de: "", ate: "" });
  const { data = [], isLoading, error } = useQuery({ queryKey: ["comunicacoes", "envios", f], queryFn: () => api.get("/comunicacoes/envios", Object.fromEntries(Object.entries(f).filter(([, v]) => v))) });
  const nome = useMemo(() => new Map(empresas.map((e) => [e.id, e.razao_social])), [empresas]);
  const mudar = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Situação</span><select className={campo} value={f.status} onChange={(e) => mudar("status", e.target.value)}><option value="">Todas</option><option value="ENVIADO">Enviado</option><option value="FALHA">Falha</option></select></label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Origem</span><select className={campo} value={f.origem} onChange={(e) => mudar("origem", e.target.value)}><option value="">Todas</option>{Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">De</span><input type="date" className={campo} value={f.de} onChange={(e) => mudar("de", e.target.value)} /></label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Até</span><input type="date" className={campo} value={f.ate} onChange={(e) => mudar("ate", e.target.value)} /></label>
      </div>
      {isLoading && <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
      {error && <p className="py-8 text-center text-sm" role="alert">Não foi possível carregar.</p>}
      {!isLoading && !error && (
        <TabelaPadrao
          id="admin-envios" ariaLabel="E-mails enviados" titulo="E-mails enviados" linhas={data} vazio="Nenhum e-mail com esses filtros." ordemInicial={{ chave: "createdAt", dir: -1 }}
          colunas={[
            { chave: "createdAt", rotulo: "Quando", tipo: "data", render: (e) => <span className="tabular-nums">{new Date(e.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</span> },
            { chave: "destinatario", rotulo: "Para" },
            { chave: "empresa", rotulo: "Empresa", valor: (e) => nome.get(e.empresa_id) || "", render: (e) => nome.get(e.empresa_id) || <span className="text-muted-foreground">—</span> },
            { chave: "assunto", rotulo: "Assunto" },
            { chave: "origem", rotulo: "Origem", valor: (e) => ORIGENS[e.origem] || e.origem },
            { chave: "status", rotulo: "Situação", valor: (e) => SITUACOES_ENVIO[e.status] || e.status, render: (e) => <span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${TOM[e.status] || "bg-muted"}`}>{SITUACOES_ENVIO[e.status] || e.status}</span> },
            { chave: "erro", rotulo: "Erro", quebrar: true, render: (e) => (e.erro ? <span className="text-[11px] text-muted-foreground">{e.erro}</span> : <span className="text-muted-foreground">—</span>) },
          ]}
        />
      )}
      <p className="text-xs text-muted-foreground">Últimos 1.000 envios do filtro.</p>
    </div>
  );
}

export function AbaBloqueios() {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ email: "", motivo: "" });
  const { data = [] } = useQuery({ queryKey: ["comunicacoes", "bloqueios"], queryFn: () => api.get("/comunicacoes/bloqueios") });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["comunicacoes", "bloqueios"] });
  const add = useMutation({ mutationFn: () => api.post("/comunicacoes/bloqueios", novo), onSuccess: () => { setNovo({ email: "", motivo: "" }); recarregar(); toast({ title: "E-mail bloqueado" }); }, onError: (e) => toast({ title: "Não foi possível bloquear", description: e.message, variant: "destructive" }) });
  const tirar = useMutation({ mutationFn: (id) => api.delete(`/comunicacoes/bloqueios/${id}`), onSuccess: () => { recarregar(); toast({ title: "E-mail tirado da lista" }); } });
  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-sm text-muted-foreground">Não recebem comunicados nem avisos por e-mail.</p>
      <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3 text-sm">
        <label className="space-y-1 flex-1 min-w-[200px]"><span className="block text-xs text-muted-foreground">E-mail</span><input type="email" required className={`${campo} w-full`} value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></label>
        <label className="space-y-1 flex-1 min-w-[160px]"><span className="block text-xs text-muted-foreground">Motivo (opcional)</span><input className={`${campo} w-full`} value={novo.motivo} maxLength={200} onChange={(e) => setNovo({ ...novo, motivo: e.target.value })} /></label>
        <button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Bloquear</button>
      </form>
      <TabelaPadrao
        id="admin-bloqueios" ariaLabel="Lista de bloqueio" titulo="Lista de bloqueio" linhas={data} vazio="Ninguém na lista."
        colunas={[
          { chave: "email", rotulo: "E-mail" },
          { chave: "motivo", rotulo: "Motivo", quebrar: true, render: (b) => b.motivo || <span className="text-muted-foreground">—</span> },
          { chave: "createdAt", rotulo: "Bloqueado em", tipo: "data" },
          { chave: "acoes", rotulo: "Ações", ordenavel: false, filtravel: false, alinhar: "direita", valor: () => "",
            render: (b) => <button type="button" onClick={() => tirar.mutate(b.id)} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label={`Tirar ${b.email} da lista`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button> },
        ]}
      />
    </div>
  );
}

export function AbaAvisos() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["comunicacoes", "avisos"], queryFn: () => api.get("/comunicacoes/avisos-email") });
  const [c, setC] = useState(null);
  const atual = c || data;
  const salvar = useMutation({ mutationFn: () => api.put("/comunicacoes/avisos-email", atual), onSuccess: () => { setC(null); qc.invalidateQueries({ queryKey: ["comunicacoes", "avisos"] }); toast({ title: "Avisos por e-mail salvos" }); }, onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }) });
  if (!atual) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const alternar = (k) => setC({ ...atual, categorias: atual.categorias.includes(k) ? atual.categorias.filter((x) => x !== k) : [...atual.categorias, k] });
  return (
    <div className="max-w-2xl space-y-3 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" checked={atual.ativo} onChange={(e) => setC({ ...atual, ativo: e.target.checked })} /> Mandar cópia dos avisos por e-mail</label>
      <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Destinatários (um por linha, até 20)</span><textarea className={`${campo} w-full min-h-[90px]`} value={(atual.destinatarios || []).join("\n")} onChange={(e) => setC({ ...atual, destinatarios: e.target.value.split(/\s*[\n,;]\s*/).filter(Boolean) })} /></label>
      <fieldset className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-3"><legend className="px-1 text-xs font-medium">Quais avisos</legend>{Object.entries(CATEGORIAS).filter(([k]) => k !== "TAREFA").map(([k, v]) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={atual.categorias.includes(k)} onChange={() => alternar(k)} /> {v.rotulo}</label>)}</fieldset>
      <button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending} className="rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">Salvar</button>
    </div>
  );
}

/** Administração > Comunicações e envios: e-mails enviados, lista de bloqueio e cópia dos avisos por e-mail. */
export default function ComunicacoesPagina() {
  const { user } = useAuth();
  const emp = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list(), enabled: user?.role === "admin" });
  const crumbs = [{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Comunicações e envios" }];
  if (user?.role !== "admin") return <div><PageHeader crumbs={crumbs} title="Comunicações e envios" /><p role="alert" className="p-8 text-sm">Somente administradores veem os envios.</p></div>;
  return (
    <div>
      <PageHeader crumbs={crumbs} title="Comunicações e envios" />
      <div className="px-6 lg:px-8 py-6">
        <Tabs defaultValue="envios" className="space-y-4">
          <TabsList><TabsTrigger value="envios">E-mails enviados</TabsTrigger><TabsTrigger value="bloqueios">Lista de bloqueio</TabsTrigger><TabsTrigger value="avisos">Avisos por e-mail</TabsTrigger></TabsList>
          <TabsContent value="envios"><AbaEnvios empresas={emp.data || []} /></TabsContent>
          <TabsContent value="bloqueios"><AbaBloqueios /></TabsContent>
          <TabsContent value="avisos"><AbaAvisos /></TabsContent>
        </Tabs>
        <div className="mt-6"><ListaDePrevistas moduloId="comunicacoes" /></div>
      </div>
    </div>
  );
}
