import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, Info, MessageCircle } from "lucide-react";
import { api } from "@/api/base44Client";
import { brl, CONTATO } from "@/lib/calculadoraAgro";
import { simularSimplesHibrido } from "../../../base44/shared/simplesHibrido";
import LeadForm from "@/components/ferramentas/LeadForm";

const pct2 = (v) => `${(v * 100).toFixed(2).replace(".", ",")}%`;
const fmtMoeda = (s) => { const n = String(s).replace(/\D/g, ""); return n ? Number(n).toLocaleString("pt-BR") : ""; };
const numMoeda = (s) => Number(String(s).replace(/\D/g, "")) || 0;

const CHAVE_SESSAO = "intax_simples_hibrido_v1";
const DADOS_INICIAIS = { modo: "automatico", pctClientes: 70, rbt12: "", folha12: "", receitaMensal: "" };

function lerSessao() {
  try { const s = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || "null"); return s || null; } catch { return null; }
}

function Passos({ atual }) {
  const nomes = ["Enquadramento", "Números", "Simulação", "Resultado"];
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

const ANEXOS = [
  { id: "automatico", label: "Fator R automático (recomendado)" },
  { id: "Anexo I", label: "Anexo I · Comércio" },
  { id: "Anexo II", label: "Anexo II · Indústria" },
  { id: "Anexo IV", label: "Anexo IV · Serviços (§5º-C)" },
];

/** Simulador "Simples puro × Híbrido (IBS/CBS regular)" — ferramenta pública do InTAX. */
export default function SimplesHibridoPage() {
  const sessao = useMemo(lerSessao, []);
  const [passo, setPasso] = useState(sessao?.passo ?? 0);
  const [dados, setDados] = useState(sessao?.dados ?? DADOS_INICIAIS);
  const [enviado, setEnviado] = useState(null);

  useEffect(() => {
    try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify({ passo: Math.min(passo, 3), dados })); } catch { /* sem storage */ }
  }, [passo, dados]);

  const { data: parametros, isLoading: carregandoParams, isError } = useQuery({
    queryKey: ["publicParametrosTransicao"],
    queryFn: () => api.get("/public/parametros-transicao"),
    staleTime: 10 * 60 * 1000,
  });
  const anoParams2027 = useMemo(() => parametros?.find((p) => p.ano === 2027), [parametros]);

  const dadosValidos = numMoeda(dados.rbt12) > 0 && numMoeda(dados.receitaMensal) > 0;

  const resultado = useMemo(() => {
    if (passo < 3 || !dadosValidos || !anoParams2027) return null;
    return simularSimplesHibrido(
      {
        receitaMensal: numMoeda(dados.receitaMensal),
        rbt12: numMoeda(dados.rbt12),
        folha12: numMoeda(dados.folha12),
        modo: dados.modo,
        pctClientesRegimeRegular: dados.pctClientes / 100,
      },
      anoParams2027,
    );
  }, [passo, dadosValidos, anoParams2027, dados]);

  const relatorioDados = useMemo(() => {
    if (!resultado?.pontos) return null;
    return {
      anexo: resultado.puro.anexo, rbt12: numMoeda(dados.rbt12),
      aliquota_simples: resultado.puro.aliquotaEfetiva, carga_hibrida: resultado.hibrido.cargaHibridaPct,
      markup_equilibrio: resultado.pontos.markupEquilibrio, markup_neutro_cliente: resultado.pontos.markupNeutroCliente,
    };
  }, [resultado, dados.rbt12]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-heading font-semibold">Vale a pena virar contribuinte regular do IBS/CBS?</h1>
        <p className="text-muted-foreground mt-2">Compare ficar no Simples puro com optar pelo regime regular do IBS/CBS (LC 214/2025, art. 47, §9º) — com o ponto de preço em que as duas opções empatam.</p>
      </div>
      <Passos atual={passo} />

      {/* 0 — enquadramento */}
      {passo === 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-6">
          <div>
            <p className="text-sm font-medium mb-2">Como seu negócio se enquadra no Simples?</p>
            <div className="flex flex-wrap gap-2">
              {ANEXOS.map((a) => (
                <button key={a.id} type="button" onClick={() => setDados((d) => ({ ...d, modo: a.id }))} className={`px-4 py-2 rounded-md border text-sm ${dados.modo === a.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{a.label}</button>
              ))}
            </div>
            {dados.modo === "automatico" && (
              <div className="flex gap-2 items-start text-xs text-muted-foreground bg-muted/40 border border-border rounded-md p-3 mt-3">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Não sabe seu Fator R? Deixe no automático: calculamos a partir da folha e da receita dos últimos 12 meses, e aplicamos o Anexo III (≥28%, LC 123/2006 art. 18 §5º-J) ou V (&lt;28%, §5º-M) automaticamente.</span>
              </div>
            )}
          </div>
          <div>
            <div className="flex justify-between text-sm"><label className="font-medium">Que fração dos seus clientes compra para revender ou usar na própria empresa (regime regular do IBS/CBS)?</label><span className="tabular-nums text-muted-foreground">{dados.pctClientes}%</span></div>
            <input type="range" min={0} max={100} value={dados.pctClientes} onChange={(e) => setDados((d) => ({ ...d, pctClientes: Number(e.target.value) }))} className="w-full mt-2" />
            <div className="flex justify-between text-[11px] text-muted-foreground mt-1"><span>0% — só consumidor final</span><span>100% — só empresas</span></div>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => setPasso(1)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium">Continuar <ArrowRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* 1 — números */}
      {passo === 1 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-6">
          <div>
            <label className="text-sm font-medium" htmlFor="rbt12">RBT12 — receita bruta dos últimos 12 meses (R$)</label>
            <input id="rbt12" inputMode="numeric" value={dados.rbt12} onChange={(e) => setDados((d) => ({ ...d, rbt12: fmtMoeda(e.target.value) }))} placeholder="1.200.000" className="w-full h-11 mt-1.5 rounded-md border border-input bg-background px-3 text-base tabular-nums" />
            <p className="text-xs text-muted-foreground mt-1">Define sua faixa e alíquota do Simples.</p>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="folha12">Folha de pagamento dos últimos 12 meses — FS12 (R$)</label>
            <input id="folha12" inputMode="numeric" value={dados.folha12} onChange={(e) => setDados((d) => ({ ...d, folha12: fmtMoeda(e.target.value) }))} placeholder="360.000" className="w-full h-11 mt-1.5 rounded-md border border-input bg-background px-3 text-base tabular-nums" />
            <p className="text-xs text-muted-foreground mt-1">Só usada pra calcular seu Fator R, se deixou no automático.</p>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="receita">Faturamento médio do último mês (R$)</label>
            <input id="receita" inputMode="numeric" value={dados.receitaMensal} onChange={(e) => setDados((d) => ({ ...d, receitaMensal: fmtMoeda(e.target.value) }))} placeholder="100.000" className="w-full h-11 mt-1.5 rounded-md border border-input bg-background px-3 text-base tabular-nums" />
            <p className="text-xs text-muted-foreground mt-1">Base para o cálculo mensal do DAS e da carga híbrida.</p>
          </div>
          {isError && <p className="text-sm text-destructive">Não foi possível carregar os parâmetros da transição. Tente novamente em instantes.</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setPasso(0)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Voltar</button>
            <button type="button" disabled={!dadosValidos || carregandoParams || isError} onClick={() => setPasso(2)} className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Simular agora <ArrowRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* 2 — transição */}
      {passo === 2 && (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-5">
          <p className="font-heading text-lg font-semibold max-w-md">Comparando Simples puro × Híbrido com as tabelas vigentes de 2027</p>
          <ul className="text-sm text-muted-foreground space-y-2 text-left max-w-sm">
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Calculando Fator R e enquadrando no Anexo correto</li>
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Aplicando a tabela 2027 (LC 123/2006, redação da LC 227/2026)</li>
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Simulando o regime híbrido (LC 214/2025, art. 47, §9º)</li>
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Calculando o ponto de equilíbrio de preço</li>
          </ul>
          <button type="button" onClick={() => setPasso(3)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium">Ver resultado <ArrowRight className="w-4 h-4" /></button>
        </div>
      )}

      {/* 3 — resultado */}
      {passo === 3 && resultado?.puro?.acimaDoLimite && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-5">
          <p className="font-medium">RBT12 acima de R$ 4,8 milhões</p>
          <p className="text-sm text-muted-foreground mt-1">Com essa receita, o negócio está fora do limite do Simples Nacional (LC 123/2006, art. 3º, §2º) — a comparação Simples puro × Híbrido não se aplica. Fale com a equipe para simular o regime regular diretamente.</p>
          <button type="button" onClick={() => setPasso(1)} className="mt-3 text-sm underline underline-offset-2">Ajustar os números</button>
        </div>
      )}

      {passo === 3 && resultado?.pontos && (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex justify-between items-center"><span className="font-medium text-sm">Simples puro</span><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-2 py-0.5 rounded">hoje</span></div>
              <p className="text-xs text-muted-foreground mt-3">Alíquota efetiva do Simples</p>
              <p className="text-2xl font-semibold tabular-nums mt-0.5">{pct2(resultado.puro.aliquotaEfetiva)}</p>
              <p className="text-xs text-muted-foreground mt-3">DAS mensal estimado</p>
              <p className="text-lg font-semibold tabular-nums mt-0.5">{brl(resultado.puro.dasMensal)}</p>
            </div>
            <div className="rounded-xl border border-primary bg-primary/5 p-5">
              <div className="flex justify-between items-center"><span className="font-medium text-sm">Híbrido, repassando o equilíbrio</span><span className="text-[11px] font-semibold uppercase tracking-wide text-primary-foreground bg-primary px-2 py-0.5 rounded">simulado</span></div>
              <p className="text-xs text-muted-foreground mt-3">Preço repassado ao cliente</p>
              <p className="text-2xl font-semibold tabular-nums mt-0.5 text-primary">+{pct2(resultado.pontos.markupEquilibrio)}</p>
              <p className="text-xs text-muted-foreground mt-3">Carga híbrida mensal (no preço novo)</p>
              <p className="text-lg font-semibold tabular-nums mt-0.5 text-primary">{brl(resultado.hibrido.cargaHibridaMensal * (1 + resultado.pontos.markupEquilibrio))}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Ponto de equilíbrio</p>
              <p className="text-xl font-semibold tabular-nums mt-1">{pct2(resultado.pontos.markupEquilibrio)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">repasse de preço que mantém seu resultado líquido igual ao de hoje</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Ponto neutro do cliente</p>
              <p className="text-xl font-semibold tabular-nums mt-1">{pct2(resultado.pontos.markupNeutroCliente)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">acréscimo máximo em que o custo líquido dele não piora</p>
            </div>
            <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-4">
              <p className="text-xs text-amber-800 dark:text-amber-400">Gap comercial</p>
              <p className="text-xl font-semibold tabular-nums mt-1 text-amber-800 dark:text-amber-400">{pct2(resultado.pontos.gapComercial)}</p>
              <p className="text-[11px] text-amber-800 dark:text-amber-400 mt-1">diferença entre o que você precisa cobrar e o que o cliente aceita — margem de negociação</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4 flex gap-2 text-xs text-muted-foreground">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>A alíquota de CBS do regime regular (usada no cálculo do híbrido) é uma premissa editável até a fixação oficial da alíquota de referência pelo Senado — o resultado pode mudar quando ela for fixada. Resultado sujeito a ajuste; valide com um especialista antes de decidir.</span>
          </div>

          <div className="rounded-xl border border-border bg-muted/40 p-5">
            <p className="font-semibold">Quer decidir isso com quem entende da reforma e da sua operação?</p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-prose">A equipe da FAL Agro ajuda a avaliar se compensa migrar pro regime regular no seu caso — com as suas notas fiscais reais, não só a média do segmento.</p>
            <a href={`${CONTATO.whatsappLink}?text=${encodeURIComponent("Olá! Simulei Simples puro × Híbrido no InTAX e quero entender se vale migrar para o regime regular do IBS/CBS.")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 mt-3 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
              <MessageCircle className="w-4 h-4" /> Migre para a FAL
            </a>
          </div>

          {!enviado ? (
            <LeadForm
              origem="simples-hibrido" titulo="Receba esta simulação por e-mail"
              subtitulo="Enviamos o resumo com os pontos acima. Quer ver isso com as suas notas fiscais reais? A equipe FAL Agro entra em contato."
              botao="Receber simulação" perfil="simples-hibrido" segmento={resultado.puro.anexo} dados={relatorioDados}
              onSucesso={setEnviado}
            />
          ) : (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20 p-5">
              <p className="font-medium flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Pronto, {enviado.nome?.split(" ")[0]}!</p>
              <p className="text-sm text-muted-foreground mt-1">Enviamos o resumo para o seu e-mail. Se quiser, já falamos pelo WhatsApp: {CONTATO.whatsapp}.</p>
            </div>
          )}

          <button type="button" onClick={() => setPasso(1)} className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">Simular outro cenário</button>
        </div>
      )}
    </div>
  );
}
