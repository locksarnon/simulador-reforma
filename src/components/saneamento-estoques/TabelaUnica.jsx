import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronsDown, Columns3, RotateCcw } from "lucide-react";
import AlcaLargura from "@/components/AlcaLargura";
import { cabecalhoTabelaCls } from "@/lib/estiloTabela";
import { useArrastarParaRolar } from "@/lib/useArrastarParaRolar";
import { limitarLargura, medirColunasNaturais, useEfeitoDeLayout, useLargurasColunas } from "@/lib/useLargurasColunas";
import { san, chaves } from "./api";
import { Aviso, BotaoInfo, botaoSecundario, campoCls, EstadoCarregando, EstadoErro, EstadoVazio, estiloTabela, SeloSituacao, Tag } from "./comuns";
import VisaoFocada from "./VisaoFocada";
import {
  ALTURA_LINHA, camadasAtivas, celulaDa, colunasDaTabela, colunasDoCadastro, colunasExtras, COLUNAS_FIXAS, dicaDoPar, gravarExtrasEscolhidas, gruposDeColunas, janelaVisivel,
  larguraTotal, LARGURA_FIXA, lerExtrasEscolhidas, LISTA_SITUACOES, montarFiltroItens, mudouPar, parDoItem, precisaCarregarMais, proximoPendente, ROTULO_CAMADA, ROTULO_GRUPO_TABELA,
  rolagemParaLinha, REGRA_FINALIDADE, rotuloFinalidade, rotuloSituacao, textoDaCelula, textoDoCadastro, textoDoEnquadramento,
} from "./logica";

/** Rótulo do grupo de colunas: a camada ou um dos grupos do cadastro (dados do item, outras colunas do ERP). */
const rotuloDoGrupo = (g) => ROTULO_GRUPO_TABELA[g] || ROTULO_CAMADA[g] || g;
const ehColunaDoCadastro = (c) => c.tipo === "era" || c.tipo === "ficou" || c.tipo === "valor" || c.tipo === "extra";

const ALTURA_CABECALHO = 56;
const FILTRO_VAZIO = { busca: "", camada: "", situacao: "", grupo: "", revisar: false, ordem: "codigo" };

/** Colunas fixas da tabela: sem "Estabelec." quando há estabelecimento único (o projeto com até um e os itens com no máximo um). */
export function fixasDaTabela(estabelecimentos, itens) {
  const varios = (Array.isArray(estabelecimentos) ? estabelecimentos : []).length > 1 || new Set((itens || []).map((i) => i.estabelecimento).filter(Boolean)).size > 1;
  return varios ? COLUNAS_FIXAS : COLUNAS_FIXAS.filter((c) => c.id !== "estabelecimento");
}

/** Texto simples de cada coluna (para medir a largura nas linhas já carregadas, inclusive as fora da tela); `extra`: espaço de selos. */
export function textoParaMedir(item, id) {
  if (id === "codigo") return { texto: item.codigo };
  if (id === "descricao") return { texto: item.descricao, extra: item.ativo === false ? 64 : 0 };
  if (id === "estabelecimento") return { texto: item.estabelecimento || "—" };
  if (id === "grupo") return { texto: item.grupo || "(sem grupo)" };
  if (id === "finalidade") return { texto: rotuloFinalidade(item.finalidade || item.finalidadeSugerida), extra: !item.finalidade && item.finalidadeSugerida ? 76 : 0 };
  if (id === "conjunto") { const e = textoDoEnquadramento(item); return { texto: e.texto, extra: e.origem ? 76 : 0 }; }
  // Pares do cadastro (era:campo / ficou:campo), campo de coluna única (valor:campo) e extras do ERP (extra:nome).
  const m = /^(era|ficou|valor|extra):(.*)$/.exec(String(id));
  if (m) { const tipo = m[1]; const campo = m[2]; const par = parDoItem(item, { tipo, campo }); return { texto: textoDoCadastro(campo, tipo === "era" ? par[0] : par[1]) }; }
  return null; // situação: selo, medido na tela
}

