import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Botao, TabelaItens, fmt, plural } from "./ui";

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Itens de um grupo, com a situação de cada um no escopo. Só é montado com o grupo aberto. */
function ItensDoGrupo({ itens, situacao }) {
  const lista = useMemo(() => itens.map((it) => ({ ...it, situacao: situacao(it) })), [itens, situacao]);
  return <TabelaItens itens={lista} colunas={["linha", "codigo", "descricao", "unidade", "ultima_mov", "situacao"]} />;
}

/**
 * Escolha dos grupos que entram neste saneamento (passo Triagem). `gruposFora` é { [nome]: true } com os desmarcados: o que não está lá está marcado,
 * então um grupo novo (outra base) entra por padrão. Os desmarcados saem da análise, das listas e da execução, e NÃO são inativados.
 */
export default function GruposDoSaneamento({ grupos, emEscopoPorGrupo, gruposFora, situacao, onAlternar, onMarcar }) {
  const [aberto, setAberto] = useState({});
  const [filtro, setFiltro] = useState("");
  const q = semAcento(filtro).trim();
  const visiveis = useMemo(() => (q ? grupos.filter((g) => semAcento(g.nome).includes(q)) : grupos), [grupos, q]);
  const marcados = grupos.filter((g) => !gruposFora[g.nome]);
  const totalItens = grupos.reduce((s, g) => s + g.itens.length, 0);
  const itensMarcados = marcados.reduce((s, g) => s + g.itens.length, 0);
  const alternar = (nome) => setAberto((a) => ({ ...a, [nome]: !a[nome] }));
  const alvo = q ? `os ${visiveis.length} da busca` : "todos";

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Grupos do saneamento">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">Grupos do saneamento</h3>
          <p className="text-xs text-muted-foreground">Marque os grupos que entram neste saneamento. Os desmarcados ficam de fora da análise, das listas e da execução, e não são inativados.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao disabled={visiveis.length === 0} onClick={() => onMarcar(visiveis.map((g) => g.nome), true)}>Marcar {alvo}</Botao>
          <Botao disabled={visiveis.length === 0} onClick={() => onMarcar(visiveis.map((g) => g.nome), false)}>Desmarcar {alvo}</Botao>
        </div>
      </div>
      <p className="text-sm"><b>{fmt(marcados.length)} de {fmt(grupos.length)}</b> grupos marcados · {fmt(itensMarcados)} de {fmt(totalItens)} itens{marcados.length === 0 && <span className="text-amber-700 dark:text-amber-300"> · nenhum grupo marcado: não há o que sanear</span>}</p>
      {grupos.length > 8 && <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar grupo" aria-label="Buscar grupo" className="w-full border rounded-md p-2 text-sm bg-background" />}
      <div className="space-y-1.5">
        {visiveis.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum grupo corresponde à busca.</p> : visiveis.map((g) => {
          const fora = !!gruposFora[g.nome];
          return (
            <div key={g.nome} className="rounded-lg border border-border">
              <div className="flex items-center gap-2 px-3 py-2">
                <input type="checkbox" checked={!fora} onChange={() => onAlternar(g.nome)} aria-label={`Incluir o grupo ${g.nome} no saneamento`} className="shrink-0" />
                <button type="button" onClick={() => alternar(g.nome)} aria-expanded={!!aberto[g.nome]} className={`flex-1 min-w-0 flex flex-wrap items-center gap-2 text-left ${fora ? "text-muted-foreground" : ""}`}>
                  {aberto[g.nome] ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                  <b className="font-medium">{g.nome}</b>
                  <span className="text-xs text-muted-foreground">{plural(g.itens.length, "item", "itens")}{fora ? " · fora do saneamento" : ` · ${fmt(emEscopoPorGrupo.get(g.nome) || 0)} em escopo`}</span>
                </button>
              </div>
              {aberto[g.nome] && <div className="border-t border-border p-3"><ItensDoGrupo itens={g.itens} situacao={situacao} /></div>}
            </div>);
        })}
      </div>
    </section>
  );
}
