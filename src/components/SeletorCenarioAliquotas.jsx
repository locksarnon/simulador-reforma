import React from "react";
import { AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import PctInput from "@/components/ui/pct-input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import InfoTooltip from "@/components/InfoTooltip";
import { CENARIOS_ALIQUOTA, alertaGatilho, pctRef } from "@/motor/cenariosAliquota";
import { definirCenarioAliquotas } from "@/lib/cenarioAliquotasStore";

const AJUDA =
  "As alíquotas de IBS e CBS de 2029 a 2033 ainda não existem: o Senado as fixa em outubro do ano anterior, com base no cálculo do TCU (LC 214, art. 349). Escolha o cenário que quer simular. A escolha vale para todas as telas e fica guardada neste navegador. 2026 a 2028 não mudam com o cenário.";

/**
 * Escolha do cenário de alíquotas de referência (2029–2033) com o resumo do que ele assume e o
 * alerta do gatilho de 26,5%. `resumo` e `selecao` vêm de useTransicaoComCenario().
 */
export default function SeletorCenarioAliquotas({ resumo, selecao, className = "" }) {
  if (!resumo || !selecao) return null;
  const alerta = alertaGatilho(resumo);
  const personalizado = selecao.id === "personalizado";

  return (
    <section className={`rounded-lg border border-border bg-card p-4 space-y-3 ${className}`} aria-label="Cenário de alíquotas de 2029 a 2033">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="w-full sm:w-80">
          <Label className="text-xs inline-flex items-center gap-1.5 mb-1.5">
            Cenário de alíquotas 2029–2033 <InfoTooltip text={AJUDA} />
          </Label>
          <Select value={selecao.id} onValueChange={(id) => definirCenarioAliquotas({ id })}>
            <SelectTrigger aria-label="Cenário de alíquotas"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CENARIOS_ALIQUOTA.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {personalizado && (
          <>
            <div className="w-28">
              <Label className="text-xs mb-1.5 block" htmlFor="cen-cbs">CBS ref. (%)</Label>
              <PctInput id="cen-cbs" value={selecao.cbs ?? resumo.cbsReferencia} onChange={(f) => definirCenarioAliquotas({ id: "personalizado", cbs: f })} />
            </div>
            <div className="w-28">
              <Label className="text-xs mb-1.5 block" htmlFor="cen-ibs">IBS cheio (%)</Label>
              <PctInput id="cen-ibs" value={selecao.ibs ?? resumo.ibsReferenciaCheia} onChange={(f) => definirCenarioAliquotas({ id: "personalizado", ibs: f })} />
            </div>
          </>
        )}

        <p className="text-sm text-muted-foreground flex-1 min-w-[16rem]">
          {resumo.resumo}{" "}
          <span className="text-foreground font-medium tabular-nums">
            CBS {pctRef(resumo.cbsReferencia)} + IBS {pctRef(resumo.ibsReferenciaCheia)} = {pctRef(resumo.somaReferencia)}
          </span>
        </p>
      </div>

      {resumo.redutorCompraGov && (
        <p className="text-xs text-muted-foreground">
          Vendas a órgão público: redutor de <b className="text-foreground">{pctRef(resumo.redutorCompraGov.valor, 2)}</b> cadastrado em {resumo.redutorCompraGov.ano}, repetido nos anos seguintes até haver novo valor (a lei só fixa o redutor de cada ano no ano anterior, LC 214, art. 349, §1º).
        </p>
      )}

      {alerta && (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs leading-relaxed" role="status">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" aria-hidden />
          <span>{alerta}</span>
        </p>
      )}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground">O que este cenário assume e de onde vem</summary>
        <p className="mt-2 leading-relaxed">{resumo.descricao}</p>
        <p className="mt-1.5 leading-relaxed"><b className="text-foreground">Fonte:</b> {resumo.fonte}.</p>
      </details>
    </section>
  );
}
