// Peças dos critérios compartilhadas pelos passos Critérios e Análises: as abas são as mesmas nos dois, para o analista tratar cada problema no seu lugar.
import React from "react";
import { CRITERIOS } from "./logica";
import { achadosDe } from "./analise";
import { Botao, Chip, dataBr, fmt } from "./ui";

/** Abas dos critérios. `marca(c)` diz quais levam o ✓ (aprovados no passo Critérios; concluídos no passo Análises). */
export function AbasCriterios({ estado, contagem, ativo, onSelecionar, marca }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Critérios">
      {CRITERIOS.map((c) => {
        const n = achadosDe(contagem, c);
        return (
          <button key={c.id} type="button" role="tab" aria-selected={c.id === ativo} onClick={() => onSelecionar(c.id)}
            className={`px-2.5 py-1 text-xs rounded-md border ${c.id === ativo ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}>
            {c.titulo}{n > 0 && <span className="ml-1 tabular-nums opacity-70">{fmt(n)}</span>}{marca(estado, c) ? " ✓" : ""}
          </button>);
      })}
    </div>
  );
}

/** Selos do critério: tipo de teste e situação da aprovação (aprovado pelo analista, aprovado automaticamente ou pendente). */
export function SelosCriterio({ crit, situacao, cEst }) {
  return (
    <>
      {crit.auto ? <Chip tom="b">Teste automático</Chip> : <Chip>Conferência manual</Chip>}
      {situacao === "APROVADO" ? <Chip tom="g">Aprovado por {cEst.por} em {dataBr(cEst.em)}</Chip> : situacao === "AUTO" ? <Chip tom="g">Aprovado automaticamente: sem achados</Chip> : <Chip tom="a">Pendente de aprovação</Chip>}
    </>
  );
}

/** Aprovar (pendente), reabrir (aprovado pelo analista) ou revisar manualmente (aprovado automaticamente). */
export function AcaoAprovacao({ situacao, onAprovar, onReabrir }) {
  if (situacao === "PENDENTE") return <Botao onClick={onAprovar}>Aprovar critério</Botao>;
  return <Botao onClick={onReabrir}>{situacao === "AUTO" ? "Revisar manualmente" : "Reabrir critério"}</Botao>;
}
