import React, { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Chip, Th, dataBr, fmt, ordenarPor, plural, useOrdenacao } from "./ui";
import { dadosDoItem, leituraAchado } from "./leituraAchados";
import { chaveDe, identificavel, motivoSemIdentidade } from "./identidade";
import { sugestaoMudou } from "./aprovacao";

/** O que "encaminhar" faz, dito de forma completa para quem está decidindo. */
export const TXT_ENCAMINHAR = "Encaminhar = enviar o achado ao passo De/para como proposta, para você aprovar ou rejeitar (com aprovador e data). Só o aprovado entra nas listas finais e na execução; o que não for encaminhado fica como está. Nada é alterado no cadastro: a ferramenta só sugere.";

/** Rótulo do botão em bloco: diz o que sai (sugestões ou achados), quantos faltam encaminhar e para onde vão (aprovação no De/para). */
export function rotuloEncaminhar(crit, restam, parcial, ondeTxt) {
  const sug = crit.id === "padrao" || crit.id === "unidade";
  const o = restam === 1 ? `${sug ? "a sugestão" : "o achado"}${parcial ? " restante" : ""}` : `${sug ? "as" : "os"} ${fmt(restam)} ${sug ? "sugestões" : "achados"}${parcial ? " restantes" : ""}`;
  return `Encaminhar ${o} ${ondeTxt} para aprovação`;
}

/** Em que pé está um achado encaminhado, ao lado da caixa: aguardando, aprovado ou rejeitado no De/para. */
export function SituacaoEncaminhado({ d }) {
  if (d.status === "APR") return <span title={`Aprovado no De/para${d.decididoPor ? ` por ${d.decididoPor}` : ""}${d.decididoEm ? ` em ${dataBr(d.decididoEm)}` : ""}`}><Chip tom="g">Aprovado</Chip></span>;
  if (d.status === "REJ") return <span title="Rejeitado no De/para"><Chip>Rejeitado</Chip></span>;
  return <span title="Encaminhado ao De/para: aguarda a sua decisão lá"><Chip tom="a">Aguardando aprovação</Chip></span>;
}

/** Explica o que é encaminhar e mostra quantos achados do critério já foram encaminhados e em que pé estão. */
export function LegendaEncaminhar({ lista, decisoes, critId, onIrDepara, indice }) {
  const decs = lista.filter((a) => !indice || identificavel(a.item, indice)).map((a) => decisoes[chaveDe(a.item, critId)]).filter(Boolean); // item sem código, ou de código repetido, não tem decisão
  const aguardando = decs.filter((d) => d.status === "PROP").length; const aprovados = decs.filter((d) => d.status === "APR").length; const rejeitados = decs.filter((d) => d.status === "REJ").length;
  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p>{TXT_ENCAMINHAR}</p>
        <p className="text-foreground">{decs.length === 0 ? "Nenhum achado encaminhado neste critério ainda." : <>Encaminhados neste critério: <b className="font-medium">{fmt(decs.length)} de {fmt(lista.length)}</b> ({fmt(aguardando)} aguardando aprovação · {plural(aprovados, "aprovado", "aprovados")} · {plural(rejeitados, "rejeitado", "rejeitados")}).</>}{" "}
          <button type="button" className="text-primary underline" onClick={onIrDepara}>Abrir o De/para</button></p>
      </div>
    </div>
  );
}

/** Um lado da leitura (como é ou como seria): linhas "rótulo: valor", com o que muda em destaque. */
function Linhas({ linhas }) {
  return <div className="space-y-0.5">{linhas.map((l, i) => <div key={i} className="break-words"><span className="text-muted-foreground">{l.rotulo}: </span><span className={l.destaque ? "font-medium" : ""}>{l.valor}</span></div>)}</div>;
}

const ranqueDecisao = (d) => (!d ? 0 : d.status === "PROP" ? 1 : d.status === "APR" ? 2 : 3);
const textoLado = (ls) => ls.map((x) => `${x.rotulo} ${x.valor}`).join(" ");

/**
 * Tabela dos achados de um critério num grupo: o item, como é hoje, como seria (a sugestão) e por quê, e a caixa de encaminhar.
 * Todas as colunas ordenam ao clicar no cabeçalho. `onAlternar(achado)` marca ou desmarca o encaminhamento.
 */
