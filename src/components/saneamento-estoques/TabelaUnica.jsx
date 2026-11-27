import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronsDown } from "lucide-react";
import { san, chaves } from "./api";
import { Aviso, botaoSecundario, campoCls, EstadoCarregando, EstadoErro, EstadoVazio, estiloTabela, SeloSituacao, Tag } from "./comuns";
import VisaoFocada from "./VisaoFocada";
import {
  ALTURA_LINHA, camadasAtivas, celulaDa, colunasDaTabela, COLUNAS_FIXAS, gruposDeColunas, janelaVisivel, larguraTotal, LARGURA_FIXA, LISTA_SITUACOES, montarFiltroItens,
  precisaCarregarMais, proximoPendente, ROTULO_CAMADA, rolagemParaLinha, rotuloFinalidade, rotuloSituacao, textoDaCelula, textoDoEnquadramento,
} from "./logica";

const ALTURA_CABECALHO = 56;
const FILTRO_VAZIO = { busca: "", camada: "", situacao: "", grupo: "", revisar: false, ordem: "codigo" };

/** Lista paginada (cursor) acumulada numa só sequência. */
function useItens(projetoId, filtro) {
  const q = useInfiniteQuery({
    queryKey: chaves.itens(projetoId, filtro),
    queryFn: ({ pageParam }) => san.itens(projetoId, montarFiltroItens(filtro, { cursor: pageParam })),
    initialPageParam: undefined,
    getNextPageParam: (ultima) => ultima.proximo || undefined,
    gcTime: 60_000, // não guarda listas gigantes de filtros que já saíram da tela
  });
  const itens = useMemo(() => (q.data ? q.data.pages.flatMap((p) => p.itens) : []), [q.data]);
  return { q, itens, total: q.data?.pages?.[0]?.total };
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
  const texto = coluna.id === "grupo" ? item.grupo || "(sem grupo)" : coluna.id === "finalidade" ? rotuloFinalidade(item.finalidade) : "";
  return <span className="block truncate" title={texto}>{texto || <span className="text-muted-foreground">—</span>}</span>;
}

