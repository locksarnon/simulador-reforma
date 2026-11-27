import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfirmar } from "@/components/ConfirmProvider";
import { san, chaves, atualizarTudo } from "./api";
import CasoDetalhe from "./CasoDetalhe";
import PlanilhaDecisao from "./PlanilhaDecisao";
import TabelaDensa from "./TabelaDensa";
import { Aviso, botaoPerigo, botaoPrimario, botaoSecundario, campoCls, EstadoCarregando, EstadoErro, EstadoVazio, faixaQuadroCls, quadroCls, Rotulo, SeloTexto, Tag, TextoLongo, usePodeAlterar } from "./comuns";
import {
  CAMADAS, contadorDeGrupos, corpoDoLote, descricaoDoLoteDoGrupo, fatiarIds, filtroAdmiteLote, grupoDoGrupoDeCasos, identificacaoDoCaso, idsDosGruposParaLote, lerParecer, linhaDeExcecao, MAX_LOTE, mensagemDeErro, montarFiltroCasos, opcoesDeTipo, proximoCasoAberto,
  problemaDoGrupoDeCasos, ROTULO_CAMADA, ROTULO_CONFIANCA, rotuloDoCampo, rotuloSituacaoCaso, rotuloTipoCaso, situacaoUnicaDoGrupo, SITUACOES_DO_CASO, somarPrevias, textoDaPropostaDoGrupo,
  textoDasSituacoesDoGrupo, textoDoValor, textoLegivel, versoesDaPrevia,
} from "./logica";

/** As três decisões do lote. Pedir informação e rejeitar valem para todo caso em aberto; aprovar, só para os que têm proposta aprovável. */
const ACOES_DO_LOTE = {
  aprovar: { rotulo: "Aprovar", texto: "Fundamento comum (opcional)", obrigatorio: false, chamar: san.loteAprovar, feitos: (r) => r.aprovados || 0, resultado: "aprovado(s)" },
  pedir: { rotulo: "Pedir informação", texto: "Que informação falta? (vale para todos os casos do lote)", obrigatorio: true, chamar: san.lotePedirInformacao, feitos: (r) => r.decididos || 0, resultado: "com pedido de informação registrado" },
  rejeitar: { rotulo: "Rejeitar", texto: "Justificativa da rejeição (vale para todos os casos do lote)", obrigatorio: true, chamar: san.loteRejeitar, feitos: (r) => r.decididos || 0, resultado: "rejeitado(s)" },
};
const n = (v) => Number(v || 0).toLocaleString("pt-BR");

function Contagem({ valor, rotulo }) {
  return <div className="border border-foreground/30 bg-card p-2"><div className="text-xl font-semibold tabular-nums">{n(valor)}</div>{rotulo}</div>;
}

/**
 * Decisão em lote sobre os casos marcados ou sobre o FILTRO INTEIRO (não só o que a lista carregou). A prévia e a decisão andam em rodadas de até
 * 2000 casos, sozinhas, com progresso; o que não couber numa chamada (tempo do servidor) entra na rodada seguinte. Se algo interromper, a tela
 * diz quantos casos ficaram e oferece continuar.
 */
