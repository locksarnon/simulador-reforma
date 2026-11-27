import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Filter, RotateCcw, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import BotaoExportar from "@/components/BotaoExportar";
import { aplicarTabela, textoDaColuna } from "@/components/TabelaPadrao";
import { botaoSecundario, estiloTabela } from "./comuns";
import { ALTURA_LINHA } from "./logica";
import AlcaLargura from "@/components/AlcaLargura";
import { cabecalhoTabelaCls } from "@/lib/estiloTabela";
import { idDaTabela, medirColunasNaturais, useAoRedimensionar, useEfeitoDeLayout, useLargurasColunas } from "@/lib/useLargurasColunas";

const ALTURA_TITULOS = 28; // a mesma faixa de títulos da aba Tabela (metade do cabeçalho de 56 px)
const LARGURA_PADRAO = 140;
const LARGURA_MARCAR = 36;
const ALINHAR = { direita: "justify-end text-right tabular-nums", centro: "justify-center text-center" };
// Passar o mouse: o verde do InTAX (o mesmo das tabelas padrão), também por cima das colunas fixas, que têm fundo opaco.
const HOVER_LINHA = "hover:bg-gradient-to-r hover:from-primary/30 hover:via-primary/12 hover:to-transparent";

function lerPreferencia(id) {
  if (!id) return null;
  try { return JSON.parse(localStorage.getItem(`intax-tabela:${id}`) || "null"); } catch { return null; }
}
function gravarPreferencia(id, v) {
  if (!id) return;
  try { localStorage.setItem(`intax-tabela:${id}`, JSON.stringify(v)); } catch { /* sem armazenamento: vale só nesta visita */ }
}

/**
 * Tabela densa do Saneamento, no layout da aba Tabela: cabeçalho fixo no topo, colunas `fixa` presas à esquerda, linhas de 38 px com zebra
 * e o verde do InTAX ao passar o mouse, rolagem dentro da área (vertical e horizontal), contador no topo e "carregar mais" ao chegar ao fim.
 * Mantém as funções da tabela padrão: busca na lista, filtro digitável por coluna, ordenação pelo cabeçalho, colunas ocultáveis e
 * reordenáveis (guardadas neste navegador), exportação do que está filtrado e caixas de marcar (`selecao`).
 * Colunas: { chave, rotulo, largura (px), fixa, valor(linha), render(linha), tipo, alinhar, ordenavel, filtravel, dica, oculta, elastica }.
 * `oculta`: começa escondida (quem nunca mexeu nas colunas); `elastica`: cresce para ocupar a sobra da largura (a `largura` é o mínimo).
 * Larguras como no Excel: depois de desenhada, cada coluna fica do tamanho do conteúdo (título e até 200 linhas; só cresce ao
 * filtrar), a `largura` vale até medir; a alça na borda do título ajusta (arrastar, setas, clique duplo = conteúdo), guardado
 * neste navegador; "Restaurar larguras" no menu Colunas. Coluna com largura escolhida deixa de ser elástica.
 */