/** Tabela única: uma linha por produto, colunas agrupadas por camada, janela de linhas (virtualização) e páginas por cursor. */
export default function TabelaUnica({ projeto, recorte, aoAbrirCaso, aoIrParaConfiguracao }) {
  const camadas = useMemo(() => camadasAtivas(projeto.modulos), [projeto.modulos]);
  const [filtro, setFiltro] = useState(() => ({ ...FILTRO_VAZIO, ...(recorte || {}) }));
  const [busca, setBusca] = useState(filtro.busca);
  const [selecao, setSelecao] = useState(null); // { id, camada }
  const [rolagem, setRolagem] = useState(0);
  const [alturaVisivel, setAlturaVisivel] = useState(560);
  const [aviso, setAviso] = useState(null);
  const [area, setArea] = useState(null);
  const quadro = useRef(0);
  const { q, itens, total } = useItens(projeto.id, filtro);
  const visao = useQuery({ queryKey: chaves.visao(projeto.id), queryFn: () => san.visaoGeral(projeto.id) });
  const grupos = visao.data?.grupos?.map((g) => g.grupo) || [];

  const colunas = useMemo(() => colunasDaTabela(camadas), [camadas]);
  const larg = larguraTotal(colunas);
  const gruposCab = useMemo(() => gruposDeColunas(colunas), [colunas]);
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
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {q.isSuccess ? `${total !== undefined ? total.toLocaleString("pt-BR") : itens.length.toLocaleString("pt-BR")} produto(s) ${temFiltro ? "com estes filtros" : "no projeto"}; ${itens.length.toLocaleString("pt-BR")} carregado(s).` : ""}
        {q.isFetchingNextPage && " Carregando mais…"}
      </p>
      {aviso && <Aviso>{aviso}</Aviso>}

      {q.isError ? <EstadoErro erro={q.error} aoTentar={() => q.refetch()} texto="Não foi possível carregar os produtos." />
        : q.isPending ? <EstadoCarregando texto="Carregando os produtos…" />
          : itens.length === 0 ? (
            <EstadoVazio titulo={temFiltro ? "Nenhum produto com estes filtros" : "Nenhum produto importado"}>
              {temFiltro ? "Mude ou limpe os filtros." : projeto.atividadesConfirmadas ? "Importe o cadastro de itens na aba Importação." : <>Confirme as atividades do cliente para continuar.{aoIrParaConfiguracao && <> <button type="button" className="text-primary underline" onClick={aoIrParaConfiguracao}>Ir para a Configuração</button></>}</>}
            </EstadoVazio>
          ) : (
            <div ref={setArea} onScroll={aoRolar} className={`${estiloTabela.area} h-[68vh] min-h-[320px]`} tabIndex={0} aria-label="Tabela de produtos por camada. Role para ver mais linhas.">
              <div role="table" aria-label="Produtos e situação de cada camada" aria-rowcount={(total ?? itens.length) + 2} aria-colcount={COLUNAS_FIXAS.length + colunas.length} style={{ width: larg }}>
                {/* Cabeçalho: grupos (camadas) e colunas, fixo no topo; as 3 primeiras colunas também ficam fixas à esquerda. */}
                <div role="rowgroup" className={estiloTabela.cabecalho} style={{ height: ALTURA_CABECALHO }}>
                  <div role="row" className="flex border-b border-border/70" style={{ height: ALTURA_CABECALHO / 2 }}>
                    <div className="sticky left-0 z-40 bg-muted" style={{ width: LARGURA_FIXA }} />
                    {gruposCab.map((g) => (
                      <div key={g.camada} role="columnheader" style={{ width: g.largura }} className="border-l border-border/70 px-1">
                        <button type="button" aria-pressed={filtro.camada === g.camada} onClick={() => alternarCamada(g.camada)} title="Mostrar só os produtos com situação nesta camada"
                          className={`h-full w-full truncate px-1 text-left text-xs font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${filtro.camada === g.camada ? "bg-primary/15" : ""}`}>
                          {ROTULO_CAMADA[g.camada]}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div role="row" className="flex text-xs text-muted-foreground" style={{ height: ALTURA_CABECALHO / 2 }}>
                    {COLUNAS_FIXAS.map((c, n) => (
                      <div key={c.id} role="columnheader" className={estiloTabela.tituloFixo} style={{ width: c.largura, left: COLUNAS_FIXAS.slice(0, n).reduce((s, x) => s + x.largura, 0) }}>{c.titulo}</div>
                    ))}
                    {colunas.map((c) => <div key={c.id} role="columnheader" className={estiloTabela.tituloColuna} style={{ width: c.largura }}>{c.titulo}</div>)}
                  </div>
                </div>
                <div role="rowgroup" className="relative" style={{ height: janela.alturaTotal }}>
                  {itens.slice(janela.inicio, janela.fim).map((item, k) => {
                    const i = janela.inicio + k;
                    const marcado = selecao?.id === item.id;
                    return (
                      <div key={item.id} role="row" aria-rowindex={i + 3} aria-selected={marcado} className={`absolute left-0 ${estiloTabela.linha} ${estiloTabela.fundoLinha(i, marcado)}`} style={{ top: i * ALTURA_LINHA, height: ALTURA_LINHA, width: larg }}>
                        {COLUNAS_FIXAS.map((c, n) => (
                          <div key={c.id} role="cell" className={`sticky z-10 flex items-center overflow-hidden px-2 ${estiloTabela.fundoFixo(i, marcado)} ${c.id === "codigo" ? "font-medium tabular-nums" : ""}`} style={{ width: c.largura, left: COLUNAS_FIXAS.slice(0, n).reduce((s, x) => s + x.largura, 0) }}>
                            <span className="truncate" title={c.id === "descricao" ? item.descricao : undefined}>{c.id === "estabelecimento" ? item.estabelecimento || "—" : item[c.id]}</span>
                            {c.id === "descricao" && item.ativo === false && <Tag className="ml-1">inativo</Tag>}
                          </div>
                        ))}
                        {colunas.map((c) => {
                          const cel = c.tipo === "situacao" ? celulaDa(item, c.camada) : null;
                          return (
                            <div key={c.id} role="cell" className={estiloTabela.celula} style={{ width: c.largura }}>
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
                    <div className="absolute left-0 px-3 py-2 text-xs text-muted-foreground" style={{ top: itens.length * ALTURA_LINHA, width: LARGURA_FIXA }}>Carregando mais produtos…</div>
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