export function PainelDeLote({ projeto, ids, filtro, descricao, aoFechar, aoMudou }) {
  const { pode, razao } = usePodeAlterar();
  const confirmar = useConfirmar();
  const [acao, setAcao] = useState("aprovar");
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState(null);
  const [progresso, setProgresso] = useState(null); // { fase, feitos, total }
  const [resultado, setResultado] = useState(null); // { acao, feitos, excecoes, pendentes, versoes }
  const [erro, setErro] = useState(null);
  const parar = useRef(false);
  const cfg = ACOES_DO_LOTE[acao];
  const ocupado = !!progresso;

  const calcularPrevia = async () => {
    parar.current = false; setErro(null); setResultado(null); setPrevia(null);
    const rodadas = [];
    try {
      if (ids.length) {
        for (const fatia of fatiarIds(ids)) {
          rodadas.push(await san.lotePrevia(projeto.id, corpoDoLote({ ids: fatia })));
          setProgresso({ fase: "previa", feitos: rodadas.reduce((s, p) => s + (p.casos || 0), 0), total: ids.length });
          if (parar.current) break;
        }
      } else {
        let apos;
        do {
          const p = await san.lotePrevia(projeto.id, corpoDoLote({ filtro, apos }));
          rodadas.push(p); apos = p.proximo || null;
          setProgresso({ fase: "previa", feitos: rodadas.reduce((s, x) => s + (x.casos || 0), 0), total: p.total });
        } while (apos && !parar.current);
      }
      setPrevia(somarPrevias(rodadas));
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setProgresso(null); }
  };

  /** Decide em rodadas de até 2000 casos; os `restantes` de cada chamada voltam para a fila, até acabar (ou alguém parar). */
  const decidir = async (fila0, versoes, qual, textoComum) => {
    parar.current = false; setErro(null);
    const c = ACOES_DO_LOTE[qual];
    let fila = [...fila0];
    let feitos = resultado?.acao === qual ? resultado.feitos : 0;
    const excecoes = resultado?.acao === qual ? [...resultado.excecoes] : [];
    const total = feitos + fila.length;
    setProgresso({ fase: "decidir", feitos, total });
    try {
      while (fila.length && !parar.current) {
        const fatia = fila.slice(0, MAX_LOTE);
        const corpo = { ids: fatia, versoes: Object.fromEntries(fatia.map((id) => [id, versoes[id]])), ...(textoComum ? (qual === "aprovar" ? { fundamento: textoComum } : { texto: textoComum }) : {}) };
        const r = await c.chamar(projeto.id, corpo);
        const resto = r.restantes || [];
        feitos += c.feitos(r); excecoes.push(...(r.excecoes || []));
        fila = [...resto, ...fila.slice(fatia.length)];
        setProgresso({ fase: "decidir", feitos, total });
        if (resto.length === fatia.length && !c.feitos(r)) break; // nada andou nesta chamada: para e oferece continuar
      }
    } catch (e) { setErro(mensagemDeErro(e)); }
    setResultado({ acao: qual, feitos, excecoes, pendentes: fila, versoes, texto: textoComum });
    setPrevia(null); setProgresso(null);
    aoMudou();
  };

  const alvos = previa ? (acao === "aprovar" ? previa.aprovaveis : previa.abertos) : [];
  const executar = async () => {
    if (acao === "rejeitar" && !(await confirmar({ titulo: `Rejeitar ${n(alvos.length)} caso(s)?`, rotulo: "Rejeitar", perigoso: true, descricao: "Cada caso fica rejeitado com esta justificativa, sem alterar o cadastro. Dá para reabrir um a um depois." }))) return;
    const versoes = versoesDaPrevia(previa, acao);
    decidir(Object.keys(versoes), versoes, acao, texto.trim());
  };

  return (
    <section aria-label="Decisão em lote" className={`space-y-3 ${quadroCls}`}>
      <div className={`-mx-3 -mt-3 mb-2 flex items-center justify-between ${faixaQuadroCls}`}><h3 className="text-sm font-semibold text-foreground">Decidir em lote</h3><button type="button" className={`${botaoSecundario} bg-card`} onClick={aoFechar} disabled={ocupado}>Fechar</button></div>
      <p className="text-sm text-muted-foreground">{descricao} Primeiro veja a prévia; só então confirme.</p>
      <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Decisão">
        {Object.entries(ACOES_DO_LOTE).map(([k, v]) => (
          <label key={k} className="flex items-center gap-1.5 text-sm"><input type="radio" name="acao-do-lote" value={k} checked={acao === k} disabled={ocupado} onChange={() => setAcao(k)} />{v.rotulo}</label>
        ))}
      </div>
      <label className="block"><Rotulo>{cfg.texto}</Rotulo>{acao === "aprovar"
        ? <input className={campoCls} value={texto} disabled={ocupado} onChange={(e) => setTexto(e.target.value)} />
        : <textarea className={`${campoCls} min-h-[64px]`} value={texto} disabled={ocupado} onChange={(e) => setTexto(e.target.value)} />}</label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={botaoSecundario} disabled={ocupado} onClick={calcularPrevia}>{previa ? "Refazer a prévia" : "Ver a prévia"}</button>
        {progresso && (
          <>
            <span className="text-sm" role="status">{progresso.fase === "previa" ? "Prévia" : cfg.rotulo}: {n(progresso.feitos)} de {n(progresso.total)} caso(s)…</span>
            <button type="button" className={botaoSecundario} onClick={() => { parar.current = true; }}>Parar</button>
          </>
        )}
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {resultado && (
        <Aviso tom={resultado.pendentes.length || resultado.excecoes.length ? "alerta" : "ok"} titulo={`${n(resultado.feitos)} caso(s) ${ACOES_DO_LOTE[resultado.acao].resultado}`}
          acao={resultado.pendentes.length > 0 && <button type="button" className={botaoPrimario} disabled={!pode || ocupado} title={razao} onClick={() => decidir(resultado.pendentes, resultado.versoes, resultado.acao, resultado.texto)}>Continuar</button>}>
          {resultado.pendentes.length > 0 && <p>{n(resultado.pendentes.length)} caso(s) ficaram para a próxima rodada: use Continuar.</p>}
          {resultado.excecoes.length ? <p>{n(resultado.excecoes.length)} ficaram de fora: veja os motivos abaixo.</p> : <p>Nenhuma exceção.</p>}
          {resultado.excecoes.length > 0 && <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5">{resultado.excecoes.slice(0, 200).map((x, i) => <li key={`${i}-${x.casoId}`}>{linhaDeExcecao(x)}</li>)}</ul>}
        </Aviso>
      )}
      {previa && (
        <div className="space-y-3">
          {acao === "aprovar" ? (
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Contagem valor={previa.aprovaveis.length} rotulo="casos aprováveis" /><Contagem valor={previa.excecoes.length} rotulo="exceções (ficam de fora)" />
              <Contagem valor={previa.itensAfetados} rotulo="itens afetados" /><Contagem valor={previa.camposAfetados} rotulo="campos alterados" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Contagem valor={previa.abertos.length} rotulo={acao === "pedir" ? "casos ficam aguardando informação" : "casos serão rejeitados"} />
            </div>
          )}
          {acao === "aprovar" && previa.aprovaveis.length > 0 && (
            <div className="max-h-64 overflow-auto border border-foreground/30 bg-card">
              <table className="w-full text-xs" aria-label="Casos que serão aprovados">
                <thead className="sticky top-0 bg-muted text-left text-muted-foreground"><tr><th scope="col" className="px-2 py-1">Item</th><th scope="col">Tipo</th><th scope="col" className="text-right">Itens</th><th scope="col" className="px-2">Campos afetados</th></tr></thead>
                <tbody>{previa.aprovaveis.slice(0, 200).map((a) => <tr key={a.casoId} className="border-t border-border/60"><td className="px-2 py-1">{identificacaoDoCaso(a) || ROTULO_CAMADA[a.camada]}</td><td>{rotuloTipoCaso(a.tipo)}</td><td className="text-right tabular-nums">{n(a.itens)}</td><td className="px-2">{a.campos.length ? a.campos.map(rotuloDoCampo).join(", ") : "nenhum (só alerta)"}</td></tr>)}</tbody>
              </table>
              {previa.aprovaveis.length > 200 && <p className="px-2 py-1 text-xs text-muted-foreground">Mostrando 200 de {n(previa.aprovaveis.length)}.</p>}
            </div>
          )}
          {acao === "aprovar" && previa.excecoes.length > 0 && (
            <div><h4 className="text-sm font-semibold">Exceções: decida estes casos à parte</h4>
              <ul className="max-h-40 list-disc overflow-auto pl-5 text-sm">{previa.excecoes.slice(0, 200).map((x, i) => <li key={`${i}-${x.casoId}`}>{linhaDeExcecao(x)}</li>)}</ul></div>
          )}
          <button type="button" className={acao === "rejeitar" ? botaoPerigo : botaoPrimario} disabled={!pode || ocupado || alvos.length === 0 || (cfg.obrigatorio && !texto.trim())} title={razao || (cfg.obrigatorio && !texto.trim() ? "Escreva o texto comum antes." : undefined)} onClick={executar}>
            {`${cfg.rotulo} ${n(alvos.length)} caso(s)`}
          </button>
        </div>
      )}
    </section>
  );
}

const FILTRO_PADRAO = { camada: "", situacao: "ABERTOS", tipo: "", origem: "" };
/** Código da linha: o do item; no caso de conjunto, "N itens" e o primeiro código. */
const codigoDaLinha = (c) => (c.qtdItens > 1 ? `${n(c.qtdItens)} itens${c.item?.codigo ? ` (1º: ${c.item.codigo})` : ""}` : c.item?.codigo || "");

/** Colunas da lista agrupada: uma linha por grupo de casos iguais (camada, tipo, grupo do item e proposta). */
const COLUNAS_AGRUPADAS = [
  { chave: "camada", rotulo: "Camada", largura: 128, fixa: true, valor: (g) => ROTULO_CAMADA[g.camada] || g.camada },
  { chave: "tipo", rotulo: "Tipo", largura: 190, valor: (g) => rotuloTipoCaso(g.tipo) },
  { chave: "grupo", rotulo: "Grupo", largura: 120, valor: grupoDoGrupoDeCasos },
  { chave: "problema", rotulo: "Problema", largura: 170, elastica: true, valor: problemaDoGrupoDeCasos, render: (g) => <TextoLongo texto={problemaDoGrupoDeCasos(g)} largura="max-w-full" /> },
  { chave: "proposta", rotulo: "Proposta", largura: 150, elastica: true, valor: (g) => textoDaPropostaDoGrupo(g.proposta), render: (g) => <TextoLongo texto={textoDaPropostaDoGrupo(g.proposta)} largura="max-w-full" /> },
  { chave: "casos", rotulo: "Casos", largura: 64, tipo: "numero", alinhar: "direita" },
  { chave: "itens", rotulo: "Itens", largura: 64, tipo: "numero", alinhar: "direita" },
  { chave: "situacao", rotulo: "Situação", largura: 128, valor: (g) => textoDasSituacoesDoGrupo(g.situacoes), render: (g) => { const s = situacaoUnicaDoGrupo(g.situacoes); return s ? <SeloTexto situacao={s}>{rotuloSituacaoCaso(s)}</SeloTexto> : textoDasSituacoesDoGrupo(g.situacoes); } },
];
const COLUNAS_DO_GRUPO = [
  { chave: "codigo", rotulo: "Código", largura: 110, fixa: true, valor: codigoDaLinha },
  { chave: "descricao", rotulo: "Descrição", largura: 170, elastica: true, valor: (c) => c.item?.descricao || "" },
  { chave: "problema", rotulo: "Problema", largura: 150, elastica: true, valor: (c) => textoLegivel(c.problema), render: (c) => <TextoLongo texto={textoLegivel(c.problema)} largura="max-w-full" /> },
  { chave: "situacao", rotulo: "Situação", largura: 116, valor: (c) => rotuloSituacaoCaso(c.situacao), render: (c) => <SeloTexto situacao={c.situacao}>{rotuloSituacaoCaso(c.situacao)}</SeloTexto> },
];

/** Detalhe de um grupo de casos iguais: o que o grupo tem em comum, o botão do lote (com todos os casos do grupo) e a lista dos casos. */
export function DetalheDoGrupo({ grupo, dados, carregando, erro, aoTentar, aoAbrirCaso, aoDecidir, aoFechar }) {
  const { pode, razao } = usePodeAlterar();
  const g = dados?.grupo || grupo;
  const casos = dados?.casos || [];
  const todos = dados?.grupo?.todosIds || [];
  return (
    <section aria-label="Grupo de casos" className={`space-y-3 ${quadroCls}`}>
      <div className={`-mx-3 -mt-3 mb-2 flex items-center justify-between ${faixaQuadroCls}`}><h3 className="text-sm font-semibold text-foreground">Grupo de casos iguais</h3><button type="button" className={`${botaoSecundario} bg-card`} onClick={aoFechar}>Fechar</button></div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Camada</dt><dd>{ROTULO_CAMADA[g.camada] || g.camada}</dd>
        <dt className="text-muted-foreground">Tipo</dt><dd>{rotuloTipoCaso(g.tipo)}</dd>
        <dt className="text-muted-foreground">Grupo</dt><dd>{grupoDoGrupoDeCasos(g)}</dd>
        <dt className="text-muted-foreground">Problema</dt><dd>{problemaDoGrupoDeCasos(g)}</dd>
        <dt className="text-muted-foreground">Proposta</dt><dd>{textoDaPropostaDoGrupo(g.proposta)}</dd>
        {g.atual && Object.keys(g.atual).length > 0 && <><dt className="text-muted-foreground">Valor atual</dt><dd>{textoDoValor(g.atual)}</dd></>}
        <dt className="text-muted-foreground">Casos e itens</dt><dd>{n(g.casos)} caso(s), {n(g.itens)} item(ns)</dd>
        <dt className="text-muted-foreground">Situação</dt><dd>{textoDasSituacoesDoGrupo(g.situacoes)}</dd>
      </dl>
      <button type="button" className={botaoPrimario} disabled={!pode || !todos.length} title={!pode ? razao : "Abre a decisão em lote com todos os casos deste grupo"} onClick={() => aoDecidir(todos, g)}>
        {`Decidir os ${n(todos.length || g.casos)} caso(s) do grupo em lote…`}
      </button>
      {erro ? <EstadoErro erro={erro} aoTentar={aoTentar} texto="Não foi possível carregar os casos do grupo." />
        : carregando ? <EstadoCarregando texto="Carregando os casos do grupo…" />
          : (
            <TabelaDensa id="saneamento-estoques-casos-do-grupo" ariaLabel="Casos do grupo" colunas={COLUNAS_DO_GRUPO} linhas={casos} chaveLinha={(c) => c.id} vazio="Nenhum caso neste grupo."
              contador={`${n(casos.length)} caso(s)${casos.length < g.casos ? ` de ${n(g.casos)} (os primeiros)` : ""}. Clique num caso para abrir.`} aoClicarLinha={(c) => aoAbrirCaso(c.id)} alturaCls="max-h-[40vh]" />
          )}
    </section>
  );
}

/** Quantas páginas a mais a lista busca sozinha para achar casos da fase (com "Todas da fase"); depois, só pelo botão. */
const PAGINAS_EXTRAS_DA_FASE = 5;

/**
 * Casos: lista filtrada no servidor (o plano de ajustes é o filtro "em aberto"), agrupada ou um a um, detalhe do caso e decisão em lote.
 * `camadasPermitidas` (aba Casos de cada fase): o filtro de camada só oferece as camadas da fase e "Todas da fase" mostra só os casos
 * delas. O servidor filtra uma camada por vez; em "Todas da fase" a lista é filtrada aqui, a contagem é a do que já foi carregado e a
 * decisão em lote sem marcação fica desligada (escolha uma camada ou marque as linhas), para nunca decidir casos da outra fase.
 */
export default function Casos({ projeto, recorte, casoInicial, agruparInicial = true, camadasPermitidas = null }) {
  const qc = useQueryClient();
  const { pode, razao } = usePodeAlterar();
  const [filtro, setFiltro] = useState(() => ({ camada: recorte?.camada && (!camadasPermitidas || camadasPermitidas.includes(recorte.camada)) ? recorte.camada : "", situacao: recorte?.situacao || "ABERTOS", tipo: "", origem: "", grupo: recorte?.grupo || "" }));
  const [agrupar, setAgrupar] = useState(agruparInicial);
  const [aberto, setAberto] = useState(casoInicial || null);
  const [grupoAberto, setGrupoAberto] = useState(null); // a linha (grupo) aberta à direita
  const [marcados, setMarcados] = useState(() => new Set());
  const [lote, setLote] = useState(false);
  const [loteDoGrupo, setLoteDoGrupo] = useState(null); // { ids, descricao }: lote com os casos de grupos escolhidos
  const [buscandoIds, setBuscandoIds] = useState(false);
  const [erroIds, setErroIds] = useState(null);
  const [semProximo, setSemProximo] = useState(false);
  const fecharLote = () => { setLote(false); setLoteDoGrupo(null); setErroIds(null); };
  // Trocar o filtro (ou o agrupamento) muda o recorte: o painel do lote (e o resultado anterior) fecha.
  const trocarFiltro = (f) => { setFiltro(f); setMarcados(new Set()); fecharLote(); setGrupoAberto(null); };
  const mudar = (k) => (e) => trocarFiltro({ ...filtro, [k]: e.target.value, ...(k === "camada" ? { tipo: "" } : {}) });
  const trocarAgrupar = (v) => { setAgrupar(v); setMarcados(new Set()); fecharLote(); setGrupoAberto(null); };

  const q = useInfiniteQuery({
    queryKey: chaves.casos(projeto.id, filtro),
    queryFn: ({ pageParam }) => san.casos(projeto.id, montarFiltroCasos(filtro, { cursor: pageParam })),
    initialPageParam: undefined,
    getNextPageParam: (u) => u.proximo || undefined,
    gcTime: 60_000,
    enabled: !agrupar,
  });
  const qg = useInfiniteQuery({
    queryKey: chaves.casosAgrupados(projeto.id, filtro),
    queryFn: ({ pageParam }) => san.casosAgrupados(projeto.id, montarFiltroCasos(filtro, { cursor: pageParam })),
    initialPageParam: undefined,
    getNextPageParam: (u) => u.proximo || undefined,
    gcTime: 60_000,
    enabled: agrupar,
  });
  const qd = useQuery({
    queryKey: chaves.grupoDeCasos(projeto.id, filtro, grupoAberto?.chave),
    queryFn: () => san.casosAgrupados(projeto.id, { ...montarFiltroCasos(filtro, { limite: 1 }), chave: grupoAberto.chave }),
    enabled: agrupar && !!grupoAberto,
    gcTime: 60_000,
  });
  const ativa = agrupar ? qg : q;
  // "Todas da fase": o servidor devolve todas as camadas; ficam só as da fase.
  const soDaFase = !!camadasPermitidas && !filtro.camada;
  const daFase = (x) => !soDaFase || camadasPermitidas.includes(x.camada);
  const casos = useMemo(() => (q.data ? q.data.pages.flatMap((p) => p.casos).filter(daFase) : []), [q.data, soDaFase, camadasPermitidas]);
  const grupos = useMemo(() => (qg.data ? qg.data.pages.flatMap((p) => p.grupos).filter(daFase) : []), [qg.data, soDaFase, camadasPermitidas]);
  const visiveis = agrupar ? grupos.length : casos.length;
  const paginasCarregadas = ativa.data?.pages?.length || 0;
  useEffect(() => {
    // Poucas linhas da fase na primeira leva: busca mais algumas páginas sozinha (o resto, pelo botão Carregar mais).
    if (soDaFase && visiveis < 50 && ativa.hasNextPage && !ativa.isFetchingNextPage && paginasCarregadas <= PAGINAS_EXTRAS_DA_FASE) ativa.fetchNextPage();
  }, [soDaFase, visiveis, ativa, paginasCarregadas]);
  const casosDoGrupo = qd.data?.casos || [];
  const tipos = ativa.data?.pages?.[0]?.tipos;
  const total = tipos && !soDaFase ? tipos.filter((t) => !filtro.tipo || t.tipo === filtro.tipo).reduce((s, t) => s + t.n, 0) : null;

  const colunas = useMemo(() => [
    { chave: "codigo", rotulo: "Código", largura: 110, fixa: true, valor: codigoDaLinha },
    { chave: "descricao", rotulo: "Descrição", largura: 170, elastica: true, valor: (c) => c.item?.descricao || "" },
    { chave: "grupo", rotulo: "Grupo", largura: 100, valor: (c) => c.item?.grupo || "" },
    { chave: "problema", rotulo: "Problema", largura: 150, elastica: true, valor: (c) => textoLegivel(c.problema), render: (c) => <TextoLongo texto={textoLegivel(c.problema)} largura="max-w-full" /> },
    { chave: "qtdItens", rotulo: "Itens", largura: 56, tipo: "numero", alinhar: "direita" },
    { chave: "situacao", rotulo: "Situação", largura: 116, valor: (c) => rotuloSituacaoCaso(c.situacao), render: (c) => <SeloTexto situacao={c.situacao}>{rotuloSituacaoCaso(c.situacao)}</SeloTexto> },
    ...(filtro.camada ? [] : [{ chave: "camada", rotulo: "Camada", largura: 128, valor: (c) => ROTULO_CAMADA[c.camada] }]),
    { chave: "tipo", rotulo: "Tipo", largura: 200, oculta: true, valor: (c) => rotuloTipoCaso(c.tipo) },
    { chave: "origem", rotulo: "Origem", largura: 84, oculta: true, valor: (c) => (c.origem === "IA" ? "IA" : "Regra"), render: (c) => <Tag tom={c.origem === "IA" ? "info" : "neutro"}>{c.origem === "IA" ? "IA" : "Regra"}</Tag> },
    { chave: "parecer", rotulo: "Parecer da IA", largura: 140, oculta: true, valor: (c) => { const p = lerParecer(c); return p?.confianca ? ROTULO_CONFIANCA[p.confianca] : p ? "Com parecer" : ""; } },
  ], [filtro.camada]);
  const temFiltro = Object.keys(FILTRO_PADRAO).some((k) => filtro[k] !== FILTRO_PADRAO[k]);
  const emAberto = filtro.situacao === "ABERTOS";
  const sufixo = `${emAberto ? " em aberto" : ""}${temFiltro || filtro.grupo ? " com estes filtros" : ""}`;
  const primeiraG = qg.data?.pages?.[0];
  const contador = soDaFase
    ? `${n(visiveis)} ${agrupar ? "grupo(s)" : "caso(s)"}${emAberto ? " em aberto" : ""} desta fase carregado(s)${ativa.hasNextPage ? " (role até o fim para carregar mais)" : ""}${ativa.isFetchingNextPage ? ". Carregando mais…" : "."}`
    : agrupar
    ? [primeiraG ? `${contadorDeGrupos(primeiraG.totalGrupos, primeiraG.totalCasos)}${sufixo}` : null,
      `${n(grupos.length)} grupo(s) carregado(s)${qg.hasNextPage ? " (role até o fim para carregar mais)" : ""}`].filter(Boolean).join("; ") + (qg.isFetchingNextPage ? ". Carregando mais…" : ".")
    : [total != null ? `${n(total)} caso(s)${sufixo}` : null,
      `${n(casos.length)} carregado(s)${q.hasNextPage ? " (role até o fim para carregar mais)" : ""}`].filter(Boolean).join("; ") + (q.isFetchingNextPage ? ". Carregando mais…" : ".");
  const carregarMais = () => { if (ativa.hasNextPage && !ativa.isFetchingNextPage) ativa.fetchNextPage(); };

  const idsMarcados = [...marcados];
  const podeLote = idsMarcados.length > 0 || (!soDaFase && filtroAdmiteLote(filtro) && (total == null || total > 0));
  const descricaoLote = idsMarcados.length
    ? `${n(idsMarcados.length)} caso(s) marcado(s).`
    : `Todos os casos em aberto deste filtro${total != null && emAberto ? ` (${n(total)})` : ""}, inclusive os que a lista ainda não carregou.`;
  const recarregar = () => { atualizarTudo(qc, projeto.id); };
  const listaDoProximo = agrupar ? casosDoGrupo : casos;
  const irAoProximo = () => {
    const prox = proximoCasoAberto(listaDoProximo, aberto);
    setSemProximo(!prox);
    if (prox) setAberto(prox);
  };
  // Lote: com grupos marcados, os casos desses grupos (os ids que faltarem são pedidos ao servidor); sem marcação, o filtro inteiro.
  const abrirLote = async () => {
    setErroIds(null);
    if (!agrupar || !marcados.size) { setLoteDoGrupo(null); setLote(true); return; }
    setBuscandoIds(true);
    try {
      const ids = await idsDosGruposParaLote(grupos, marcados, async (chave) => (await san.casosAgrupados(projeto.id, { ...montarFiltroCasos(filtro, { limite: 1 }), chave })).grupo.todosIds);
      setLote(false);
      setLoteDoGrupo({ ids, descricao: `${n(ids.length)} caso(s) de ${n(marcados.size)} grupo(s) marcado(s).` });
    } catch (e) { setErroIds(mensagemDeErro(e)); } finally { setBuscandoIds(false); }
  };
  const decidirGrupo = (ids, g) => { setLote(false); setLoteDoGrupo({ ids, descricao: descricaoDoLoteDoGrupo(g, ids.length) }); };
  const aoMudouLote = () => { setMarcados(new Set()); recarregar(); };

  const painelDireito = () => {
    if (aberto) {
      return (
        <div className="space-y-2">
          {agrupar && grupoAberto && <button type="button" className={botaoSecundario} onClick={() => { setAberto(null); setSemProximo(false); }}>Voltar ao grupo</button>}
          <CasoDetalhe key={aberto} projeto={projeto} casoId={aberto} aoIrAoProximo={irAoProximo} aoMudou={recarregar} grupoDoRecorte={filtro.grupo || null} />
        </div>
      );
    }
    if (agrupar && grupoAberto) {
      return <DetalheDoGrupo grupo={grupoAberto} dados={qd.data} carregando={qd.isPending} erro={qd.isError ? qd.error : null} aoTentar={() => qd.refetch()}
        aoAbrirCaso={(id) => { setAberto(id); setSemProximo(false); }} aoDecidir={decidirGrupo} aoFechar={() => setGrupoAberto(null)} />;
    }
    return agrupar
      ? <EstadoVazio titulo="Escolha um grupo">Clique numa linha para ver o que os casos do grupo têm em comum, decidir todos de uma vez ou abrir um caso.</EstadoVazio>
      : <EstadoVazio titulo="Escolha um caso">Clique numa linha para ver o item, o problema, a proposta e decidir.</EstadoVazio>;
  };
  const vazioTitulo = emAberto ? "Nenhum caso em aberto com este filtro" : "Nenhum caso com este filtro";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2" role="search" aria-label="Filtros dos casos">
        <label className="block"><Rotulo>Camada</Rotulo><select className={campoCls} value={filtro.camada} onChange={mudar("camada")}><option value="">{camadasPermitidas ? "Todas da fase" : "Todas"}</option>{(camadasPermitidas || CAMADAS).map((c) => <option key={c} value={c}>{ROTULO_CAMADA[c]}</option>)}</select></label>
        <label className="block"><Rotulo>Situação do caso</Rotulo>
          <select className={campoCls} value={filtro.situacao} onChange={mudar("situacao")}><option value="ABERTOS">Em aberto (plano de ajustes)</option><option value="">Todos</option>{Object.entries(SITUACOES_DO_CASO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="block"><Rotulo>Tipo</Rotulo>
          <select className={`${campoCls} max-w-[18rem]`} value={filtro.tipo} onChange={mudar("tipo")}><option value="">Todos</option>{opcoesDeTipo(tipos, filtro.tipo).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select></label>
        <label className="block"><Rotulo>Origem</Rotulo><select className={campoCls} value={filtro.origem} onChange={mudar("origem")}><option value="">Todas</option><option value="REGRA">Regra</option><option value="IA">IA</option></select></label>
        <label className="flex items-center gap-1.5 self-center pt-4 text-sm" title="Casos do mesmo tipo, no mesmo grupo de itens e com a mesma proposta viram uma linha só">
          <input type="checkbox" checked={agrupar} onChange={(e) => trocarAgrupar(e.target.checked)} />Agrupar casos iguais
        </label>
        {temFiltro && <button type="button" className={botaoSecundario} onClick={() => trocarFiltro({ ...FILTRO_PADRAO, grupo: filtro.grupo })}>Limpar filtros</button>}
        <button type="button" className={botaoPrimario} disabled={!pode || !podeLote || buscandoIds} title={!pode ? razao : soDaFase && !idsMarcados.length ? "Escolha uma camada desta fase, ou marque linhas na tabela, para decidir em lote" : agrupar ? "Marque grupos na tabela, ou decida todos os casos em aberto do filtro" : "Marque casos na tabela, ou decida todos os casos em aberto do filtro"} onClick={abrirLote}>{buscandoIds ? "Juntando os casos…" : "Decidir em lote…"}</button>
        <PlanilhaDecisao projeto={projeto} camada={filtro.camada} camadas={camadasPermitidas} aoMudou={recarregar} />
      </div>
      {filtro.grupo && (
        <Aviso titulo="Recorte da visão geral" acao={<button type="button" className={botaoSecundario} onClick={() => trocarFiltro({ ...filtro, grupo: "" })}>Tirar o recorte</button>}>
          Grupo <strong>{filtro.grupo}</strong>{filtro.camada ? <> na camada <strong>{ROTULO_CAMADA[filtro.camada]}</strong></> : null}.
        </Aviso>
      )}
      {erroIds && <Aviso tom="erro">{erroIds}</Aviso>}
      {loteDoGrupo && <PainelDeLote key={loteDoGrupo.ids.slice(0, 20).join("|")} projeto={projeto} ids={loteDoGrupo.ids} filtro={filtro} descricao={loteDoGrupo.descricao} aoFechar={fecharLote} aoMudou={aoMudouLote} />}
      {lote && !loteDoGrupo && <PainelDeLote projeto={projeto} ids={agrupar ? [] : idsMarcados} filtro={filtro} descricao={agrupar ? `Todos os casos em aberto deste filtro${primeiraG ? ` (${n(primeiraG.totalCasos)})` : ""}, inclusive os que a lista ainda não carregou.` : descricaoLote} aoFechar={fecharLote} aoMudou={aoMudouLote} />}
      {semProximo && <Aviso>Não há mais casos em aberto na lista.</Aviso>}

      {ativa.isError ? <EstadoErro erro={ativa.error} aoTentar={() => ativa.refetch()} texto="Não foi possível carregar os casos." />
        : ativa.isPending ? <EstadoCarregando texto="Carregando os casos…" />
          : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="min-w-0 space-y-2">
                {agrupar ? (
                  grupos.length === 0 && !qg.hasNextPage ? (
                    <EstadoVazio titulo={vazioTitulo}>Troque os filtros, ou rode as análises na aba Análise da fase.</EstadoVazio>
                  ) : (
                    <TabelaDensa id="saneamento-estoques-casos-agrupados" ariaLabel="Casos agrupados" colunas={COLUNAS_AGRUPADAS} linhas={grupos} chaveLinha={(g) => g.chave} vazio="Nenhum grupo com estes filtros." contador={contador}
                      aoClicarLinha={(g) => { setGrupoAberto(g); setAberto(null); setSemProximo(false); }} linhaMarcada={(g) => g.chave === grupoAberto?.chave} selecao={{ marcadas: marcados, aoMudar: (m) => { setMarcados(m); fecharLote(); } }}
                      aoChegarAoFim={carregarMais} rodape={qg.isFetchingNextPage ? "Carregando mais grupos…" : null} />
                  )
                ) : casos.length === 0 && !q.hasNextPage ? (
                  <EstadoVazio titulo={vazioTitulo}>Troque os filtros, ou rode as análises na aba Análise da fase.</EstadoVazio>
                ) : (
                  <TabelaDensa id="saneamento-estoques-casos-v2" ariaLabel="Casos" colunas={colunas} linhas={casos} chaveLinha={(c) => c.id} vazio="Nenhum caso com estes filtros." contador={contador}
                    aoClicarLinha={(c) => { setAberto(c.id); setSemProximo(false); }} linhaMarcada={(c) => c.id === aberto} selecao={{ marcadas: marcados, aoMudar: (m) => { setMarcados(m); setLote(false); } }}
                    aoChegarAoFim={carregarMais} rodape={q.isFetchingNextPage ? "Carregando mais casos…" : null} />
                )}
                {ativa.hasNextPage && <button type="button" className={botaoSecundario} onClick={() => ativa.fetchNextPage()} disabled={ativa.isFetchingNextPage}>{ativa.isFetchingNextPage ? "Carregando…" : agrupar ? "Carregar mais grupos" : "Carregar mais casos"}</button>}
              </div>
              <div className="min-w-0">{painelDireito()}</div>
            </div>
          )}
    </div>
  );
}
