import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ClipboardCopy, ExternalLink, AlertTriangle, RotateCcw, ListChecks, Map as MapIcon } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { toast } from "@/components/ui/use-toast";
import { ROTEIRO, GRUPOS_ROTEIRO, CSV_TESTE_CADASTRO } from "@/lib/roteiroTestes";
import { SETORES_REFORMA, COBERTURA, resumoCobertura } from "@/lib/setoresReforma";

const CHAVE = "intax_roteiro_testes_v1";
const STATUS = [
  { id: "", rotulo: "Não testado", cor: "bg-muted text-muted-foreground" },
  { id: "ok", rotulo: "Aprovado", cor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
  { id: "problema", rotulo: "Com problema", cor: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300" },
];

function useEstado() {
  const [estado, setEstado] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CHAVE) || "{}"); } catch { return {}; }
  });
  useEffect(() => { try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch { /* sem storage */ } }, [estado]);
  return [estado, setEstado];
}

function Funcao({ f, indice, estado, setEstado }) {
  const e = estado[f.id] || { passos: {}, status: "", obs: "" };
  const feitos = f.passos.filter((_, i) => e.passos[i]).length;
  const atualiza = (parcial) => setEstado((s) => ({ ...s, [f.id]: { ...e, ...parcial } }));
  const st = STATUS.find((x) => x.id === e.status) || STATUS[0];

  const copiarCsv = async () => {
    try { await navigator.clipboard.writeText(CSV_TESTE_CADASTRO); toast({ title: "CSV de teste copiado", description: "Cole num arquivo teste.csv e envie na tela." }); } catch { toast({ title: "Não foi possível copiar", variant: "destructive" }); }
  };

  return (
    <section id={`f-${f.id}`} className="rounded-xl border border-border bg-card scroll-mt-20">
      <header className="p-5 border-b border-border flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="w-8 h-8 shrink-0 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center">{indice}</span>
          <div>
            <h2 className="font-heading font-semibold text-base">{f.titulo}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{f.objetivo}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${st.cor}`}>{st.rotulo}</span>
          <a href={f.rota} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"><ExternalLink className="w-3.5 h-3.5" /> Abrir a tela</a>
        </div>
      </header>

      <div className="p-5 space-y-5">
        {f.preparo.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Antes de começar</h3>
            <ul className="list-disc pl-5 text-sm space-y-0.5">{f.preparo.map((x) => <li key={x}>{x}</li>)}</ul>
            {f.csvTeste && <button onClick={copiarCsv} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"><ClipboardCopy className="w-3.5 h-3.5" /> Copiar CSV de teste</button>}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Passo a passo</h3>
            <span className="text-xs text-muted-foreground tabular-nums">{feitos}/{f.passos.length} concluídos</span>
          </div>
          <ol className="space-y-2">
            {f.passos.map((p, i) => {
              const marcado = Boolean(e.passos[i]);
              return (
                <li key={i} className={`rounded-lg border p-3 flex gap-3 transition-colors ${marcado ? "border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/10" : "border-border"}`}>
                  <button type="button" onClick={() => atualiza({ passos: { ...e.passos, [i]: !marcado } })} aria-label={`Marcar passo ${i + 1}`}
                    className={`w-6 h-6 shrink-0 rounded-md border flex items-center justify-center mt-0.5 ${marcado ? "bg-emerald-600 border-emerald-600 text-white" : "border-border hover:bg-muted"}`}>
                    {marcado && <Check className="w-4 h-4" />}
                  </button>
                  <div className="text-sm min-w-0">
                    <p><span className="text-muted-foreground tabular-nums mr-1.5">{i + 1}.</span><b className="font-medium">Faça:</b> {p.f}</p>
                    <p className="mt-1 text-muted-foreground"><b className="font-medium text-foreground">Esperado:</b> {p.e}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {f.cuidados.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-1"><AlertTriangle className="w-3.5 h-3.5" /> Cuidados</h3>
            <ul className="list-disc pl-5 text-sm space-y-0.5">{f.cuidados.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}

        <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1">Critério de aprovação</h3>
          <p className="text-sm">{f.criterio}</p>
        </div>

        <div className="grid sm:grid-cols-[180px_1fr] gap-3 items-start">
          <div>
            <label className="text-xs font-medium">Resultado</label>
            <select value={e.status} onChange={(ev) => atualiza({ status: ev.target.value })} className="w-full h-9 mt-1 rounded-md border border-input bg-background px-2 text-sm">
              {STATUS.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium">Observações (o que viu, o que esperava, print ou horário)</label>
            <textarea value={e.obs} onChange={(ev) => atualiza({ obs: ev.target.value })} rows={2} className="w-full mt-1 rounded-md border border-input bg-background p-2 text-sm" placeholder="Ex.: no passo 5 o alerta não apareceu; esperado X, obtido Y." />
          </div>
        </div>
      </div>
    </section>
  );
}

function Mapa() {
  const r = resumoCobertura();
  const [filtro, setFiltro] = useState("");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground max-w-3xl">
        Todos os setores e ramos com tratamento próprio na <b className="text-foreground">LC 214/2025</b>, com os nomes e artigos da lei. A coluna de cobertura diz o que o InTAX já modela.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[["Itens mapeados", r.total, ""], ["Cobertos", r.coberto, "text-emerald-600"], ["Parciais", r.parcial, "text-amber-600"], ["Pendentes", r.pendente, "text-muted-foreground"]].map(([t, v, c]) => (
          <div key={t} className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{t}</p><p className={`text-2xl font-semibold tabular-nums ${c}`}>{v}</p></div>
        ))}
      </div>
      <div className="flex gap-2">
        {[["", "Todos"], ["coberto", "Cobertos"], ["parcial", "Parciais"], ["pendente", "Pendentes"]].map(([k, l]) => (
          <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-1.5 rounded-md border text-sm ${filtro === k ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{l}</button>
        ))}
      </div>
      {SETORES_REFORMA.map((g) => {
        const itens = g.itens.filter((x) => !filtro || x.cobertura === filtro);
        if (itens.length === 0) return null;
        return (
          <section key={g.grupo} className="rounded-xl border border-border bg-card">
            <header className="px-4 py-3 border-b border-border">
              <h2 className="font-heading font-semibold text-sm">{g.grupo}</h2>
              <p className="text-xs text-muted-foreground">{g.fonte}</p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                  <th className="px-4 py-2 font-medium">Setor / ramo (nome da lei)</th><th className="px-4 py-2 font-medium">Base legal</th><th className="px-4 py-2 font-medium">Tratamento</th><th className="px-4 py-2 font-medium">No InTAX</th>
                </tr></thead>
                <tbody>
                  {itens.map((x, i) => (
                    <tr key={x.nome} className={`align-top border-b border-border last:border-0 ${i % 2 ? "bg-muted/15" : ""}`}>
                      <td className="px-4 py-2.5 font-medium max-w-[280px]">{x.nome}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{x.baseLegal}</td>
                      <td className="px-4 py-2.5 text-xs max-w-[360px]">{x.tratamento}</td>
                      <td className="px-4 py-2.5 max-w-[260px]"><span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${COBERTURA[x.cobertura].cor}`}>{COBERTURA[x.cobertura].rotulo}</span>{x.obs && <p className="text-xs text-muted-foreground mt-1">{x.obs}</p>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Página PROVISÓRIA para o tester (remover depois). */
export default function RoteiroTestesPage() {
  const [aba, setAba] = useState("roteiro");
  const [estado, setEstado] = useEstado();

  const progresso = useMemo(() => {
    const totalPassos = ROTEIRO.reduce((a, f) => a + f.passos.length, 0);
    const feitos = ROTEIRO.reduce((a, f) => a + f.passos.filter((_, i) => estado[f.id]?.passos?.[i]).length, 0);
    return {
      totalPassos, feitos,
      ok: ROTEIRO.filter((f) => estado[f.id]?.status === "ok").length,
      problema: ROTEIRO.filter((f) => estado[f.id]?.status === "problema").length,
    };
  }, [estado]);

  const copiarRelatorio = async () => {
    const linhas = [`RELATÓRIO DE TESTES — InTAX (${new Date().toLocaleString("pt-BR")})`, `Passos concluídos: ${progresso.feitos}/${progresso.totalPassos} · Aprovadas: ${progresso.ok} · Com problema: ${progresso.problema}`, ""];
    ROTEIRO.forEach((f, i) => {
      const e = estado[f.id] || { passos: {}, status: "", obs: "" };
      const feitos = f.passos.filter((_, k) => e.passos[k]).length;
      linhas.push(`${i + 1}. ${f.titulo} — ${(STATUS.find((s) => s.id === e.status) || STATUS[0]).rotulo} (${feitos}/${f.passos.length} passos)`);
      const naoFeitos = f.passos.map((p, k) => (e.passos[k] ? null : k + 1)).filter(Boolean);
      if (feitos > 0 && naoFeitos.length) linhas.push(`   passos não concluídos: ${naoFeitos.join(", ")}`);
      if (e.obs) linhas.push(`   OBS: ${e.obs}`);
    });
    try { await navigator.clipboard.writeText(linhas.join("\n")); toast({ title: "Relatório copiado", description: "Cole no e-mail ou no chat para enviar." }); } catch { toast({ title: "Não foi possível copiar", variant: "destructive" }); }
  };

  const limpar = () => { if (window.confirm("Apagar todo o progresso e as observações deste roteiro neste navegador?")) setEstado({}); };
  const pct = progresso.totalPassos ? Math.round((progresso.feitos / progresso.totalPassos) * 100) : 0;
  let n = 0;

  return (
    <div>
      <PageHeader crumbs={[{ label: "DataHub", to: "/" }, { label: "Roteiro de testes" }]} />
      <div className="p-6 lg:p-8 space-y-5">
        <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <span><b>Tela provisória para a fase de testes</b> — será removida depois. O progresso e as observações ficam salvos só neste navegador. Use dados de teste e prefixe tudo que criar com "TESTE-".</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-heading font-semibold">Roteiro de testes do InTAX</h1>
            <p className="text-sm text-muted-foreground">Passo a passo por funcionalidade: onde clicar, o que esperar, cuidados e quando considerar aprovado.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={copiarRelatorio} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm"><ClipboardCopy className="w-4 h-4" /> Copiar relatório</button>
            <button onClick={limpar} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-muted"><RotateCcw className="w-4 h-4" /> Recomeçar</button>
          </div>
        </div>

        <div className="flex gap-2 border-b border-border">
          {[["roteiro", "Roteiro de uso", ListChecks], ["mapa", "Mapa de setores da reforma", MapIcon]].map(([id, rot, Icon]) => (
            <button key={id} onClick={() => setAba(id)} className={`inline-flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px ${aba === id ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="w-4 h-4" />{rot}</button>
          ))}
        </div>

        {aba === "mapa" ? <Mapa /> : (
          <div className="grid lg:grid-cols-[260px_1fr] gap-6 items-start">
            <aside className="lg:sticky lg:top-4 space-y-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex justify-between text-sm mb-1.5"><span className="font-medium">Progresso</span><span className="tabular-nums text-muted-foreground">{pct}%</span></div>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
                <p className="text-xs text-muted-foreground mt-2">{progresso.feitos}/{progresso.totalPassos} passos · {progresso.ok} aprovadas · {progresso.problema} com problema</p>
              </div>
              <nav className="rounded-xl border border-border bg-card p-2 max-h-[60vh] overflow-y-auto">
                {GRUPOS_ROTEIRO.map((g) => (
                  <div key={g} className="mb-2">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</p>
                    {ROTEIRO.filter((f) => f.grupo === g).map((f) => {
                      n += 1;
                      const e = estado[f.id];
                      const st = STATUS.find((s) => s.id === (e?.status || "")) || STATUS[0];
                      return (
                        <a key={f.id} href={`#f-${f.id}`} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${st.id === "ok" ? "bg-emerald-500" : st.id === "problema" ? "bg-red-500" : "bg-muted-foreground/40"}`} />
                          <span className="truncate">{n}. {f.titulo}</span>
                        </a>
                      );
                    })}
                  </div>
                ))}
              </nav>
              <p className="text-xs text-muted-foreground">Ao encontrar um problema: marque "Com problema", escreva o que esperava e o que aconteceu e, no fim, use "Copiar relatório".</p>
            </aside>
            <div className="space-y-5 min-w-0">
              {ROTEIRO.map((f, i) => <Funcao key={f.id} f={f} indice={i + 1} estado={estado} setEstado={setEstado} />)}
              <div className="rounded-xl border border-border bg-card p-5 text-sm">
                <h3 className="font-medium mb-1">Terminou?</h3>
                <p className="text-muted-foreground">Clique em "Copiar relatório" no alto da página e envie o texto para a equipe. Revise também a aba <Link to="#" onClick={(e) => { e.preventDefault(); setAba("mapa"); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="underline">Mapa de setores da reforma</Link> para conferir o que ainda não está coberto.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
