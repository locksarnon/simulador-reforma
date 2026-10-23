import React, { useMemo } from "react";
import { Info } from "lucide-react";
import { Botao, Chip, Th, fmt, ordenarPor, plural, useOrdenacao } from "./ui";
import { SituacaoEncaminhado } from "./TabelaAchados";
import { conjuntoIdentificavel, escolhaDoConjunto, saldoNaEscala } from "./conjuntos";
import { chaveDe, idItem } from "./identidade";
import { numeroBr } from "./unidades";

const NIVEL_ROT = { EXATA: "Idêntico", MUITO_PROVAVEL: "Indicação alta", POSSIVEL: "Indicação possível" };
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const palavraChave = (p) => semAcento(p).replace(/[^a-z0-9]/g, "");

export const TXT_FICA = "Escolha qual código fica em cada conjunto: os outros itens são encaminhados ao De/para para unificar nele (você aprova ou rejeita lá). A sugestão considera, nesta ordem, o maior saldo em estoque, a movimentação mais recente, o cadastro mais completo e o menor código. Nada é alterado no cadastro: a ferramenta só sugere, e a similaridade entre descrições não é prova de que sejam o mesmo produto.";

/** Explica a escolha de quem fica e conta os conjuntos por situação. */
export function LegendaConjuntos({ conjuntos, decisoes, onIrDepara }) {
  const st = conjuntos.map((c) => escolhaDoConjunto(c, decisoes).status);
  const aguardando = st.filter((s) => s === "aguardando").length; const decididos = st.filter((s) => s === "decidida").length; const com = aguardando + decididos;
  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p>{TXT_FICA}</p>
        <p className="text-foreground">{com === 0 ? `${plural(conjuntos.length, "conjunto", "conjuntos")}, nenhum com escolha ainda.` : <>Com escolha: <b className="font-medium">{fmt(com)} de {plural(conjuntos.length, "conjunto", "conjuntos")}</b> ({fmt(aguardando)} aguardando aprovação · {fmt(decididos)} já decididos no De/para).</>}{" "}
          <button type="button" className="text-primary underline" onClick={onIrDepara}>Abrir o De/para</button></p>
      </div>
    </div>
  );
}

