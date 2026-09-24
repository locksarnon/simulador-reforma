import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Download, Loader2, CheckCircle2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/api/base44Client";
import { PERFIS, REGIMES, estimar, montarRelatorio, brl } from "@/lib/calculadoraAgro";
import { comoEraComoFica, pontosTratados, pontosNaoTratados, secoesReforma } from "@/lib/relatorioReforma";
import LeadForm from "@/components/ferramentas/LeadForm";

const COR = {
  verde: "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20",
  amarelo: "border-amber-500/50 bg-amber-50 dark:bg-amber-950/20",
  vermelho: "border-red-500/50 bg-red-50 dark:bg-red-950/20",
};
const BOLA = { verde: "bg-emerald-500", amarelo: "bg-amber-500", vermelho: "bg-red-500" };
const pct = (v) => `${v.toFixed(1).replace(".", ",")}%`;

function Passos({ atual }) {
  const nomes = ["Perfil", "Perguntas", "Números", "Resultado"];
  return (
    <ol className="flex items-center gap-2 text-xs mb-6" aria-label="Etapas">
      {nomes.map((n, i) => (
        <li key={n} className="flex items-center gap-2">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-medium ${i <= atual ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
          <span className={i === atual ? "font-medium" : "text-muted-foreground hidden sm:inline"}>{n}</span>
          {i < nomes.length - 1 && <span className="w-6 h-px bg-border" />}
        </li>
      ))}
    </ol>
  );
}

const fmtMoeda = (s) => {
  const n = String(s).replace(/\D/g, "");
  return n ? Number(n).toLocaleString("pt-BR") : "";
};
const numMoeda = (s) => Number(String(s).replace(/\D/g, "")) || 0;

function Slider({ label, ajuda, valor, onChange, min = 0, max = 100 }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><label className="font-medium">{label}</label><span className="tabular-nums text-muted-foreground">{valor}%</span></div>
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
      <input type="range" min={min} max={max} value={valor} onChange={(e) => onChange(Number(e.target.value))} className="w-full mt-2" />
    </div>
  );
}

