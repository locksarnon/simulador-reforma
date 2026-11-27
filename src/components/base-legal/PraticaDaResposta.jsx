import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Calculator, CheckCircle2, ListChecks, Sparkles } from "lucide-react";
import { nomeDoModelo, respondeuPeloFable } from "@/lib/assistente";

const ROTULO = "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground";

/** Linha do cálculo em duas colunas (cabe no painel do assistente): o item e a conta à esquerda; o valor e a origem à direita. */
function Linha({ descricao, conta, valor, origem, destaque = false }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className={`text-sm ${destaque ? "font-medium" : ""}`}>{descricao}</p>
        {conta && <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{conta}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm tabular-nums ${destaque ? "font-semibold" : ""}`}>{valor}</p>
        <div className="mt-0.5 text-[11px]">{origem}</div>
      </div>
    </li>
  );
}

/** Cálculo modelo conferido pelo InTAX: premissas de exemplo, números da lei com o artigo e as contas refeitas. */
export function CalculoModelo({ c }) {
  return (
    <section aria-label="Cálculo modelo" className="space-y-2 rounded-lg border border-border p-3">
      <p className={ROTULO}><Calculator className="h-3.5 w-3.5" aria-hidden="true" /> Como calcular</p>
      {c.formula && <p className="text-sm font-medium">{c.formula}</p>}
      <ul className="divide-y divide-border">
        {(c.premissas ?? []).map((p) => (
          <Linha key={p.id} descricao={p.descricao} valor={p.valor_texto}
            origem={<span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">Exemplo</span>} />
        ))}
        {(c.parametros ?? []).map((p) => (
          <Linha key={p.id} descricao={p.descricao} valor={p.valor_texto}
            origem={<Link to={`/base-legal/${p.fundamento.norma}/${p.fundamento.caminho}`} className="text-primary hover:underline">{p.fundamento.numero}, {p.fundamento.rotulo}</Link>} />
        ))}
        {(c.linhas ?? []).map((l) => (
          <Linha key={l.id} descricao={l.descricao} conta={l.conta} valor={l.valor_texto} destaque
            origem={<span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Conta conferida</span>} />
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">Valores da operação são de exemplo. Cada número da lei vem com o artigo que o traz, e todas as contas foram refeitas pelo InTAX.</p>
      {c.ajustes?.length > 0 && (
        <div className="rounded-md bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          <p className="font-medium">Contas corrigidas pelo InTAX (o modelo errou a conta; vale a da tabela):</p>
          <ul className="mt-0.5 list-disc pl-4">{c.ajustes.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

/** "O que eu faço?" e "como calculo?": o passo a passo e o cálculo modelo (ou por que não há cálculo). */
export default function PraticaDaResposta({ pratica }) {
  if (!pratica) return null;
  const passos = pratica.passos ?? [];
  return (
    <div className="space-y-4">
      {passos.length > 0 && (
        <section aria-label="Na prática: o que fazer" className="space-y-2">
          <p className={ROTULO}><ListChecks className="h-3.5 w-3.5" aria-hidden="true" /> Na prática: o que fazer</p>
          <ol className="space-y-2">
            {passos.map((p, i) => (
              <li key={`${i}-${p.slice(0, 20)}`} className="flex gap-2.5 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary tabular-nums" aria-hidden="true">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {pratica.calculo ? <CalculoModelo c={pratica.calculo} /> : pratica.sem_calculo ? (
        <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm"><Calculator className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span><b>Cálculo modelo:</b> {pratica.sem_calculo}</span></p>
      ) : null}
    </div>
  );
}

/** Qual motor construiu a resposta: o Claude Fable 5.2 ou, se ele não respondeu, o motor reserva (dito com todas as letras). */
export function MotorDaResposta({ modelo }) {
  if (!modelo) return null;
  if (respondeuPeloFable(modelo)) {
    return <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> Resposta construída pelo {nomeDoModelo(modelo)}</p>;
  }
  return (
    <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Resposta do motor reserva ({nomeDoModelo(modelo)}): o Claude Fable 5.2 não respondeu agora. Confira com atenção redobrada ou pergunte de novo em instantes.</span>
    </p>
  );
}