/** Descrição com as palavras que não aparecem em todos os itens do conjunto em destaque: o que muda de um para o outro salta aos olhos. */
function Descricao({ texto, comuns }) {
  return <>{String(texto ?? "").split(/(\s+)/).map((p, i) => { const k = palavraChave(p); return k && !comuns.has(k) ? <mark key={i} className="rounded bg-amber-100 px-0.5 text-foreground dark:bg-amber-900/40">{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>; })}</>;
}

function CartaoConjunto({ conj, decisoes, escala, indice, onEscolher, onDesfazer, onComparar }) {
  const [ord, ordenar] = useOrdenacao();
  const esc = escolhaDoConjunto(conj, decisoes); const sugId = conj.sugestao.id; const ident = conjuntoIdentificavel(conj, indice);
  const bloqueado = esc.travada || !ident.ok; // já decidido no De/para, ou sem como guardar a escolha pelo código do item
  const comuns = useMemo(() => {
    const conjuntos = conj.membros.map((m) => new Set(String(m.descricao ?? "").split(/\s+/).map(palavraChave).filter(Boolean)));
    return new Set([...conjuntos[0]].filter((p) => conjuntos.every((s) => s.has(p))));
  }, [conj]);
  const membros = useMemo(() => ordenarPor(conj.membros, ord, { codigo: (m) => m.codigo, saldo: (m) => saldoNaEscala(m.saldo, escala), descricao: (m) => m.descricao }), [conj, ord, escala]);
  const codigoDe = (id) => conj.membros.find((m) => idItem(m) === id)?.codigo ?? id ?? "—";
  const sugerido = conj.membros.find((m) => idItem(m) === sugId);
  const status = esc.status === "decidida" ? <Chip tom="g">Decidido no De/para</Chip> : esc.status === "aguardando" ? <Chip tom="a">Aguardando aprovação</Chip> : <Chip>Sem escolha</Chip>;
  return (
    <div className="rounded-lg border border-border p-3 space-y-2" aria-label={`Conjunto de ${conj.membros.length} itens parecidos`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Chip tom={conj.nivel === "POSSIVEL" ? "a" : "b"}>{NIVEL_ROT[conj.nivel]}</Chip>
        <span className="text-muted-foreground tabular-nums">{plural(conj.membros.length, "item", "itens")} · similaridade {conj.score.toFixed(2).replace(".", ",")}</span>
        {status}
        <span className="flex-1" />
        <Botao disabled={bloqueado || esc.fica === sugId} title={esc.travada ? "Já decidido no De/para" : ident.motivo || undefined} onClick={() => onEscolher(conj, sugId, "sugestao")}>Aceitar a sugestão</Botao>
        <Botao disabled={bloqueado || esc.status === "nenhuma"} title={esc.travada ? "Já decidido no De/para" : ident.motivo || undefined} onClick={() => onDesfazer(conj)}>Desfazer</Botao>
        <button type="button" className="text-primary underline" onClick={() => onComparar(conj.membros[0])}>Comparar palavra a palavra</button>
      </div>
      {!ident.ok && <p className="text-xs text-amber-700 dark:text-amber-300">{ident.motivo} Corrija no ERP e traga a base de novo.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead><tr className="text-left text-muted-foreground">
            <th className="p-1.5">Fica</th><Th chave="codigo" ord={ord} onOrdenar={ordenar}>Código</Th><Th chave="saldo" ord={ord} onOrdenar={ordenar} className="p-1.5 text-right">Saldo em estoque</Th><Th chave="descricao" ord={ord} onOrdenar={ordenar}>Descrição</Th><th className="p-1.5">Situação</th>
          </tr></thead>
          <tbody>{membros.map((m) => {
            const saldo = saldoNaEscala(m.saldo, escala); const dec = decisoes[chaveDe(m, "duplicidade")]; const fica = esc.fica === idItem(m);
            return (
              <tr key={m.linha} className={`border-t border-border align-top ${fica ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}>
                <td className="p-1.5"><input type="radio" name={`fica-${conj.id}`} checked={fica} disabled={bloqueado} onChange={() => onEscolher(conj, idItem(m), idItem(m) === sugId ? "sugestao" : "analista")} aria-label={`Manter o código ${m.codigo || `da linha ${m.linha}`}`} /></td>
                <td className="p-1.5 whitespace-nowrap"><span className="tabular-nums">{m.codigo || "—"}</span>{idItem(m) === sugId && <span className="ml-1.5" title={conj.sugestao.motivo || undefined}><Chip tom="b">Sugerido</Chip></span>}</td>
                <td className="p-1.5 text-right tabular-nums">{saldo == null ? "—" : numeroBr(saldo)}</td>
                <td className="p-1.5 max-w-[420px] break-words"><Descricao texto={m.descricao} comuns={comuns} /></td>
                <td className="p-1.5 whitespace-nowrap">{fica ? <Chip tom="g">Fica</Chip> : esc.fica != null ? <span className="inline-flex items-center gap-1.5 text-muted-foreground">sai → {codigoDe(esc.fica)}{dec && <SituacaoEncaminhado d={dec} />}</span> : null}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      {sugerido && conj.sugestao.motivo && <p className="text-[11px] text-muted-foreground">Sugestão: manter o código <b className="font-medium text-foreground">{sugerido.codigo || `da linha ${sugerido.linha}`}</b> ({conj.sugestao.motivo}).{esc.fica != null && esc.fica !== sugId ? ` Escolha do analista: ${codigoDe(esc.fica)}.` : ""}</p>}
    </div>
  );
}

/** Conjuntos de duplicados de um grupo, lado a lado: código, saldo em estoque e descrição, com a sugestão de qual fica e a escolha do analista. */
export default function ConjuntosDuplicidade({ conjuntos, decisoes, escala = 1, indice, onEscolher, onDesfazer, onComparar }) {
  return <div className="space-y-2">{conjuntos.map((c) => <CartaoConjunto key={c.id} conj={c} decisoes={decisoes} escala={escala} indice={indice} onEscolher={onEscolher} onDesfazer={onDesfazer} onComparar={onComparar} />)}</div>;
}
