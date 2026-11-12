import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import SeletorCenarioAliquotas from "@/components/SeletorCenarioAliquotas";
import { brl, PERFIS } from "@/lib/calculadoraAgro";
import { useTransicaoComCenario } from "@/lib/cenarioAliquotasStore";
import { descricaoCurta } from "@/motor/cenariosAliquota";
import { compararRegimes, DAS_PADRAO, mapaDeVencedores, rotuloDoRegime, viradas } from "@/lib/regimes";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CORES = { simples: "#2563EB", presumido: "#B45309", real: "#1E764D", empate: "#6B7280" };
const PERFIS_COMPARAVEIS = PERFIS.filter((p) => p.regimes.filter((r) => r !== "produtor_pf").length >= 2);
const pct = (v) => (v === null || v === undefined ? "—" : `${v.toFixed(2).replace(".", ",")}%`);

/** Planejamento tributário > Comparação de regimes: a carga sobre o consumo de cada regime, ano a ano, e o mapa de quem vence. */
export default function RegimesPagina() {
  const [perfilId, setPerfilId] = useState(PERFIS_COMPARAVEIS[0]?.id);
  const perfil = PERFIS.find((p) => p.id === perfilId);
  const [d, setD] = useState({ faturamento: 4_000_000, comprasPct: Math.round((perfil?.compras_pct ?? 0.5) * 100), creditoPct: 70, exportaPct: 0, das: DAS_PADRAO });
  const mudar = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const { data: parametros, isLoading, error } = useQuery({ queryKey: ["publicParametrosTransicao"], queryFn: () => api.get("/public/parametros-transicao"), staleTime: 10 * 60 * 1000 });
  const { linhas: params, resumo: cenario, selecao } = useTransicaoComCenario(parametros);
  const base = useMemo(() => ({ faturamentoAnual: Number(d.faturamento) || 0, comprasPct: Number(d.comprasPct) || 0, creditoPct: Number(d.creditoPct) || 0, exportaPct: Number(d.exportaPct) || 0, respostas: {} }), [d]);
  const comp = useMemo(() => (perfil && params.length && base.faturamentoAnual > 0 ? compararRegimes(base, perfil, params, { dasPct: Number(d.das) || DAS_PADRAO, cenarioTexto: descricaoCurta(cenario) }) : null), [perfil, params, base, d.das, cenario]);
  const mapa = useMemo(() => (comp ? mapaDeVencedores(base, perfil, params, { dasPct: Number(d.das) || DAS_PADRAO }) : null), [comp, base, perfil, params, d.das]);
  const trocar = (id) => { const p = PERFIS.find((x) => x.id === id); setPerfilId(id); mudar("comprasPct", Math.round((p?.compras_pct ?? 0.5) * 100)); };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "Planejamento tributário", to: "/area/reforma" }, { label: "Comparação de regimes" }]}
        title="Comparação de regimes"
        subtitle="Simples, Lucro Presumido e Lucro Real até 2033"
      />
      <div className="px-6 lg:px-8 py-6 grid gap-4 xl:grid-cols-[320px_1fr]">
        <form className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm" onSubmit={(e) => e.preventDefault()} aria-label="Dados da empresa simulada">
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Perfil da atividade</span>
            <select className={campo} value={perfilId} onChange={(e) => trocar(e.target.value)}>{PERFIS_COMPARAVEIS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Faturamento anual (R$)</span>
            <input type="number" min={0} step={10000} className={campo} value={d.faturamento} onChange={(e) => mudar("faturamento", e.target.value)} /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Compras e insumos (% do faturamento): {d.comprasPct}%</span>
            <input type="range" min={0} max={90} step={5} value={d.comprasPct} onChange={(e) => mudar("comprasPct", e.target.value)} className="w-full" /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Das compras, quanto gera crédito: {d.creditoPct}%</span>
            <input type="range" min={0} max={100} step={5} value={d.creditoPct} onChange={(e) => mudar("creditoPct", e.target.value)} className="w-full" /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Exportação (% do faturamento)</span>
            <input type="number" min={0} max={95} className={campo} value={d.exportaPct} onChange={(e) => mudar("exportaPct", e.target.value)} /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">DAS efetivo no Simples (% do faturamento)</span>
            <input type="number" min={0} max={33} step={0.1} className={campo} value={d.das} onChange={(e) => mudar("das", e.target.value)} /></label>
          {Number(d.faturamento) > 4_800_000 && <p role="status" className="text-xs text-amber-700 dark:text-amber-400">Acima de R$ 4,8 milhões por ano a empresa não pode ficar no Simples (LC 123/2006, art. 3º): a linha do Simples é só referência.</p>}
          <SeletorCenarioAliquotas resumo={cenario} selecao={selecao} />
        </form>

        <div className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando os parâmetros da transição…</p>}
          {error && <p role="alert" className="text-sm">Não foi possível carregar os parâmetros da transição.</p>}
          {!comp && !isLoading && !error && <p className="text-sm text-muted-foreground">Informe o faturamento para comparar.</p>}
          {comp && (
            <>
              <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="titulo-vence">
                <h2 id="titulo-vence" className="font-heading text-sm font-semibold">Quem tem a menor carga sobre o consumo</h2>
                <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                  {viradas(comp.vencedorPorAno).map((v) => (
                    <li key={v.ano} className="rounded-full border border-border px-3 py-1"><span className="text-muted-foreground">a partir de {v.ano}:</span> <strong style={{ color: CORES[v.regime] }}>{rotuloDoRegime(v.regime)}</strong></li>
                  ))}
                </ul>
                <div className="mt-3 h-[260px]" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comp.linhas} margin={{ left: 0, right: 16, top: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(v, n) => [pct(v), rotuloDoRegime(n)]} />
                      <Legend formatter={(n) => rotuloDoRegime(n)} />
                      {comp.regimes.map((r) => <Line key={r.id} type="monotone" dataKey={r.id} stroke={CORES[r.id]} strokeWidth={2} dot={{ r: 3 }} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="overflow-x-auto rounded-xl border border-border bg-card" aria-labelledby="titulo-tabela">
                <h2 id="titulo-tabela" className="px-4 pt-3 font-heading text-sm font-semibold">Carga sobre o consumo, ano a ano</h2>
                <table className="mt-2 w-full text-[13px]" aria-label="Carga por regime e ano">
                  <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-4 py-2">Ano</th>{comp.regimes.map((r) => <th key={r.id} className="px-4 py-2 text-right">{r.label}</th>)}</tr></thead>
                  <tbody>
                    {comp.linhas.map((l) => (
                      <tr key={l.ano} className="border-b border-border/60">
                        <td className="px-4 py-1.5 tabular-nums">{l.ano}</td>
                        {comp.regimes.map((r) => {
                          const vence = comp.vencedorPorAno[l.ano] === r.id;
                          return <td key={r.id} className={`px-4 py-1.5 text-right tabular-nums ${vence ? "font-semibold text-emerald-700 dark:text-emerald-400" : ""}`}>{pct(l[r.id])}<span className="block text-[11px] font-normal text-muted-foreground">{l[`${r.id}_reais`] !== null ? brl(l[`${r.id}_reais`]) : ""}</span>{l[`${r.id}_credor`] > 0 && <span className="block text-[11px] font-normal text-amber-700 dark:text-amber-400">crédito acumulado {brl(l[`${r.id}_credor`])}</span>}{vence && <span className="sr-only"> (menor carga)</span>}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {mapa && (
                <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="titulo-mapa-regimes">
                  <h2 id="titulo-mapa-regimes" className="font-heading text-sm font-semibold">Mapa de 2033: quem vence conforme as compras e o crédito</h2>
                  <p className="text-xs text-muted-foreground">Mesmo faturamento e perfil; muda só o peso das compras e quanto delas gera crédito.</p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="text-xs" aria-label="Regime vencedor em 2033 por compras e crédito">
                      <thead><tr><th className="px-2 py-1 text-left text-muted-foreground">Compras ↓ / crédito →</th>{mapa[0].celulas.map((c) => <th key={c.credito} className="px-2 py-1 text-muted-foreground">{c.credito}%</th>)}</tr></thead>
                      <tbody>{mapa.map((linha) => (
                        <tr key={linha.compras}>
                          <th className="px-2 py-1 text-left font-normal text-muted-foreground">{linha.compras}%</th>
                          {linha.celulas.map((c) => <td key={c.credito} className="px-1 py-1"><span className="block min-w-[92px] rounded px-2 py-1 text-center text-white" style={{ backgroundColor: CORES[c.vencedor] || "#6B7280" }}>{c.vencedor ? rotuloDoRegime(c.vencedor).replace("Lucro ", "") : "—"}</span></td>)}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </section>
              )}

              <section className="rounded-xl border border-amber-400/60 bg-card p-4 text-xs text-muted-foreground space-y-1" aria-label="O que a comparação considera">
                <p><strong className="text-foreground">Compara só os tributos sobre o consumo</strong>: PIS/Cofins, ICMS, IBS/CBS na transição e o DAS do Simples. IRPJ, CSLL, contribuições sobre a folha e o efeito do crédito no preço do cliente não entram; a escolha do regime precisa olhar o lucro e a folha também.</p>
                <p><strong className="text-foreground">Crédito acumulado</strong> aparece quando os créditos das compras passam do tributo das vendas: não é economia, fica parado até ser compensado ou ressarcido e pesa no caixa. Carga zero com crédito acumulado conta como empate.</p>
                <p>As premissas (ICMS médio do perfil, DAS informado, redução do perfil) são as mesmas da calculadora; de 2029 a 2033 a série segue o cenário escolhido. Para a empresa de verdade, use o diagnóstico com as notas fiscais em <Link to="/diagnostico" className="text-primary hover:underline">Diagnósticos</Link>.</p>
                {comp.resultados[0]?.r.premissas?.slice(-2).map((p) => <p key={p}>{p}</p>)}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