/** Calculadora InTAX — "Quanto a reforma muda para mim?" (ferramenta-isca, sem login). */
export default function CalculadoraPage() {
  const [passo, setPasso] = useState(0);
  const [perfilId, setPerfilId] = useState(null);
  const [respostas, setRespostas] = useState({});
  const [dados, setDados] = useState({ regime: "", faturamento: "", comprasPct: 55, creditoPct: 70, exportaPct: 20, carga: "", reducao: 0 });
  const [enviado, setEnviado] = useState(null);
  const [baixando, setBaixando] = useState(false);

  const perfil = PERFIS.find((p) => p.id === perfilId);
  const { data: parametros, isLoading: carregandoParams, isError } = useQuery({
    queryKey: ["publicParametrosTransicao"],
    queryFn: () => api.get("/public/parametros-transicao"),
    staleTime: 10 * 60 * 1000,
  });

  const perguntaAtual = perfil ? perfil.perguntas.findIndex((q) => respostas[q.id] === undefined) : 0;
  const perguntasRespondidas = perfil && perguntaAtual === -1;

  const escolherPerfil = (id) => {
    const p = PERFIS.find((x) => x.id === id);
    setPerfilId(id); setRespostas({}); setEnviado(null);
    setDados((d) => ({ ...d, regime: p.regimes[0] === "produtor_pf" ? "produtor_pf" : "", comprasPct: Math.round(p.compras_pct * 100), reducao: p.reducao_vendas }));
    setPasso(1);
  };
  const responder = (qid, valor) => {
    setRespostas((r) => ({ ...r, [qid]: valor }));
    const restantes = perfil.perguntas.filter((q) => q.id !== qid && respostas[q.id] === undefined).length;
    if (restantes === 0) setTimeout(() => setPasso(2), 250);
  };

  const flagsExporta = perfil && perfil.perguntas.some((q) => q.id === "exporta" && respostas[q.id] === "sim");
  const dadosValidos = dados.regime && numMoeda(dados.faturamento) > 0;

  const resultado = useMemo(() => {
    if (passo < 3 || !perfil || !parametros?.length) return null;
    return estimar({
      perfil: perfil.id, regime: dados.regime, faturamentoAnual: numMoeda(dados.faturamento),
      comprasPct: dados.comprasPct, creditoPct: dados.creditoPct, exportaPct: dados.exportaPct, reducao: dados.reducao,
      respostas, cargaInformada: dados.carga === "" ? null : Number(dados.carga.replace(",", ".")),
    }, parametros);
  }, [passo, perfil, parametros, dados, respostas]);

  const relatorio = useMemo(() => {
    if (!resultado) return null;
    const base = montarRelatorio(dados, resultado);
    const i = base.secoes.findIndex((s) => s.titulo === "Pontos de atenção");
    base.secoes.splice(i < 0 ? base.secoes.length : i, 0, ...secoesReforma(resultado));
    return base;
  }, [resultado, dados]);
  const comparativo = useMemo(() => (resultado ? comoEraComoFica(resultado.perfil, resultado.regime) : null), [resultado]);

  const baixarPdf = async () => {
    setBaixando(true);
    try { await api.baixar("POST", "/public/relatorio/pdf", { body: relatorio, nome: "relatorio-intax.pdf" }); } finally { setBaixando(false); }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-heading font-semibold">Quanto a reforma tributária muda para o seu negócio?</h1>
        <p className="text-muted-foreground mt-2">Responda em menos de 2 minutos e veja a carga estimada hoje, em 2027 e em 2033 — sem cadastro para começar.</p>
      </div>
      <Passos atual={passo} />

      {/* 0 — perfil */}
      {passo === 0 && (
        <div className="space-y-6">
          {["Regimes diferenciados", "Regimes específicos", "Imposto Seletivo", "Regime regular"].map((g) => (
            <section key={g}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{g}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {PERFIS.filter((p) => p.grupo === g).map((p) => (
                  <button key={p.id} type="button" onClick={() => escolherPerfil(p.id)} className="text-left rounded-xl border border-border bg-card p-4 hover:border-primary hover:bg-muted/30 transition-colors">
                    <div className="text-2xl mb-1" aria-hidden>{p.emoji}</div>
                    <div className="font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{p.descricao}</div>
                    <div className="text-[10px] text-muted-foreground/80 mt-2">LC 214/2025 · {p.lei}</div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* 1 — perguntas sim/não */}
      {passo === 1 && perfil && (
        <div className="space-y-4">
          <button type="button" onClick={() => setPasso(0)} className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Trocar perfil</button>
          {perfil.perguntas.map((q, i) => {
            const ativa = i === (perguntasRespondidas ? perfil.perguntas.length - 1 : perguntaAtual);
            const resp = respostas[q.id];
            if (resp === undefined && !ativa) return null;
            return (
              <div key={q.id} className={`rounded-xl border p-5 ${ativa && resp === undefined ? "border-primary bg-card" : "border-border bg-card/60"}`}>
                <p className="text-xs text-muted-foreground mb-1">Pergunta {i + 1} de {perfil.perguntas.length}</p>
                <p className="font-medium">{q.texto}</p>
                <p className="text-xs text-muted-foreground mt-1">{q.ajuda}</p>
                <div className="flex gap-2 mt-4">
                  {["sim", "nao"].map((v) => (
                    <button key={v} type="button" onClick={() => responder(q.id, v)} className={`px-6 py-2 rounded-md border text-sm font-medium transition-colors ${resp === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{v === "sim" ? "Sim" : "Não"}</button>
                  ))}
                </div>
              </div>
            );
          })}
          {perguntasRespondidas && <button type="button" onClick={() => setPasso(2)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium">Continuar <ArrowRight className="w-4 h-4" /></button>}
        </div>
      )}

      {/* 2 — números */}
      {passo === 2 && perfil && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-6">
          <div>
            <p className="text-sm font-medium mb-2">Regime tributário</p>
            <div className="flex flex-wrap gap-2">
              {REGIMES.filter((r) => perfil.regimes.includes(r.id)).map((r) => (
                <button key={r.id} type="button" onClick={() => setDados((d) => ({ ...d, regime: r.id }))} className={`px-4 py-2 rounded-md border text-sm ${dados.regime === r.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{r.label}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">Como seus principais produtos são tratados na reforma?</p>
            <p className="text-xs text-muted-foreground mb-2">Muitos itens (alimentos, insumos, medicamentos) têm alíquota zero ou reduzida. Não sabe? Use a <a href="/consulta-ncm" target="_blank" rel="noreferrer" className="underline">Consulta NCM</a>.</p>
            <div className="flex flex-wrap gap-2">
              {[[0, "Alíquota padrão"], [0.6, "Redução de 60% (insumos, alimentos)"], [1, "Alíquota zero (cesta básica, hortifrúti)"]].map(([v, r]) => (
                <button key={v} type="button" onClick={() => setDados((d) => ({ ...d, reducao: v }))} className={`px-3 py-2 rounded-md border text-sm ${dados.reducao === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{r}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="fat">Faturamento anual (R$)</label>
            <div className="relative mt-1.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
              <input id="fat" inputMode="numeric" value={dados.faturamento} onChange={(e) => setDados((d) => ({ ...d, faturamento: fmtMoeda(e.target.value) }))} placeholder="6.000.000" className="w-full h-11 rounded-md border border-input bg-background pl-10 pr-3 text-base tabular-nums" />
            </div>
          </div>
          <Slider label="Compras de insumos e mercadorias" ajuda="Quanto do faturamento vai para compras (valor inicial típico do seu perfil)." valor={dados.comprasPct} onChange={(v) => setDados((d) => ({ ...d, comprasPct: v }))} max={95} />
          <Slider label="Compras de fornecedores que geram crédito" ajuda="Parte das compras feita com nota fiscal de fornecedor que destaca o tributo." valor={dados.creditoPct} onChange={(v) => setDados((d) => ({ ...d, creditoPct: v }))} />
          {flagsExporta && <Slider label="Parcela do faturamento exportada" valor={dados.exportaPct} onChange={(v) => setDados((d) => ({ ...d, exportaPct: v }))} max={95} />}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Sei a carga tributária atual (opcional, deixa a estimativa mais precisa)</summary>
            <div className="mt-2 flex items-center gap-2">
              <input inputMode="decimal" value={dados.carga} onChange={(e) => setDados((d) => ({ ...d, carga: e.target.value.replace(/[^\d,.]/g, "") }))} placeholder="Ex.: 9,5" className="h-10 w-28 rounded-md border border-input bg-background px-3 tabular-nums" />
              <span className="text-muted-foreground">% do faturamento</span>
            </div>
          </details>
          {isError && <p className="text-sm text-destructive">Não foi possível carregar os parâmetros da transição. Tente novamente em instantes.</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setPasso(1)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted">Voltar</button>
            <button type="button" disabled={!dadosValidos || carregandoParams || isError} onClick={() => setPasso(3)} className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              {carregandoParams && <Loader2 className="w-4 h-4 animate-spin" />} Ver resultado <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3 — resultado */}
      {passo === 3 && resultado && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            {[{ t: "Hoje", v: resultado.atual }, { t: "2027", v: resultado.y2027.pctTransicao }, { t: "2033", v: resultado.y2033.pctTransicao }].map((c, i) => (
              <div key={c.t} className={`rounded-xl border p-4 ${i === 2 ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                <p className="text-xs text-muted-foreground">{c.t}</p>
                <p className="text-2xl sm:text-3xl font-semibold tabular-nums mt-1">{pct(c.v)}</p>
                <p className="text-[11px] text-muted-foreground">do faturamento</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Em 2033, cerca de <b className="text-foreground">{brl(Math.abs(resultado.deltaReais2033))}/ano {resultado.deltaReais2033 >= 0 ? "a mais" : "a menos"}</b> que hoje ({resultado.delta2033 >= 0 ? "+" : ""}{resultado.delta2033.toFixed(1).replace(".", ",")} p.p.). Estimativa de ordem de grandeza.
          </p>

          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium mb-2">Carga estimada por ano (% do faturamento)</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={resultado.serie.map((s) => ({ ano: s.ano, "Carga estimada": Number(s.pctTransicao.toFixed(2)), Hoje: Number(resultado.atual.toFixed(2)) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" width={44} />
                  <Tooltip formatter={(v) => `${Number(v).toFixed(1).replace(".", ",")}%`} />
                  <Line type="monotone" dataKey="Hoje" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="Carga estimada" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {resultado.regularComparacao && (
              <p className="text-xs text-muted-foreground mt-2">Se optar pelo regime regular (fora do Simples), a carga estimada em 2033 seria {pct(resultado.regularComparacao.pct2033)}.</p>
            )}
          </div>

          {comparativo && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="font-medium text-sm">Como era × como fica ({comparativo.regimeRot})</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="bg-muted/60 text-left text-xs"><th className="p-2 border border-border w-1/5">Tema</th><th className="p-2 border border-border">Como era</th><th className="p-2 border border-border">Como fica</th></tr></thead>
                  <tbody>{comparativo.linhas.map((l) => (
                    <tr key={l.tema} className="align-top">
                      <td className="p-2 border border-border font-medium">{l.tema}{l.base && <div className="text-[11px] font-normal text-muted-foreground">{l.base}</div>}</td>
                      <td className="p-2 border border-border text-muted-foreground">{l.era}</td>
                      <td className="p-2 border border-border">{l.fica}{l.confirmar && <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">A confirmar: {l.confirmar}</div>}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/10 p-4">
              <p className="font-medium text-sm mb-2">Já considerado nesta estimativa</p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">{pontosTratados(resultado).map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10 p-4">
              <p className="font-medium text-sm mb-2">Ainda não considerado</p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">{pontosNaoTratados(resultado).map((t) => <li key={t.t}><b className="text-foreground">{t.t}.</b> {t.p}</li>)}</ul>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {resultado.cards.map((c, i) => (
              <div key={i} className={`rounded-xl border p-4 ${COR[c.cor]}`}>
                <p className="font-medium text-sm flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${BOLA[c.cor]}`} />{c.titulo}</p>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{c.texto}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <p className="font-medium text-sm mb-2">3 ações prioritárias</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">{resultado.acoes.map((a) => <li key={a}>{a}</li>)}</ol>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Premissas desta estimativa</summary>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground text-xs">{resultado.premissas.map((p) => <li key={p}>{p}</li>)}</ul>
          </details>

          {!enviado ? (
            <LeadForm
              origem="calculadora" titulo="Receba o relatório completo em PDF"
              subtitulo="Enviamos por e-mail e você também pode baixar na hora. Quer esse cálculo com as suas notas reais? A equipe FAL Agro entra em contato."
              botao="Receber relatório" perfil={perfil.id} segmento={perfil.label} regime={dados.regime}
              relatorio={relatorio} dados={{ impacto_pp_2033: resultado.delta2033, atual_pct: resultado.atual, pct_2033: resultado.y2033.pctTransicao, faturamento_anual: resultado.base.fatAnual }}
              onSucesso={setEnviado}
            />
          ) : (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20 p-5 space-y-3">
              <p className="font-medium flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Pronto, {enviado.nome?.split(" ")[0]}!</p>
              <p className="text-sm text-muted-foreground">{enviado.email_configurado ? "Enviamos o relatório para o seu e-mail." : "Baixe o relatório abaixo."} Nossa equipe pode ajudar a refazer esse cálculo com as suas notas fiscais reais.</p>
              <button type="button" onClick={baixarPdf} disabled={baixando} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
                {baixando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Baixar PDF agora
              </button>
            </div>
          )}

          <button type="button" onClick={() => { setPasso(0); setEnviado(null); }} className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">Refazer com outro perfil</button>
        </div>
      )}
    </div>
  );
}
