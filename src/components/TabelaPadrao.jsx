import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Filter, GripVertical, RotateCcw, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import BotaoExportar from "@/components/BotaoExportar";
import { plural } from "@/lib/plural";
import AlcaLargura, { redimensionandoColuna } from "@/components/AlcaLargura";
import { idDaTabela, useAoRedimensionar, useEfeitoDeLayout, useLargurasColunas } from "@/lib/useLargurasColunas";
import { barraListaCls, botaoBarraCls, cabecalhoTabelaCls } from "@/lib/estiloTabela";

const TAMANHOS = [10, 25, 50, 100, 0];
const colador = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Valor da coluna para ordenar e filtrar: `valor(linha)` se houver, senão o campo `chave` (aceita "a.b"). */
export function valorDaColuna(col, linha) {
  if (col.valor) return col.valor(linha);
  return String(col.chave).split(".").reduce((o, k) => (o == null ? o : o[k]), linha);
}

/** Texto exibido: datas em pt-BR, moeda em reais, competência AAAAMM em MM/AAAA. */
export function textoDaColuna(col, linha) {
  const v = valorDaColuna(col, linha);
  if (v === null || v === undefined || v === "") return "";
  if (col.tipo === "moeda" && typeof v === "number") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (col.tipo === "data") {
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = new Date(s.length === 10 ? `${s}T12:00:00Z` : s); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }); }
    if (/^\d{8}$/.test(s)) return `${s.slice(6)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
    return s;
  }
  if (col.tipo === "periodo" && /^\d{6}$/.test(String(v))) return `${String(v).slice(4)}/${String(v).slice(0, 4)}`;
  if (col.tipo === "numero" && typeof v === "number") return v.toLocaleString("pt-BR");
  return String(v);
}

function chaveOrdenavel(col, linha) {
  const v = valorDaColuna(col, linha);
  if (v === null || v === undefined || v === "") return null;
  if (col.tipo === "data") {
    // Tudo vira milissegundos para comparar: AAAAMMDD, AAAAMMDDhhmmss (Serpro), dd/mm/aaaa e ISO.
    const s = String(v);
    let iso = s;
    if (/^\d{8}$/.test(s)) iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
    else if (/^\d{14}$/.test(s)) iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12)}`;
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) iso = `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}`;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? s : t;
  }
  if (typeof v === "number") return v;
  return String(v);
}

/** Ordena, filtra (busca geral e por coluna, sem acento) e devolve as linhas visíveis. Exportado para testes. */
export function aplicarTabela(linhas, colunas, { busca = "", filtros = {}, ordem = null } = {}) {
  const b = semAcento(busca).trim();
  let l = linhas.filter((x) => (!b || colunas.some((c) => semAcento(textoDaColuna(c, x)).includes(b))) && Object.entries(filtros).every(([k, f]) => {
    if (!String(f ?? "").trim()) return true;
    const c = colunas.find((y) => y.chave === k);
    return !c || semAcento(textoDaColuna(c, x)).includes(semAcento(f).trim());
  }));
  if (ordem) {
    const c = colunas.find((y) => y.chave === ordem.chave);
    if (c) l = [...l].sort((a, z) => {
      const va = chaveOrdenavel(c, a), vz = chaveOrdenavel(c, z);
      if (va === null && vz === null) return 0;
      if (va === null) return 1;
      if (vz === null) return -1;
      const r = typeof va === "number" && typeof vz === "number" ? va - vz : colador.compare(String(va), String(vz));
      return r * ordem.dir;
    });
  }
  return l;
}

function lerPreferencia(id) {
  if (!id) return null;
  try { return JSON.parse(localStorage.getItem(`intax-tabela:${id}`) || "null"); } catch { return null; }
}
function gravarPreferencia(id, v) {
  if (!id) return;
  try { localStorage.setItem(`intax-tabela:${id}`, JSON.stringify(v)); } catch { /* sem armazenamento: vale só nesta visita */ }
}