export default function TabelaAchados({ ach, crit, decisoes, itemPorLinha, indice, escalaSaldo = 1, onAlternar, onComparar }) {
  const [ord, ordenar] = useOrdenacao();
  const [lim, setLim] = useState(100);
  const linhas = useMemo(() => ach.map((a) => ({ a, l: leituraAchado(crit, a, { itemPorLinha, escala: escalaSaldo }), dados: dadosDoItem(a.item, escalaSaldo) })), [ach, crit, itemPorLinha, escalaSaldo]);
  const ordenadas = useMemo(() => ordenarPor(linhas, ord, {
    linha: (x) => x.a.item.linha, codigo: (x) => x.a.item.codigo, descricao: (x) => x.a.item.descricao,
    como: (x) => textoLado(x.l.como), seria: (x) => textoLado(x.l.seria), enc: (x) => ranqueDecisao(decisoes[chaveDe(x.a.item, crit.id)]),
  }), [linhas, ord, decisoes, crit.id]);
  const rotSeria = crit.id === "padrao" ? "Como seria (descrição sugerida)" : crit.id === "unidade" ? "Como seria (unidade sugerida)" : "Como seria";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead><tr className="text-left text-muted-foreground">
          <Th chave="linha" ord={ord} onOrdenar={ordenar}>Linha</Th><Th chave="codigo" ord={ord} onOrdenar={ordenar}>Código</Th><Th chave="descricao" ord={ord} onOrdenar={ordenar}>Descrição</Th>
          <Th chave="como" ord={ord} onOrdenar={ordenar}>Como é</Th><Th chave="seria" ord={ord} onOrdenar={ordenar}>{rotSeria}</Th>
          <Th chave="enc" ord={ord} onOrdenar={ordenar} title="Enviar o achado ao passo De/para, para aprovar ou rejeitar lá">Encaminhar para aprovação</Th>
        </tr></thead>
        <tbody>{ordenadas.slice(0, lim).map(({ a, l, dados }) => {
          const it = a.item; const semId = indice ? motivoSemIdentidade(it, indice) : ""; const dec = semId ? undefined : decisoes[chaveDe(it, crit.id)];
          return (
            <tr key={it.linha} className="border-t border-border align-top">
              <td className="p-1.5 tabular-nums">{it.linha}</td><td className="p-1.5">{it.codigo || "—"}</td>
              <td className="p-1.5 max-w-[240px]"><div className="break-words">{it.descricao || "—"}</div>{dados.length > 0 && <div className="mt-0.5 text-[11px] text-muted-foreground">{dados.map(([r, v]) => `${r} ${v}`).join(" · ")}</div>}</td>
              <td className="p-1.5 max-w-[260px]"><Linhas linhas={l.como} />{crit.id === "duplicidade" && it.duplicidade && <button type="button" className="mt-1 text-primary underline" onClick={() => onComparar(it)}>Comparar</button>}</td>
              <td className="p-1.5 max-w-[300px]"><Linhas linhas={l.seria} />{l.porque && <div className="mt-0.5 text-[11px] text-muted-foreground break-words">{l.porque}</div>}</td>
              <td className="p-1.5 whitespace-nowrap"><label className="inline-flex items-center gap-1.5" title={semId || undefined}><input type="checkbox" aria-label={`Encaminhar o item ${it.codigo || `da linha ${it.linha}`} para aprovação`} checked={!!dec} disabled={(!!dec && dec.status !== "PROP") || !!semId} onChange={() => onAlternar(a)} />{dec && <SituacaoEncaminhado d={dec} />}</label>{semId && <p className="mt-1 max-w-[200px] whitespace-normal text-[11px] text-amber-700 dark:text-amber-300">{semId}.</p>}
                {dec && sugestaoMudou(crit.id, dec, a) && <p className="mt-1 max-w-[220px] whitespace-normal text-[11px] text-amber-700 dark:text-amber-300">A sugestão de hoje é diferente da que foi decidida: a decisão vale só para a anterior.</p>}</td>
            </tr>);
        })}</tbody>
      </table>
      {ordenadas.length > lim && <button type="button" onClick={() => setLim(lim + 200)} className="text-xs text-primary underline p-2">Mostrar mais ({fmt(ordenadas.length - lim)} restantes)</button>}
    </div>
  );
}
