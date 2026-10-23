import React, { useMemo, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { achadosDe, situacaoCriterio } from "./analise";
import { Botao, plural } from "./ui";
import { contarSelecao, criteriosDoRelatorio, gerarXlsxAnalises, montarRelatorioAnalises, nomeArquivoAnalises } from "./relatorioAnalises";

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Escolha do que vai no Excel das análises: os grupos e os critérios. Com mais de um critério, cada um sai em seu bloco de colunas,
 * lado a lado na linha do item. `ativo` é a aba aberta (o critério que já vem marcado).
 */
export default function ExportarAnalises({ ativo, grupos, achados, contagem, estado, itemPorLinha, escalaSaldo = 1, nomeProjeto, nomeBase, slug, onFechar }) {
  const disponiveis = useMemo(() => criteriosDoRelatorio().map((c) => ({ ...c, n: achadosDe(contagem, c) ?? 0 })), [contagem]);
  const [crit, setCrit] = useState(() => { const a = disponiveis.find((c) => c.id === ativo && c.n > 0); return a ? [a.id] : disponiveis.filter((c) => c.n > 0).map((c) => c.id); });
  const [fora, setFora] = useState({}); // grupos desmarcados
  const [filtro, setFiltro] = useState("");
  const [gerando, setGerando] = useState(false);
  const [msg, setMsg] = useState("");

  const marcados = useMemo(() => grupos.filter((g) => !fora[g.nome]), [grupos, fora]);
  const q = semAcento(filtro).trim();
  const visiveis = useMemo(() => (q ? grupos.filter((g) => semAcento(g.nome).includes(q)) : grupos), [grupos, q]);
  const quantos = useMemo(() => contarSelecao({ achados, criterios: crit, grupos: marcados.map((g) => g.nome) }), [achados, crit, marcados]);
  const doGrupo = (nome) => crit.reduce((s, id) => s + (contagem?.porGrupoCriterio?.[`${nome}|${id}`] ?? 0), 0);
  const alvo = q ? `os ${visiveis.length} da busca` : "todos";
  const marcarGrupos = (nomes, marcar) => { setFora((f) => { const x = { ...f }; for (const n of nomes) { if (marcar) delete x[n]; else x[n] = true; } return x; }); setMsg(""); };
  const alternarCrit = (id) => { setCrit((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])); setMsg(""); };
  const motivoBloqueio = marcados.length === 0 ? "Marque ao menos um grupo." : crit.length === 0 ? "Marque ao menos um critério." : quantos.itens === 0 ? "Não há achados nos grupos e critérios marcados." : "";

  const emitir = async () => {
    setGerando(true); setMsg("");
    try {
      const nomes = marcados.map((g) => g.nome); const escolhidos = disponiveis.filter((c) => crit.includes(c.id));
      const rel = montarRelatorioAnalises({ achados, criterios: crit, grupos: nomes, estado, contagem, itemPorLinha, escalaSaldo, totaisGrupos: new Map(grupos.map((g) => [g.nome, g.itens.length])) });
      await gerarXlsxAnalises(rel, { nomeProjeto, nomeBase }, nomeArquivoAnalises({ slug, criterios: escolhidos, grupos: nomes, totalGrupos: grupos.length }));
      setMsg(`Planilha emitida: ${plural(rel.totais.itens, "item", "itens")} com achado, ${plural(rel.criterios.length, "critério", "critérios")}, ${plural(rel.totais.grupos, "grupo", "grupos")}.`);
    } catch (e) { setMsg(`Não foi possível emitir a planilha: ${e.message}`); } finally { setGerando(false); }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Emitir Excel das análises">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">Emitir Excel das análises</h3>
          <p className="text-xs text-muted-foreground">Escolha os grupos e os critérios. Com mais de um critério, cada um ocupa o seu bloco de colunas, lado a lado na linha do item. A planilha lista indícios e sugestões; nada é alterado no cadastro.</p>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-sm font-medium">Grupos <span className="font-normal text-muted-foreground tabular-nums">({marcados.length} de {grupos.length})</span></b>
            <span className="flex gap-2 text-xs"><button type="button" className="text-primary underline" onClick={() => marcarGrupos(visiveis.map((g) => g.nome), true)}>Marcar {alvo}</button><button type="button" className="text-primary underline" onClick={() => marcarGrupos(visiveis.map((g) => g.nome), false)}>Desmarcar {alvo}</button></span>
          </div>
          {grupos.length > 8 && <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar grupo" aria-label="Buscar grupo" className="w-full border rounded-md p-1.5 text-sm bg-background" />}
          <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
            {visiveis.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum grupo corresponde à busca.</p> : visiveis.map((g) => (
              <label key={g.nome} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!fora[g.nome]} onChange={() => marcarGrupos([g.nome], !!fora[g.nome])} aria-label={`Incluir o grupo ${g.nome} no Excel`} />
                <span className="flex-1 min-w-0 truncate" title={g.nome}>{g.nome}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{plural(doGrupo(g.nome), "achado", "achados")}</span>
              </label>))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-sm font-medium">Critérios <span className="font-normal text-muted-foreground tabular-nums">({crit.length} de {disponiveis.length})</span></b>
            <span className="flex gap-2 text-xs"><button type="button" className="text-primary underline" onClick={() => setCrit(disponiveis.filter((c) => c.n > 0).map((c) => c.id))}>Marcar todos</button><button type="button" className="text-primary underline" onClick={() => setCrit([])}>Desmarcar todos</button></span>
          </div>
          <div className="space-y-1">
            {disponiveis.map((c) => (
              <label key={c.id} className={`flex items-center gap-2 text-sm ${c.n === 0 ? "text-muted-foreground" : ""}`}>
                <input type="checkbox" checked={crit.includes(c.id)} disabled={c.n === 0} onChange={() => alternarCrit(c.id)} aria-label={`Incluir o critério ${c.titulo} no Excel`} />
                <span className="flex-1 min-w-0">{c.titulo}{c.n > 0 && situacaoCriterio(estado, c, contagem) === "PENDENTE" && <span className="text-xs text-muted-foreground"> · a aprovar</span>}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{c.n === 0 ? "sem achados" : plural(c.n, "achado", "achados")}</span>
              </label>))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao disabled={gerando || !!motivoBloqueio} onClick={emitir} title={motivoBloqueio || undefined}>
          {gerando ? <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 inline mr-1" />}Gerar Excel
        </Botao>
        <span className="text-sm text-muted-foreground" role="status">{motivoBloqueio || `${plural(quantos.itens, "item", "itens")} com achado (${plural(quantos.achados, "achado", "achados")} em ${plural(crit.length, "critério", "critérios")}) em ${plural(marcados.length, "grupo", "grupos")}.`}</span>
      </div>
      {msg && <p className="text-xs text-muted-foreground" role="status">{msg}</p>}
    </section>
  );
}
