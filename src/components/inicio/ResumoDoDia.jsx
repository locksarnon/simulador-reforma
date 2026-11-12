import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bell, CalendarDays, ListChecks, PieChart } from "lucide-react";
import { api } from "@/api/client";
import { hojeBR } from "@/lib/tarefas";
import { normalizarCamadas, somarDias } from "@/lib/agenda";
import { quandoFoi } from "@/lib/notificacoes";
import { plural } from "@/lib/plural";

function Cartao({ titulo, icone: Icone, to, rotuloLink, carregando, erro, children }) {
  return (
    <section className="flex flex-col rounded-xl border border-border bg-card p-4" aria-label={titulo}>
      <h2 className="mb-2 flex items-center gap-2 font-heading text-sm font-semibold"><Icone className="h-4 w-4 text-primary" aria-hidden="true" /> {titulo}</h2>
      <div className="flex-1 text-sm">
        {carregando ? <p className="text-muted-foreground">Carregando…</p> : erro ? <p role="alert" className="text-muted-foreground">Não foi possível carregar.</p> : children}
      </div>
      <Link to={to} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">{rotuloLink} <ArrowRight className="h-3 w-3" aria-hidden="true" /></Link>
    </section>
  );
}

const Numero = ({ valor, rotulo, alerta }) => (
  <div>
    <p className={`text-xl font-semibold tabular-nums ${alerta ? "text-red-700 dark:text-red-400" : ""}`}>{valor ?? "—"}</p>
    <p className="text-[11px] text-muted-foreground">{rotulo}</p>
  </div>
);

/** O resumo do dia no Início: as tarefas da pessoa, o que vem nos próximos 7 dias, os avisos não lidos e a carteira. */
export default function ResumoDoDia() {
  const hoje = hojeBR();
  const ate = somarDias(hoje, 6);
  const tarefas = useQuery({ queryKey: ["tarefas", "resumo"], queryFn: () => api.get("/tarefas/resumo") });
  const semana = useQuery({ queryKey: ["agenda", "camadas", hoje, ate, ""], queryFn: () => api.get("/agenda-geral/camadas", { de: hoje, ate }) });
  const avisos = useQuery({ queryKey: ["notificacoes", "inicio"], queryFn: () => api.get("/notificacoes", { nao_lidas: 1, limite: 4 }) });
  const carteira = useQuery({ queryKey: ["painel-carteira"], queryFn: () => api.get("/painel-carteira") });
  const proximos = useMemo(() => normalizarCamadas({ camadas: semana.data }).filter((i) => i.camada !== "evento" || i.dia >= hoje), [semana.data, hoje]);
  const t = tarefas.data;
  const c = carteira.data;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Cartao titulo="Suas tarefas" icone={ListChecks} to="/bpo/tarefas" rotuloLink="Abrir as tarefas" carregando={tarefas.isLoading} erro={tarefas.error}>
        <div className="grid grid-cols-3 gap-2">
          <Numero valor={t?.minhas} rotulo="em aberto" />
          <Numero valor={t?.minhas_atrasadas} rotulo="atrasadas" alerta={(t?.minhas_atrasadas ?? 0) > 0} />
          <Numero valor={t?.hoje} rotulo="vencem hoje (todas)" />
        </div>
        {(t?.sem_responsavel ?? 0) > 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{plural(t.sem_responsavel, "tarefa", "tarefas")} sem responsável.</p>}
      </Cartao>

      <Cartao titulo="Próximos 7 dias" icone={CalendarDays} to="/bpo/agenda" rotuloLink="Abrir a agenda" carregando={semana.isLoading} erro={semana.error}>
        {proximos.length === 0 ? <p className="text-muted-foreground">Nada marcado para a semana.</p> : (
          <ul className="space-y-1">
            {proximos.slice(0, 5).map((i) => (
              <li key={i.id} className="flex items-center gap-2 truncate text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: i.cor }} aria-hidden="true" />
                <span className="tabular-nums text-muted-foreground">{i.dia.slice(8, 10)}/{i.dia.slice(5, 7)}</span>
                <span className="truncate">{i.titulo}</span>
              </li>
            ))}
            {proximos.length > 5 && <li className="text-xs text-muted-foreground">e mais {proximos.length - 5}</li>}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Avisos" icone={Bell} to="/notificacoes" rotuloLink="Ver todos os avisos" carregando={avisos.isLoading} erro={avisos.error}>
        {(avisos.data || []).length === 0 ? <p className="text-muted-foreground">Nenhum aviso novo.</p> : (
          <ul className="space-y-1.5">
            {avisos.data.map((n) => <li key={n.id} className="text-xs"><span className="font-medium">{n.titulo}</span> <span className="text-muted-foreground">· {quandoFoi(n.createdAt)}</span></li>)}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Carteira" icone={PieChart} to="/inicio/carteira" rotuloLink="Abrir o painel da carteira" carregando={carteira.isLoading} erro={carteira.error}>
        <div className="grid grid-cols-3 gap-2">
          <Numero valor={c?.total} rotulo="empresas" />
          <Numero valor={c?.carteiras?.bpo} rotulo="no BPO" />
          <Numero valor={c?.carteiras?.diagnostico} rotulo="com diagnóstico" />
        </div>
        {c && c.saude.com_faltas > 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{plural(c.saude.com_faltas, "empresa", "empresas")} com cadastro incompleto.</p>}
      </Cartao>
    </div>
  );
}