let pincel = null;
/** Maior largura de texto das linhas carregadas, por coluna (amostra de até 3.000 linhas), com a fonte das células. */
function medirTextosCarregados(itens, ids, fonte) {
  if (typeof document === "undefined") return {};
  try {
    pincel = pincel || document.createElement("canvas").getContext("2d");
    if (!pincel) return {};
    pincel.font = fonte;
    const saida = {};
    for (const item of itens.slice(0, 3000)) for (const id of ids) {
      const m = textoParaMedir(item, id);
      if (!m || !m.texto) continue;
      const w = Math.ceil(pincel.measureText(String(m.texto)).width) + 18 + (m.extra || 0);
      if (w > (saida[id] || 0)) saida[id] = w;
    }
    return saida;
  } catch { return {}; }
}

/** Lista paginada (cursor) acumulada numa só sequência. `extras`: colunas extras do ERP escolhidas (só elas vêm do servidor). */
function useItens(projetoId, filtro, extras) {
  const q = useInfiniteQuery({
    queryKey: chaves.itens(projetoId, extras.length ? { ...filtro, extras } : filtro),
    queryFn: ({ pageParam }) => san.itens(projetoId, montarFiltroItens(filtro, { cursor: pageParam, extras })),
    initialPageParam: undefined,
    getNextPageParam: (ultima) => ultima.proximo || undefined,
    gcTime: 60_000, // não guarda listas gigantes de filtros que já saíram da tela
  });
  const itens = useMemo(() => (q.data ? q.data.pages.flatMap((p) => p.itens) : []), [q.data]);
  return { q, itens, total: q.data?.pages?.[0]?.total };
}

/**
 * Célula do cadastro: "como era", "como ficou" (destaque quando mudou, dica com os dois valores), coluna única de campo que nenhuma camada
 * altera (o valor importado na base) ou coluna extra do ERP.
 */
function CelulaCadastro({ item, coluna }) {
  const par = parDoItem(item, coluna);
  const texto = textoDoCadastro(coluna.campo, coluna.tipo === "era" ? par[0] : par[1]);
  const dica = coluna.tipo === "era" || coluna.tipo === "valor" ? texto : dicaDoPar(coluna.campo, par);
  return <span className={`block truncate ${coluna.campo === "saldo" ? "tabular-nums" : ""}`} title={dica}>{texto === "—" ? <span className="text-muted-foreground">—</span> : texto}</span>;
}

function Celula({ item, coluna }) {
  if (coluna.tipo === "situacao") {
    const c = celulaDa(item, coluna.camada);
    return c ? <SeloSituacao situacao={c.situacao} revisar={c.revisar} curto /> : <span className="text-xs text-muted-foreground" aria-label="Sem dados">—</span>;
  }
  if (coluna.id === "conjunto") {
    const e = textoDoEnquadramento(item);
    return (
      <span className="flex min-w-0 items-center gap-1" title={e.texto}>
        {e.aguardando ? <Tag tom="alerta">{e.texto}</Tag> : <span className="truncate">{e.texto || <span className="text-muted-foreground">—</span>}</span>}
        {e.origem && <Tag tom={e.origem === "exceção" ? "alerta" : "info"}>{e.origem}</Tag>}
      </span>
    );
  }
  if (coluna.id === "finalidade" && !item.finalidade && item.finalidadeSugerida) {
    // Proposta da camada Finalidade ainda não aprovada: aparece como sugerida até o caso ser aprovado.
    const t = rotuloFinalidade(item.finalidadeSugerida);
    return <span className="flex min-w-0 items-center gap-1" title={`${t} (sugerida: aprove o caso em Casos para confirmar)`}><span className="truncate italic text-muted-foreground">{t}</span><Tag tom="info">sugerida</Tag></span>;
  }
  const texto = coluna.id === "grupo" ? item.grupo || "(sem grupo)" : coluna.id === "finalidade" ? rotuloFinalidade(item.finalidade) : "";
  return <span className="block truncate" title={texto}>{texto || <span className="text-muted-foreground">—</span>}</span>;
}

