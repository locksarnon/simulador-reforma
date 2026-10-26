// Ajuste da checagem de Duplicidade: em quais grupos a variante (cor, tipo, apresentação) é observação e não produto, e quais palavras são observação. O analista marca os grupos,
// aprova as palavras (as cores já vêm aprovadas) e vê o que a regra liga na base. Só SUGERE: nada é alterado no cadastro. A lógica está em observacao.js.
import React, { useState } from "react";
import { Botao, Chip, fmt, plural } from "./ui";
import { grupoUsaObservacao, grupoUsaPorPadrao, palavrasEmVigor, palavrasIgnoradas } from "./observacao";

/**
 * `cfg` = estado.observacao; `grupos` = os grupos em escopo ({ nome, itens }); `sugestoes` = sugerirPalavras(); `efeito` = efeitoObservacao() da base. Os `on...` gravam no projeto:
 * onGrupo(nome, usa), onGruposPadrao(), onAprovar(palavras), onIgnorar(palavras), onRestaurar(palavra).
 */
export default function PainelObservacao({ cfg, grupos, sugestoes, efeito, semAnalise = false, onGrupo, onGruposPadrao, onAprovar, onIgnorar, onRestaurar }) {
  const [nova, setNova] = useState("");
  const [marcadas, setMarcadas] = useState(() => new Set());
  const vigor = palavrasEmVigor(cfg); const ignoradas = palavrasIgnoradas(cfg);
  const nMarcados = grupos.filter((g) => grupoUsaObservacao(cfg, g.nome)).length;
  const escolhidas = sugestoes.filter((s) => marcadas.has(s.forma));
  const adicionar = () => { const ws = nova.split(/[\s,;]+/).filter(Boolean); if (ws.length) { onAprovar(ws); setNova(""); } };
  const alternar = (forma) => setMarcadas((m) => { const n = new Set(m); if (n.has(forma)) n.delete(forma); else n.add(forma); return n; });
  const resolver = (fn) => { fn(escolhidas.map((s) => s.palavra)); setMarcadas(new Set()); };
  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <p className="text-sm font-medium">Variante é observação, não produto</p>
      <p className="text-xs text-muted-foreground">Nos grupos marcados abaixo, a cor, o tipo e a apresentação (CLEAR e NEUTRO, INCOLOR, EM PASTA, LÍQUIDA...) são <b className="font-medium text-foreground">observação</b>, que vai para o campo adicional do item, e não produto: os itens que só diferem por elas são o mesmo produto e entram como indicação de duplicidade. Nos demais grupos a variante continua separando os itens (peças: lado direito e lado esquerdo são itens diferentes). A medida e a unidade seguem separando em qualquer grupo. Nada é alterado no cadastro.</p>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium">Grupos que usam esta regra <span className="font-normal text-muted-foreground">({fmt(nMarcados)} de {plural(grupos.length, "grupo", "grupos")})</span></p>
          <button type="button" className="text-xs text-primary underline" onClick={onGruposPadrao}>Voltar ao padrão (limpeza, copa, cozinha e utensílios)</button>
        </div>
        {grupos.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum grupo em escopo: importe a base no passo Triagem.</p> : (
          <div className="grid max-h-48 gap-x-4 gap-y-1 overflow-auto sm:grid-cols-2" role="group" aria-label="Grupos que usam a regra de observação">
            {grupos.map((g) => (
              <label key={g.nome} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={grupoUsaObservacao(cfg, g.nome)} onChange={(e) => onGrupo(g.nome, e.target.checked)} />
                <span className="min-w-0 break-words">{g.nome} <span className="text-xs text-muted-foreground tabular-nums">({fmt(g.itens.length)})</span></span>
                {grupoUsaPorPadrao(g.nome) && <span className="text-[10px] text-muted-foreground">padrão</span>}
              </label>))}
          </div>)}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Palavras de observação <span className="font-normal text-muted-foreground">({fmt(vigor.length)}; valem nos grupos marcados)</span></p>
        <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto">
          {vigor.map((p) => (
            <span key={p.forma} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
              {p.palavra}{p.padrao && <span className="text-muted-foreground">·padrão</span>}
              <button type="button" aria-label={`Tirar ${p.palavra} das palavras de observação`} className="text-muted-foreground hover:text-foreground" onClick={() => (p.padrao ? onIgnorar([p.palavra]) : onRestaurar(p.palavra))}>×</button>
            </span>))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }} placeholder="Nova palavra (ou várias, separadas por vírgula)" aria-label="Nova palavra de observação" className="w-72 max-w-full rounded-md border bg-background p-1.5 text-sm" />
          <Botao disabled={!nova.trim()} onClick={adicionar}>Adicionar</Botao>
        </div>
        {ignoradas.length > 0 && (
          <p className="text-xs text-muted-foreground">Não são observação (você disse): {ignoradas.map((p, i) => <React.Fragment key={p.forma}>{i > 0 && ", "}{p.palavra} <button type="button" className="text-primary underline" aria-label={`Voltar ${p.palavra} ao que era`} onClick={() => onRestaurar(p.palavra)}>voltar</button></React.Fragment>)}.</p>)}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Sugestões da base <span className="font-normal text-muted-foreground">(palavras que mudam entre itens que, fora isso, são iguais, nos grupos marcados)</span></p>
        {sugestoes.length === 0 ? <p className="text-xs text-muted-foreground">{nMarcados === 0 ? "Marque ao menos um grupo para ver as sugestões." : "Nenhuma palavra nova a sugerir nos grupos marcados."}</p> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Botao disabled={escolhidas.length === 0} onClick={() => resolver(onAprovar)}>É observação{escolhidas.length ? ` (${escolhidas.length})` : ""}</Botao>
              <Botao disabled={escolhidas.length === 0} onClick={() => resolver(onIgnorar)}>Não é observação{escolhidas.length ? ` (${escolhidas.length})` : ""}</Botao>
              <button type="button" className="text-xs text-primary underline" onClick={() => setMarcadas(new Set(marcadas.size === sugestoes.length ? [] : sugestoes.map((s) => s.forma)))}>{marcadas.size === sugestoes.length ? "Desmarcar todas" : "Marcar todas"}</button>
            </div>
            <div className="max-h-72 overflow-auto">
              <table className="w-full border-collapse text-xs">
                <thead><tr className="text-left text-muted-foreground"><th className="p-1.5 w-8"><span className="sr-only">Marcar</span></th><th className="p-1.5">Palavra</th><th className="p-1.5 text-right">Itens</th><th className="p-1.5 text-right">Conjuntos</th><th className="p-1.5">Exemplo</th></tr></thead>
                <tbody>{sugestoes.map((s) => (
                  <tr key={s.forma} className="border-t border-border align-top">
                    <td className="p-1.5"><input type="checkbox" checked={marcadas.has(s.forma)} onChange={() => alternar(s.forma)} aria-label={`Marcar ${s.palavra}`} /></td>
                    <td className="p-1.5 font-mono">{s.palavra}</td>
                    <td className="p-1.5 text-right tabular-nums">{fmt(s.itens)}</td>
                    <td className="p-1.5 text-right tabular-nums">{fmt(s.conjuntos)}</td>
                    <td className="p-1.5 max-w-[360px] break-words text-muted-foreground">{s.exemplos.join(" | ")}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </>)}
      </div>

      <p className="text-xs text-muted-foreground" role="status">
        {nMarcados === 0 ? <Chip>Regra desligada</Chip> : efeito.itens > 0 ? <>Na base atual a regra liga <b className="font-medium text-foreground">{plural(efeito.itens, "item", "itens")}</b> em {plural(efeito.conjuntos, "conjunto", "conjuntos")} de duplicados, que aparecem nos achados da checagem.</> : "Na base atual a regra ainda não ligou nenhum item."}
        {" "}Mudar os grupos ou as palavras reabre a regra desta checagem e a conclusão dos grupos atingidos. Os casos que você já encaminhou ou aprovou no De/para continuam valendo: revise ou rejeite lá o que não fizer mais sentido.
      </p>
      {semAnalise && <p className="text-xs text-amber-700 dark:text-amber-300" role="alert">A investigação de duplicidades não rodou na importação desta base: a checagem segue pendente e os achados só aparecem depois que ela rodar (importe a base de novo com essa opção). A regra acima só vale para o que ela mesma acha.</p>}
    </div>
  );
}
