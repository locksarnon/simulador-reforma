import React, { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Botao, Th, dataBr, fmt, ordenarPor, useOrdenacao } from "./ui";
import { grupoDe } from "./logica";
import { RELACOES, criarSituacao, descricaoRelacao, gerarRelacao, itensDaRelacao } from "./relacoes";

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Relação de itens de um cartão da triagem (universo, fora do escopo, em escopo, sem data legível), com filtro e Excel do que está na tela. */
export default function RelacaoTriagem({ id, itens, escopo, corte, semDataFora, nomeProjeto, nomeBase, slug }) {
  const [filtro, setFiltro] = useState("");
  const [mostrar, setMostrar] = useState(50);
  const [gerando, setGerando] = useState(false);
  const [msg, setMsg] = useState("");
  const rel = RELACOES[id];
  const base = useMemo(() => itensDaRelacao(id, itens, escopo), [id, itens, escopo]);
  const situacao = useMemo(() => criarSituacao(escopo, corte), [escopo, corte]);
  const lista = useMemo(() => {
    const q = semAcento(filtro).trim();
    return q ? base.filter((it) => semAcento(`${it.codigo} ${it.descricao} ${grupoDe(it)} ${it.unidade}`).includes(q)) : base;
  }, [base, filtro]);
  const comSituacao = id === "universo";
  const [ord, ordenar] = useOrdenacao();
  // o Excel sai com o que está na tela: o filtro e também a ordem escolhida
  const ordenada = useMemo(() => ordenarPor(lista, ord, { codigo: (it) => it.codigo, descricao: (it) => it.descricao, unidade: (it) => it.unidade, grupo: (it) => grupoDe(it), ultima: (it) => it.ultima_mov, situacao: (it) => situacao(it) }), [lista, ord, situacao]);

  const emitir = async () => {
    setGerando(true); setMsg("");
    try {
      await gerarRelacao({ id, lista: ordenada, escopo, corte, semDataFora, nomeProjeto, nomeBase, filtro: filtro.trim() }, `${slug}-${rel.arquivo}.xlsx`);
      setMsg(`Planilha emitida com ${fmt(lista.length)} ${lista.length === 1 ? "item" : "itens"}.`);
    } catch (e) { setMsg(`Não foi possível emitir a planilha: ${e.message}`); } finally { setGerando(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3" role="region" aria-label={`Relação: ${rel.titulo}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">Relação: {rel.titulo} <span className="text-sm text-muted-foreground tabular-nums">({fmt(base.length)})</span></h3>
          <p className="text-xs text-muted-foreground">{descricaoRelacao(id, corte, semDataFora)}</p>
        </div>
        <Botao disabled={gerando || lista.length === 0} onClick={emitir}>
          {gerando ? <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}Emitir Excel ({fmt(lista.length)})
        </Botao>
      </div>
      {base.length > 0 && (
        <input value={filtro} onChange={(e) => { setFiltro(e.target.value); setMostrar(50); setMsg(""); }} placeholder="Filtrar por código, descrição, grupo ou unidade (o Excel sai com o que estiver na tela)"
          aria-label={`Filtrar a relação ${rel.titulo}`} className="w-full border rounded-md p-2 text-sm bg-background" />)}
      {msg && <p className="text-xs text-muted-foreground" role="status">{msg}</p>}
      {base.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item nesta relação.</p> : lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item corresponde ao filtro.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead><tr className="text-left text-muted-foreground"><Th chave="codigo" ord={ord} onOrdenar={ordenar}>Código</Th><Th chave="descricao" ord={ord} onOrdenar={ordenar}>Descrição</Th><Th chave="unidade" ord={ord} onOrdenar={ordenar}>Unidade</Th><Th chave="grupo" ord={ord} onOrdenar={ordenar}>Grupo</Th><Th chave="ultima" ord={ord} onOrdenar={ordenar}>Última mov.</Th>{comSituacao && <Th chave="situacao" ord={ord} onOrdenar={ordenar}>Situação</Th>}</tr></thead>
            <tbody>{ordenada.slice(0, mostrar).map((it) => (
              <tr key={it.linha} className="border-t border-border">
                <td className="p-1.5">{it.codigo || "—"}</td><td className="p-1.5 max-w-[320px]">{it.descricao || "—"}</td><td className="p-1.5">{it.unidade || "—"}</td>
                <td className="p-1.5">{grupoDe(it)}</td><td className="p-1.5 tabular-nums">{dataBr(it.ultima_mov)}</td>{comSituacao && <td className="p-1.5">{situacao(it)}</td>}
              </tr>))}</tbody>
          </table>
          {lista.length > mostrar && <button type="button" onClick={() => setMostrar(mostrar + 200)} className="text-xs text-primary underline p-2">Mostrar mais ({fmt(lista.length - mostrar)} restantes)</button>}
        </div>)}
    </div>
  );
}
