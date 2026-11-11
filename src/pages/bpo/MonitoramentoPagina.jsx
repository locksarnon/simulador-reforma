import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import BotaoExportar from "@/components/BotaoExportar";
import AvisoDoModo from "@/components/monitoramento/AvisoDoModo";
import ListaDePrevistas from "@/components/ListaDePrevistas";
import { useCarteiras } from "@/lib/useCarteiras";
import { naCarteira } from "@/lib/servicos";
import { mascararDocumento } from "@/lib/clientes";
import { NIVEIS, quandoConsultou, SEM_CONSULTA, tomDaNota, useEstadoMonitoramento } from "@/lib/monitoramento";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Ponto({ nivel, rotulo }) {
  const n = NIVEIS[nivel] || SEM_CONSULTA;
  return <span className={`inline-block h-3 w-3 rounded-full ${n.ponto}`} title={`${rotulo}: ${n.rotulo}`} aria-label={`${rotulo}: ${n.rotulo}`} />;
}

/**
 * BPO Fiscal > Monitoramento fiscal: a carteira numa tabela, uma bolinha por assunto (situação, declarações, guias, caixa postal,
 * parcelamentos, MEI, procuração), a nota de saúde fiscal e a atualização em lote.
 */
export default function MonitoramentoPagina() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const estado = useEstadoMonitoramento();
  const { empresas, mapa, carregando } = useCarteiras();
  const painel = useQuery({ queryKey: ["monitoramento", "painel"], queryFn: () => api.get("/monitoramento/painel") });
  const [filtro, setFiltro] = useState({ busca: "", nivel: "" });
  const [marcadas, setMarcadas] = useState(new Set());
  const [lote, setLote] = useState(null);
  const grupos = (estado.data?.grupos || []).filter((g) => g.id !== "processos");
  const porEmpresa = useMemo(() => new Map((painel.data || []).map((p) => [p.empresa_id, p])), [painel.data]);

  const lista = useMemo(() => {
    const q = filtro.busca.trim().toLowerCase();
    return empresas
      .filter((e) => naCarteira(mapa.get(e.id)?.BPO_FISCAL))
      .filter((e) => !q || e.razao_social.toLowerCase().includes(q) || String(e.cnpj_cpf || "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "§"))
      .map((e) => ({ e, p: porEmpresa.get(e.id) }))
      .filter(({ p }) => !filtro.nivel || (filtro.nivel === "SEM" ? !p : Object.values(p?.grupos || {}).includes(filtro.nivel)))
      .sort((a, b) => (a.p?.score ?? 101) - (b.p?.score ?? 101) || a.e.razao_social.localeCompare(b.e.razao_social, "pt-BR"));
  }, [empresas, mapa, porEmpresa, filtro]);

  const contagem = useMemo(() => {
    const c = { CRITICO: 0, ATENCAO: 0, OK: 0, SEM: 0 };
    for (const { p } of lista) {
      if (!p) { c.SEM += 1; continue; }
      const v = Object.values(p.grupos);
      if (v.includes("CRITICO")) c.CRITICO += 1; else if (v.includes("ATENCAO")) c.ATENCAO += 1; else c.OK += 1;
    }
    return c;
  }, [lista]);

  const atualizar = useMutation({
    mutationFn: (ids) => api.post("/monitoramento/lote", { empresa_ids: ids }),
    onSuccess: (l) => {
      setLote(l);
      const passo = async () => {
        const s = await api.get(`/monitoramento/lote/${l.id}`).catch(() => null);
        if (!s) return;
        setLote(s);
        qc.invalidateQueries({ queryKey: ["monitoramento", "painel"] });
        if (!s.fim) setTimeout(passo, 3000); else { setMarcadas(new Set()); toast({ title: "Atualização concluída", description: `${s.feitas - s.erros} consulta(s)${s.erros ? `; ${s.erros} com erro` : ""}.` }); }
      };
      setTimeout(passo, 2000);
    },
    onError: (e) => toast({ title: "Não foi possível atualizar", description: e.message, variant: "destructive" }),
  });
  const rodando = lote && !lote.fim;
  const desligado = estado.data?.modo === "DESLIGADO";
  const alvos = marcadas.size ? [...marcadas] : lista.map(({ e }) => e.id);
  const todas = lista.length > 0 && lista.every(({ e }) => marcadas.has(e.id));

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "BPO Fiscal", to: "/area/bpo" }, { label: "Monitoramento fiscal" }]}
        title="Monitoramento fiscal"
        subtitle="A situação de cada cliente na Receita pelo Integra Contador do Serpro: situação fiscal, declarações, guias, caixa postal, parcelamentos, MEI e procuração."
        actions={(
          <button type="button" disabled={desligado || rodando || !alvos.length} onClick={() => atualizar.mutate(alvos)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {rodando ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {lote.feitas} de {lote.total || "…"}</> : <><RefreshCw className="h-4 w-4" aria-hidden="true" /> Atualizar {marcadas.size ? `${marcadas.size} marcado(s)` : `os ${alvos.length} da lista`}</>}
          </button>
        )}
      />
      <div className="px-6 lg:px-8 py-5 space-y-4">
        <AvisoDoModo modo={estado.data?.modo} ehAdmin={user?.role === "admin"} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[["CRITICO", "Com algo crítico"], ["ATENCAO", "Pedem atenção"], ["OK", "Em dia"], ["SEM", "Sem consulta"]].map(([n, r]) => (
            <button key={n} type="button" onClick={() => setFiltro((f) => ({ ...f, nivel: f.nivel === n ? "" : n }))} aria-pressed={filtro.nivel === n} className={`rounded-xl border bg-card px-4 py-3 text-left hover:bg-muted/50 ${filtro.nivel === n ? "ring-2 ring-primary" : "border-border"}`}>
              <p className="text-xs text-muted-foreground">{r}</p><p className="text-xl font-semibold tabular-nums">{contagem[n]}</p>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex-1 min-w-[200px] space-y-1"><span className="block text-xs text-muted-foreground">Buscar</span><input type="search" className={`${campo} w-full`} placeholder="Nome ou CNPJ" value={filtro.busca} onChange={(e) => setFiltro((f) => ({ ...f, busca: e.target.value }))} /></label>
          <BotaoExportar titulo="Monitoramento fiscal" linhas={lista} colunas={[
            { chave: "cliente", rotulo: "Cliente", valor: ({ e }) => e.razao_social }, { chave: "doc", rotulo: "CNPJ/CPF", valor: ({ e }) => e.cnpj_cpf || "" },
            { chave: "nota", rotulo: "Saúde fiscal", valor: ({ p }) => (p ? p.score : "") },
            ...grupos.map((g) => ({ chave: g.id, rotulo: g.rotulo, valor: ({ p }) => (NIVEIS[p?.grupos?.[g.id]]?.rotulo || "") })),
            { chave: "alertas", rotulo: "Alertas", valor: ({ p }) => (p?.alertas || []).map((a) => a.titulo).join(" | ") },
            { chave: "quando", rotulo: "Atualizado em", valor: ({ p }) => (p ? quandoConsultou(p.atualizado) : "") },
          ]} />
        </div>
        <p className="text-xs text-muted-foreground">Aparecem só os clientes com BPO fiscal ativo. Para incluir um cliente, ligue o BPO fiscal dele em <Link to="/" className="text-primary underline">Clientes</Link>.</p>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-[13px]" aria-label="Monitoramento da carteira">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="w-8 px-3 py-2"><input type="checkbox" aria-label="Marcar todos" checked={todas} onChange={() => setMarcadas(todas ? new Set() : new Set(lista.map(({ e }) => e.id)))} /></th>
                <th className="px-2 py-2">Cliente</th><th className="px-2 py-2 text-right">Saúde</th>
                {grupos.map((g) => <th key={g.id} className="px-2 py-2 text-center">{g.rotulo}</th>)}
                <th className="px-2 py-2">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {(carregando || painel.isLoading) && <tr><td colSpan={grupos.length + 4} className="py-10 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</td></tr>}
              {!carregando && lista.length === 0 && <tr><td colSpan={grupos.length + 4} className="py-10 text-center text-muted-foreground">{filtro.busca || filtro.nivel ? "Nenhum cliente do BPO com esses filtros." : <>Nenhum cliente com BPO fiscal ativo. Ligue o BPO fiscal em <Link to="/" className="text-primary underline">Clientes</Link>.</>}</td></tr>}
              {lista.map(({ e, p }) => (
                <tr key={e.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2"><input type="checkbox" aria-label={`Marcar ${e.razao_social}`} checked={marcadas.has(e.id)} onChange={() => setMarcadas((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })} /></td>
                  <td className="px-2 py-2"><Link to={`/bpo/monitoramento/${e.id}`} className="font-medium hover:text-primary hover:underline">{e.razao_social}</Link><p className="text-[11px] text-muted-foreground tabular-nums">{mascararDocumento(e.cnpj_cpf) || "sem CNPJ"} · {e.regime_atual || "regime não informado"}</p>{p?.alertas?.[0] && <p className="text-[11px] text-red-700 dark:text-red-400 truncate max-w-md" title={p.alertas.map((a) => a.titulo).join("\n")}>{p.alertas[0].titulo}{p.alertas.length > 1 ? ` (+${p.alertas.length - 1})` : ""}</p>}</td>
                  <td className={`px-2 py-2 text-right font-semibold tabular-nums ${p ? tomDaNota(p.score) : "text-muted-foreground"}`}>{p ? p.score : "—"}</td>
                  {grupos.map((g) => <td key={g.id} className="px-2 py-2 text-center"><Ponto nivel={p?.grupos?.[g.id]} rotulo={g.rotulo} /></td>)}
                  <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">{p ? quandoConsultou(p.atualizado) : "nunca"}{p?.simulado ? " · demo" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Ordenado da menor para a maior saúde fiscal. Bolinha: vermelha crítico, amarela atenção, verde em dia, azul informativo, cinza sem consulta. A rotina automática e o envio de guias ficam em Administração &gt; Parâmetros e rotinas.</p>
        <ListaDePrevistas moduloId="monitoramento" titulo="O que ainda vem no monitoramento" />
      </div>
    </div>
  );
}
