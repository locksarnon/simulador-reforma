import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { useCarteiras } from "@/lib/useCarteiras";
import { naCarteira } from "@/lib/servicos";
import { NIVEIS, quandoConsultou, tomDaNota, useEstadoMonitoramento } from "@/lib/monitoramento";
import { SeloNivel } from "@/components/monitoramento/CartaoServico";
import AvisoDoModo from "@/components/monitoramento/AvisoDoModo";

const EH_CERTIDAO = /certid|cnd|crf|fgts/i;
const DIAS = 86_400_000;

function Cartao({ titulo, children, acao }) {
  return <section className="rounded-xl border border-border bg-card p-4 space-y-3"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{titulo}</h3>{acao}</div>{children}</section>;
}

/** Diferenças entre o cadastro e o que a Receita respondeu, e clientes do BPO sem acompanhamento. */
export function cruzarDados({ empresas, bpo, painel, ultimasPorEmpresa, agora = Date.now() }) {
  const achados = [];
  for (const e of empresas) {
    const p = painel.get(e.id);
    const doc = String(e.cnpj_cpf || "").replace(/\D/g, "");
    if (bpo.has(e.id) && doc.length !== 14 && doc.length !== 11) achados.push({ empresa: e, nivel: "ATENCAO", texto: "Sem CNPJ/CPF válido no cadastro: o monitoramento não consulta." });
    if (bpo.has(e.id) && !p) achados.push({ empresa: e, nivel: "ATENCAO", texto: "Do BPO, mas nunca consultado no monitoramento." });
    else if (bpo.has(e.id) && p && agora - new Date(p.atualizado).getTime() > 35 * DIAS) achados.push({ empresa: e, nivel: "ATENCAO", texto: `Última consulta há mais de 35 dias (${quandoConsultou(p.atualizado)}).` });
    const ult = ultimasPorEmpresa?.get(e.id) || {};
    const dte = ult.dte?.resumo?.titulo || "";
    const regime = String(e.regime_atual || "").toLowerCase();
    if (/optante simples/i.test(dte) && regime && !regime.includes("simples") && !regime.includes("mei")) achados.push({ empresa: e, nivel: "CRITICO", texto: `O cadastro diz "${e.regime_atual}", mas a Receita (DTE) diz "${dte}".` });
  }
  return achados;
}

