import React, { useMemo } from "react";
import { Info } from "lucide-react";
import TabelaPadrao from "@/components/TabelaPadrao";
import { Chip, dataBr, fmt, plural } from "./ui";
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

const ROT_DECISAO = { PROP: "Aguardando aprovação", APR: "Aprovado", REJ: "Rejeitado" };
const LONGOS = ["Parecido com", "Ação", "Fica"]; // rótulos com texto longo (lista de itens parecidos, instrução): só estes quebram linha
/** Rótulos de um lado da leitura (como é ou como seria), na ordem em que aparecem nos achados: cada rótulo vira uma coluna. */
const rotulosDe = (linhas, lado) => { const r = []; for (const x of linhas) for (const l of x.l[lado]) if (!r.includes(l.rotulo)) r.push(l.rotulo); return r; };
/** Valor de um rótulo num lado (o rótulo repetido, como duas ações, junta os valores). */
const valorDe = (ls, rotulo) => ls.filter((l) => l.rotulo === rotulo);

/**
 * Tabela dos achados de um critério num grupo: o item, os dados de apoio, como é hoje, como seria (a sugestão) e por quê, e a caixa de encaminhar. Cada informação na sua
 * coluna (cada rótulo de "como é" e de "como seria" vira uma coluna). `onAlternar(achado)` marca ou desmarca o encaminhamento.
 */
export default function TabelaAchados({ ach, crit, decisoes, itemPorLinha, indice, escalaSaldo = 1, onAlternar, onComparar }) {
  const linhas = useMemo(() => ach.map((a) => ({ a, l: leituraAchado(crit, a, { itemPorLinha, escala: escalaSaldo }), dados: Object.fromEntries(dadosDoItem(a.item, escalaSaldo)) })), [ach, crit, itemPorLinha, escalaSaldo]);
  const semId = (x) => (indice ? motivoSemIdentidade(x.a.item, indice) : "");
  const decDe = (x) => (semId(x) ? undefined : decisoes[chaveDe(x.a.item, crit.id)]);
  const colunas = (() => {
    const lado = (nome, chave) => rotulosDe(linhas, chave).map((r) => ({
      chave: `${chave}:${r}`, rotulo: `${nome}: ${r}`, quebrar: LONGOS.includes(r) || undefined, valor: (x) => valorDe(x.l[chave], r).map((l) => l.valor).join("; "),
      render: (x) => { const ls = valorDe(x.l[chave], r); return ls.length ? <span className={ls.some((l) => l.destaque) ? "font-medium" : ""}>{ls.map((l) => l.valor).join("; ")}</span> : null; },
    }));
    const dados = ["Unidade", "NCM", "Últ. mov.", "Saldo"].filter((r) => linhas.some((x) => x.dados[r] != null)).map((r) => ({
      chave: `dado:${r}`, rotulo: r === "Últ. mov." ? "Última mov." : r, alinhar: r === "Saldo" ? "direita" : undefined,
      valor: (x) => x.dados[r] ?? "", render: (x) => <span className="text-muted-foreground">{x.dados[r] ?? ""}</span>,
    }));
    return [
      { chave: "linha", rotulo: "Linha", tipo: "numero", alinhar: "direita", valor: (x) => x.a.item.linha },
      { chave: "codigo", rotulo: "Código", valor: (x) => x.a.item.codigo || "—" },
      { chave: "descricao", rotulo: "Descrição", valor: (x) => x.a.item.descricao || "—" },
      ...dados,
      ...lado("Como é", "como"),
      ...(crit.id === "duplicidade" ? [{ chave: "comparar", rotulo: "Comparar", ordenavel: false, filtravel: false, valor: () => "", render: (x) => (x.a.item.duplicidade ? <button type="button" className="text-primary underline" onClick={() => onComparar(x.a.item)}>Comparar</button> : null) }] : []),
      ...lado("Como seria", "seria"),
      { chave: "porque", rotulo: "Por quê", quebrar: true, valor: (x) => x.l.porque || "", render: (x) => <span className="text-muted-foreground">{x.l.porque}</span> },
      { chave: "enc", rotulo: "Encaminhar para aprovação", dica: "Enviar o achado ao passo De/para, para aprovar ou rejeitar lá", valor: (x) => ROT_DECISAO[decDe(x)?.status] || "", render: (x) => {
        const it = x.a.item; const s = semId(x); const dec = decDe(x);
        return <label className="inline-flex items-center gap-1.5" title={s || undefined}><input type="checkbox" aria-label={`Encaminhar o item ${it.codigo || `da linha ${it.linha}`} para aprovação`} checked={!!dec} disabled={(!!dec && dec.status !== "PROP") || !!s} onChange={() => onAlternar(x.a)} />{dec && <SituacaoEncaminhado d={dec} />}</label>;
      } },
      { chave: "aviso", rotulo: "Aviso", quebrar: true, valor: (x) => avisoAchado(x, semId(x), decDe(x), crit.id), render: (x) => { const t = avisoAchado(x, semId(x), decDe(x), crit.id); return t ? <span className="text-[11px] text-amber-700 dark:text-amber-300">{t}</span> : null; } },
    ];
  })();
  return <TabelaPadrao id={`saneamento-achados-${crit.id}`} ariaLabel={`Achados: ${crit.titulo}`} linhas={linhas} chaveLinha={(x) => x.a.item.linha} colunas={colunas} tamanhoInicial={100} vazio="Nenhum achado." />;
}

/** Aviso de um achado: item sem código que o identifique, ou decisão tomada sobre uma sugestão que mudou. */
function avisoAchado(x, semId, dec, critId) {
  return [semId ? `${semId}.` : "", dec && sugestaoMudou(critId, dec, x.a) ? "A sugestão de hoje é diferente da que foi decidida: a decisão vale só para a anterior." : ""].filter(Boolean).join(" ");
}