/**
 * Tabela padrão do InTAX: busca geral, filtro digitável em cada coluna, ordenação em qualquer coluna (clique no cabeçalho),
 * colunas reordenáveis (arrastar o cabeçalho) e ocultáveis, com a escolha guardada neste navegador; paginação e exportação
 * do que está filtrado. `documentos(linha)` vira a última coluna, fixa (ver, baixar, original, retificadora).
 * Padrão: começa em ordem alfabética, linha de uma altura só (texto sem quebra; `quebrar: true` só para textos longos),
 * `aoClicarLinha` torna a linha clicável e `coluna.aoClicar` leva a um destino próprio; `selecao` põe caixas de marcar.
 * `simples`: tabela curta de quadro (sem barra, sem paginação), com os cabeçalhos ainda ordenando. `totais(linhasFiltradas)`
 * devolve a(s) linha(s) <tr> do rodapé.
 * Larguras como no Excel: depois de desenhada, cada coluna fica do tamanho do conteúdo (título e células da página; só cresce
 * ao filtrar ou paginar) e a tabela passa a layout fixo; a alça na borda do título ajusta (arrastar, setas, clique duplo =
 * conteúdo), guardado neste navegador; "Restaurar larguras" no menu Colunas. Antes de medir (servidor, testes) vale o layout
 * automático. Títulos em verde-escuro com texto branco (cabecalhoTabelaCls); a linha de filtros fica clara. Tabela `simples`
 * com 5 linhas ou mais ganha a busca "Buscar nesta lista".
 * Barra única: `filtrosExtras` + busca + Filtros por coluna + Colunas + Exportar + `acoes` numa linha só (quebra só em tela
 * estreita). `busca={{ valor, aoMudar, placeholder, rotulo }}` troca a busca interna pela da página (busca no servidor ou
 * guardada em lista salva): a tabela não filtra por ela e não mostra uma segunda caixa.
 */
/** Ordem de partida: a indicada, senão a primeira coluna de texto em ordem alfabética. */
export function ordemPadrao(colunas, ordemInicial) {
  if (ordemInicial !== undefined) return ordemInicial;
  const c = colunas.find((x) => x.ordenavel !== false && !["moeda", "numero", "data", "periodo"].includes(x.tipo)) || colunas.find((x) => x.ordenavel !== false);
  return c ? { chave: c.chave, dir: 1 } : null;
}