/** BPO Fiscal > Análise de risco > Painel: a carteira pelos olhos do monitoramento fiscal e das certidões guardadas. */
export default function PainelDeRisco({ ehAdmin }) {
  const estado = useEstadoMonitoramento();
  const painelQ = useQuery({ queryKey: ["monitoramento", "painel"], queryFn: () => api.get("/monitoramento/painel") });
  const docsQ = useQuery({ queryKey: ["documentos", "todos"], queryFn: () => api.get("/documentos") });
  const { empresas, mapa, carregando } = useCarteiras();
  const grupos = (estado.data?.grupos || []).filter((g) => g.id !== "processos");
  const painel = useMemo(() => new Map((painelQ.data || []).map((p) => [p.empresa_id, p])), [painelQ.data]);
  const bpo = useMemo(() => new Set(empresas.filter((e) => naCarteira(mapa.get(e.id)?.BPO_FISCAL)).map((e) => e.id)), [empresas, mapa]);
  const nomeDe = useMemo(() => new Map(empresas.map((e) => [e.id, e.razao_social])), [empresas]);

  const resumo = useMemo(() => {
    const ps = painelQ.data || [];
    const c = { CRITICO: 0, ATENCAO: 0, OK: 0 };
    for (const p of ps) { const v = Object.values(p.grupos); if (v.includes("CRITICO")) c.CRITICO += 1; else if (v.includes("ATENCAO")) c.ATENCAO += 1; else c.OK += 1; }
    const media = ps.length ? Math.round(ps.reduce((s, p) => s + p.score, 0) / ps.length) : null;
    const porGrupo = grupos.map((g) => ({ ...g, CRITICO: ps.filter((p) => p.grupos[g.id] === "CRITICO").length, ATENCAO: ps.filter((p) => p.grupos[g.id] === "ATENCAO").length, OK: ps.filter((p) => p.grupos[g.id] === "OK" || p.grupos[g.id] === "INFO").length }));
    return { c, media, total: ps.length, porGrupo, top: [...ps].sort((a, b) => a.score - b.score).slice(0, 5) };
  }, [painelQ.data, grupos]);

  const fila = useMemo(() => (painelQ.data || []).flatMap((p) => p.alertas.map((a) => ({ ...a, empresa_id: p.empresa_id }))).sort((a, b) => (NIVEIS[b.nivel]?.peso ?? 0) - (NIVEIS[a.nivel]?.peso ?? 0)).slice(0, 50), [painelQ.data]);
  const certidoes = useMemo(() => (docsQ.data || []).filter((d) => EH_CERTIDAO.test(d.tipo?.nome || d.descricao || "")), [docsQ.data]);
  const radar = useMemo(() => ({
    vencidas: certidoes.filter((d) => d.situacao === "VENCIDO"),
    aVencer: certidoes.filter((d) => d.situacao === "A_VENCER"),
    validas: certidoes.filter((d) => d.situacao === "VALIDO"),
    semCertidao: [...bpo].filter((id) => !certidoes.some((d) => d.empresa_id === id)),
  }), [certidoes, bpo]);
  const achados = useMemo(() => cruzarDados({ empresas, bpo, painel }), [empresas, bpo, painel]);

  if (painelQ.isLoading || carregando) return <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>;
  return (
    <div className="space-y-4">
      <AvisoDoModo modo={estado.data?.modo} ehAdmin={ehAdmin} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Saúde fiscal média</p><p className={`text-2xl font-semibold tabular-nums ${resumo.media !== null ? tomDaNota(resumo.media) : ""}`}>{resumo.media ?? "—"}</p></div>
        <div className="rounded-xl border border-border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Com algo crítico</p><p className="text-2xl font-semibold tabular-nums text-red-700 dark:text-red-400">{resumo.c.CRITICO}</p></div>
        <div className="rounded-xl border border-border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Pedem atenção</p><p className="text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">{resumo.c.ATENCAO}</p></div>
        <div className="rounded-xl border border-border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Em dia</p><p className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{resumo.c.OK}</p></div>
        <div className="rounded-xl border border-border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Certidões vencidas</p><p className="text-2xl font-semibold tabular-nums">{radar.vencidas.length}</p></div>
      </div>
      {resumo.total === 0 && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Ainda não há consultas. Rode o <Link to="/bpo/monitoramento" className="text-primary underline">Monitoramento fiscal</Link> para a carteira e o painel se preenche.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Top 5 em risco">
          {resumo.top.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados.</p> : (
            <ol className="space-y-2">{resumo.top.map((p, i) => (
              <li key={p.empresa_id} className="flex items-center gap-2 text-sm"><span className="w-5 text-muted-foreground tabular-nums">{i + 1}.</span><Link to={`/bpo/monitoramento/${p.empresa_id}`} className="flex-1 truncate hover:text-primary hover:underline">{nomeDe.get(p.empresa_id) || "Cliente"}</Link><span className={`font-semibold tabular-nums ${tomDaNota(p.score)}`}>{p.score}</span></li>
            ))}</ol>
          )}
        </Cartao>
        <Cartao titulo="Indicadores por assunto">
          <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="py-1">Assunto</th><th className="py-1 text-right">Crítico</th><th className="py-1 text-right">Atenção</th><th className="py-1 text-right">Em dia</th></tr></thead>
            <tbody>{resumo.porGrupo.map((g) => <tr key={g.id} className="border-t border-border/60"><td className="py-1">{g.rotulo}</td><td className="py-1 text-right tabular-nums text-red-700 dark:text-red-400">{g.CRITICO}</td><td className="py-1 text-right tabular-nums text-amber-700 dark:text-amber-400">{g.ATENCAO}</td><td className="py-1 text-right tabular-nums">{g.OK}</td></tr>)}</tbody></table>
        </Cartao>
        <Cartao titulo={`Fila de prioridade (${fila.length})`} acao={<Link to="/bpo/monitoramento" className="text-xs text-primary hover:underline">Monitoramento</Link>}>
          {fila.length === 0 ? <p className="text-xs text-muted-foreground">Nada pedindo ação.</p> : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto">{fila.map((a, i) => <li key={i} className="flex items-start gap-2 text-xs"><SeloNivel nivel={a.nivel} /><span className="flex-1"><Link to={`/bpo/monitoramento/${a.empresa_id}`} className="font-medium hover:text-primary hover:underline">{nomeDe.get(a.empresa_id) || "Cliente"}</Link>: {a.titulo}</span></li>)}</ul>
          )}
        </Cartao>
        <Cartao titulo="Radar de certidões" acao={<Link to="/bpo/arquivos" className="text-xs text-primary hover:underline">Arquivos e documentos</Link>}>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Vencidas</dt><dd className="font-semibold tabular-nums text-red-700 dark:text-red-400">{radar.vencidas.length}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Vencem em breve</dt><dd className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">{radar.aVencer.length}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Válidas</dt><dd className="font-semibold tabular-nums">{radar.validas.length}</dd></div>
            <div><dt className="text-xs text-muted-foreground">BPO sem nenhuma</dt><dd className="font-semibold tabular-nums">{radar.semCertidao.length}</dd></div>
          </dl>
          {[...radar.vencidas, ...radar.aVencer].length > 0 && <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">{[...radar.vencidas, ...radar.aVencer].map((d) => <li key={d.id}><span className={d.situacao === "VENCIDO" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}>{d.situacao === "VENCIDO" ? "Vencida" : "Vence"} {d.validade ? new Date(d.validade).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : ""}</span> · {d.tipo?.nome || d.descricao} · {nomeDe.get(d.empresa_id) || "pessoa física"}</li>)}</ul>}
          <p className="text-[11px] text-muted-foreground">Conta os documentos de tipo certidão (CND federal, estadual, municipal, CNDT, CRF do FGTS) guardados com validade.</p>
        </Cartao>
      </div>
      <Cartao titulo={`Conferência do cadastro com a Receita (${achados.length})`}>
        {achados.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma divergência encontrada.</p> : (
          <ul className="space-y-1.5 text-xs">{achados.map((a, i) => <li key={i} className="flex items-start gap-2"><SeloNivel nivel={a.nivel} /><span><Link to={`/clientes/${a.empresa.id}`} className="font-medium hover:text-primary hover:underline">{a.empresa.razao_social}</Link>: {a.texto}</span></li>)}</ul>
        )}
      </Cartao>
      <p className="text-xs text-muted-foreground">Saúde fiscal: começa em 100 e perde 25 por assunto crítico e 8 por assunto em atenção, na última consulta de cada serviço. O raio-X de cada cliente é a página dele no Monitoramento fiscal.</p>
    </div>
  );
}
