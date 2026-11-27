import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  textoDasSituacoesDoGrupo, textoDoValor, textoLegivel, tituloDoCasoAberto, tituloDoGrupoDeCasos, travaDeDecisao, versoesDaPrevia, vizinhosNaLista,
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
export function PainelDeLote({ projeto, ids, filtro, descricao, aoFechar, aoMudou, trava = null }) {
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
      {trava && <Aviso tom="bloqueio" titulo="Fase 2 ainda não liberada">{trava}</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {resultado && (
        <Aviso tom={resultado.pendentes.length || resultado.excecoes.length ? "alerta" : "ok"} titulo={`${n(resultado.feitos)} caso(s) ${ACOES_DO_LOTE[resultado.acao].resultado}`}
          acao={resultado.pendentes.length > 0 && <button type="button" className={botaoPrimario} disabled={!pode || ocupado || !!trava} title={razao || trava || undefined} onClick={() => decidir(resultado.pendentes, resultado.versoes, resultado.acao, resultado.texto)}>Continuar</button>}>
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
          <button type="button" className={acao === "rejeitar" ? botaoPerigo : botaoPrimario} disabled={!pode || !!trava || ocupado || alvos.length === 0 || (cfg.obrigatorio && !texto.trim())} title={razao || trava || (cfg.obrigatorio && !texto.trim() ? "Escreva o texto comum antes." : undefined)} onClick={executar}>
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

/**
 * Detalhe de um grupo de casos iguais: o que o grupo tem em comum (problema, grupo, proposta e situação), o botão do lote (com todos os casos
 * do grupo) e a lista dos casos. Dentro do painel sobreposto (`noPainel`), o título fica no cabeçalho do painel e o quadro vem sem faixa.
 */
export function DetalheDoGrupo({ grupo, dados, carregando, erro, aoTentar, aoAbrirCaso, aoDecidir, aoFechar, noPainel = false, trava = null }) {
  const { pode, razao } = usePodeAlterar();
  const g = dados?.grupo || grupo;
  const casos = dados?.casos || [];
  const todos = dados?.grupo?.todosIds || [];
  const titulo = tituloDoGrupoDeCasos(g);
  return (
    <section aria-label={titulo} className={noPainel ? "space-y-2" : `space-y-2 ${quadroCls}`}>
      {!noPainel && (
        <div className={`-mx-3 -mt-3 mb-2 flex items-center justify-between ${faixaQuadroCls}`}><h3 className="text-sm font-semibold text-foreground">{titulo}</h3>{aoFechar && <button type="button" className={`${botaoSecundario} bg-card`} onClick={aoFechar}>Fechar</button>}</div>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm" aria-label="O que os casos do grupo têm em comum">
        <dt className="text-muted-foreground">Problema identificado</dt><dd>{problemaDoGrupoDeCasos(g)}</dd>
        <dt className="text-muted-foreground">Grupo</dt><dd>{grupoDoGrupoDeCasos(g)}</dd>
        <dt className="text-muted-foreground">Proposta</dt><dd>{textoDaPropostaDoGrupo(g.proposta)}</dd>
        {g.atual && Object.keys(g.atual).length > 0 && <><dt className="text-muted-foreground">Valor atual</dt><dd>{textoDoValor(g.atual)}</dd></>}
        <dt className="text-muted-foreground">Situação</dt><dd>{textoDasSituacoesDoGrupo(g.situacoes)}</dd>
      </dl>
      <button type="button" className={botaoPrimario} disabled={!pode || !!trava || !todos.length} title={!pode ? razao : trava || "Abre a decisão em lote com todos os casos deste grupo"} onClick={() => aoDecidir(todos, g)}>
        {`Decidir os ${n(todos.length || g.casos)} caso(s) do grupo em lote…`}
      </button>
      {erro ? <EstadoErro erro={erro} aoTentar={aoTentar} texto="Não foi possível carregar os casos do grupo." />
        : carregando ? <EstadoCarregando texto="Carregando os casos do grupo…" />
          : (
            <TabelaDensa id="saneamento-estoques-casos-do-grupo" ariaLabel="Casos do grupo" colunas={COLUNAS_DO_GRUPO} linhas={casos} chaveLinha={(c) => c.id} vazio="Nenhum caso neste grupo."
              contador={`${n(casos.length)} caso(s)${casos.length < g.casos ? ` de ${n(g.casos)} (os primeiros)` : ""}. Clique num caso para abrir.`} aoClicarLinha={(c) => aoAbrirCaso(c.id)} alturaCls="max-h-[60vh]" />
          )}
    </section>
  );
}

const SELETOR_FOCAVEL = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const SELETOR_DIALOGO = '[role="dialog"],[role="alertdialog"]';

/** Outra janela aberta por cima do painel (confirmação, menu Colunas e outros popovers): a que está fechando (animação) não conta. */
const outraJanelaAberta = (painel, doc) => [...doc.querySelectorAll(SELETOR_DIALOGO)].some((d) => d !== painel && !d.contains(painel) && d.getAttribute("data-state") !== "closed");

/**
 * O Esc fecha o painel? Não quando quem está por cima já tratou o Esc (o popover do menu Colunas marca o evento) ou quando há outra janela
 * aberta por cima (a confirmação ou um popover): ela fecha primeiro.
 */
export function escFechaOPainel(e, painel, doc = document) {
  if (e?.key !== "Escape" || e.defaultPrevented || !painel) return false;
  return !outraJanelaAberta(painel, doc);
}

/**
 * O foco escapou do painel? Sem foco (o botão focado sumiu ao trocar de caso), num botão desligado (Próximo no fim da lista) ou fora do
 * painel. O foco dentro de outra janela por cima (confirmação, popover) não é fuga.
 */
export function focoForaDoPainel(painel, ativo, doc = document) {
  if (!painel) return false;
  if (!ativo || ativo === doc.body || ativo === doc.documentElement) return true;
  if (ativo.disabled) return true;
  if (painel === ativo || painel.contains(ativo)) return false;
  return !ativo.closest?.(SELETOR_DIALOGO);
}

/**
 * Painel largo sobre a tabela dos casos: ocupa 70% da tela pela direita, na altura toda, com rolagem própria; a tabela fica escurecida atrás.
 * Cabeçalho com o título, a posição na lista carregada, Anterior, Próximo e Fechar (Esc também fecha, salvo com uma confirmação ou um
 * popover aberto por cima). Ao abrir, o foco vai ao painel; o Tab circula dentro dele e o foco que sai dele (ou que some ao trocar de caso,
 * `chave`) volta para ele; ao fechar, o foco volta para onde estava. Sem portal: igual na tela e nos testes.
 */
export function PainelSobreposto({ titulo, posicao, aoAnterior, aoProximo, aoFechar, acoes, chave = null, children }) {
  const ref = useRef(null);
  const tituloId = useId();
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  useEffect(() => {
    const antes = document.activeElement;
    ref.current?.focus();
    // Na fase de bolha da janela: o popover (que escuta o Esc no documento, na captura) trata o Esc dele antes.
    const tecla = (e) => { if (escFechaOPainel(e, ref.current)) fechar.current?.(); };
    const foco = (e) => { if (ref.current && focoForaDoPainel(ref.current, e.target)) ref.current.focus(); };
    window.addEventListener("keydown", tecla);
    document.addEventListener("focusin", foco);
    return () => {
      window.removeEventListener("keydown", tecla);
      document.removeEventListener("focusin", foco);
      if (antes?.isConnected && typeof antes.focus === "function") antes.focus();
    };
  }, []);
  // Trocou o caso ou o grupo (Anterior, Próximo, "Aprovar e ir ao próximo"): o botão focado pode ter sumido ou ficado desligado.
  useEffect(() => {
    if (ref.current && focoForaDoPainel(ref.current, document.activeElement)) ref.current.focus();
  }, [chave]);
  const prenderTab = (e) => {
    if (e.key !== "Tab" || !ref.current) return;
    const f = [...ref.current.querySelectorAll(SELETOR_FOCAVEL)];
    if (!f.length) return;
    const atual = document.activeElement;
    if (e.shiftKey && (atual === f[0] || atual === ref.current)) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && atual === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  };
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1} onKeyDown={prenderTab}
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-background shadow-xl focus:outline-none sm:w-[70vw]">
        <header className={`flex flex-wrap items-center gap-2 ${faixaQuadroCls}`}>
          <div className="min-w-0 flex-1">
            <h2 id={tituloId} className="truncate text-sm font-semibold text-foreground" title={titulo}>{titulo}</h2>
            {posicao && <p className="text-xs text-muted-foreground">{posicao}</p>}
          </div>
          {acoes}
          <button type="button" className={`${botaoSecundario} bg-card`} disabled={!aoAnterior} onClick={aoAnterior || undefined} aria-label="Anterior da lista">Anterior</button>
          <button type="button" className={`${botaoSecundario} bg-card`} disabled={!aoProximo} onClick={aoProximo || undefined} aria-label="Próximo da lista">Próximo</button>
          <button type="button" className={`${botaoSecundario} bg-card`} onClick={aoFechar} aria-label="Fechar o painel (Esc)">Fechar</button>
        </header>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">{children}</div>
      </div>
    </div>
  );
}

/**
 * Casos: lista filtrada no servidor (o plano de ajustes é o filtro "em aberto"), agrupada ou um a um, detalhe do caso e decisão em lote.
 * `camadasPermitidas` (aba Casos de cada fase): o filtro de camada só oferece as camadas da fase e "Todas da fase" mostra só os casos
 * delas: o servidor recebe a lista de camadas da fase, então a contagem e a decisão em lote valem só para a fase.
 */
export default function Casos({ projeto, recorte, casoInicial, aoUsarCasoInicial, aoTirarRecorte, agruparInicial = true, camadasPermitidas = null, bloqueioFase2 = null }) {
  const qc = useQueryClient();
  const { pode, razao } = usePodeAlterar();
  const [filtro, setFiltro] = useState(() => ({ camada: recorte?.camada && (!camadasPermitidas || camadasPermitidas.includes(recorte.camada)) ? recorte.camada : "", situacao: recorte?.situacao || "ABERTOS", tipo: "", origem: "", grupo: recorte?.grupo || "" }));
  // O caso pedido (Tabela > Abrir o caso) abre na lista de um caso por linha: Anterior, Próximo e a posição andam nos casos da camada.
  const [agrupar, setAgrupar] = useState(casoInicial ? false : agruparInicial);
  // O caso pedido vale uma vez: a página o esquece assim que ele abre (voltar à aba não reabre o painel).
  useEffect(() => { if (casoInicial) aoUsarCasoInicial?.(); }, []);
  const [aberto, setAberto] = useState(casoInicial || null);
  const [grupoAberto, setGrupoAberto] = useState(null); // a linha (grupo) aberta no painel sobreposto
  const [ultimoCaso, setUltimoCaso] = useState(casoInicial || null); // a última linha aberta fica marcada na tabela ao fechar o painel
  const [ultimoGrupo, setUltimoGrupo] = useState(null);
  const [marcados, setMarcados] = useState(() => new Set());
  const [lote, setLote] = useState(false);
  const [loteDoGrupo, setLoteDoGrupo] = useState(null); // { ids, descricao, doGrupo }: lote com os casos de grupos escolhidos (doGrupo: aberto no painel do grupo)
  const [buscandoIds, setBuscandoIds] = useState(false);
  const [erroIds, setErroIds] = useState(null);
  const [semProximo, setSemProximo] = useState(false);
  const fecharLote = () => { setLote(false); setLoteDoGrupo(null); setErroIds(null); };
  // Trocar o filtro (ou o agrupamento) muda o recorte: o painel do lote (e o resultado anterior) fecha.
  const trocarFiltro = (f) => { setFiltro(f); setMarcados(new Set()); fecharLote(); setGrupoAberto(null); };
  const mudar = (k) => (e) => trocarFiltro({ ...filtro, [k]: e.target.value, ...(k === "camada" ? { tipo: "" } : {}) });
  // "Todas da fase": o servidor recebe as camadas da fase separadas por vírgula (lista, contagem e lote só da fase).
  const filtroSrv = useMemo(() => (camadasPermitidas && !filtro.camada ? { ...filtro, camada: camadasPermitidas.join(",") } : filtro), [filtro, camadasPermitidas]);
  const trocarAgrupar = (v) => { setAgrupar(v); setMarcados(new Set()); fecharLote(); setGrupoAberto(null); };

  const q = useInfiniteQuery({
    queryKey: chaves.casos(projeto.id, filtroSrv),
    queryFn: ({ pageParam }) => san.casos(projeto.id, montarFiltroCasos(filtroSrv, { cursor: pageParam })),
    initialPageParam: undefined,
    getNextPageParam: (u) => u.proximo || undefined,
    gcTime: 60_000,
    enabled: !agrupar,
  });
  const qg = useInfiniteQuery({
    queryKey: chaves.casosAgrupados(projeto.id, filtroSrv),
    queryFn: ({ pageParam }) => san.casosAgrupados(projeto.id, montarFiltroCasos(filtroSrv, { cursor: pageParam })),
    initialPageParam: undefined,
    getNextPageParam: (u) => u.proximo || undefined,
    gcTime: 60_000,
    enabled: agrupar,
  });
  const qd = useQuery({
    queryKey: chaves.grupoDeCasos(projeto.id, filtroSrv, grupoAberto?.chave),
    queryFn: () => san.casosAgrupados(projeto.id, { ...montarFiltroCasos(filtroSrv, { limite: 1 }), chave: grupoAberto.chave }),
    enabled: agrupar && !!grupoAberto,
    gcTime: 60_000,
  });
  const ativa = agrupar ? qg : q;
  const casos = useMemo(() => (q.data ? q.data.pages.flatMap((p) => p.casos) : []), [q.data]);
  const grupos = useMemo(() => (qg.data ? qg.data.pages.flatMap((p) => p.grupos) : []), [qg.data]);
  const casosDoGrupo = qd.data?.casos || [];
  const tipos = ativa.data?.pages?.[0]?.tipos;
  const total = tipos ? tipos.filter((t) => !filtro.tipo || t.tipo === filtro.tipo).reduce((s, t) => s + t.n, 0) : null;

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
  const contador = agrupar
    ? [primeiraG ? `${contadorDeGrupos(primeiraG.totalGrupos, primeiraG.totalCasos)}${sufixo}` : null,
      `${n(grupos.length)} grupo(s) carregado(s)${qg.hasNextPage ? " (role até o fim para carregar mais)" : ""}`].filter(Boolean).join("; ") + (qg.isFetchingNextPage ? ". Carregando mais…" : ".") + " Clique numa linha para abrir."
    : [total != null ? `${n(total)} caso(s)${sufixo}` : null,
      `${n(casos.length)} carregado(s)${q.hasNextPage ? " (role até o fim para carregar mais)" : ""}`].filter(Boolean).join("; ") + (q.isFetchingNextPage ? ". Carregando mais…" : ".") + " Clique numa linha para abrir.";
  const carregarMais = () => { if (ativa.hasNextPage && !ativa.isFetchingNextPage) ativa.fetchNextPage(); };

  const idsMarcados = [...marcados];
  const podeLote = idsMarcados.length > 0 || (filtroAdmiteLote(filtroSrv) && (total == null || total > 0));
  const descricaoLote = idsMarcados.length
    ? `${n(idsMarcados.length)} caso(s) marcado(s).`
    : `Todos os casos em aberto deste filtro${total != null && emAberto ? ` (${n(total)})` : ""}, inclusive os que a lista ainda não carregou.`;
  const recarregar = () => { atualizarTudo(qc, projeto.id); };
  // Fase 2 ainda não liberada: as decisões das camadas travadas ficam desligadas (o servidor as recusaria).
  const travaDoLote = travaDeDecisao(bloqueioFase2, filtro.camada || camadasPermitidas || []);
  const travaDoGrupo = grupoAberto ? travaDeDecisao(bloqueioFase2, grupoAberto.camada) : null;
  const listaDoProximo = agrupar ? casosDoGrupo : casos;
  const abrirCaso = (id) => { setAberto(id); setUltimoCaso(id); setSemProximo(false); };
  const abrirGrupo = (g) => {
    if (loteDoGrupo?.doGrupo) fecharLote();
    setGrupoAberto(g); setUltimoGrupo(g.chave); setAberto(null); setSemProximo(false);
  };
  const fecharPainel = () => { if (loteDoGrupo?.doGrupo) fecharLote(); setAberto(null); setGrupoAberto(null); setSemProximo(false); };
  const irAoProximo = () => {
    const prox = proximoCasoAberto(listaDoProximo, aberto);
    setSemProximo(!prox);
    if (prox) { setAberto(prox); setUltimoCaso(prox); }
  };
  // Lote: com grupos marcados, os casos desses grupos (os ids que faltarem são pedidos ao servidor); sem marcação, o filtro inteiro.
  const abrirLote = async () => {
    setErroIds(null);
    if (!agrupar || !marcados.size) { setLoteDoGrupo(null); setLote(true); return; }
    setBuscandoIds(true);
    try {
      const ids = await idsDosGruposParaLote(grupos, marcados, async (chave) => (await san.casosAgrupados(projeto.id, { ...montarFiltroCasos(filtroSrv, { limite: 1 }), chave })).grupo.todosIds);
      setLote(false);
      setLoteDoGrupo({ ids, descricao: `${n(ids.length)} caso(s) de ${n(marcados.size)} grupo(s) marcado(s).` });
    } catch (e) { setErroIds(mensagemDeErro(e)); } finally { setBuscandoIds(false); }
  };
  // O lote de um grupo abre dentro do painel do grupo, onde a pessoa está.
  const decidirGrupo = (ids, g) => { setLote(false); setLoteDoGrupo({ ids, descricao: descricaoDoLoteDoGrupo(g, ids.length), doGrupo: true }); };
  const aoMudouLote = () => { setMarcados(new Set()); recarregar(); };

  /** O painel sobreposto: o caso aberto (Anterior e Próximo andam na lista carregada ou nos casos do grupo) ou o grupo aberto (andam nos grupos). */
  const painel = () => {
    if (aberto) {
      const viz = vizinhosNaLista(listaDoProximo, aberto);
      const linha = listaDoProximo.find((c) => c.id === aberto);
      return (
        <PainelSobreposto chave={aberto} titulo={tituloDoCasoAberto(linha)} posicao={viz.posicao ? `Caso ${n(viz.posicao)} de ${n(viz.total)} ${agrupar ? "carregados deste grupo" : "carregados"}` : null}
          aoAnterior={viz.anterior ? () => abrirCaso(viz.anterior) : null} aoProximo={viz.proximo ? () => abrirCaso(viz.proximo) : null} aoFechar={fecharPainel}
          acoes={agrupar && grupoAberto ? <button type="button" className={`${botaoSecundario} bg-card`} onClick={() => { setAberto(null); setSemProximo(false); }}>Voltar ao grupo</button> : null}>
          {semProximo && <Aviso>Não há mais casos em aberto na lista.</Aviso>}
          <CasoDetalhe key={aberto} projeto={projeto} casoId={aberto} aoIrAoProximo={irAoProximo} aoMudou={recarregar} grupoDoRecorte={filtro.grupo || null} bloqueioFase2={bloqueioFase2} />
        </PainelSobreposto>
      );
    }
    if (agrupar && grupoAberto) {
      const viz = vizinhosNaLista(grupos, grupoAberto.chave, (g) => g.chave);
      const ir = (chave) => () => abrirGrupo(grupos.find((g) => g.chave === chave));
      return (
        <PainelSobreposto chave={grupoAberto.chave} titulo={tituloDoGrupoDeCasos(qd.data?.grupo || grupoAberto)} posicao={viz.posicao ? `Grupo ${n(viz.posicao)} de ${n(viz.total)} carregados` : null}
          aoAnterior={viz.anterior ? ir(viz.anterior) : null} aoProximo={viz.proximo ? ir(viz.proximo) : null} aoFechar={fecharPainel}>
          {loteDoGrupo?.doGrupo && <PainelDeLote key={loteDoGrupo.ids.slice(0, 20).join("|")} projeto={projeto} ids={loteDoGrupo.ids} filtro={filtroSrv} descricao={loteDoGrupo.descricao} aoFechar={fecharLote} aoMudou={aoMudouLote} trava={travaDoGrupo} />}
          <DetalheDoGrupo noPainel trava={travaDoGrupo} grupo={grupoAberto} dados={qd.data} carregando={qd.isPending} erro={qd.isError ? qd.error : null} aoTentar={() => qd.refetch()}
            aoAbrirCaso={abrirCaso} aoDecidir={decidirGrupo} />
        </PainelSobreposto>
      );
    }
    return null;
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
        <button type="button" className={botaoPrimario} disabled={!pode || !podeLote || buscandoIds || !!travaDoLote} title={!pode ? razao : travaDoLote || (agrupar ? "Marque grupos na tabela, ou decida todos os casos em aberto do filtro" : "Marque casos na tabela, ou decida todos os casos em aberto do filtro")} onClick={abrirLote}>{buscandoIds ? "Juntando os casos…" : "Decidir em lote…"}</button>
        <PlanilhaDecisao projeto={projeto} camada={filtro.camada} camadas={camadasPermitidas} aoMudou={recarregar} bloqueioFase2={bloqueioFase2} />
      </div>
      {filtro.grupo && (
        <Aviso titulo="Recorte da visão geral" acao={<button type="button" className={botaoSecundario} onClick={() => { trocarFiltro({ ...filtro, grupo: "" }); aoTirarRecorte?.(); }}>Tirar o recorte</button>}>
          Grupo <strong>{filtro.grupo}</strong>{filtro.camada ? <> na camada <strong>{ROTULO_CAMADA[filtro.camada]}</strong></> : null}.
        </Aviso>
      )}
      {erroIds && <Aviso tom="erro">{erroIds}</Aviso>}
      {loteDoGrupo && !loteDoGrupo.doGrupo && <PainelDeLote key={loteDoGrupo.ids.slice(0, 20).join("|")} projeto={projeto} ids={loteDoGrupo.ids} filtro={filtroSrv} descricao={loteDoGrupo.descricao} aoFechar={fecharLote} aoMudou={aoMudouLote} trava={travaDoLote} />}
      {lote && !loteDoGrupo && <PainelDeLote projeto={projeto} ids={agrupar ? [] : idsMarcados} filtro={filtroSrv} descricao={agrupar ? `Todos os casos em aberto deste filtro${primeiraG ? ` (${n(primeiraG.totalCasos)})` : ""}, inclusive os que a lista ainda não carregou.` : descricaoLote} aoFechar={fecharLote} aoMudou={aoMudouLote} trava={travaDoLote} />}
      {ativa.isError ? <EstadoErro erro={ativa.error} aoTentar={() => ativa.refetch()} texto="Não foi possível carregar os casos." />
        : ativa.isPending ? <EstadoCarregando texto="Carregando os casos…" />
          : (
            <div className="min-w-0 space-y-2">
              {agrupar ? (
                grupos.length === 0 && !qg.hasNextPage ? (
                  <EstadoVazio titulo={vazioTitulo}>Troque os filtros, ou rode as análises na aba Análise da fase.</EstadoVazio>
                ) : (
                  <TabelaDensa id="saneamento-estoques-casos-agrupados" ariaLabel="Casos agrupados" colunas={COLUNAS_AGRUPADAS} linhas={grupos} chaveLinha={(g) => g.chave} vazio="Nenhum grupo com estes filtros." contador={contador}
                    aoClicarLinha={abrirGrupo} linhaMarcada={(g) => g.chave === (grupoAberto?.chave ?? ultimoGrupo)} selecao={{ marcadas: marcados, aoMudar: (m) => { setMarcados(m); fecharLote(); } }}
                    aoChegarAoFim={carregarMais} rodape={qg.isFetchingNextPage ? "Carregando mais grupos…" : null} />
                )
              ) : casos.length === 0 && !q.hasNextPage ? (
                <EstadoVazio titulo={vazioTitulo}>Troque os filtros, ou rode as análises na aba Análise da fase.</EstadoVazio>
              ) : (
                <TabelaDensa id="saneamento-estoques-casos-v2" ariaLabel="Casos" colunas={colunas} linhas={casos} chaveLinha={(c) => c.id} vazio="Nenhum caso com estes filtros." contador={contador}
                  aoClicarLinha={(c) => abrirCaso(c.id)} linhaMarcada={(c) => c.id === (aberto ?? ultimoCaso)} selecao={{ marcadas: marcados, aoMudar: (m) => { setMarcados(m); setLote(false); } }}
                  aoChegarAoFim={carregarMais} rodape={q.isFetchingNextPage ? "Carregando mais casos…" : null} />
              )}
              {ativa.hasNextPage && <button type="button" className={botaoSecundario} onClick={() => ativa.fetchNextPage()} disabled={ativa.isFetchingNextPage}>{ativa.isFetchingNextPage ? "Carregando…" : agrupar ? "Carregar mais grupos" : "Carregar mais casos"}</button>}
            </div>
          )}
      {painel()}
    </div>
  );
}
