// Peças das checagens (passo Checagens): as abas, o selo da conclusão, o selo da regra, o aviso de situação e as ações de aprovar, reabrir ou declarar que não se aplica.
import React, { useState } from "react";
import { CRITERIOS } from "./logica";
import { JUSTIFICATIVA_MIN, achadosDe, coberturaDoCriterio, naoAplicavelDe } from "./analise";
import { ROTULO_CONCLUSAO } from "./checagens";
import { Botao, Chip, dataBr, fmt } from "./ui";

const TOM_CONCLUSAO = { SEM_ACHADOS: "g", COM_ACHADOS: "b", NAO_APLICAVEL: "n", PENDENTE: "a" };

/** O estado da checagem (verificada sem achados, verificada com achados, não se aplica ou pendente) como selo colorido. */
export function ChipConclusao({ conclusao }) {
  return <Chip tom={TOM_CONCLUSAO[conclusao] || "n"}>{ROTULO_CONCLUSAO[conclusao] || conclusao}</Chip>;
}

/** Abas das checagens, uma por problema. `conclusoes` ({ [critId]: conclusão }) põe ✓ nas concluídas (com ou sem achados) e "n/a" nas que não se aplicam; o selo diz o estado ao passar o mouse. */
export function AbasCriterios({ contagem, ativo, onSelecionar, conclusoes }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Checagens">
      {CRITERIOS.map((c) => {
        const n = achadosDe(contagem, c); const concl = conclusoes?.[c.id];
        return (
          <button key={c.id} type="button" role="tab" aria-selected={c.id === ativo} onClick={() => onSelecionar(c.id)} title={concl ? ROTULO_CONCLUSAO[concl] : undefined}
            className={`px-2.5 py-1 text-xs rounded-md border ${c.id === ativo ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}>
            {c.titulo}{n > 0 && <span className="ml-1 tabular-nums opacity-70">{fmt(n)}</span>}{concl === "SEM_ACHADOS" || concl === "COM_ACHADOS" ? " ✓" : concl === "NAO_APLICAVEL" ? " n/a" : ""}
          </button>);
      })}
    </div>
  );
}

/** Selo da REGRA da checagem: aprovada pelo analista, aprovada automaticamente (teste sem achados), sem a análise executada, não aplicável ou pendente de aprovação. */
export function SelosCriterio({ situacao, cEst }) {
  return situacao === "APROVADO" ? <Chip tom="g">Regra aprovada por {cEst.por} em {dataBr(cEst.em)}</Chip>
    : situacao === "AUTO" ? <Chip tom="g">Regra aprovada automaticamente: sem achados</Chip>
      : situacao === "NAO_APLICAVEL" ? <Chip>Não se aplica a este projeto</Chip>
        : situacao === "SEM_ANALISE" ? <Chip tom="a">Análise não executada nesta base</Chip>
          : <Chip tom="a">Regra pendente de aprovação</Chip>;
}

/** Explica a situação quando ela não é a de sempre: análise que não rodou na base ou checagem declarada não aplicável (com quem, quando e por quê). */
export function AvisoCriterio({ estado, crit, situacao, contagem, onIrTriagem }) {
  if (situacao === "SEM_ANALISE") {
    const falta = coberturaDoCriterio(contagem, crit).falta;
    return (
      <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 text-xs space-y-2 dark:border-amber-700/50 dark:bg-amber-950/20" role="alert">
        <p>A base foi processada sem {falta}. Sem ela o teste desta checagem não enxerga o problema por inteiro, e “nenhum achado” não prova que não há: a checagem fica pendente e nenhum grupo pode ser saneado sem ela.</p>
        <p className="text-muted-foreground">Para resolver, processe a base de novo com a opção marcada (passo Triagem, “Trocar a base”) ou declare que a checagem não se aplica a este projeto, com a justificativa.</p>
        {onIrTriagem && <Botao onClick={onIrTriagem}>Ir para a Triagem</Botao>}
      </div>);
  }
  if (situacao === "NAO_APLICAVEL") {
    const n = naoAplicavelDe(estado, crit);
    return <p className="text-xs text-muted-foreground">Declarada não aplicável por {n?.por || "—"} em {dataBr(n?.em)}: {n?.justificativa}. A checagem não gera análise, lista nem regra na política, e não trava o saneamento dos grupos.</p>;
  }
  return null;
}

/** Aprovar a regra (pendente), reabri-la (aprovada ou não aplicável), revisar manualmente (aprovada automaticamente) ou declarar que a checagem não se aplica, com justificativa. */
export function AcaoAprovacao({ situacao, onAprovar, onReabrir, onNaoAplicavel }) {
  const [aberto, setAberto] = useState(false); const [txt, setTxt] = useState("");
  const podeNaoAplicar = !!onNaoAplicavel && (situacao === "PENDENTE" || situacao === "SEM_ANALISE");
  const valida = txt.trim().length >= JUSTIFICATIVA_MIN;
  const confirmar = (e) => { e.preventDefault(); if (!valida) return; onNaoAplicavel(txt.trim()); setAberto(false); setTxt(""); };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {situacao === "PENDENTE" && <Botao onClick={onAprovar}>Aprovar a regra</Botao>}
        {(situacao === "APROVADO" || situacao === "NAO_APLICAVEL") && <Botao onClick={onReabrir}>Reabrir a regra</Botao>}
        {situacao === "AUTO" && <Botao onClick={onReabrir}>Revisar manualmente</Botao>}
        {podeNaoAplicar && <Botao onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>Não se aplica a este projeto…</Botao>}
      </div>
      {aberto && podeNaoAplicar && (
        <form onSubmit={confirmar} className="rounded-lg border border-border p-3 space-y-2">
          <label className="block text-xs text-muted-foreground">Por que esta checagem não se aplica a este projeto? A justificativa fica registrada com o seu nome e a data.
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
