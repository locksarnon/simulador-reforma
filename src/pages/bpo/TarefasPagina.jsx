import { useMemo, useState } from "react";
import BotaoExportar from "@/components/BotaoExportar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Loader2, Pencil, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import DialogoTarefa from "@/components/tarefas/DialogoTarefa";
import DialogoProcesso from "@/components/tarefas/DialogoProcesso";
import DialogoGerar from "@/components/tarefas/DialogoGerar";
import SeletorDeEmpresa from "@/components/SeletorDeEmpresa";
import { useColaboradores } from "@/lib/useTags";
import { useEmpresaEmFoco } from "@/lib/EmpresaEmFoco";
import { plural } from "@/lib/plural";
import {
  descreverRecorrencia, ESCOPOS, filtrarTarefas, PRIORIDADES, situacaoDoPrazo, STATUS_ABERTOS, TOM_DA_PRIORIDADE, TOM_DO_PRAZO,
} from "@/lib/tarefas";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const GRUPOS = [["abertas", "Em aberto"], ["CONCLUIDA", "Concluídas"], ["CANCELADA", "Canceladas"]];

function Cartao({ rotulo, valor, destaque, ativo, aoClicar }) {
  return (
    <button type="button" onClick={aoClicar} aria-pressed={ativo} className={`rounded-xl border bg-card px-4 py-3 text-left hover:bg-muted/50 ${destaque ? "border-amber-400/60" : "border-border"} ${ativo ? "ring-2 ring-primary" : ""}`}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor ?? "—"}</p>
    </button>
  );
}