/** Caixa de busca da barra única (h-8, com o X para limpar). Sem `placeholder`, é a busca interna "em todas as colunas". */
export function CaixaBusca({ valor, aoMudar, placeholder, rotulo, estreita = false }) {
  const texto = placeholder || "Buscar em todas as colunas";
  return (
    <label className={`relative flex-1 sm:max-w-xs ${estreita ? "min-w-[160px]" : "min-w-[200px]"}`}>
      <span className="sr-only">{rotulo || texto}</span>
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input type="search" value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder={texto} className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-7 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden" />
      {valor && <button type="button" onClick={() => aoMudar("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Limpar a busca"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>}
    </label>
  );
}

const ALINHAR = { direita:"text-right tabular-nums", centro: "text-center" };

const LARGURA_NOVA = 150; // coluna ainda não medida (acabou de aparecer) com a tabela já em layout fixo
const LARGURA_MARCAR = 32;
const LARGURA_DOCUMENTOS = 120;
const CHAVE_DOCUMENTOS = "__documentos";

/** Mede a largura natural de cada título (e da sua coluna) com a tabela por um instante em layout automático, sem a linha de filtros. */
function medirTabela(t) {
  if (!t?.tHead?.rows?.[0] || t.getBoundingClientRect().width === 0) return null;
  const ths = [...t.tHead.rows[0].cells].filter((c) => c.dataset.coluna);
  const filtros = t.tHead.querySelector("tr.linha-filtros");
  const antes = [t.style.tableLayout, t.style.width, t.style.minWidth, filtros?.style.display];
  const largs = ths.map((th) => th.style.width);
  t.style.tableLayout = "auto"; t.style.width = "max-content"; t.style.minWidth = "0";
  if (filtros) filtros.style.display = "none";
  ths.forEach((th) => { th.style.width = ""; });
  const saida = {};
  for (const th of ths) saida[th.dataset.coluna] = Math.ceil(th.getBoundingClientRect().width);
  ths.forEach((th, i) => { th.style.width = largs[i]; });
  [t.style.tableLayout, t.style.width, t.style.minWidth] = antes;
  if (filtros) filtros.style.display = antes[3];
  return saida;
}

export default function TabelaPadrao({ id, titulo, colunas, linhas = [], documentos, chaveLinha = (l, i) => l.id ?? i, vazio = "Nada para mostrar.", filtrosExtras, acoes, tamanhoInicial = 25, destaqueLinha, ariaLabel, ordemInicial, aoClicarLinha, selecao, filtrosVisiveis = true, rodape, simples = false, totais, classeTabela = "", busca: buscaExterna }) {
  const pref = useMemo(() => lerPreferencia(id), [id]);
  const todas = colunas.map((c) => c.chave);
  const [ordemColunas, setOrdemColunas] = useState(() => {
    const salvo = (pref?.ordem || []).filter((k) => todas.includes(k));
    return [...salvo, ...todas.filter((k) => !salvo.includes(k))];
  });
  const [ocultas, setOcultas] = useState(() => (pref?.ocultas || []).filter((k) => todas.includes(k)));
  const [buscaInterna, setBuscaInterna] = useState("");
  const busca = buscaExterna ? "" : buscaInterna;
  const textoBusca = buscaExterna ? buscaExterna.valor ?? "" : buscaInterna;
  const setBusca = buscaExterna ? (v) => buscaExterna.aoMudar(v) : setBuscaInterna;
  const [filtros, setFiltros] = useState({});
  const [verFiltros, setVerFiltros] = useState(filtrosVisiveis && !simples);
  const [ordem, setOrdem] = useState(() => ordemPadrao(colunas, ordemInicial));
  const [tamanho, setTamanho] = useState(simples ? 0 : pref?.tamanho ?? tamanhoInicial);
  const [pagina, setPagina] = useState(0);
  const [arrastando, setArrastando] = useState(null);
  const larguras = useLargurasColunas(idDaTabela(id, ariaLabel || titulo, todas));
  const tabela = useRef(null);
  const [area, setArea] = useState(null);

  // Colunas novas (vindas de outra consulta) entram no fim, sem perder a ordem escolhida.
  useEffect(() => { setOrdemColunas((o) => [...o.filter((k) => todas.includes(k)), ...todas.filter((k) => !o.includes(k))]); }, [todas.join("|")]);
  useEffect(() => { gravarPreferencia(id, { ordem: ordemColunas, ocultas, tamanho }); }, [id, ordemColunas, ocultas, tamanho]);
  useEffect(() => { setPagina(0); }, [textoBusca, JSON.stringify(filtros), ordem?.chave, ordem?.dir, tamanho]);

  const visiveis = ordemColunas.map((k) => colunas.find((c) => c.chave === k)).filter((c) => c && !ocultas.includes(c.chave));
  const filtradas = useMemo(() => aplicarTabela(linhas, colunas, { busca, filtros, ordem }), [linhas, colunas, busca, filtros, ordem]);
  const total = filtradas.length;
  const paginas = tamanho ? Math.max(1, Math.ceil(total / tamanho)) : 1;
  const exibidas = useMemo(() => (tamanho ? filtradas.slice(pagina * tamanho, pagina * tamanho + tamanho) : filtradas), [filtradas, tamanho, pagina]);
  const temFiltro = !!textoBusca || Object.values(filtros).some((f) => String(f ?? "").trim());

  // Larguras: mede o conteúdo depois de desenhar (antes de pintar); trocou o conjunto de colunas, mede do zero; senão só cresce.
  const chaveVisiveis = visiveis.map((c) => c.chave).join("|") + (documentos ? "|docs" : "");
  const ultimaMedida = useRef("");
  const medir = useCallback(() => {
    const m = medirTabela(tabela.current);
    if (!m) return;
    larguras.definirAuto(m, { crescer: ultimaMedida.current === chaveVisiveis });
    ultimaMedida.current = chaveVisiveis;
  }, [chaveVisiveis, larguras.definirAuto]);
  useEfeitoDeLayout(() => { medir(); }, [medir, exibidas, larguras.versao]);
  useAoRedimensionar(area, medir);
  const fixo = larguras.medidas || larguras.personalizadas;
  const larguraDe = (c) => larguras.larguraDe(c.chave, LARGURA_NOVA);
  const larguraDocs = larguras.larguraDe(CHAVE_DOCUMENTOS, LARGURA_DOCUMENTOS);
  const somaLarguras = (selecao ? LARGURA_MARCAR : 0) + visiveis.reduce((s, c) => s + larguraDe(c), 0) + (documentos ? larguraDocs : 0);

  const ordenar = (k) => setOrdem((o) => (!o || o.chave !== k ? { chave: k, dir: 1 } : { chave: k, dir: -o.dir }));
  const chaves = selecao ? filtradas.map((l, i) => chaveLinha(l, i)) : [];
  const todasMarcadas = !!selecao && chaves.length > 0 && chaves.every((k) => selecao.marcadas.has(k));
  const marcar = (k) => { const n = new Set(selecao.marcadas); if (n.has(k)) n.delete(k); else n.add(k); selecao.aoMudar(n); };
  const extras = (selecao ? 1 : 0) + (documentos ? 1 : 0) + (fixo ? 1 : 0);
  const soltar = (alvo) => {
    if (!arrastando || arrastando === alvo) return;
    setOrdemColunas((o) => { const s = o.filter((k) => k !== arrastando); s.splice(s.indexOf(alvo), 0, arrastando); return s; });
    setArrastando(null);
  };
  const mover = (k, passo) => setOrdemColunas((o) => { const i = o.indexOf(k); const j = i + passo; if (j < 0 || j >= o.length) return o; const s = [...o]; [s[i], s[j]] = [s[j], s[i]]; return s; });
  const restaurar = () => { setOrdemColunas(todas); setOcultas([]); };
  const buscaCurta = simples && linhas.length >= 5 && (
    <label className="relative min-w-[180px] flex-1 sm:max-w-xs">
      <span className="sr-only">Buscar nesta lista</span>
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input value={textoBusca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nesta lista" className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-7 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      {textoBusca && <button type="button" onClick={() => setBusca("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Limpar a busca"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>}
    </label>
  );

  // A busca da página (servidor ou lista salva) vem primeiro na barra; a busca interna fica depois dos filtros extras.
  const caixaBusca = (
    <CaixaBusca valor={textoBusca} aoMudar={setBusca} placeholder={buscaExterna?.placeholder} rotulo={buscaExterna?.rotulo} estreita={!!filtrosExtras} />
  );

  return (
    <div className="space-y-2">
      {!simples && <div className={barraListaCls} data-barra-lista="">
        {titulo && <h4 className="mr-auto text-sm font-semibold">{titulo}</h4>}
        {!buscaExterna && filtrosExtras}
        {caixaBusca}
        {buscaExterna && filtrosExtras}
        <button type="button" onClick={() => setVerFiltros((v) => !v)} aria-pressed={verFiltros} className={`${botaoBarraCls} ${verFiltros ? "bg-primary/10 text-primary" : ""}`}><Filter className="h-3.5 w-3.5" aria-hidden="true" /> Filtros por coluna</button>
        {temFiltro && <button type="button" onClick={() => { setBusca(""); setFiltros({}); }} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" aria-hidden="true" /> Limpar filtros</button>}
        <Popover>
          <PopoverTrigger asChild><button type="button" className={botaoBarraCls}><Columns3 className="h-3.5 w-3.5" aria-hidden="true" /> Colunas</button></PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2">
            <p className="px-1 pb-1 text-[11px] text-muted-foreground">Marque as colunas e use as setas para mudar a ordem (ou arraste o cabeçalho na tabela). Para mudar a largura, arraste a borda direita do título.</p>
            <ul className="max-h-72 space-y-0.5 overflow-y-auto">
              {ordemColunas.map((k, i) => { const c = colunas.find((x) => x.chave === k); if (!c) return null; return (
                <li key={k} className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-gradient-to-r hover:from-primary/30 hover:via-primary/12 hover:to-transparent">
                  <input type="checkbox" checked={!ocultas.includes(k)} onChange={() => setOcultas((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]))} aria-label={`Mostrar ${c.rotulo}`} />
                  <span className="flex-1 truncate">{c.rotulo}</span>
                  <button type="button" disabled={i === 0} onClick={() => mover(k, -1)} className="rounded p-0.5 hover:bg-background disabled:opacity-30" aria-label={`Subir ${c.rotulo}`}><ArrowUp className="h-3 w-3" aria-hidden="true" /></button>
                  <button type="button" disabled={i === ordemColunas.length - 1} onClick={() => mover(k, 1)} className="rounded p-0.5 hover:bg-background disabled:opacity-30" aria-label={`Descer ${c.rotulo}`}><ArrowDown className="h-3 w-3" aria-hidden="true" /></button>
                </li>
              ); })}
            </ul>
            <button type="button" onClick={restaurar} className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"><RotateCcw className="h-3 w-3" aria-hidden="true" /> Restaurar colunas</button>
            <button type="button" onClick={larguras.restaurar} disabled={!larguras.personalizadas} className="inline-flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"><RotateCcw className="h-3 w-3" aria-hidden="true" /> Restaurar larguras</button>
          </PopoverContent>
        </Popover>
        <BotaoExportar titulo={titulo || ariaLabel || "Tabela"} linhas={filtradas.map((l) => Object.fromEntries(visiveis.map((c) => [c.chave, textoDaColuna(c, l)])))} colunas={visiveis.map((c) => ({ chave: c.chave, rotulo: c.rotulo }))} compacto />
        {acoes}
      </div>}
      {simples && (titulo || acoes || buscaCurta) && <div className="flex flex-wrap items-center gap-2">{titulo && <h4 className="mr-auto text-sm font-semibold">{titulo}</h4>}{buscaCurta}{acoes}</div>}

      <div ref={setArea} className="overflow-x-auto rounded-lg border border-border bg-card">
        <table ref={tabela} className={`w-full text-[13px] leading-5 ${classeTabela}`} aria-label={ariaLabel || titulo} style={fixo ? { tableLayout: "fixed", width: "100%", minWidth: somaLarguras } : undefined}>
          <thead className="bg-muted/50">
            <tr className="text-left text-xs">
              {selecao && <th scope="col" className={`w-8 px-2 py-1.5 ${cabecalhoTabelaCls}`} style={fixo ? { width: LARGURA_MARCAR } : undefined}><input type="checkbox" aria-label="Marcar todas" checked={todasMarcadas} onChange={() => selecao.aoMudar(todasMarcadas ? new Set() : new Set(chaves))} /></th>}
              {visiveis.map((c) => {
                const ativa = ordem?.chave === c.chave;
                const Icone = !ativa ? ArrowUpDown : ordem.dir === 1 ? ArrowUp : ArrowDown;
                return (
                  <th key={c.chave} scope="col" data-coluna={c.chave} draggable onDragStart={(e) => { if (redimensionandoColuna()) { e.preventDefault(); return; } setArrastando(c.chave); }} onDragOver={(e) => e.preventDefault()} onDrop={() => soltar(c.chave)} onDragEnd={() => setArrastando(null)}
                    aria-sort={ativa ? (ordem.dir === 1 ? "ascending" : "descending") : "none"}
                    title={c.dica} style={fixo ? { width: larguraDe(c) } : undefined}
                    className={`relative select-none whitespace-nowrap px-2 py-1.5 font-medium ${cabecalhoTabelaCls} ${c.alinhar === "direita" ? "text-right" : c.alinhar === "centro" ? "text-center" : ""} ${fixo ? "overflow-hidden text-ellipsis" : c.largura || ""} ${arrastando === c.chave ? "opacity-50" : ""}`}>
                    <span className="inline-flex max-w-full items-center gap-1">
                      <GripVertical className="h-3 w-3 shrink-0 cursor-grab opacity-60" aria-hidden="true" />
                      {c.ordenavel === false ? <span className="truncate">{c.rotulo}</span> : (
                        <button type="button" onClick={() => ordenar(c.chave)} className={`inline-flex min-w-0 items-center gap-1 rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${ativa ? "font-semibold" : ""}`} title={c.dica || "Ordenar"}>
                          <span className="truncate">{c.rotulo}</span><Icone className={`h-3 w-3 shrink-0 ${ativa ? "" : "opacity-60"}`} aria-hidden="true" />
                        </button>
                      )}
                    </span>
                    <AlcaLargura rotulo={c.rotulo} largura={fixo ? larguraDe(c) : undefined} aoIniciar={() => { if (!larguras.medidas) medir(); }}
                      aoMudar={(px, { final }) => larguras.definir(c.chave, px, { gravar: final })} aoAutoAjustar={() => larguras.autoAjustar(c.chave)} />
                  </th>
                );
              })}
              {documentos && <th scope="col" data-coluna={CHAVE_DOCUMENTOS} style={fixo ? { width: larguraDocs } : undefined} className={`whitespace-nowrap px-2 py-1.5 text-right font-medium ${cabecalhoTabelaCls}`}>Documentos</th>}
              {fixo && <th aria-hidden="true" className={`p-0 ${cabecalhoTabelaCls}`} />}
            </tr>
            {verFiltros && (
              <tr className="linha-filtros">
                {selecao && <th />}
                {visiveis.map((c) => (
                  <th key={c.chave} className="px-2 pb-1.5 pt-1 font-normal">
                    {c.filtravel === false ? null : <input value={filtros[c.chave] ?? ""} onChange={(e) => setFiltros((f) => ({ ...f, [c.chave]: e.target.value }))} placeholder="Filtrar" aria-label={`Filtrar ${c.rotulo}`} className={`h-6 w-full ${fixo ? "min-w-0" : "min-w-[56px]"} rounded border border-border bg-background px-1.5 text-xs font-normal text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`} />}
                  </th>
                ))}
                {documentos && <th />}
                {fixo && <th aria-hidden="true" />}
              </tr>
            )}
          </thead>
          <tbody>
            {exibidas.length === 0 && <tr><td colSpan={visiveis.length + extras} className="px-3 py-6 text-center text-sm text-muted-foreground">{temFiltro ? "Nenhuma linha com esses filtros." : vazio}</td></tr>}
            {exibidas.map((l, i) => {
              const k = chaveLinha(l, i);
              return (
                <tr key={k} onClick={aoClicarLinha ? () => aoClicarLinha(l) : undefined} className={`border-t border-border/60 align-middle transition-[background-color,box-shadow] hover:bg-gradient-to-r hover:from-primary/30 hover:via-primary/12 hover:to-transparent hover:shadow-[inset_3px_0_0_0_hsl(var(--primary))] ${aoClicarLinha ? "cursor-pointer" : ""} ${i % 2 ? "bg-muted/15" : ""} ${destaqueLinha?.(l) ?? ""}`}>
                  {selecao && <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Marcar a linha" checked={selecao.marcadas.has(k)} onChange={() => marcar(k)} /></td>}
                  {visiveis.map((c) => {
                    const texto = c.render ? null : textoDaColuna(c, l);
                    return (
                      <td key={c.chave} onClick={c.aoClicar ? (e) => { e.stopPropagation(); c.aoClicar(l); } : undefined}
                        title={fixo && texto ? texto : undefined}
                        className={`px-2 py-1 ${ALINHAR[c.alinhar] || ""} ${c.quebrar === true ? (fixo ? "overflow-hidden break-words" : "min-w-[16rem] max-w-[32rem]") : `whitespace-nowrap ${fixo ? "overflow-hidden text-ellipsis" : ""}`} ${c.aoClicar ? "cursor-pointer" : ""}`}>
                        {c.render ? c.render(l) : texto}
                      </td>
                    );
                  })}
                  {documentos && <td className="whitespace-nowrap px-2 py-0.5 text-right" onClick={(e) => e.stopPropagation()}>{documentos(l)}</td>}
                  {fixo && <td aria-hidden="true" className="p-0" />}
                </tr>
              );
            })}
          </tbody>
          {totais && <tfoot className="border-t border-border bg-muted/40 font-medium">{totais(filtradas, { selecao: !!selecao, documentos: !!documentos, visiveis })}</tfoot>}
        </table>
      </div>
      {rodape}

      {!simples && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{total === linhas.length ? plural(total, "linha", "linhas") : `${total} de ${plural(linhas.length, "linha", "linhas")}`}</span>
        <label className="ml-auto inline-flex items-center gap-1">Linhas por página
          <select value={tamanho} onChange={(e) => setTamanho(Number(e.target.value))} className="rounded border border-border bg-background px-1 py-0.5">{TAMANHOS.map((t) => <option key={t} value={t}>{t || "Todas"}</option>)}</select>
        </label>
        {tamanho > 0 && paginas > 1 && (
          <span className="inline-flex items-center gap-1">
            <button type="button" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} className="botao-acao rounded px-2 py-px hover:bg-muted disabled:opacity-40">Anterior</button>
            <span className="tabular-nums">{pagina + 1} de {paginas}</span>
            <button type="button" disabled={pagina >= paginas - 1} onClick={() => setPagina((p) => p + 1)} className="botao-acao rounded px-2 py-px hover:bg-muted disabled:opacity-40">Próxima</button>
          </span>
        )}
      </div>}
    </div>
  );
}
