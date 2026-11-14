import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import PrepararAtualizacao from "@/components/monitoramento/PrepararAtualizacao";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import AvisoDoModo from "@/components/monitoramento/AvisoDoModo";
import LegendaNiveis from "@/components/monitoramento/LegendaNiveis";
import ListaDePrevistas from "@/components/ListaDePrevistas";
import { useCarteiras } from "@/lib/useCarteiras";
import { naCarteira } from "@/lib/servicos";
import { mascararDocumento } from "@/lib/clientes";
import { plural } from "@/lib/plural";
import { NIVEIS, quandoConsultou, SEM_CONSULTA, tomDaNota, useEstadoMonitoramento } from "@/lib/monitoramento";

function Ponto({ nivel, rotulo, falhou }) {
  const n = NIVEIS[nivel] || SEM_CONSULTA;
  const texto = `${rotulo}: ${n.rotulo}${falhou ? " (a última consulta falhou)" : ""}`;
  return <span className={`inline-block h-3 w-3 rounded-full align-middle ${n.ponto} ${falhou ? "ring-2 ring-amber-500 ring-offset-1 ring-offset-background" : ""}`} title={texto} aria-label={texto} />;
}

const pior = (p) => { if (!p) return "SEM"; const v = Object.values(p.grupos || {}); return v.includes("CRITICO") ? "CRITICO" : v.includes("ATENCAO") ? "ATENCAO" : "OK"; };

/**
 * BPO Fiscal > Monitoramento fiscal: a carteira na tabela padrão; uma coluna por assunto, na ordem das abas do cliente.
 * A linha abre o monitoramento do cliente; a bolinha abre direto o assunto.
 */