export default function TabelaDensa({
  id, ariaLabel, colunas, linhas = [], chaveLinha = (l, i) => l.id ?? i, vazio = "Nada para mostrar.", aoClicarLinha, linhaMarcada, selecao,
  ordemInicial = null, contador, acoes, rodape, aoChegarAoFim, alturaCls = "max-h-[68vh]",
}) {
  const pref = useMemo(() => lerPreferencia(id), [id]);
  const todas = colunas.map((c) => c.chave);
  const [ordemColunas, setOrdemColunas] = useState(() => {
    const salvo = (pref?.ordem || []).filter((k) => todas.includes(k));
    return [...salvo, ...todas.filter((k) => !salvo.includes(k))];
  });
  const [ocultas, setOcultas] = useState(() => (pref?.ocultas ? pref.ocultas.filter((k) => todas.includes(k)) : colunas.filter((c) => c.oculta).map((c) => c.chave)));
  const [busca, setBusca] = useState("");
  const [filtros, setFiltros] = useState({});
  const [verFiltros, setVerFiltros] = useState(false);
  const [ordem, setOrdem] = useState(ordemInicial);
  const larguras = useLargurasColunas(idDaTabela(id, ariaLabel, todas));
  const [raiz, setRaiz] = useState(null);

  useEffect(() => { setOrdemColunas((o) => [...o.filter((k) => todas.includes(k)), ...todas.filter((k) => !o.includes(k))]); }, [todas.join("|")]);
  useEffect(() => { gravarPreferencia(id, { ...(lerPreferencia(id) || {}), ordem: ordemColunas, ocultas }); }, [id, ordemColunas, ocultas]);

  // Colunas fixas primeiro (na ordem escolhida entre elas), depois as rolantes.
  const escolhidas = ordemColunas.map((k) => colunas.find((c) => c.chave === k)).filter((c) => c && !ocultas.includes(c.chave));
  const visiveis = [...escolhidas.filter((c) => c.fixa), ...escolhidas.filter((c) => !c.fixa)];
  const filtradas = useMemo(() => aplicarTabela(linhas, colunas, { busca, filtros, ordem }), [linhas, colunas, busca, filtros, ordem]);
  const temFiltro = !!busca || Object.values(filtros).some((f) => String(f ?? "").trim());

  // Larguras: mede o conteúdo depois de desenhar (antes de pintar); trocou o conjunto de colunas, mede do zero; senão só cresce.
  const chaveVisiveis = visiveis.map((c) => c.chave).join("|");
  const ultimaMedida = useRef("");
  const medir = useCallback(() => {
    const m = medirColunasNaturais(raiz);
    if (!m) return;
    larguras.definirAuto(m, { crescer: ultimaMedida.current === chaveVisiveis });
    ultimaMedida.current = chaveVisiveis;
  }, [raiz, chaveVisiveis, larguras.definirAuto]);
  useEfeitoDeLayout(() => { medir(); }, [medir, filtradas, larguras.versao]);
  useAoRedimensionar(raiz, medir);
  const elastica = (c) => c.elastica && !c.fixa && !larguras.escolhida(c.chave);

  // Posição de cada coluna fixa (soma das larguras à esquerda) e largura total.
  const larguraDe = (c) => larguras.larguraDe(c.chave, c.largura || LARGURA_PADRAO);
  const inicioFixas = selecao ? LARGURA_MARCAR : 0;
  const esquerda = {};
  let acumulado = inicioFixas;
  for (const c of visiveis) if (c.fixa) { esquerda[c.chave] = acumulado; acumulado += larguraDe(c); }
  const larg = inicioFixas + visiveis.reduce((s, c) => s + larguraDe(c), 0);

  const ordenar = (k) => setOrdem((o) => (!o || o.chave !== k ? { chave: k, dir: 1 } : o.dir === 1 ? { chave: k, dir: -1 } : ordemInicial));
  const chaves = selecao ? filtradas.map((l, i) => chaveLinha(l, i)) : [];
  const todasMarcadas = !!selecao && chaves.length > 0 && chaves.every((k) => selecao.marcadas.has(k));
  const marcar = (k) => { const n = new Set(selecao.marcadas); if (n.has(k)) n.delete(k); else n.add(k); selecao.aoMudar(n); };
  const mover = (k, passo) => setOrdemColunas((o) => { const i = o.indexOf(k); const j = i + passo; if (j < 0 || j >= o.length) return o; const s = [...o]; [s[i], s[j]] = [s[j], s[i]]; return s; });
  const aoRolar = aoChegarAoFim ? (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - ALTURA_LINHA * 4) aoChegarAoFim();
  } : undefined;

  const celulaFixa = (i, marcado, esq, primeira) => ({
    className: `sticky z-10 flex items-center overflow-hidden px-2 ${estiloTabela.fundoFixo(i, marcado)}`,
    style: { left: esq },
    sobre: <span aria-hidden="true" className={`pointer-events-none absolute inset-0 hidden bg-primary/15 group-hover:block ${primeira ? "shadow-[inset_3px_0_0_0_hsl(var(--primary))]" : ""}`} />,
    primeira,
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {contador && <p className="mr-auto text-xs text-muted-foreground" aria-live="polite">{contador}</p>}
        <label className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <span className="sr-only">Buscar nesta lista</span>
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nesta lista" className="h-8 w-full border border-border bg-background pl-7 pr-7 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          {busca && <button type="button" onClick={() => setBusca("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground" aria-label="Limpar a busca"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>}
        </label>
        <button type="button" onClick={() => setVerFiltros((v) => !v)} aria-pressed={verFiltros} className={`${botaoSecundario} ${verFiltros ? "border-primary bg-primary/10" : ""}`}><Filter className="h-3.5 w-3.5" aria-hidden="true" />Filtros por coluna</button>
        {temFiltro && <button type="button" className={botaoSecundario} onClick={() => { setBusca(""); setFiltros({}); }}><X className="h-3.5 w-3.5" aria-hidden="true" />Limpar a busca</button>}
        <Popover>
          <PopoverTrigger asChild><button type="button" className={botaoSecundario}><Columns3 className="h-3.5 w-3.5" aria-hidden="true" />Colunas</button></PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2">
            <p className="px-1 pb-1 text-[11px] text-muted-foreground">Marque as colunas e use as setas para mudar a ordem. As colunas fixas ficam sempre à esquerda. Para mudar a largura, arraste a borda direita do título.</p>
            <ul className="max-h-72 space-y-0.5 overflow-y-auto">
              {ordemColunas.map((k, i) => { const c = colunas.find((x) => x.chave === k); if (!c) return null; return (
                <li key={k} className="flex items-center gap-1.5 px-1 py-0.5 text-xs hover:bg-muted">
                  <input type="checkbox" checked={!ocultas.includes(k)} onChange={() => setOcultas((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]))} aria-label={`Mostrar ${c.rotulo}`} />
                  <span className="flex-1 truncate">{c.rotulo}</span>
                  <button type="button" disabled={i === 0} onClick={() => mover(k, -1)} className="p-0.5 hover:bg-background disabled:opacity-30" aria-label={`Subir ${c.rotulo}`}><ArrowUp className="h-3 w-3" aria-hidden="true" /></button>
                  <button type="button" disabled={i === ordemColunas.length - 1} onClick={() => mover(k, 1)} className="p-0.5 hover:bg-background disabled:opacity-30" aria-label={`Descer ${c.rotulo}`}><ArrowDown className="h-3 w-3" aria-hidden="true" /></button>
                </li>
              ); })}
            </ul>
            <button type="button" onClick={() => { setOrdemColunas(todas); setOcultas(colunas.filter((c) => c.oculta).map((c) => c.chave)); }} className="mt-1 inline-flex w-full items-center justify-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:bg-muted"><RotateCcw className="h-3 w-3" aria-hidden="true" /> Restaurar colunas</button>
            <button type="button" onClick={larguras.restaurar} disabled={!larguras.personalizadas} className="inline-flex w-full items-center justify-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"><RotateCcw className="h-3 w-3" aria-hidden="true" /> Restaurar larguras</button>
          </PopoverContent>
        </Popover>
        <BotaoExportar titulo={ariaLabel || "Tabela"} linhas={filtradas.map((l) => Object.fromEntries(visiveis.map((c) => [c.chave, textoDaColuna(c, l)])))} colunas={visiveis.map((c) => ({ chave: c.chave, rotulo: c.rotulo }))} />
        {acoes}
      </div>

      <div onScroll={aoRolar} className={`${estiloTabela.area} ${alturaCls}`} tabIndex={0} aria-label={`${ariaLabel}. Role para ver mais linhas e colunas.`}>
        <div ref={setRaiz} role="table" aria-label={ariaLabel} aria-rowcount={filtradas.length + 1} aria-colcount={visiveis.length + (selecao ? 1 : 0)} style={{ width: larg, minWidth: "100%" }}>
          <div role="rowgroup" className={estiloTabela.cabecalho}>
            <div role="row" className={`flex border-b border-border/70 text-xs ${cabecalhoTabelaCls}`} style={{ height: ALTURA_TITULOS }}>
              {selecao && (
                <div role="columnheader" className={`${estiloTabela.tituloFixo} left-0 justify-center`} style={{ width: LARGURA_MARCAR }}>
                  <input type="checkbox" aria-label="Marcar todas" checked={todasMarcadas} onChange={() => selecao.aoMudar(todasMarcadas ? new Set() : new Set(chaves))} />
                </div>
              )}
              {visiveis.map((c) => {
                const ativa = ordem?.chave === c.chave;
                const Icone = !ativa ? ArrowUpDown : ordem.dir === 1 ? ArrowUp : ArrowDown;
                return (
                  <div key={c.chave} role="columnheader" data-coluna={c.chave} aria-sort={ativa ? (ordem.dir === 1 ? "ascending" : "descending") : "none"} title={c.dica}
                    className={`${c.fixa ? estiloTabela.tituloFixo : `${estiloTabela.tituloColuna} font-medium`} ${ALINHAR[c.alinhar] || ""}`} style={{ width: larguraDe(c), ...(elastica(c) ? { flexGrow: 1, flexShrink: 0 } : {}), ...(c.fixa ? { left: esquerda[c.chave] } : {}) }}>
                    {c.ordenavel === false ? <span className="truncate">{c.rotulo}</span> : (
                      <button type="button" onClick={() => ordenar(c.chave)} title={c.dica || "Ordenar"}
                        className={`inline-flex min-w-0 items-center gap-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${ativa ? "font-semibold" : ""}`}>
                        <span className="truncate">{c.rotulo}</span><Icone className={`h-3 w-3 shrink-0 ${ativa ? "" : "opacity-60"}`} aria-hidden="true" />
                      </button>
                    )}
                    <AlcaLargura rotulo={c.rotulo} largura={larguraDe(c)} aoMudar={(px, { final }) => larguras.definir(c.chave, px, { gravar: final })} aoAutoAjustar={() => larguras.autoAjustar(c.chave)} />
                  </div>
                );
              })}
            </div>
            {verFiltros && (
              <div role="row" className="flex border-b border-border/70" style={{ height: ALTURA_TITULOS + 2 }}>
                {selecao && <div role="columnheader" aria-label="Marcar" className="sticky left-0 z-40 bg-muted" style={{ width: LARGURA_MARCAR }} />}
                {visiveis.map((c) => (
                  <div key={c.chave} role="columnheader" aria-label={`Filtro de ${c.rotulo}`} className={`${c.fixa ? "sticky z-40 bg-muted" : "border-l border-border/70"} flex items-center px-1`} style={{ width: larguraDe(c), ...(elastica(c) ? { flexGrow: 1, flexShrink: 0 } : {}), ...(c.fixa ? { left: esquerda[c.chave] } : {}) }}>
                    {c.filtravel === false ? null : <input value={filtros[c.chave] ?? ""} onChange={(e) => setFiltros((f) => ({ ...f, [c.chave]: e.target.value }))} placeholder="Filtrar" aria-label={`Filtrar ${c.rotulo}`} className="h-6 w-full border border-border bg-background px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div role="rowgroup">
            {filtradas.length === 0 && <div role="row" className="px-3 py-6 text-center text-sm text-muted-foreground"><span role="cell">{temFiltro ? "Nenhuma linha com esta busca." : vazio}</span></div>}
            {filtradas.map((l, i) => {
              const k = chaveLinha(l, i);
              const marcado = !!linhaMarcada?.(l);
              const abrir = aoClicarLinha ? () => aoClicarLinha(l) : undefined;
              let primeira = true;
              const proximaEhPrimeira = () => { const p = primeira; primeira = false; return p; };
              return (
                <div key={k} role="row" aria-selected={aoClicarLinha ? marcado : undefined} tabIndex={abrir ? 0 : undefined} onClick={abrir}
                  onKeyDown={abrir ? (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrir(); } } : undefined}
                  className={`group ${estiloTabela.linha} ${estiloTabela.fundoLinha(i, marcado)} ${HOVER_LINHA} ${abrir ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" : ""}`}
                  style={{ minHeight: ALTURA_LINHA }}>
                  {selecao && (() => { const f = celulaFixa(i, marcado, 0, proximaEhPrimeira()); return (
                    <div role="cell" className={`${f.className} justify-center`} style={{ ...f.style, width: LARGURA_MARCAR }} onClick={(e) => e.stopPropagation()}>
                      {f.sobre}<input type="checkbox" className="relative" aria-label="Marcar a linha" checked={selecao.marcadas.has(k)} onChange={() => marcar(k)} />
                    </div>
                  ); })()}
                  {visiveis.map((c) => {
                    const conteudo = c.render ? c.render(l) : (() => { const t = textoDaColuna(c, l); return <span className="block truncate" title={t || undefined}>{t || <span className="text-muted-foreground">—</span>}</span>; })();
                    if (c.fixa) {
                      const f = celulaFixa(i, marcado, esquerda[c.chave], proximaEhPrimeira());
                      return <div key={c.chave} role="cell" data-coluna={c.chave} className={`${f.className} ${ALINHAR[c.alinhar] || ""}`} style={{ ...f.style, width: larguraDe(c) }}>{f.sobre}<span className="relative min-w-0 max-w-full">{conteudo}</span></div>;
                    }
                    const esq = proximaEhPrimeira() ? "shadow-[inset_3px_0_0_0_transparent] group-hover:shadow-[inset_3px_0_0_0_hsl(var(--primary))]" : "";
                    return <div key={c.chave} role="cell" data-coluna={c.chave} className={`${estiloTabela.celula} ${ALINHAR[c.alinhar] || ""} ${esq}`} style={{ width: larguraDe(c), ...(elastica(c) ? { flexGrow: 1, flexShrink: 0 } : {}) }}><span className="min-w-0 max-w-full">{conteudo}</span></div>;
                  })}
                </div>
              );
            })}
            {rodape && <div className="sticky left-0 px-3 py-2 text-xs text-muted-foreground" style={{ width: "fit-content" }}>{rodape}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