function AbaTarefas({ user, empresas, colaboradores }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const [grupo, setGrupo] = useState("abertas");
  const { empresaId: emFoco } = useEmpresaEmFoco();
  const [filtros, setFiltros] = useState({ busca: "", responsavel: "", empresa: emFoco || "", atalho: "" });
  const [dialogo, setDialogo] = useState(null);
  const lista = useQuery({ queryKey: ["tarefas", grupo], queryFn: () => api.get("/tarefas", { status: grupo, limite: 1000 }) });
  const resumo = useQuery({ queryKey: ["tarefas", "resumo"], queryFn: () => api.get("/tarefas/resumo") });
  const empresaPorId = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);
  const pessoaPorId = useMemo(() => new Map(colaboradores.map((c) => [c.id, c.name || c.email])), [colaboradores]);
  const nomeDaEmpresa = (id) => empresaPorId.get(id)?.razao_social || "";
  const tarefas = useMemo(
    () => filtrarTarefas(lista.data, filtros, { usuarioId: user?.id, nomeDaEmpresa }),
    [lista.data, filtros, user?.id, empresaPorId],
  );
  const mudar = (chave, valor) => setFiltros((f) => ({ ...f, [chave]: valor }));
  const atalho = (a, r = "") => setFiltros((f) => ({ ...f, atalho: f.atalho === a && f.responsavel === r ? "" : a, responsavel: f.atalho === a && f.responsavel === r ? "" : r }));
  const recarregar = () => qc.invalidateQueries({ queryKey: ["tarefas"] });
  const falha = (titulo) => (e) => toast({ title: titulo, description: e.message, variant: "destructive" });

  const mudarStatus = useMutation({
    mutationFn: ({ id, status }) => api.put(`/tarefas/${id}`, { status }),
    onSuccess: recarregar,
    onError: falha("Não foi possível mudar a tarefa"),
  });
  const excluir = useMutation({
    mutationFn: (id) => api.delete(`/tarefas/${id}`),
    onSuccess: () => { toast({ title: "Tarefa excluída" }); recarregar(); },
    onError: falha("Não foi possível excluir"),
  });
  const remover = async (t) => {
    if (t.modelo_id) {
      if (await confirmar({ titulo: "Cancelar esta tarefa?", descricao: "Ela foi gerada por um processo recorrente. Cancelar tira da lista sem que o processo a crie de novo.", rotulo: "Cancelar tarefa" })) mudarStatus.mutate({ id: t.id, status: "CANCELADA" });
    } else if (await confirmar({ titulo: "Excluir esta tarefa?", descricao: t.titulo, rotulo: "Excluir" })) excluir.mutate(t.id);
  };
  const podeExcluir = (t) => t.modelo_id ? STATUS_ABERTOS.includes(t.status) : t.criado_por === user?.id || user?.role === "admin";

  const r = resumo.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Cartao rotulo="Minhas em aberto" valor={r?.minhas} ativo={filtros.responsavel === "eu" && !filtros.atalho} aoClicar={() => { setGrupo("abertas"); setFiltros((f) => ({ ...f, atalho: "", responsavel: f.responsavel === "eu" && !f.atalho ? "" : "eu" })); }} />
        <Cartao rotulo="Atrasadas" valor={r?.atrasadas} destaque={(r?.atrasadas ?? 0) > 0} ativo={filtros.atalho === "atrasadas"} aoClicar={() => { setGrupo("abertas"); atalho("atrasadas"); }} />
        <Cartao rotulo="Vencem hoje" valor={r?.hoje} ativo={filtros.atalho === "hoje"} aoClicar={() => { setGrupo("abertas"); atalho("hoje"); }} />
        <Cartao rotulo="Próximos 7 dias" valor={r?.semana} ativo={filtros.atalho === "semana"} aoClicar={() => { setGrupo("abertas"); atalho("semana"); }} />
        <Cartao rotulo="Sem responsável" valor={r?.sem_responsavel} destaque={(r?.sem_responsavel ?? 0) > 0} ativo={filtros.responsavel === "sem" && !filtros.atalho} aoClicar={() => { setGrupo("abertas"); setFiltros((f) => ({ ...f, atalho: "", responsavel: f.responsavel === "sem" && !f.atalho ? "" : "sem" })); }} />
      </div>

      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Situação das tarefas">
            {GRUPOS.map(([v, rotulo]) => <button key={v} type="button" aria-pressed={grupo === v} onClick={() => setGrupo(v)} className={`rounded px-3 py-1 text-sm ${grupo === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{rotulo}</button>)}
          </div>
          <label className="space-y-1 flex-1 min-w-[180px]"><span className="block text-xs text-muted-foreground">Buscar (título ou empresa)</span>
            <input type="search" className={`${campo} w-full`} value={filtros.busca} onChange={(e) => mudar("busca", e.target.value)} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Responsável</span>
            <select className={campo} value={filtros.responsavel} onChange={(e) => mudar("responsavel", e.target.value)}>
              <option value="">Todos</option><option value="eu">Eu</option><option value="sem">Sem responsável</option>
              {colaboradores.filter((c) => c.id !== user?.id).map((c) => <option key={c.id} value={c.id}>{c.name || c.email}</option>)}
            </select></label>
          <div className="w-60"><SeletorDeEmpresa empresas={empresas} valor={filtros.empresa} aoMudar={(v) => mudar("empresa", v)} rotulo="Empresa" opcional={false} placeholder="Todas as empresas" /></div>
          <button type="button" onClick={recarregar} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-muted" title="Buscar de novo"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Atualizar</button>
          <BotaoExportar titulo="Tarefas" linhas={tarefas} colunas={[
            { chave: "titulo", rotulo: "Tarefa" }, { chave: "empresa", rotulo: "Empresa", valor: (t) => nomeDaEmpresa(t.empresa_id) },
            { chave: "responsavel", rotulo: "Responsável", valor: (t) => (t.responsavel ? pessoaPorId.get(t.responsavel) || "" : "Sem responsável") },
            { chave: "prazo", rotulo: "Prazo", valor: (t) => (t.prazo ? new Date(t.prazo).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "") },
            { chave: "status", rotulo: "Situação", valor: (t) => ({ ABERTA: "A fazer", EM_ANDAMENTO: "Em andamento", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" })[t.status] || t.status },
            { chave: "prioridade", rotulo: "Prioridade", valor: (t) => PRIORIDADES[t.prioridade] || t.prioridade },
            { chave: "competencia", rotulo: "Competência" },
          ]} />
          <button type="button" onClick={() => setDialogo({ tarefa: null })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Nova tarefa</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px] leading-5" aria-label="Tarefas">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="w-8 py-1.5 pr-2"><span className="sr-only">Concluir</span></th>
                <th className="py-1.5 pr-3">Tarefa</th><th className="py-1.5 pr-3">Empresa</th><th className="py-1.5 pr-3">Responsável</th>
                <th className="py-1.5 pr-3">Prazo</th><th className="py-1.5 pr-3">Prioridade</th><th className="py-1.5"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.isLoading && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</td></tr>}
              {lista.error && <tr><td colSpan={7} className="py-8 text-center" role="alert">Não foi possível carregar. <button type="button" onClick={recarregar} className="text-primary hover:underline">Tentar de novo</button></td></tr>}
              {!lista.isLoading && !lista.error && tarefas.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">
                  {(lista.data || []).length === 0 && grupo === "abertas" ? "Nenhuma tarefa em aberto. Crie uma, ou cadastre um processo recorrente para elas aparecerem sozinhas." : "Nenhuma tarefa com esses filtros."}
                </td></tr>
              )}
              {tarefas.map((t) => {
                const prazo = situacaoDoPrazo(t);
                const concluida = t.status === "CONCLUIDA";
                return (
                  <tr key={t.id} className="border-b border-border/60 align-top hover:bg-muted/40">
                    <td className="py-1.5 pr-2"><input type="checkbox" checked={concluida} disabled={t.status === "CANCELADA" || mudarStatus.isPending} onChange={() => mudarStatus.mutate({ id: t.id, status: concluida ? "ABERTA" : "CONCLUIDA" })} aria-label={concluida ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`} /></td>
                    <td className="py-1.5 pr-3 max-w-[360px]">
                      <p className={`font-medium ${concluida || t.status === "CANCELADA" ? "text-muted-foreground line-through" : ""}`}>{t.titulo}</p>
                      {t.descricao && <p className="truncate text-[11px] text-muted-foreground" title={t.descricao}>{t.descricao}</p>}
                      <p className="text-[11px] text-muted-foreground">
                        {t.status === "EM_ANDAMENTO" && <span className="mr-1.5 rounded bg-sky-100 px-1 text-sky-800 dark:bg-sky-950 dark:text-sky-300">Em andamento</span>}
                        {t.modelo_id && <span>Processo recorrente</span>}
                      </p>
                    </td>
                    <td className="py-1.5 pr-3">{nomeDaEmpresa(t.empresa_id) || <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{t.responsavel ? pessoaPorId.get(t.responsavel) || "Ex-colaborador" : <span className="text-muted-foreground">Sem responsável</span>}</td>
                    <td className={`py-1.5 pr-3 whitespace-nowrap ${TOM_DO_PRAZO[prazo.tom]}`}>{prazo.texto}</td>
                    <td className="py-1.5 pr-3"><span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${TOM_DA_PRIORIDADE[t.prioridade] || "bg-muted"}`}>{PRIORIDADES[t.prioridade] || t.prioridade}</span></td>
                    <td className="py-1.5 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-0.5">
                        {t.status === "ABERTA" && <button type="button" onClick={() => mudarStatus.mutate({ id: t.id, status: "EM_ANDAMENTO" })} className="rounded p-1.5 hover:bg-muted" aria-label={`Iniciar ${t.titulo}`} title="Marcar como em andamento"><Play className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                        <button type="button" onClick={() => setDialogo({ tarefa: t })} className="rounded p-1.5 hover:bg-muted" aria-label={`Editar ${t.titulo}`} title="Editar"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
                        {podeExcluir(t) && (
                          <button type="button" onClick={() => remover(t)} className="rounded p-1.5 text-destructive hover:bg-destructive/10" aria-label={`${t.modelo_id ? "Cancelar" : "Excluir"} ${t.titulo}`} title={t.modelo_id ? "Cancelar a tarefa" : "Excluir"}>
                            {t.modelo_id ? <Ban className="h-3.5 w-3.5" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">{tarefas.length} de {plural((lista.data || []).length, "tarefa", "tarefas")}.</p>
      </div>
      {dialogo && <DialogoTarefa key={dialogo.tarefa?.id || "nova"} tarefa={dialogo.tarefa} empresas={empresas} colaboradores={colaboradores} usuarioId={user?.id} aoFechar={() => setDialogo(null)} />}
    </div>
  );
}

function AbaProcessos({ ehAdmin, colaboradores }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const [dialogo, setDialogo] = useState(null); // { processo } para editar/novo
  const [gerar, setGerar] = useState(null); // { modelo }
  const { data: processos = [], isLoading, error } = useQuery({ queryKey: ["processos"], queryFn: () => api.get("/processos") });
  const pessoaPorId = useMemo(() => new Map(colaboradores.map((c) => [c.id, c.name || c.email])), [colaboradores]);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["processos"] });
  const falha = (titulo) => (e) => toast({ title: titulo, description: e.message, variant: "destructive" });
  const alternar = useMutation({ mutationFn: (p) => api.put(`/processos/${p.id}`, { ativo: !p.ativo }), onSuccess: recarregar, onError: falha("Não foi possível mudar o processo") });
  // Replicar: a cópia nasce desativada, para não gerar tarefas em dobro antes de ser ajustada.
  const replicar = useMutation({
    mutationFn: (p) => api.post("/processos", { nome: `${p.nome} (cópia)`.slice(0, 120), descricao: p.descricao, recorrencia: p.recorrencia, dia: p.dia, mes: p.mes, escopo: p.escopo, responsavel: p.responsavel, prioridade: p.prioridade, ativo: false }),
    onSuccess: () => { recarregar(); toast({ title: "Processo replicado", description: "A cópia está desativada." }); },
    onError: falha("Não foi possível replicar"),
  });
  const apagar = useMutation({ mutationFn: (id) => api.delete(`/processos/${id}`), onSuccess: () => { toast({ title: "Processo apagado" }); recarregar(); }, onError: falha("Não foi possível apagar") });
  const confirmarApagar = async (p) => {
    if (await confirmar({ titulo: `Apagar o processo "${p.nome}"?`, descricao: "As tarefas que ele já criou continuam na lista. Só deixa de criar novas. Para pausar sem apagar, desative.", rotulo: "Apagar" })) apagar.mutate(p.id);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 min-w-[260px] text-sm text-muted-foreground">A tarefa de cada período é criada 10 dias antes do prazo.</p>
        {ehAdmin ? (
          <>
            <button type="button" onClick={() => setGerar({ modelo: "" })} disabled={!processos.some((p) => p.ativo)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">Gerar tarefas agora</button>
            <button type="button" onClick={() => setDialogo({ processo: null })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Novo processo</button>
          </>
        ) : <p className="text-xs text-muted-foreground">Só administradores criam e mudam processos.</p>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-[13px] leading-5" aria-label="Processos recorrentes">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-3 py-2">Processo</th><th className="px-3 py-2">Quando</th><th className="px-3 py-2">Para quem</th><th className="px-3 py-2">Responsável</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</td></tr>}
            {error && <tr><td colSpan={6} className="py-8 text-center" role="alert">Não foi possível carregar os processos.</td></tr>}
            {!isLoading && !error && processos.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Nenhum processo recorrente ainda. {ehAdmin ? "Crie o primeiro, por exemplo \"Conferir a apuração de ICMS\", todo mês, para cada empresa do BPO." : ""}</td></tr>}
            {processos.map((p) => (
              <tr key={p.id} className={`border-b border-border/60 align-top ${p.ativo ? "" : "opacity-60"}`}>
                <td className="px-3 py-2"><p className="font-medium">{p.nome}</p>{p.descricao && <p className="max-w-[320px] truncate text-[11px] text-muted-foreground" title={p.descricao}>{p.descricao}</p>}</td>
                <td className="px-3 py-2">{descreverRecorrencia(p)}</td>
                <td className="px-3 py-2">{ESCOPOS[p.escopo] || p.escopo}</td>
                <td className="px-3 py-2">{p.responsavel ? pessoaPorId.get(p.responsavel) || "Ex-colaborador" : <span className="text-muted-foreground">Quem atende a empresa</span>}</td>
                <td className="px-3 py-2"><span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${p.ativo ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{p.ativo ? "Ativo" : "Desativado"}</span></td>
                <td className="px-3 py-2">
                  {ehAdmin && (
                    <div className="flex items-center justify-end gap-1">
                      {p.ativo && <button type="button" onClick={() => setGerar({ modelo: p.id })} className="rounded px-2 py-1 text-xs hover:bg-muted">Gerar</button>}
                      <button type="button" onClick={() => alternar.mutate(p)} className="rounded px-2 py-1 text-xs hover:bg-muted">{p.ativo ? "Desativar" : "Ativar"}</button>
                      <button type="button" onClick={() => replicar.mutate(p)} className="rounded px-2 py-1 text-xs hover:bg-muted" aria-label={`Replicar ${p.nome}`}>Replicar</button>
                      <button type="button" onClick={() => setDialogo({ processo: p })} className="rounded p-1.5 hover:bg-muted" aria-label={`Editar ${p.nome}`} title="Editar"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
                      <button type="button" onClick={() => confirmarApagar(p)} className="rounded p-1.5 text-destructive hover:bg-destructive/10" aria-label={`Apagar ${p.nome}`} title="Apagar"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialogo && <DialogoProcesso key={dialogo.processo?.id || "novo"} processo={dialogo.processo} colaboradores={colaboradores} aoFechar={() => setDialogo(null)} />}
      {gerar && <DialogoGerar processos={processos} processoInicial={gerar.modelo} aoFechar={() => setGerar(null)} />}
    </div>
  );
}

/** BPO Fiscal > Processos e tarefas: as tarefas do escritório (avulsas e geradas) e os processos recorrentes que as geram. */
export default function TarefasPagina() {
  const { user } = useAuth();
  const ehAdmin = user?.role === "admin";
  const emp = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list() });
  const colab = useColaboradores();
  const empresas = useMemo(() => [...(emp.data || [])].sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR")), [emp.data]);
  const colaboradores = colab.data || [];
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "BPO Fiscal", to: "/area/bpo" }, { label: "Processos e tarefas" }]}
        title="Processos e tarefas"
      />
      <div className="px-6 lg:px-8 py-6">
        <Tabs defaultValue="tarefas" className="space-y-4">
          <TabsList><TabsTrigger value="tarefas">Tarefas</TabsTrigger><TabsTrigger value="processos">Processos recorrentes</TabsTrigger></TabsList>
          <TabsContent value="tarefas"><AbaTarefas user={user} empresas={empresas} colaboradores={colaboradores} /></TabsContent>
          <TabsContent value="processos"><AbaProcessos ehAdmin={ehAdmin} colaboradores={colaboradores} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export { AbaProcessos, AbaTarefas };
