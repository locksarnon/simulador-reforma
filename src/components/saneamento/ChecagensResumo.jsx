// Visão geral das checagens: para cada problema de cadastro, o que foi examinado (cobertura), como terminou (conclusão: verificada sem achados, com achados, não se aplica ou
// pendente) e a evidência (quem aprovou a regra, quem concluiu os grupos, a justificativa do "não se aplica"). Também deixa à vista o que está pendente na conferência manual.
import React from "react";
import { fmt, plural } from "./ui";
import { ChipConclusao } from "./CriterioUi";
import { ROTULO_CONCLUSAO, linhasEvidencia, textoCausa, textoCobertura } from "./checagens";
import TabelaPadrao from "@/components/TabelaPadrao";

/** `lista` vem de checagens() e `resumo` de resumoChecagens(); `escopo` é o escopo.resumo do projeto (null sem base); `onAbrir(id)` abre a aba da checagem. */
export default function ChecagensResumo({ lista, resumo, escopo, nomeBase, extraidaEm, onAbrir }) {
  const dataExtracao = extraidaEm ? String(extraidaEm).split("-").reverse().join("/") : "";
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {escopo ? <>As checagens valem para os <b className="font-medium text-foreground">{fmt(escopo.emEscopo)} itens em escopo</b>{nomeBase ? ` da base ${nomeBase}` : ""}{dataExtracao ? ` (extração de ${dataExtracao})` : ""}.{escopo.fora > 0 ? ` Os ${fmt(escopo.fora)} itens fora do escopo (corte por data) não são checados: ficam só como candidatos à inativação, que depende de aprovação.` : ""}{escopo.foraGrupos > 0 ? ` Os ${fmt(escopo.foraGrupos)} itens de grupos fora do saneamento não são checados nem inativados.` : ""} Nada é alterado no cadastro: a ferramenta só verifica e sugere.</>
          : "Nenhuma base com itens em escopo: nada foi verificado."}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5"><ChipConclusao conclusao="SEM_ACHADOS" /> <b className="tabular-nums">{fmt(resumo.SEM_ACHADOS)}</b></span>
        <span className="inline-flex items-center gap-1.5"><ChipConclusao conclusao="COM_ACHADOS" /> <b className="tabular-nums">{fmt(resumo.COM_ACHADOS)}</b></span>
        <span className="inline-flex items-center gap-1.5"><ChipConclusao conclusao="NAO_APLICAVEL" /> <b className="tabular-nums">{fmt(resumo.NAO_APLICAVEL)}</b></span>
        <span className="inline-flex items-center gap-1.5"><ChipConclusao conclusao="PENDENTE" /> <b className="tabular-nums">{fmt(resumo.PENDENTE)}</b></span>
      </div>
      {resumo.manuaisPendentes.length > 0 && (
        <div role="status" className="rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 text-xs space-y-1 dark:border-amber-700/50 dark:bg-amber-950/20">
          <p><b className="font-medium">{plural(resumo.manuaisPendentes.length, "checagem de conferência manual pendente", "checagens de conferência manual pendentes")}.</b> Nenhum teste automático as faz por você: o grupo só é saneado depois de concluída em cada grupo, com o resultado e a evidência escrita.</p>
          <ul className="list-disc pl-5">
            {resumo.manuaisPendentes.map((c) => <li key={c.id}><button type="button" className="underline text-primary" onClick={() => onAbrir(c.id)}>{c.titulo}</button>: {textoCausa(c)}</li>)}
          </ul>
        </div>)}
      <TabelaPadrao id="saneamento-checagens-resumo" ariaLabel="Checagens" simples linhas={lista} chaveLinha={(c) => c.id} vazio="Nenhuma checagem." colunas={[
        { chave: "titulo", rotulo: "Checagem", render: (c) => <button type="button" className="text-left underline text-primary" onClick={() => onAbrir(c.id)}>{c.titulo}</button> },
        { chave: "tipo", rotulo: "Tipo", valor: (c) => (c.tipo === "AUTOMATICA" ? "Teste automático" : "Conferência manual") },
        { chave: "cobertura", rotulo: "Cobertura", valor: (c) => textoCobertura(c), quebrar: true },
        { chave: "conclusao", rotulo: "Conclusão", valor: (c) => ROTULO_CONCLUSAO[c.conclusao] || c.conclusao, render: (c) => <ChipConclusao conclusao={c.conclusao} /> },
        { chave: "detalhe", rotulo: "Detalhe", valor: (c) => (c.conclusao === "COM_ACHADOS" && c.achados > 0 ? plural(c.achados, "achado", "achados") : c.conclusao === "PENDENTE" ? textoCausa(c) : "") },
        { chave: "evidencia", rotulo: "Evidência", valor: (c) => linhasEvidencia(c, nomeBase).join("; "), quebrar: true },
      ]} />
      <p className="text-[11px] text-muted-foreground">Verificada sem achados não é prova de que o cadastro está certo: diz apenas que a checagem rodou nos itens acima e não achou nada. A pendente fica assim até ser feita: nada se conclui sobre o que não foi verificado.</p>
    </div>
  );
}
