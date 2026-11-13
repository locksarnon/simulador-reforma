import { useMemo, useState } from "react";
import TabelaPadrao from "@/components/TabelaPadrao";
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
const SITUACOES_TAREFA = { ABERTA: "A fazer", EM_ANDAMENTO: "Em andamento", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };
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
          <button type="button" onClick={() => setDialogo({ tarefa: null })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Nova tarefa</button>
        </div>

        {lista.isLoading && <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
        {lista.error && <p className="py-8 text-center text-sm" role="alert">Não foi possível carregar. <button type="button" onClick={recarregar} className="text-primary hover:underline">Tentar de novo</button></p>}
        {!lista.isLoading && !lista.error && (
          <TabelaPadrao
            id="bpo-tarefas" ariaLabel="Tarefas" titulo="Tarefas" linhas={tarefas} tamanhoInicial={50} ordemInicial={{ chave: "prazo", dir: 1 }}
            vazio={(lista.data || []).length === 0 && grupo === "abertas" ? "Nenhuma tarefa em aberto. Crie uma, ou cadastre um processo recorrente para elas aparecerem sozinhas." : "Nenhuma tarefa com esses filtros."}
            colunas={[
              { chave: "concluir", rotulo: "Feita", ordenavel: false, filtravel: false, valor: (t) => (t.status === "CONCLUIDA" ? "Sim" : "Não"),
                render: (t) => { const concluida = t.status === "CONCLUIDA"; return <input type="checkbox" checked={concluida} disabled={t.status === "CANCELADA" || mudarStatus.isPending} onChange={() => mudarStatus.mutate({ id: t.id, status: concluida ? "ABERTA" : "CONCLUIDA" })} aria-label={concluida ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`} />; } },
              { chave: "titulo", rotulo: "Tarefa", render: (t) => <span className={`font-medium ${t.status === "CONCLUIDA" || t.status === "CANCELADA" ? "text-muted-foreground line-through" : ""}`}>{t.titulo}</span> },
              { chave: "empresa", rotulo: "Empresa", valor: (t) => nomeDaEmpresa(t.empresa_id), render: (t) => nomeDaEmpresa(t.empresa_id) || <span className="text-muted-foreground">—</span> },
              { chave: "responsavel", rotulo: "Responsável", valor: (t) => (t.responsavel ? pessoaPorId.get(t.responsavel) || "Ex-colaborador" : "Sem responsável"),
                render: (t) => (t.responsavel ? pessoaPorId.get(t.responsavel) || "Ex-colaborador" : <span className="text-muted-foreground">Sem responsável</span>) },
              { chave: "prazo", rotulo: "Prazo", tipo: "data", valor: (t) => (t.prazo ? String(t.prazo).slice(0, 10) : ""), render: (t) => { const prazo = situacaoDoPrazo(t); return <span className={TOM_DO_PRAZO[prazo.tom]}>{prazo.texto}</span>; } },
              { chave: "prioridade", rotulo: "Prioridade", valor: (t) => PRIORIDADES[t.prioridade] || t.prioridade, render: (t) => <span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${TOM_DA_PRIORIDADE[t.prioridade] || "bg-muted"}`}>{PRIORIDADES[t.prioridade] || t.prioridade}</span> },
              { chave: "status", rotulo: "Situação", valor: (t) => SITUACOES_TAREFA[t.status] || t.status,
                render: (t) => (t.status === "EM_ANDAMENTO" ? <span className="rounded bg-sky-100 px-1 text-[11px] text-sky-800 dark:bg-sky-950 dark:text-sky-300">Em andamento</span> : <span className="text-muted-foreground">{SITUACOES_TAREFA[t.status] || t.status}</span>) },
              { chave: "origem", rotulo: "Origem", valor: (t) => (t.modelo_id ? "Processo recorrente" : "Avulsa"), render: (t) => <span className="text-muted-foreground">{t.modelo_id ? "Processo recorrente" : "Avulsa"}</span> },
              { chave: "competencia", rotulo: "Competência", render: (t) => t.competencia || <span className="text-muted-foreground">—</span> },
              { chave: "descricao", rotulo: "Descrição", render: (t) => (t.descricao ? <span className="block max-w-[24rem] truncate text-muted-foreground" title={t.descricao}>{t.descricao}</span> : <span className="text-muted-foreground">—</span>) },
              { chave: "acoes", rotulo: "Ações", ordenavel: false, filtravel: false, alinhar: "direita", valor: () => "",
                render: (t) => (
                  <div className="flex items-center justify-end gap-0.5">
                    {t.status === "ABERTA" && <button type="button" onClick={() => mudarStatus.mutate({ id: t.id, status: "EM_ANDAMENTO" })} className="rounded p-1 hover:bg-muted" aria-label={`Iniciar ${t.titulo}`} title="Marcar como em andamento"><Play className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                    <button type="button" onClick={() => setDialogo({ tarefa: t })} className="rounded p-1 hover:bg-muted" aria-label={`Editar ${t.titulo}`} title="Editar"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
                    {podeExcluir(t) && (
                      <button type="button" onClick={() => remover(t)} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label={`${t.modelo_id ? "Cancelar" : "Excluir"} ${t.titulo}`} title={t.modelo_id ? "Cancelar a tarefa" : "Excluir"}>
                        {t.modelo_id ? <Ban className="h-3.5 w-3.5" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                      </button>
                    )}
                  </div>
                ) },
            ]}
          />
        )}
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
      {isLoading && <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
      {error && <p className="py-8 text-center text-sm" role="alert">Não foi possível carregar os processos.</p>}
      {!isLoading && !error && (
        <TabelaPadrao
          id="bpo-processos" ariaLabel="Processos recorrentes" titulo="Processos recorrentes" linhas={processos} destaqueLinha={(p) => (p.ativo ? "" : "opacity-60")}
          vazio={`Nenhum processo recorrente ainda. ${ehAdmin ? "Crie o primeiro, por exemplo \"Conferir a apuração de ICMS\", todo mês, para cada empresa do BPO." : ""}`}
          colunas={[
            { chave: "nome", rotulo: "Processo", render: (p) => <span className="font-medium">{p.nome}</span> },
            { chave: "recorrencia", rotulo: "Quando", valor: (p) => descreverRecorrencia(p) },
            { chave: "escopo", rotulo: "Para quem", valor: (p) => ESCOPOS[p.escopo] || p.escopo },
            { chave: "responsavel", rotulo: "Responsável", valor: (p) => (p.responsavel ? pessoaPorId.get(p.responsavel) || "Ex-colaborador" : "Quem atende a empresa"),
              render: (p) => (p.responsavel ? pessoaPorId.get(p.responsavel) || "Ex-colaborador" : <span className="text-muted-foreground">Quem atende a empresa</span>) },
            { chave: "ativo", rotulo: "Situação", valor: (p) => (p.ativo ? "Ativo" : "Desativado"), render: (p) => <span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${p.ativo ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{p.ativo ? "Ativo" : "Desativado"}</span> },
            { chave: "descricao", rotulo: "Descrição", render: (p) => (p.descricao ? <span className="block max-w-[24rem] truncate text-muted-foreground" title={p.descricao}>{p.descricao}</span> : <span className="text-muted-foreground">—</span>) },
            ...(ehAdmin ? [{ chave: "acoes", rotulo: "Ações", ordenavel: false, filtravel: false, alinhar: "direita", valor: () => "",
              render: (p) => (
                <div className="flex items-center justify-end gap-1">
                  {p.ativo && <button type="button" onClick={() => setGerar({ modelo: p.id })} className="rounded px-2 py-0.5 text-xs hover:bg-muted">Gerar</button>}
                  <button type="button" onClick={() => alternar.mutate(p)} className="rounded px-2 py-0.5 text-xs hover:bg-muted">{p.ativo ? "Desativar" : "Ativar"}</button>
                  <button type="button" onClick={() => replicar.mutate(p)} className="rounded px-2 py-0.5 text-xs hover:bg-muted" aria-label={`Replicar ${p.nome}`}>Replicar</button>
                  <button type="button" onClick={() => setDialogo({ processo: p })} className="rounded p-1 hover:bg-muted" aria-label={`Editar ${p.nome}`} title="Editar"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  <button type="button" onClick={() => confirmarApagar(p)} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label={`Apagar ${p.nome}`} title="Apagar"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                </div>
              ) }] : []),
          ]}
        />
      )}
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