/**
 * Tabela única: uma linha por produto, colunas agrupadas por camada, janela de linhas (virtualização) e páginas por cursor.
 * Larguras como no Excel: cada coluna fica do tamanho do conteúdo (título, linhas na tela e o texto das linhas já carregadas; medida
 * de novo ao trocar filtro ou camadas, não ao rolar), a alça na borda do título ajusta (arrastar, setas, clique duplo = conteúdo),
 * guardado neste navegador; as posições das colunas fixas, os grupos e a largura das linhas seguem a mesma conta.
 */
export default function TabelaUnica({ projeto, recorte, aoAbrirCaso }) {
  const camadas = useMemo(() => camadasAtivas(projeto.modulos), [projeto.modulos]);
  const [filtro, setFiltro] = useState(() => ({ ...FILTRO_VAZIO, ...(recorte || {}) }));
  const [busca, setBusca] = useState(filtro.busca);
  const [selecao, setSelecao] = useState(null); // { id, camada }
  const [rolagem, setRolagem] = useState(0);
  const [alturaVisivel, setAlturaVisivel] = useState(560);
  const [aviso, setAviso] = useState(null);
  const [regraAberta, setRegraAberta] = useState(false);
  const [area, setArea] = useState(null);
  // Clicar numa área vazia e arrastar leva a tabela para o lado e para cima/baixo; o clique que termina o arraste não abre a visão focada.
  useArrastarParaRolar(area, { vertical: true });
  const quadro = useRef(0);
  // Colunas do cadastro (pares como era × como ficou) e colunas extras do ERP; as extras escolhidas ficam guardadas por projeto.
  const colunasQ = useQuery({ queryKey: chaves.colunasDosItens(projeto.id), queryFn: () => san.colunasDosItens(projeto.id), staleTime: 60_000 });
  const [extrasEscolhidas, setExtrasEscolhidas] = useState(() => lerExtrasEscolhidas(projeto.id));
  const [painelColunas, setPainelColunas] = useState(false);
  const extrasDisponiveis = Array.isArray(colunasQ.data?.extras) ? colunasQ.data.extras : null;
  const extras = useMemo(() => (extrasDisponiveis ? extrasEscolhidas.filter((n) => extrasDisponiveis.includes(n)) : extrasEscolhidas), [extrasEscolhidas, extrasDisponiveis]);
  const escolherExtras = (nomes) => { setExtrasEscolhidas(nomes); gravarExtrasEscolhidas(projeto.id, nomes); };
  const alternarExtra = (nome) => escolherExtras(extrasEscolhidas.includes(nome) ? extrasEscolhidas.filter((n) => n !== nome) : [...extrasEscolhidas, nome]);
  const { q, itens, total } = useItens(projeto.id, filtro, extras);
  const visao = useQuery({ queryKey: chaves.visao(projeto.id), queryFn: () => san.visaoGeral(projeto.id) });
  const grupos = visao.data?.grupos?.map((g) => g.grupo) || [];

  const larguras = useLargurasColunas("saneamento-estoques-tabela-unica");
  const [tabelaEl, setTabelaEl] = useState(null);
  const ajustar = (c) => ({ ...c, largura: larguras.larguraDe(c.id, c.largura) });
  const fundamentais = colunasQ.data?.fundamentais;
  // Ordem: dados do item (pares), outras colunas do ERP escolhidas, depois as camadas (como antes).
  const colunas = useMemo(() => [...colunasDoCadastro(fundamentais), ...colunasExtras(extras), ...colunasDaTabela(camadas)], [fundamentais, extras, camadas]).map(ajustar);
  // Estabelecimento só aparece quando o projeto tem mais de um (ou o cadastro traz algum).
  const fixas = useMemo(() => fixasDaTabela(projeto.estabelecimentos, itens), [projeto.estabelecimentos, itens]).map(ajustar);
  const esquerdas = fixas.map((_, n) => fixas.slice(0, n).reduce((s, x) => s + x.largura, 0));
  const larguraFixa = fixas.reduce((s, c) => s + c.largura, 0);
  const larg = larguraTotal(colunas) - LARGURA_FIXA + larguraFixa;
  const gruposCab = gruposDeColunas(colunas);
  const chaveColunas = [...fixas, ...colunas].map((c) => c.id).join("|");
  const primeiraPagina = q.data?.pages?.[0];
  // Tamanho do conteúdo: ao chegar a primeira página de um filtro, ao trocar as colunas ou ao restaurar (não ao rolar nem ao carregar mais).
  useEfeitoDeLayout(() => {
    const dom = medirColunasNaturais(tabelaEl, { limiteLinhas: 120 });
    if (!dom) return;
    const celula = tabelaEl.querySelector('[role="cell"]');
    const fonte = celula && typeof getComputedStyle === "function" ? getComputedStyle(celula).font : "13px sans-serif";
    const texto = medirTextosCarregados(itens, chaveColunas.split("|"), fonte);
    const mapa = { ...dom };
    for (const [k, v] of Object.entries(texto)) mapa[k] = Math.max(mapa[k] || 0, limitarLargura(v));
    larguras.definirAuto(mapa);
  }, [tabelaEl, chaveColunas, primeiraPagina, larguras.versao]);
  const janela = janelaVisivel({ rolagem, alturaVisivel, alturaLinha: ALTURA_LINHA, total: itens.length });

  // Busca digitada: espera a pessoa parar de digitar antes de consultar o servidor.
  useEffect(() => { const t = setTimeout(() => setFiltro((f) => (f.busca === busca ? f : { ...f, busca })), 300); return () => clearTimeout(t); }, [busca]);
  // Mede a área visível.
  useEffect(() => {
    const el = area;
    if (!el) return undefined;
    const medir = () => setAlturaVisivel(el.clientHeight || 560);
    medir();
    if (typeof ResizeObserver === "undefined") return undefined;
    const o = new ResizeObserver(medir);
    o.observe(el);
    return () => o.disconnect();
  }, [area]);
  // Perto do fim do que foi carregado, busca a próxima página.
  useEffect(() => {
    if (precisaCarregarMais({ fim: janela.fim, carregadas: itens.length, temMais: q.hasNextPage }) && !q.isFetchingNextPage) q.fetchNextPage();
  }, [janela.fim, itens.length, q.hasNextPage, q.isFetchingNextPage]);  
  // Mudou o filtro: volta ao topo.
  useEffect(() => { if (area) area.scrollTop = 0; setRolagem(0); }, [filtro]);  

  const aoRolar = useCallback((e) => {
    const topo = e.currentTarget.scrollTop;
    cancelAnimationFrame(quadro.current);
    quadro.current = requestAnimationFrame(() => setRolagem(topo));
  }, []);
  const mudar = (k) => (e) => setFiltro((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const alternarCamada = (camada) => setFiltro((f) => ({ ...f, camada: f.camada === camada ? "" : camada }));

  const irAoProximoPendente = async () => {
    setAviso(null);
    const atual = selecao ? itens.findIndex((i) => i.id === selecao.id) : Math.max(-1, Math.floor(rolagem / ALTURA_LINHA) - 1);
    const alvo = filtro.camada || null;
    let lista = itens;
    let i = proximoPendente(lista, atual, alvo, camadas);
    let tentativas = 0;
    let ultima = q;
    let falhou = false;
    while (i < 0 && ultima.hasNextPage && tentativas++ < 40) {
      ultima = await q.fetchNextPage();
      if (ultima.isError) { falhou = true; break; }
      lista = ultima.data ? ultima.data.pages.flatMap((p) => p.itens) : lista;
      i = proximoPendente(lista, atual, alvo, camadas);
    }
    if (i < 0) {
      setAviso(falhou ? "Não foi possível carregar mais produtos agora. Tente de novo." : ultima.hasNextPage ? "Ainda há itens a carregar além dos que foram buscados: use \"Ir ao próximo pendente\" de novo ou role a tabela." : "Não há mais itens pendentes depois deste ponto.");
      return;
    }
    const item = lista[i];
    const celula = (item.celulas || []).find((c) => c.situacao === "PENDENTE" && (!alvo || c.camada === alvo));
    if (area) area.scrollTop = rolagemParaLinha(i, ALTURA_LINHA, alturaVisivel);
    setSelecao({ id: item.id, camada: celula?.camada || alvo || camadas[0] });
  };

  const temFiltro = filtro.busca || filtro.camada || filtro.situacao || filtro.grupo || filtro.revisar;
  const itemAberto = selecao ? itens.find((i) => i.id === selecao.id) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2" role="search" aria-label="Filtros da tabela">
        <label className="block min-w-[180px] flex-1"><span className="mb-1 block text-xs text-muted-foreground">Buscar por código ou descrição</span>
          <input className={campoCls} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite para buscar" /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Camada</span>
          <select className={campoCls} value={filtro.camada} onChange={mudar("camada")}><option value="">Todas</option>{camadas.map((c) => <option key={c} value={c}>{ROTULO_CAMADA[c]}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Situação{filtro.camada ? "" : " (em alguma camada)"}</span>
          <select className={campoCls} value={filtro.situacao} onChange={mudar("situacao")}><option value="">Todas</option>{LISTA_SITUACOES.map((s) => <option key={s} value={s}>{rotuloSituacao(s)}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Grupo</span>
          <select className={campoCls} value={filtro.grupo} onChange={mudar("grupo")}><option value="">Todos</option>{grupos.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Ordem de trabalho</span>
          <select className={campoCls} value={filtro.ordem} onChange={mudar("ordem")}><option value="codigo">Por código</option><option value="grupo">Por grupo e código</option></select></label>
        <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" checked={filtro.revisar} onChange={mudar("revisar")} />Só marcadas "revisar"</label>
        {temFiltro && <button type="button" className={botaoSecundario} onClick={() => { setBusca(""); setFiltro(FILTRO_VAZIO); }}>Limpar filtros</button>}
        <button type="button" className={botaoSecundario} onClick={irAoProximoPendente} disabled={!itens.length}><ChevronsDown className="h-4 w-4" aria-hidden="true" />Ir ao próximo pendente</button>
        {extrasDisponiveis?.length > 0 && (
          <button type="button" className={botaoSecundario} aria-expanded={painelColunas} aria-controls="san-colunas-erp" onClick={() => setPainelColunas((x) => !x)} title="Escolher as outras colunas do ERP que aparecem na tabela">
            <Columns3 className="h-4 w-4" aria-hidden="true" />Colunas{extras.length ? ` (${extras.length})` : ""}
          </button>
        )}
        {larguras.personalizadas && <button type="button" className={botaoSecundario} onClick={larguras.restaurar} title="Volta cada coluna ao tamanho do conteúdo"><RotateCcw className="h-4 w-4" aria-hidden="true" />Restaurar larguras</button>}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {q.isSuccess ? `${total !== undefined ? total.toLocaleString("pt-BR") : itens.length.toLocaleString("pt-BR")} produto(s) ${temFiltro ? "com estes filtros" : "no projeto"}; ${itens.length.toLocaleString("pt-BR")} carregado(s).` : ""}
        {q.isFetchingNextPage && " Carregando mais…"}
      </p>
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-foreground/80" data-legenda="alterado">
        <span className="amostra-celula-alterada" aria-hidden="true" />alterado no saneamento <span className="text-muted-foreground">(passe o mouse na célula para ver como era e como ficou)</span>
      </p>
      {aviso && <Aviso>{aviso}</Aviso>}
      {painelColunas && extrasDisponiveis?.length > 0 && (
        <div id="san-colunas-erp" className="border border-border bg-card p-3 text-xs" role="group" aria-label="Outras colunas do ERP">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">Outras colunas do ERP (ficam ocultas até você marcar)</span>
            <span className="flex gap-3">
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => escolherExtras([...extrasDisponiveis])}>Mostrar todas</button>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => escolherExtras([])}>Ocultar todas</button>
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setPainelColunas(false)}>Fechar</button>
            </span>
          </div>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
            {extrasDisponiveis.map((nome) => (
              <label key={nome} className="flex min-w-0 items-center gap-1.5"><input type="checkbox" checked={extras.includes(nome)} onChange={() => alternarExtra(nome)} /><span className="truncate" title={nome}>{nome}</span></label>
            ))}
          </div>
        </div>
      )}
      {regraAberta && (
        <div id="san-regra-finalidade" className="border border-border bg-card p-3 text-xs">
          <div className="mb-1 flex items-center justify-between gap-2"><span className="font-semibold">Como o sistema chega à finalidade</span><button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setRegraAberta(false)}>Fechar</button></div>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">{REGRA_FINALIDADE.map((t) => <li key={t}>{t}</li>)}</ol>
        </div>
      )}

      {q.isError ? <EstadoErro erro={q.error} aoTentar={() => q.refetch()} texto="Não foi possível carregar os produtos." />
        : q.isPending ? <EstadoCarregando texto="Carregando os produtos…" />
          : itens.length === 0 ? (
            <EstadoVazio titulo={temFiltro ? "Nenhum produto com estes filtros" : "Nenhum produto importado"}>
              {temFiltro ? "Mude ou limpe os filtros." : "Importe o cadastro de itens em Fase 1 > 1.1 Preparar e diretrizes."}
            </EstadoVazio>
          ) : (
            <div ref={setArea} onScroll={aoRolar} className={`${estiloTabela.area} h-[68vh] min-h-[320px]`} tabIndex={0} aria-label="Tabela de produtos por camada. Role para ver mais linhas.">
              <div ref={setTabelaEl} role="table" aria-label="Produtos e situação de cada camada" aria-rowcount={(total ?? itens.length) + 2} aria-colcount={fixas.length + colunas.length} style={{ width: larg }}>
                {/* Cabeçalho: grupos (camadas) e colunas, fixo no topo; as 3 primeiras colunas também ficam fixas à esquerda. */}
                <div role="rowgroup" className={estiloTabela.cabecalho} style={{ height: ALTURA_CABECALHO }}>
                  <div role="row" className={`flex border-b border-white/20 ${cabecalhoTabelaCls}`} style={{ height: ALTURA_CABECALHO / 2 }}>
                    <div className="sticky left-0 z-40 bg-cabecalho" style={{ width: larguraFixa }} />
                    {gruposCab.map((g) => ROTULO_GRUPO_TABELA[g.camada] ? (
                      <div key={g.camada} role="columnheader" style={{ width: g.largura }} className="flex items-center border-l border-white/20 px-2"
                        title={g.camada === "CADASTRO" ? "Campos que as camadas podem alterar em duas colunas (como veio na importação e como está agora, com as decisões aplicadas); os demais numa coluna só, com o valor importado" : undefined}>
                        <span className="truncate text-xs font-semibold">{ROTULO_GRUPO_TABELA[g.camada]}</span>
                      </div>
                    ) : (
                      <div key={g.camada} role="columnheader" style={{ width: g.largura }} className="border-l border-white/20 px-1">
                        <button type="button" aria-pressed={filtro.camada === g.camada} onClick={() => alternarCamada(g.camada)} title="Mostrar só os produtos com situação nesta camada"
                          className={`h-full w-full truncate px-1 text-left text-xs font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${filtro.camada === g.camada ? "bg-white/20" : ""}`}>
                          {ROTULO_CAMADA[g.camada]}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div role="row" className={`flex text-xs ${cabecalhoTabelaCls}`} style={{ height: ALTURA_CABECALHO / 2 }}>
                    {fixas.map((c, n) => (
                      <div key={c.id} role="columnheader" data-coluna={c.id} className={estiloTabela.tituloFixo} style={{ width: c.largura, left: esquerdas[n] }}>
                        <span className="truncate">{c.titulo}</span>
                        <AlcaLargura rotulo={c.titulo} largura={c.largura} aoMudar={(px, { final }) => larguras.definir(c.id, px, { gravar: final })} aoAutoAjustar={() => larguras.autoAjustar(c.id)} />
                      </div>
                    ))}
                    {colunas.map((c) => (
                      <div key={c.id} role="columnheader" data-coluna={c.id} className={`${estiloTabela.tituloColuna} gap-1`} style={{ width: c.largura }}>
                        <span className="truncate">{c.titulo}</span>
                        {c.id === "finalidade" && <BotaoInfo id="san-regra-finalidade" rotulo="regra da finalidade" pequeno aberto={regraAberta} aoAlternar={() => setRegraAberta((x) => !x)} />}
                        <AlcaLargura rotulo={ehColunaDoCadastro(c) ? c.titulo : `${c.titulo} (${rotuloDoGrupo(c.camada)})`} largura={c.largura} aoMudar={(px, { final }) => larguras.definir(c.id, px, { gravar: final })} aoAutoAjustar={() => larguras.autoAjustar(c.id)} />
                      </div>
                    ))}
                  </div>
                </div>
                <div role="rowgroup" className="relative" style={{ height: janela.alturaTotal }}>
                  {itens.slice(janela.inicio, janela.fim).map((item, k) => {
                    const i = janela.inicio + k;
                    const marcado = selecao?.id === item.id;
                    return (
                      <div key={item.id} role="row" aria-rowindex={i + 3} aria-selected={marcado} className={`absolute left-0 ${estiloTabela.linha} ${estiloTabela.fundoLinha(i, marcado)}`} style={{ top: i * ALTURA_LINHA, height: ALTURA_LINHA, width: larg }}>
                        {fixas.map((c, n) => (
                          <div key={c.id} role="cell" data-coluna={c.id} className={`sticky z-10 flex items-center overflow-hidden px-2 ${estiloTabela.fundoFixo(i, marcado)} ${c.id === "codigo" ? "font-medium tabular-nums" : ""}`} style={{ width: c.largura, left: esquerdas[n] }}>
                            <span className="truncate" title={c.id === "descricao" ? item.descricao : undefined}>{c.id === "estabelecimento" ? item.estabelecimento || "—" : item[c.id]}</span>
                            {c.id === "descricao" && item.ativo === false && <Tag className="ml-1">inativo</Tag>}
                          </div>
                        ))}
                        {colunas.map((c) => {
                          const cel = c.tipo === "situacao" ? celulaDa(item, c.camada) : null;
                          if (ehColunaDoCadastro(c)) {
                            const alterada = (c.tipo === "ficou" || c.tipo === "extra") && mudouPar(parDoItem(item, c));
                            return (
                              <div key={c.id} role="cell" data-coluna={c.id} data-alterada={alterada || undefined} className={`${estiloTabela.celula} ${alterada ? "celula-alterada" : ""}`} style={{ width: c.largura }}>
                                <CelulaCadastro item={item} coluna={c} />
                              </div>
                            );
                          }
                          return (
                            <div key={c.id} role="cell" data-coluna={c.id} className={estiloTabela.celula} style={{ width: c.largura }}>
                              {c.tipo === "situacao" ? (
                                <button type="button" onClick={() => setSelecao({ id: item.id, camada: c.camada })} title={cel?.revisar_causa || undefined}
                                  aria-label={`${item.codigo}, ${ROTULO_CAMADA[c.camada]}: ${textoDaCelula(cel)}. Abrir a visão focada.`}
                                  className="max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  <Celula item={item} coluna={c} />
                                </button>
                              ) : <Celula item={item} coluna={c} />}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {q.hasNextPage && itens.length > 0 && janela.fim >= itens.length && (
                    <div className="absolute left-0 px-3 py-2 text-xs text-muted-foreground" style={{ top: itens.length * ALTURA_LINHA, width: larguraFixa }}>Carregando mais produtos…</div>
                  )}
                </div>
              </div>
            </div>
          )}

      {itemAberto && (
        <VisaoFocada projeto={projeto} item={itemAberto} camada={selecao.camada} aoFechar={() => setSelecao(null)} aoAbrirCaso={aoAbrirCaso}
          aoProximoPendente={() => { setSelecao(null); irAoProximoPendente(); }} />
      )}
    </div>
  );
}
