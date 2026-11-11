import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import SeletorDeEmpresa from "@/components/SeletorDeEmpresa";
import DialogoEvento from "@/components/agenda/DialogoEvento";
import { useColaboradores } from "@/lib/useTags";
import { CORES_DAS_TAGS } from "@/lib/tags";
import { hojeBR, competenciaAtual, nomeDaCompetencia } from "@/lib/tarefas";
import { andar, CAMADAS, DIAS_DA_SEMANA, gradeDoMes, normalizarCamadas, periodoDaVisao, porDia, semanaDe, tituloDaVisao } from "@/lib/agenda";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const VISOES = [["mes", "Mês"], ["semana", "Semana"], ["dia", "Dia"]];
const fmtDia = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function Item({ item, aoAbrir }) {
  return (
    <button type="button" onClick={() => aoAbrir(item)} title={[item.titulo, item.detalhe].filter(Boolean).join(" · ")}
      className="flex w-full items-center gap-1.5 truncate rounded px-1 text-left text-[11px] leading-5 hover:bg-muted">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.cor }} aria-hidden="true" />
      <span className="truncate">{item.hora ? `${item.hora} ` : ""}{item.titulo}</span>
    </button>
  );
}

function ListaDoDia({ dia, itens, aoAbrir, aoNovo }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-sm font-semibold">{fmtDia(dia)} · {DIAS_DA_SEMANA[(new Date(Date.parse(dia)).getUTCDay() + 6) % 7]}</h2>
        <button type="button" onClick={() => aoNovo(dia)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Evento neste dia</button>
      </div>
      {itens.length === 0 && <p className="py-3 text-center text-sm text-muted-foreground">Nada neste dia.</p>}
      <ul className="space-y-1.5">
        {itens.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => aoAbrir(i)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: i.cor }} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{i.hora ? `${i.hora} · ` : ""}{i.titulo}</span>
                <span className="block text-[11px] text-muted-foreground">{CAMADAS[i.camada].rotulo}{i.detalhe ? ` · ${i.detalhe}` : ""}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AbaCalendario({ usuario, empresas, colaboradores, tipos }) {
  const navegar = useNavigate();
  const hoje = hojeBR();
  const [visao, setVisao] = useState("mes");
  const [dia, setDia] = useState(hoje);
  const [empresa, setEmpresa] = useState("");
  const [ligadas, setLigadas] = useState(Object.keys(CAMADAS));
  const [dialogo, setDialogo] = useState(null);
  const periodo = periodoDaVisao(visao, dia);
  const camadas = useQuery({ queryKey: ["agenda", "camadas", periodo.de, periodo.ate, empresa], queryFn: () => api.get("/agenda-geral/camadas", { ...periodo, ...(empresa ? { empresa_id: empresa } : {}) }) });
  const reforma = useQuery({ queryKey: ["agenda", "reforma", empresa], queryFn: () => api.get("/agenda-reforma/marcos", { passados: 1, ...(empresa ? { empresa_id: empresa } : {}) }), staleTime: 10 * 60_000 });
  const nomeDaEmpresa = useMemo(() => { const m = new Map(empresas.map((e) => [e.id, e.razao_social])); return (id) => m.get(id) || ""; }, [empresas]);
  const itens = useMemo(() => normalizarCamadas({
    camadas: camadas.data,
    reforma: (reforma.data?.marcos || []).filter((m) => m.data >= periodo.de && m.data <= periodo.ate),
    tipos, nomeDaEmpresa,
  }), [camadas.data, reforma.data, tipos, nomeDaEmpresa, periodo.de, periodo.ate]);
  const mapa = useMemo(() => porDia(itens, ligadas), [itens, ligadas]);
  const alternarCamada = (c) => setLigadas((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]));
  const abrir = (i) => {
    if (i.camada === "evento") setDialogo({ evento: i.original });
    else if (i.link) navegar(i.link);
    else if (i.camada === "obrigacao") toast({ title: i.titulo, description: `${i.detalhe}. ${i.original.fonte ? `${i.original.fonte.norma}, ${i.original.fonte.dispositivo}.` : "Fonte oficial não confirmada."}` });
  };
  const ano = Number(dia.slice(0, 4));
  const mes = Number(dia.slice(5, 7));
  const regimeSemCadastro = empresa && camadas.data && camadas.data.regime === null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Visão do calendário">
          {VISOES.map(([v, r]) => <button key={v} type="button" aria-pressed={visao === v} onClick={() => setVisao(v)} className={`rounded px-3 py-1 ${visao === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{r}</button>)}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDia(andar(visao, dia, -1))} className="rounded-md border border-border p-1.5 hover:bg-muted" aria-label="Anterior"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => setDia(hoje)} className="rounded-md border border-border px-3 py-1 hover:bg-muted">Hoje</button>
          <button type="button" onClick={() => setDia(andar(visao, dia, 1))} className="rounded-md border border-border p-1.5 hover:bg-muted" aria-label="Próximo"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <h2 className="font-heading text-base font-semibold capitalize" aria-live="polite">{tituloDaVisao(visao, dia)}</h2>
        <div className="ml-auto w-64"><SeletorDeEmpresa empresas={empresas} valor={empresa} aoMudar={setEmpresa} rotulo="Empresa" opcional={false} placeholder="Todas as empresas" /></div>
        <button type="button" onClick={() => setDialogo({ evento: null, dia: visao === "mes" && dia.slice(0, 7) !== hoje.slice(0, 7) ? dia : hoje })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Novo evento</button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Camadas do calendário">
        {Object.entries(CAMADAS).map(([c, info]) => (
          <button key={c} type="button" aria-pressed={ligadas.includes(c)} onClick={() => alternarCamada(c)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${ligadas.includes(c) ? "border-foreground/30 bg-muted/60" : "border-border opacity-50"}`}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: info.cor }} aria-hidden="true" />{info.rotulo}
          </button>
        ))}
        {(camadas.isFetching || reforma.isFetching) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando" />}
      </div>
      {regimeSemCadastro && <p role="status" className="text-xs text-amber-700 dark:text-amber-400">Esta empresa não tem regime no cadastro: aparecem todas as obrigações federais. Preencha o regime em Grupos e empresas.</p>}
      {camadas.error && <p role="alert" className="text-sm">Não foi possível carregar o calendário. <button type="button" onClick={() => camadas.refetch()} className="text-primary hover:underline">Tentar de novo</button></p>}

      {visao === "mes" && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] table-fixed text-sm" aria-label={`Calendário de ${tituloDaVisao("mes", dia)}`}>
            <thead><tr>{DIAS_DA_SEMANA.map((d) => <th key={d} className="border-b border-border py-1.5 text-xs font-medium uppercase text-muted-foreground">{d}</th>)}</tr></thead>
            <tbody>
              {gradeDoMes(ano, mes).map((semana) => (
                <tr key={semana[0].dia}>
                  {semana.map(({ dia: d, doMes }) => {
                    const doDia = mapa.get(d) || [];
                    return (
                      <td key={d} className={`h-28 border border-border/60 p-1 align-top ${doMes ? "" : "bg-muted/30 text-muted-foreground"}`}>
                        <button type="button" onClick={() => { setDia(d); setVisao("dia"); }} className={`mb-0.5 rounded px-1 text-xs ${d === hoje ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted"}`} aria-label={`Abrir o dia ${fmtDia(d)}`}>{Number(d.slice(8, 10))}</button>
                        {doDia.slice(0, 3).map((i) => <Item key={i.id} item={i} aoAbrir={abrir} />)}
                        {doDia.length > 3 && <button type="button" onClick={() => { setDia(d); setVisao("dia"); }} className="px-1 text-[11px] text-primary hover:underline">+{doDia.length - 3} mais</button>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visao === "semana" && (
        <div className="grid gap-2 md:grid-cols-7">
          {semanaDe(dia).map((d) => <ListaDoDia key={d} dia={d} itens={mapa.get(d) || []} aoAbrir={abrir} aoNovo={(x) => setDialogo({ evento: null, dia: x })} />)}
        </div>
      )}
      {visao === "dia" && <ListaDoDia dia={dia} itens={mapa.get(dia) || []} aoAbrir={abrir} aoNovo={(x) => setDialogo({ evento: null, dia: x })} />}

      <p className="text-xs text-muted-foreground">Tarefas, obrigações, datas da Reforma e certificados vêm dos seus módulos; para mudar, use o módulo. Clique num evento para editar.</p>
      {dialogo && <DialogoEvento key={dialogo.evento?.id || dialogo.dia} evento={dialogo.evento} diaInicial={dialogo.dia} tipos={tipos} empresas={empresas} colaboradores={colaboradores} usuario={usuario} empresaInicial={empresa} aoFechar={() => setDialogo(null)} />}
    </div>
  );
}

function AbaObrigacoes({ empresas }) {
  const [mes, setMes] = useState(competenciaAtual());
  const [empresa, setEmpresa] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["agenda", "obrigacoes", mes, empresa], queryFn: () => api.get("/agenda-geral/obrigacoes", { mes, ...(empresa ? { empresa_id: empresa } : {}) }), enabled: /^\d{4}-\d{2}$/.test(mes) });
  const nomeDe = useMemo(() => new Map((data?.vencimentos || []).map((v) => [v.obrigacao, v.nome])), [data]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Mês do vencimento</span><input type="month" className={campo} value={mes} onChange={(e) => setMes(e.target.value)} /></label>
        <div className="w-72"><SeletorDeEmpresa empresas={empresas} valor={empresa} aoMudar={setEmpresa} rotulo="Empresa (filtra pelo regime)" opcional={false} placeholder="Todas as obrigações" /></div>
      </div>
      {data?.empresa && !data.empresa.regime_atual && <p role="status" className="text-xs text-amber-700 dark:text-amber-400">{data.empresa.razao_social} não tem regime no cadastro: aparecem todas as obrigações. Preencha o regime em Grupos e empresas.</p>}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-[13px] leading-5" aria-label="Obrigações federais do mês">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-3 py-2">Data</th><th className="px-3 py-2">Obrigação</th><th className="px-3 py-2">Competência</th><th className="px-3 py-2">Vale para</th><th className="px-3 py-2">Fonte oficial</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</td></tr>}
            {error && <tr><td colSpan={5} className="py-8 text-center" role="alert">Não foi possível carregar as obrigações.</td></tr>}
            {data && data.vencimentos.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Nenhuma obrigação da tabela vence em {nomeDaCompetencia(mes)}.</td></tr>}
            {(data?.vencimentos || []).map((v) => (
              <tr key={`${v.obrigacao}-${v.competencia}`} className="border-b border-border/60 align-top">
                <td className="px-3 py-2 whitespace-nowrap"><p className="font-medium tabular-nums">{fmtDia(v.data)}</p>{v.movida && <p className="text-[11px] text-muted-foreground">data legal {fmtDia(v.data_legal)}</p>}</td>
                <td className="px-3 py-2"><p className="font-medium">{v.nome}</p><p className="text-[11px] text-muted-foreground">{v.tipo === "PAGAMENTO" ? "Pagamento" : "Declaração"}{v.condicao ? ` · ${v.condicao}` : ""}</p></td>
                <td className="px-3 py-2 tabular-nums">{v.competencia}</td>
                <td className="px-3 py-2">{v.regimes === "TODOS" ? "Todos os regimes" : v.regimes.join(", ")}</td>
                <td className="px-3 py-2 max-w-[340px]">
                  {v.fonte ? (
                    <>
                      <a href={v.fonte.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{v.fonte.norma}, {v.fonte.dispositivo} <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>
                      {v.fonte.trecho && <p className="text-[11px] text-muted-foreground">“{v.fonte.trecho}”</p>}
                    </>
                  ) : null}
                  {!v.confirmado && <span className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">não confirmado</span>}
                  {v.observacao && <p className="text-[11px] text-muted-foreground">{v.observacao}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.empresas && (
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <h2 className="font-heading text-sm font-semibold">Empresas do BPO fiscal neste mês</h2>
          {data.empresas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma empresa no BPO fiscal ainda. <Link to="/clientes/servicos-contratados" className="text-primary hover:underline">Defina a carteira</Link>.</p>}
          <ul className="divide-y divide-border/60">
            {data.empresas.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                <span className="font-medium">{e.razao_social}</span>
                <span className="text-xs text-muted-foreground">{e.regime_atual || "sem regime no cadastro"}</span>
                <span className="ml-auto flex flex-wrap gap-1">{e.obrigacoes.map((id) => <span key={id} className="rounded bg-muted px-1.5 text-[11px]">{nomeDe.get(id) || id}</span>)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Datas calculadas pela regra de cada norma. Sábado, domingo, feriados nacionais fixos (Lei nº 662/1949, Lei nº 6.802/1980 e Lei nº 14.759/2023), segunda e terça de carnaval e Corpus Christi (Resolução CMN nº 4.880/2020, sem expediente bancário) movem a data conforme a norma manda (antecipar ou prorrogar).
        Feriados estaduais e municipais e os pontos facultativos não entram: confira a data na sua praça. Regra sem fonte oficial confirmada aparece como "não confirmado".
      </p>
    </div>
  );
}

function AbaTipos({ ehAdmin }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const { data: tipos = [] } = useQuery({ queryKey: ["agenda", "tipos"], queryFn: () => api.get("/agenda-geral/tipos") });
  const [novo, setNovo] = useState({ nome: "", cor: CORES_DAS_TAGS[1] });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["agenda"] });
  const falha = (t) => (e) => toast({ title: t, description: e.message, variant: "destructive" });
  const criar = useMutation({ mutationFn: () => api.post("/agenda-geral/tipos", novo), onSuccess: () => { setNovo((n) => ({ ...n, nome: "" })); recarregar(); toast({ title: "Tipo criado" }); }, onError: falha("Não foi possível criar") });
  const mudarCor = useMutation({ mutationFn: ({ id, cor }) => api.put(`/agenda-geral/tipos/${id}`, { cor }), onSuccess: recarregar, onError: falha("Não foi possível mudar a cor") });
  const apagar = useMutation({ mutationFn: (id) => api.delete(`/agenda-geral/tipos/${id}`), onSuccess: () => { recarregar(); toast({ title: "Tipo apagado" }); }, onError: falha("Não foi possível apagar") });
  return (
    <div className="max-w-xl space-y-3">
      {ehAdmin ? (
        <form onSubmit={(e) => { e.preventDefault(); if (novo.nome.trim()) criar.mutate(); }} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3 text-sm">
          <label className="space-y-1 flex-1 min-w-[160px]"><span className="block text-xs text-muted-foreground">Novo tipo de evento</span><input className={`${campo} w-full`} value={novo.nome} maxLength={40} onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))} placeholder="Ex.: Fechamento, Treinamento" /></label>
          <div className="flex gap-1" role="group" aria-label="Cor do novo tipo">{CORES_DAS_TAGS.map((c) => <button key={c} type="button" aria-pressed={novo.cor === c} aria-label={`Cor ${c}`} onClick={() => setNovo((n) => ({ ...n, cor: c }))} className={`h-6 w-6 rounded-full border-2 ${novo.cor === c ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: c }} />)}</div>
          <button type="submit" disabled={!novo.nome.trim() || criar.isPending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-60"><Plus className="h-4 w-4" aria-hidden="true" /> Criar</button>
        </form>
      ) : <p className="text-sm text-muted-foreground">Só administradores criam e mudam os tipos de evento.</p>}
      <ul className="divide-y divide-border rounded-xl border border-border bg-card" aria-label="Tipos de evento">
        {tipos.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.cor }} aria-hidden="true" />
            <span className="flex-1 font-medium">{t.nome}</span>
            {ehAdmin && (
              <>
                <div className="flex gap-1" role="group" aria-label={`Cor de ${t.nome}`}>{CORES_DAS_TAGS.slice(0, 6).map((c) => <button key={c} type="button" aria-label={`Mudar a cor de ${t.nome} para ${c}`} onClick={() => mudarCor.mutate({ id: t.id, cor: c })} className={`h-4 w-4 rounded-full border ${t.cor.toUpperCase() === c ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: c }} />)}</div>
                <button type="button" onClick={async () => { if (await confirmar({ titulo: `Apagar o tipo "${t.nome}"?`, descricao: "Os eventos desse tipo continuam, sem tipo.", rotulo: "Apagar" })) apagar.mutate(t.id); }} className="rounded p-1.5 text-destructive hover:bg-destructive/10" aria-label={`Apagar ${t.nome}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** BPO Fiscal > Obrigações e agenda: calendário geral do escritório, obrigações federais do mês e tipos de evento. */
export default function AgendaPagina() {
  const { user } = useAuth();
  const emp = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list() });
  const { data: colaboradores = [] } = useColaboradores();
  const { data: tipos = [] } = useQuery({ queryKey: ["agenda", "tipos"], queryFn: () => api.get("/agenda-geral/tipos") });
  const empresas = useMemo(() => [...(emp.data || [])].sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR")), [emp.data]);
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "BPO Fiscal", to: "/area/bpo" }, { label: "Obrigações e agenda" }]}
        title="Obrigações e agenda"
        subtitle="O calendário do escritório: eventos próprios, tarefas com prazo, obrigações federais, datas da Reforma e certificados vencendo."
      />
      <div className="px-6 lg:px-8 py-6">
        <Tabs defaultValue="calendario" className="space-y-4">
          <TabsList><TabsTrigger value="calendario">Calendário</TabsTrigger><TabsTrigger value="obrigacoes">Obrigações do mês</TabsTrigger><TabsTrigger value="tipos">Tipos de evento</TabsTrigger></TabsList>
          <TabsContent value="calendario"><AbaCalendario usuario={user} empresas={empresas} colaboradores={colaboradores} tipos={tipos} /></TabsContent>
          <TabsContent value="obrigacoes"><AbaObrigacoes empresas={empresas} /></TabsContent>
          <TabsContent value="tipos"><AbaTipos ehAdmin={user?.role === "admin"} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export { AbaCalendario, AbaObrigacoes, AbaTipos };
