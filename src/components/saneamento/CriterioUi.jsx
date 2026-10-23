// Peças dos critérios compartilhadas pelos passos Critérios e Análises: as abas são as mesmas nos dois, para o analista tratar cada problema no seu lugar.
import React, { useState } from "react";
import { CRITERIOS } from "./logica";
import { JUSTIFICATIVA_MIN, achadosDe, coberturaDoCriterio, naoAplicavelDe } from "./analise";
import { Botao, Chip, dataBr, fmt } from "./ui";

/** Abas dos critérios. `marca(c)` diz quais levam o ✓ (resolvidos no passo Critérios; concluídos no passo Análises). */
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

/** Selos do critério: tipo de teste e situação (aprovado pelo analista, aprovado automaticamente, sem a análise executada, não aplicável ou pendente). */
export function SelosCriterio({ crit, situacao, cEst }) {
  return (
    <>
      {crit.auto ? <Chip tom="b">Teste automático</Chip> : <Chip>Conferência manual</Chip>}
      {situacao === "APROVADO" ? <Chip tom="g">Aprovado por {cEst.por} em {dataBr(cEst.em)}</Chip>
        : situacao === "AUTO" ? <Chip tom="g">Aprovado automaticamente: sem achados</Chip>
          : situacao === "NAO_APLICAVEL" ? <Chip>Não se aplica a este projeto</Chip>
            : situacao === "SEM_ANALISE" ? <Chip tom="a">Análise não executada nesta base</Chip>
              : <Chip tom="a">Pendente de aprovação</Chip>}
    </>
  );
}

/** Explica a situação quando ela não é a de sempre: análise que não rodou na base ou critério declarado não aplicável (com quem, quando e por quê). */
export function AvisoCriterio({ estado, crit, situacao, contagem, onIrTriagem }) {
  if (situacao === "SEM_ANALISE") {
    const falta = coberturaDoCriterio(contagem, crit).falta;
    return (
      <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 text-xs space-y-2 dark:border-amber-700/50 dark:bg-amber-950/20" role="alert">
        <p>A base foi processada sem {falta}. Sem ela o teste deste critério não enxerga o problema por inteiro, e “nenhum achado” não prova que não há: o critério fica pendente e nenhum grupo pode ser saneado sem ele.</p>
        <p className="text-muted-foreground">Para resolver, processe a base de novo com a opção marcada (passo Triagem, “Trocar a base”) ou declare que o critério não se aplica a este projeto, com a justificativa.</p>
        {onIrTriagem && <Botao onClick={onIrTriagem}>Ir para a Triagem</Botao>}
      </div>);
  }
  if (situacao === "NAO_APLICAVEL") {
    const n = naoAplicavelDe(estado, crit);
    return <p className="text-xs text-muted-foreground">Declarado não aplicável por {n?.por || "—"} em {dataBr(n?.em)}: {n?.justificativa}. O critério não gera análise, lista nem regra na política, e não trava o saneamento dos grupos.</p>;
  }
  return null;
}

/** Aprovar (pendente), reabrir (aprovado ou não aplicável), revisar manualmente (aprovado automaticamente) ou declarar que o critério não se aplica, com justificativa. */
export function AcaoAprovacao({ situacao, onAprovar, onReabrir, onNaoAplicavel }) {
  const [aberto, setAberto] = useState(false); const [txt, setTxt] = useState("");
  const podeNaoAplicar = !!onNaoAplicavel && (situacao === "PENDENTE" || situacao === "SEM_ANALISE");
  const valida = txt.trim().length >= JUSTIFICATIVA_MIN;
  const confirmar = (e) => { e.preventDefault(); if (!valida) return; onNaoAplicavel(txt.trim()); setAberto(false); setTxt(""); };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {situacao === "PENDENTE" && <Botao onClick={onAprovar}>Aprovar critério</Botao>}
        {(situacao === "APROVADO" || situacao === "NAO_APLICAVEL") && <Botao onClick={onReabrir}>Reabrir critério</Botao>}
        {situacao === "AUTO" && <Botao onClick={onReabrir}>Revisar manualmente</Botao>}
        {podeNaoAplicar && <Botao onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>Não se aplica a este projeto…</Botao>}
      </div>
      {aberto && podeNaoAplicar && (
        <form onSubmit={confirmar} className="rounded-lg border border-border p-3 space-y-2">
          <label className="block text-xs text-muted-foreground">Por que este critério não se aplica a este projeto? A justificativa fica registrada com o seu nome e a data.
            <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={2} className="mt-1 w-full border rounded-md p-2 text-sm bg-background text-foreground" aria-label="Justificativa" /></label>
          <div className="flex flex-wrap items-center gap-2">
            <Botao type="submit" disabled={!valida}>Declarar que não se aplica</Botao>
            <Botao type="button" onClick={() => { setAberto(false); setTxt(""); }}>Cancelar</Botao>
            {!valida && <span className="text-xs text-muted-foreground">Escreva ao menos {JUSTIFICATIVA_MIN} caracteres.</span>}
          </div>
        </form>)}
    </div>
  );
}
