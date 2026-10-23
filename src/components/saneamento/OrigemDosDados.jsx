import React, { useMemo } from "react";
import { Info } from "lucide-react";
import { Botao, Chip, dataBr, fmt, plural } from "./ui";
import { origemCompleta } from "./identidade";
import { conciliarDecisoes } from "./aprovacao";
import { CRITERIOS } from "./logica";

/**
 * Origem dos dados do projeto: ERP + instância + empresa. O item é identificado por essas três coisas e pelo código (texto); a linha da planilha muda a cada extração e não
 * identifica nada. Uma nova base só vale para o projeto se for da mesma origem: para outra empresa ou instância, outro projeto.
 */
export function OrigemDosDados({ origem, onMudar }) {
  const o = origem || {};
  const campo = (chave, rotulo, exemplo) => (
    <label className="text-xs text-muted-foreground">{rotulo}
      <input value={o[chave] ?? ""} onChange={(e) => onMudar({ [chave]: e.target.value })} placeholder={exemplo} className="mt-1 w-full border rounded-md p-1.5 text-sm bg-background text-foreground" /></label>);
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">Origem dos dados</h3>
        {origemCompleta(o) ? <Chip tom="g">Declarada{o.declaradaPor ? ` por ${o.declaradaPor}` : ""}{o.declaradaEm ? ` em ${dataBr(o.declaradaEm)}` : ""}</Chip> : <Chip tom="a">Não declarada</Chip>}
      </div>
      <p className="text-xs text-muted-foreground">O item é identificado por ERP + instância + empresa + código (o código como texto, com os zeros à esquerda). As decisões, as tarefas e a revisão fiscal ficam presas ao código, e não à linha da planilha, que muda a cada extração. Uma nova base só vale para este projeto se for da mesma origem: para outra empresa ou instância, crie outro projeto.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {campo("erp", "ERP", "Ex.: SAP Business One")}{campo("instancia", "Instância ou banco de dados", "Ex.: CRESTANI_PRD")}{campo("empresa", "Empresa no ERP", "Ex.: Crestani Agro")}
      </div>
    </div>
  );
}

const titulo = (crit) => CRITERIOS.find((c) => c.id === crit)?.titulo ?? crit;

/** Depois de trocar a base: quantas decisões ainda valem para o cadastro de agora, quais mudaram desde a aprovação e quais são de itens que não estão na base. */
export function ConciliacaoBase({ decisoes, itens, onIrDepara }) {
  const c = useMemo(() => conciliarDecisoes(decisoes, itens), [decisoes, itens]);
  if (!c.total || (!c.mudaram.length && !c.ausentes.length && !c.ambiguas.length && !c.refletidas)) return null;
  const lista = (itensL) => itensL.slice(0, 6).map((x) => `${x.id} (${titulo(x.crit).toLowerCase()})`).join("; ") + (itensL.length > 6 ? `; +${itensL.length - 6}` : "");
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1.5" role="status">
      <p className="flex items-center gap-1.5 font-medium text-foreground"><Info className="w-3.5 h-3.5" aria-hidden="true" />Decisões e a base atual</p>
      <p>{fmt(c.ok)} de {plural(c.total, "decisão", "decisões")} conferem com o cadastro de agora.{c.refletidas ? ` ${plural(c.refletidas, "já está", "já estão")} refletida${c.refletidas === 1 ? "" : "s"} no cadastro.` : ""}</p>
      {c.mudaram.length > 0 && <p className="text-amber-700 dark:text-amber-300">{plural(c.mudaram.length, "decisão não vale", "decisões não valem")} porque o cadastro do item mudou para outra coisa desde a decisão: {lista(c.mudaram)}. Descarte no De/para e encaminhe de novo, se ainda fizer sentido.</p>}
      {c.ausentes.length > 0 && <p className="text-muted-foreground">{plural(c.ausentes.length, "decisão é", "decisões são")} de {c.ausentes.length === 1 ? "item" : "itens"} que não {c.ausentes.length === 1 ? "está" : "estão"} nesta base: {lista(c.ausentes)}. Ficam guardadas.</p>}
      {c.ambiguas.length > 0 && <p className="text-amber-700 dark:text-amber-300">{plural(c.ambiguas.length, "decisão é", "decisões são")} de código repetido na base ({lista(c.ambiguas)}): não dá para saber de qual item são, e nenhuma tarefa nasce delas.</p>}
      {onIrDepara && <Botao onClick={onIrDepara}>Abrir o De/para</Botao>}
    </div>
  );
}