export default function MonitoramentoPagina() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [preparando, setPreparando] = useState(null);
  const estado = useEstadoMonitoramento();
  const { empresas, mapa, carregando } = useCarteiras();
  const painel = useQuery({ queryKey: ["monitoramento", "painel"], queryFn: () => api.get("/monitoramento/painel") });
  const [nivel, setNivel] = useState("");
  const [marcadas, setMarcadas] = useState(new Set());
  const [lote, setLote] = useState(null);
  const grupos = (estado.data?.grupos || []).filter((g) => g.id !== "processos");
  const porEmpresa = useMemo(() => new Map((painel.data || []).map((p) => [p.empresa_id, p])), [painel.data]);

  const carteira = useMemo(() => empresas
    .filter((e) => naCarteira(mapa.get(e.id)?.BPO_FISCAL))
    .map((e) => ({ id: e.id, e, p: porEmpresa.get(e.id) })), [empresas, mapa, porEmpresa]);
  const lista = useMemo(() => carteira.filter(({ p }) => !nivel || pior(p) === nivel), [carteira, nivel]);
  const contagem = useMemo(() => {
    const c = { CRITICO: 0, ATENCAO: 0, OK: 0, SEM: 0 };
    for (const { p } of carteira) c[pior(p)] += 1;
    return c;
  }, [carteira]);

  const atualizar = useMutation({
    mutationFn: (pedido) => api.post("/monitoramento/lote", pedido),
    onSuccess: (l) => {
      setPreparando(null);
      setLote(l);
      const passo = async () => {
        const s = await api.get(`/monitoramento/lote/${l.id}`).catch(() => null);
        if (!s) return;
        setLote(s);
        qc.invalidateQueries({ queryKey: ["monitoramento", "painel"] });
        if (!s.fim) setTimeout(passo, 3000); else { setMarcadas(new Set()); toast({ title: "Atualização concluída", description: `${plural(s.feitas - s.erros, "consulta", "consultas")}${s.erros ? `; ${s.erros} com erro ou sem resultado` : ""}.` }); }
      };
      setTimeout(passo, 2000);
    },
    onError: (e) => toast({ title: "Não foi possível atualizar", description: e.message, variant: "destructive" }),
  });
  const rodando = lote && !lote.fim;
  const desligado = estado.data?.modo === "DESLIGADO";
  const alvos = marcadas.size ? [...marcadas] : lista.map(({ e }) => e.id);
  const abrir = (id, aba) => navegar(`/bpo/monitoramento/${id}${aba ? `?aba=${aba}` : ""}`);

  const colunas = [
    { chave: "cliente", rotulo: "Cliente", valor: ({ e }) => e.razao_social, render: ({ e }) => <Link to={`/bpo/monitoramento/${e.id}`} onClick={(ev) => ev.stopPropagation()} className="font-medium hover:text-primary hover:underline">{e.razao_social}</Link> },
    { chave: "cnpj", rotulo: "CNPJ", valor: ({ e }) => mascararDocumento(e.cnpj_cpf) || "", render: ({ e }) => <span className="tabular-nums">{mascararDocumento(e.cnpj_cpf) || "—"}</span> },
    { chave: "regime", rotulo: "Regime", valor: ({ e }) => e.regime_atual || "" },
    { chave: "saude", rotulo: "Saúde", tipo: "numero", alinhar: "direita", valor: ({ p }) => (p ? p.score : null), render: ({ p }) => <span className={`font-semibold ${p ? tomDaNota(p.score) : "text-muted-foreground"}`}>{p ? p.score : "—"}</span> },
    ...grupos.map((g) => ({
      chave: `g-${g.id}`, rotulo: g.rotulo, alinhar: "centro", dica: `Abrir ${g.rotulo} do cliente`,
      valor: ({ p }) => (NIVEIS[p?.grupos?.[g.id]] || SEM_CONSULTA).rotulo,
      render: ({ p }) => <Ponto nivel={p?.grupos?.[g.id]} rotulo={g.rotulo} falhou={!!p?.grupos_falha?.[g.id]} />,
      aoClicar: ({ e }) => abrir(e.id, g.id),
    })),
    { chave: "certidoes", rotulo: "Certidões", alinhar: "centro", valor: () => "", render: () => <span className="text-xs text-primary">Abrir</span>, aoClicar: ({ e }) => abrir(e.id, "certidoes"), filtravel: false, ordenavel: false },
    { chave: "alerta", rotulo: "Alerta principal", valor: ({ p }) => p?.alertas?.[0]?.titulo || "", render: ({ p }) => (p?.alertas?.[0] ? <span className="text-red-700 dark:text-red-400" title={p.alertas.map((a) => a.titulo).join("\n")}>{p.alertas[0].titulo}{p.alertas.length > 1 ? ` (+${p.alertas.length - 1})` : ""}</span> : "") },
    { chave: "atualizado", rotulo: "Atualizado", tipo: "data", valor: ({ p }) => p?.atualizado || null, render: ({ p }) => <span className="text-xs text-muted-foreground">{p ? quandoConsultou(p.atualizado) : "nunca"}{p?.simulado ? " · demo" : ""}</span> },
  ];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "BPO Fiscal", to: "/area/bpo" }, { label: "Monitoramento fiscal" }]}
        title="Monitoramento fiscal"
        actions={(
          user?.role === "admin" && <button type="button" disabled={desligado || rodando || !alvos.length} onClick={() => setPreparando(alvos)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {rodando ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {lote.feitas} de {lote.total || "…"}</> : <><RefreshCw className="h-4 w-4" aria-hidden="true" /> Preparar atualização</>}
          </button>
        )}
      />
      <div className="px-6 lg:px-8 py-5 space-y-4">
        <AvisoDoModo modo={estado.data?.modo} ehAdmin={user?.role === "admin"} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[["CRITICO", "Com algo crítico"], ["ATENCAO", "Pedem atenção"], ["OK", "Em dia"], ["SEM", "Sem consulta"]].map(([n, r]) => (
            <button key={n} type="button" onClick={() => setNivel((v) => (v === n ? "" : n))} aria-pressed={nivel === n} className={`rounded-xl border bg-card px-4 py-3 text-left hover:bg-muted/50 ${nivel === n ? "ring-2 ring-primary" : "border-border"}`}>
              <p className="text-xs text-muted-foreground">{r}</p><p className="text-xl font-semibold tabular-nums">{contagem[n]}</p>
            </button>
          ))}
        </div>
        {(carregando || painel.isLoading) ? (
          <p className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>
        ) : (
          <TabelaPadrao
            id="monitoramento-carteira"
            ariaLabel="Monitoramento da carteira"
            colunas={colunas}
            linhas={lista}
            tamanhoInicial={50}
            aoClicarLinha={({ e }) => abrir(e.id)}
            selecao={{ marcadas, aoMudar: setMarcadas }}
            vazio={nivel ? "Nenhum cliente do BPO nesse nível." : <>Nenhum cliente com BPO fiscal ativo. Ligue o BPO fiscal em <Link to="/" className="text-primary underline">Clientes</Link>.</>}
            rodape={<LegendaNiveis />}
          />
        )}
        <ListaDePrevistas moduloId="monitoramento" titulo="O que ainda vem no monitoramento" />
      </div>
      {preparando && <PrepararAtualizacao ids={preparando} servicos={estado.data?.servicos || []} executar={atualizar.mutate} executando={atualizar.isPending} fechar={() => setPreparando(null)} />}
    </div>
  );
}
