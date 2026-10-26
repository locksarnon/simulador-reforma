// Visão geral das checagens: para cada problema de cadastro, o que foi examinado (cobertura), como terminou (conclusão: verificada sem achados, com achados, não se aplica ou
// pendente) e a evidência (quem aprovou a regra, quem concluiu os grupos, a justificativa do "não se aplica"). Também deixa à vista o que está pendente na conferência manual.
import React from "react";
import { fmt, plural } from "./ui";
import { ChipConclusao } from "./CriterioUi";
import { linhasEvidencia, textoCausa, textoCobertura } from "./checagens";

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
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead><tr className="text-left text-muted-foreground"><th className="p-1.5">Checagem</th><th className="p-1.5">Cobertura</th><th className="p-1.5">Conclusão</th><th className="p-1.5">Evidência</th></tr></thead>
          <tbody>{lista.map((c) => {
            const evid = linhasEvidencia(c, nomeBase);
            return (
              <tr key={c.id} className="border-t border-border align-top">
                <td className="p-1.5 min-w-[150px]"><button type="button" className="text-left underline text-primary" onClick={() => onAbrir(c.id)}>{c.titulo}</button><div className="text-[11px] text-muted-foreground">{c.tipo === "AUTOMATICA" ? "Teste automático" : "Conferência manual"}</div></td>
                <td className="p-1.5 min-w-[200px]">{textoCobertura(c)}</td>
                <td className="p-1.5 min-w-[150px]"><ChipConclusao conclusao={c.conclusao} />{c.conclusao === "COM_ACHADOS" && c.achados > 0 && <div className="mt-0.5 text-[11px] text-muted-foreground">{plural(c.achados, "achado", "achados")}</div>}{c.conclusao === "PENDENTE" && <div className="mt-0.5 text-[11px] text-muted-foreground">{textoCausa(c)}</div>}</td>
                <td className="p-1.5 min-w-[200px]">{evid.length ? evid.map((l) => <div key={l}>{l}</div>) : <span className="text-muted-foreground">—</span>}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Verificada sem achados não é prova de que o cadastro está certo: diz apenas que a checagem rodou nos itens acima e não achou nada. A pendente fica assim até ser feita: nada se conclui sobre o que não foi verificado.</p>
    </div>
  );
}
