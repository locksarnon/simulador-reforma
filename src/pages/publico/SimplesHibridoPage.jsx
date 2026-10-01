import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, Info, MessageCircle } from "lucide-react";
import { api } from "@/api/base44Client";
import { brl, CONTATO } from "@/lib/calculadoraAgro";
import { simularSimplesHibrido } from "../../../base44/shared/simplesHibrido";
import LeadForm from "@/components/ferramentas/LeadForm";

const pct2 = (v) => `${(v * 100).toFixed(2).replace(".", ",")}%`;
// Máscara de moeda: os dígitos digitados são tratados como centavos (padrão
// BR), então "1200000,50" → dígitos "120000050" → R$ 1.200.000,50. Valores
// negativos não existem nesses campos (RBT12/folha/receita são sempre ≥0) —
// o "-" é descartado na extração de dígitos, então nunca chega a virar um
// número negativo "escondido"; quem digita um "-" só não vê ele aparecer.
const fmtMoeda = (s) => {
  const digitos = String(s).replace(/\D/g, "").slice(0, 15);
  if (!digitos) return "";
  return (Number(digitos) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const numMoeda = (s) => {
  const digitos = String(s).replace(/\D/g, "");
  return digitos ? Number(digitos) / 100 : 0;
};
const contemSinalNegativo = (s) => /-/.test(String(s));

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

const ANEXOS_SEM_FATOR_R = [
  { id: "Anexo I", label: "Anexo I · Comércio" },
  { id: "Anexo II", label: "Anexo II · Indústria" },
  { id: "Anexo IV", label: "Anexo IV · Serviços (§5º-C)" },
];

const ANEXOS_FATOR_R = [
  { id: "Anexo III", label: "Anexo III · Fator R ≥ 28%" },
  { id: "Anexo V", label: "Anexo V · Fator R < 28%" },
];

/** Simulador "Simples puro × Híbrido (IBS/CBS regular)" — ferramenta pública do InTAX. */
export default function SimplesHibridoPage() {
  const sessao = useMemo(lerSessao, []);
  const [passo, setPasso] = useState(sessao?.passo ?? 0);
  const [dados, setDados] = useState(sessao?.dados ?? DADOS_INICIAIS);
  const [enviado, setEnviado] = useState(null);
  // CBS do regime regular é premissa editável (ver aviso no rodapé do
  // resultado) — carregamos o valor oficial do TransicaoAno como ponto de
  // partida, mas o usuário pode sobrescrever antes de ver o resultado.
  const [cbsEditavel, setCbsEditavel] = useState(null);

  useEffect(() => {
    try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify({ passo: Math.min(passo, 3), dados })); } catch { /* sem storage */ }
  }, [passo, dados]);

  const { data: parametros, isLoading: carregandoParams, isError } = useQuery({
    queryKey: ["publicParametrosTransicao"],
    queryFn: () => api.get("/public/parametros-transicao"),
    staleTime: 10 * 60 * 1000,
  });
  const anoParams2027 = useMemo(() => parametros?.find((p) => p.ano === 2027), [parametros]);

  useEffect(() => {
    if (anoParams2027 && cbsEditavel === null) setCbsEditavel(Number(anoParams2027.cbs_efetiva));
  }, [anoParams2027, cbsEditavel]);

  const anoParamsUsado = useMemo(() => {
    if (!anoParams2027) return null;
    return { ...anoParams2027, cbs_efetiva: cbsEditavel ?? anoParams2027.cbs_efetiva };
  }, [anoParams2027, cbsEditavel]);

  const dadosValidos = numMoeda(dados.rbt12) > 0 && numMoeda(dados.receitaMensal) > 0;

  const resultado = useMemo(() => {
    if (passo < 3 || !dadosValidos || !anoParamsUsado) return null;
    return simularSimplesHibrido(
      {
        receitaMensal: numMoeda(dados.receitaMensal),
        rbt12: numMoeda(dados.rbt12),
        folha12: numMoeda(dados.folha12),
        modo: dados.modo,
        pctClientesRegimeRegular: dados.pctClientes / 100,
      },
      anoParamsUsado,
    );
  }, [passo, dadosValidos, anoParamsUsado, dados]);

  const relatorioDados = useMemo(() => {
    if (!resultado?.pontos) return null;
    return {
      anexo: resultado.puro.anexo, rbt12: numMoeda(dados.rbt12),
      aliquota_simples: resultado.puro.aliquotaEfetiva, carga_hibrida: resultado.hibrido.cargaHibridaPct,
      markup_equilibrio: resultado.pontos.markupEquilibrio, markup_neutro_cliente: resultado.pontos.markupNeutroCliente,
    };
  }, [resultado, dados.rbt12]);

  // Resumo em PDF enviado por e-mail (mesmo formato que o PdfService já usa
  // na calculadora — ver backend/src/pdf/pdf.service.ts, tipo DocumentoPdf).
  const relatorioPdf = useMemo(() => {
    if (!resultado?.pontos) return null;
    const p = resultado.puro, h = resultado.hibrido, pt = resultado.pontos;
    const avisos = [];
    if (p.avisoIcmsIssForaDas) avisos.push("Na 6ª faixa, ICMS e ISS saem do DAS e são recolhidos à parte, pelo regime normal (LC 123/2006, art. 18, §20).");
    if (p.avisoCppForaDas) avisos.push("No Anexo IV, a CPP (contribuição patronal) é sempre recolhida fora do DAS, pelo regime normal (LC 123/2006, art. 18, §5º-C).");
    return {
      titulo: "Simples puro × Híbrido (IBS/CBS regular)",
      subtitulo: `${p.anexo} · faixa ${p.faixa} · RBT12 ${brl(numMoeda(dados.rbt12))} · ${dados.pctClientes}% da carteira contribuinte do regime regular`,
      secoes: [
        {
          titulo: "Resumo",
          paragrafos: [
            `Hoje, no Simples puro, o DAS mensal estimado é ${brl(p.dasMensal)} (alíquota efetiva de ${pct2(p.aliquotaEfetiva)}).`,
            `Optando pelo regime regular do IBS/CBS (LC 123/2006, art. 13, §9º, c/c LC 214/2025, art. 47, §9º) e repassando ${pct2(pt.markupEquilibrio)} no preço, o resultado líquido fica igual ao de hoje.`,
            `Com o mix de clientes informado, o repasse que não piora o custo líquido médio da carteira é de ${pct2(pt.markupNeutroCliente)} — a diferença entre os dois (${pct2(pt.gapComercial)}) é a margem de negociação com o cliente.`,
          ],
        },
        {
          titulo: "Composição do Simples puro e do híbrido",
          tabela: {
            cabecalho: ["Item", "Simples puro", "Híbrido (preço de hoje)"],
            linhas: [
              ["Carga mensal total", brl(p.dasMensal), brl(h.cargaHibridaMensal)],
              ["IBS/CBS embutido/recolhido", brl(p.ibsCbsNoSimples), brl(h.cargaHibridaMensal - h.dasResidualPct * numMoeda(dados.receitaMensal))],
              ["Crédito que a carteira recupera", brl(p.creditoClientePuro), brl(h.creditoClienteHibrido)],
            ],
          },
        },
        { titulo: "Premissas desta estimativa", itens: [
          `Alíquota de CBS do regime regular usada: ${pct2(cbsEditavel ?? anoParams2027?.cbs_efetiva ?? 0)} — estimativa (Resolução CGIBS nº 14/2026); a alíquota definitiva só é fixada pelo Senado até 15/12/2026. Editável na tela.`,
          "Não considera créditos das compras (insumos) — simula só a saída (venda).",
          "Resultado sujeito a ajuste quando a alíquota de referência for fixada; valide com um especialista antes de decidir.",
        ] },
        ...(avisos.length ? [{ titulo: "Avisos específicos do seu Anexo", itens: avisos }] : []),
        {
          titulo: "Fale com a FAL Agro",
          paragrafos: ["Esta simulação usa só a sua média informada. Se quiser ver o cálculo com as suas notas fiscais reais e os créditos das suas compras, é só chamar:"],
          itens: [`WhatsApp: ${CONTATO.whatsapp}`, `E-mail: ${CONTATO.email}`],
        },
      ],
    };
  }, [resultado, dados.rbt12, dados.receitaMensal, dados.pctClientes, cbsEditavel, anoParams2027]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-heading font-semibold">Vale a pena virar contribuinte regular do IBS/CBS?</h1>
        <p className="text-muted-foreground mt-2">Compare ficar no Simples puro com optar pelo regime regular do IBS/CBS (LC 123/2006, art. 13, §9º, c/c LC 214/2025, art. 47, §9º) — com o ponto de preço em que as duas opções empatam.</p>
      </div>
      <Passos atual={passo} />

      {/* 0 — enquadramento */}
      {passo === 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-6">
          <div>
            <p className="text-sm font-medium mb-2">Qual Anexo do Simples se aplica ao seu negócio?</p>
            <div className="flex flex-wrap gap-2">
              {ANEXOS_SEM_FATOR_R.map((a) => (
                <button key={a.id} type="button" onClick={() => setDados((d) => ({ ...d, modo: a.id }))} className={`px-4 py-2 rounded-md border text-sm ${dados.modo === a.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{a.label}</button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground mt-4 mb-2">Presta serviço e pode cair no Anexo III ou V? Esses dois dependem do Fator R (folha ÷ receita, nos últimos 12 meses):</p>
            <div className="flex flex-wrap gap-2">
              {ANEXOS_FATOR_R.map((a) => (
                <button key={a.id} type="button" onClick={() => setDados((d) => ({ ...d, modo: a.id }))} className={`px-4 py-2 rounded-md border text-sm ${dados.modo === a.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{a.label}</button>
              ))}
              <button type="button" onClick={() => setDados((d) => ({ ...d, modo: "automatico" }))} className={`px-4 py-2 rounded-md border text-sm font-medium ${dados.modo === "automatico" ? "bg-primary text-primary-foreground border-primary" : "border-primary/50 text-primary hover:bg-primary/5"}`}>Não sei — calcular automaticamente</button>
            </div>
            {dados.modo === "automatico" && (
              <div className="flex gap-2 items-start text-xs text-muted-foreground bg-muted/40 border border-border rounded-md p-3 mt-3">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Calculamos o Fator R a partir da folha e da receita dos últimos 12 meses, e aplicamos o Anexo III (≥28%, LC 123/2006 art. 18 §5º-J) ou V (&lt;28%, §5º-M) automaticamente.</span>
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
            <input id="rbt12" inputMode="decimal" value={dados.rbt12} onChange={(e) => setDados((d) => ({ ...d, rbt12: fmtMoeda(e.target.value), rbt12Negativo: contemSinalNegativo(e.target.value) }))} placeholder="1.200.000,00" className="w-full h-11 mt-1.5 rounded-md border border-input bg-background px-3 text-base tabular-nums" />
            <p className="text-xs text-muted-foreground mt-1">Define sua faixa e alíquota do Simples.</p>
            {dados.rbt12Negativo && <p className="text-xs text-destructive mt-1">Não aceitamos valor negativo aqui — considerei só os dígitos, sem o sinal.</p>}
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="folha12">Folha de pagamento dos últimos 12 meses — FS12 (R$)</label>
            <input id="folha12" inputMode="decimal" value={dados.folha12} onChange={(e) => setDados((d) => ({ ...d, folha12: fmtMoeda(e.target.value), folha12Negativo: contemSinalNegativo(e.target.value) }))} placeholder="360.000,00" className="w-full h-11 mt-1.5 rounded-md border border-input bg-background px-3 text-base tabular-nums" />
            <p className="text-xs text-muted-foreground mt-1">Só usada pra calcular seu Fator R, se deixou no automático.</p>
            {dados.folha12Negativo && <p className="text-xs text-destructive mt-1">Não aceitamos valor negativo aqui — considerei só os dígitos, sem o sinal.</p>}
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="receita">Faturamento médio do último mês (R$)</label>
            <input id="receita" inputMode="decimal" value={dados.receitaMensal} onChange={(e) => setDados((d) => ({ ...d, receitaMensal: fmtMoeda(e.target.value), receitaMensalNegativo: contemSinalNegativo(e.target.value) }))} placeholder="100.000,00" className="w-full h-11 mt-1.5 rounded-md border border-input bg-background px-3 text-base tabular-nums" />
            <p className="text-xs text-muted-foreground mt-1">Base para o cálculo mensal do DAS e da carga híbrida.</p>
            {dados.receitaMensalNegativo && <p className="text-xs text-destructive mt-1">Não aceitamos valor negativo aqui — considerei só os dígitos, sem o sinal.</p>}
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
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Simulando o regime híbrido (LC 123/2006, art. 13, §9º, c/c LC 214/2025, art. 47, §9º)</li>
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

          {(resultado.puro.avisoIcmsIssForaDas || resultado.puro.avisoCppForaDas) && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex gap-2 text-xs text-amber-800 dark:text-amber-400">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                {resultado.puro.avisoIcmsIssForaDas && <p>Na 6ª faixa, ICMS e ISS saem do DAS e passam a ser recolhidos à parte, pelo regime normal (LC 123/2006, art. 18, §20) — o valor de DAS acima não inclui esse recolhimento.</p>}
                {resultado.puro.avisoCppForaDas && <p>No Anexo IV, a CPP (contribuição patronal) é sempre recolhida fora do DAS, pelo regime normal (LC 123/2006, art. 18, §5º-C) — some esse custo à carga total antes de decidir.</p>}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-5">
            <p className="font-medium text-sm">Premissas do híbrido (conferíveis e editáveis)</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <label htmlFor="cbsEditavel" className="text-xs text-muted-foreground max-w-[60%]">Alíquota de CBS do regime regular usada no cálculo — estimativa oficial (Resolução CGIBS nº 14/2026); o Senado fixa o valor definitivo até 15/12/2026</label>
              <div className="flex items-center gap-1.5">
                <input id="cbsEditavel" type="number" step="0.01" min="0" max="100"
                  value={cbsEditavel !== null ? (cbsEditavel * 100).toFixed(2) : ""}
                  onChange={(e) => setCbsEditavel(Math.max(0, Number(e.target.value) || 0) / 100)}
                  className="w-20 h-9 rounded-md border border-input bg-background px-2 text-sm text-right tabular-nums" />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border/60 grid sm:grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">Simples puro — composição do DAS ({brl(resultado.puro.dasMensal)}/mês)</p>
                <ul className="mt-1 space-y-0.5 tabular-nums">
                  <li>IBS/CBS embutido no DAS: {brl(resultado.puro.ibsCbsNoSimples)} ({pct2(resultado.puro.ibsCbsSimplesPct)} da receita)</li>
                  <li>Demais tributos no DAS: {brl(resultado.puro.dasMensal - resultado.puro.ibsCbsNoSimples)}</li>
                  <li>Crédito que a carteira de clientes recupera: {brl(resultado.puro.creditoClientePuro)} ({dados.pctClientes}% da carteira credita)</li>
                </ul>
              </div>
              <div>
                <p className="text-muted-foreground">Híbrido — composição da carga ({brl(resultado.hibrido.cargaHibridaMensal)}/mês, preço de hoje)</p>
                <ul className="mt-1 space-y-0.5 tabular-nums">
                  <li>DAS residual (sem IBS/CBS): {brl(resultado.hibrido.dasResidualPct * numMoeda(dados.receitaMensal))} ({pct2(resultado.hibrido.dasResidualPct)})</li>
                  <li>IBS/CBS regime regular: {brl(resultado.hibrido.cargaHibridaMensal - resultado.hibrido.dasResidualPct * numMoeda(dados.receitaMensal))} ({pct2(resultado.hibrido.ibsCbsRegularPct)})</li>
                  <li>Crédito que a carteira de clientes recupera: {brl(resultado.hibrido.creditoClienteHibrido)} ({dados.pctClientes}% da carteira credita)</li>
                </ul>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">Esta ferramenta não recebe créditos das compras (insumos) — ela simula só a saída (venda). Pra ver o efeito líquido com seus créditos reais de compra, fale com a equipe FAL Agro.</p>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4 flex gap-2 text-xs text-muted-foreground">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>A alíquota de CBS do regime regular (usada no cálculo do híbrido) é uma premissa editável até a fixação oficial da alíquota de referência pelo Senado — ajuste no campo acima se tiver um número mais atualizado. Resultado sujeito a ajuste; valide com um especialista antes de decidir.</span>
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
              botao="Receber simulação" perfil="simples-hibrido" segmento={resultado.puro.anexo} dados={relatorioDados} relatorio={relatorioPdf}
              onSucesso={setEnviado}
            />
          ) : (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20 p-5">
              <p className="font-medium flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Pronto, {enviado.nome?.split(" ")[0]}!</p>
              <p className="text-sm text-muted-foreground mt-1">{enviado.relatorio_enviado ? "Enviamos o resumo para o seu e-mail." : "Recebemos seus dados, mas não conseguimos enviar o e-mail agora — a equipe FAL Agro já tem seu contato."} Se quiser, já falamos pelo WhatsApp: {CONTATO.whatsapp}.</p>
            </div>
          )}

          <button type="button" onClick={() => setPasso(1)} className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">Simular outro cenário</button>
        </div>
      )}
    </div>
  );
}
