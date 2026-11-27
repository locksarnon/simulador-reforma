import { useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useConfirmar } from "@/components/ConfirmProvider";
import { san, chaves, atualizarTudo } from "./api";
import CasoDetalhe from "./CasoDetalhe";
import TabelaDensa from "./TabelaDensa";
import { Aviso, botaoPerigo, botaoPrimario, botaoSecundario, campoCls, EstadoCarregando, EstadoErro, EstadoVazio, faixaQuadroCls, quadroCls, Rotulo, SeloTexto, Tag, TextoLongo, usePodeAlterar } from "./comuns";
import {
  CAMADAS, corpoDoLote, fatiarIds, filtroAdmiteLote, identificacaoDoCaso, lerParecer, linhaDeExcecao, MAX_LOTE, mensagemDeErro, montarFiltroCasos, opcoesDeTipo, proximoCasoAberto,
  ROTULO_CAMADA, ROTULO_CONFIANCA, rotuloDoCampo, rotuloSituacaoCaso, rotuloTipoCaso, SITUACOES_DO_CASO, somarPrevias, textoLegivel, versoesDaPrevia,
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
function PainelDeLote({ projeto, ids, filtro, descricao, aoFechar, aoMudou }) {
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

/** Casos: lista filtrada no servidor (o plano de ajustes é o filtro "em aberto"), detalhe do caso e decisão em lote. */
export default function Casos({ projeto, recorte, casoInicial }) {
  const qc = useQueryClient();
  const { pode, razao } = usePodeAlterar();
  const [filtro, setFiltro] = useState(() => ({ camada: recorte?.camada || "", situacao: recorte?.situacao || "ABERTOS", tipo: "", origem: "", grupo: recorte?.grupo || "" }));
  const [aberto, setAberto] = useState(casoInicial || null);
  const [marcados, setMarcados] = useState(() => new Set());
  const [lote, setLote] = useState(false);
  const [semProximo, setSemProximo] = useState(false);
  // Trocar o filtro muda o recorte: o painel do lote (e o resultado anterior) fecha.
  const trocarFiltro = (f) => { setFiltro(f); setMarcados(new Set()); setLote(false); };
  const mudar = (k) => (e) => trocarFiltro({ ...filtro, [k]: e.target.value, ...(k === "camada" ? { tipo: "" } : {}) });

  const q = useInfiniteQuery({
    queryKey: chaves.casos(projeto.id, filtro),
    queryFn: ({ pageParam }) => san.casos(projeto.id, montarFiltroCasos(filtro, { cursor: pageParam })),
    initialPageParam: undefined,
    getNextPageParam: (u) => u.proximo || undefined,
    gcTime: 60_000,
  });
  const casos = useMemo(() => (q.data ? q.data.pages.flatMap((p) => p.casos) : []), [q.data]);
  const tipos = q.data?.pages?.[0]?.tipos;
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
  const contador = [
    total != null ? `${n(total)} caso(s)${emAberto ? " em aberto" : ""}${temFiltro || filtro.grupo ? " com estes filtros" : ""}` : null,
    `${n(casos.length)} carregado(s)${q.hasNextPage ? " (role até o fim para carregar mais)" : ""}`,
  ].filter(Boolean).join("; ") + (q.isFetchingNextPage ? ". Carregando mais…" : ".");
  const carregarMais = () => { if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage(); };

  const idsMarcados = [...marcados];
  const podeLote = idsMarcados.length > 0 || (filtroAdmiteLote(filtro) && (total == null || total > 0));
  const descricaoLote = idsMarcados.length
    ? `${n(idsMarcados.length)} caso(s) marcado(s).`
    : `Todos os casos em aberto deste filtro${total != null && emAberto ? ` (${n(total)})` : ""}, inclusive os que a lista ainda não carregou.`;
  const recarregar = () => { atualizarTudo(qc, projeto.id); };
  const irAoProximo = () => {
    const prox = proximoCasoAberto(casos, aberto);
    setSemProximo(!prox);
    if (prox) setAberto(prox);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2" role="search" aria-label="Filtros dos casos">
        <label className="block"><Rotulo>Camada</Rotulo><select className={campoCls} value={filtro.camada} onChange={mudar("camada")}><option value="">Todas</option>{CAMADAS.map((c) => <option key={c} value={c}>{ROTULO_CAMADA[c]}</option>)}</select></label>
        <label className="block"><Rotulo>Situação do caso</Rotulo>
          <select className={campoCls} value={filtro.situacao} onChange={mudar("situacao")}><option value="ABERTOS">Em aberto (plano de ajustes)</option><option value="">Todos</option>{Object.entries(SITUACOES_DO_CASO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="block"><Rotulo>Tipo</Rotulo>
          <select className={`${campoCls} max-w-[18rem]`} value={filtro.tipo} onChange={mudar("tipo")}><option value="">Todos</option>{opcoesDeTipo(tipos, filtro.tipo).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select></label>
        <label className="block"><Rotulo>Origem</Rotulo><select className={campoCls} value={filtro.origem} onChange={mudar("origem")}><option value="">Todas</option><option value="REGRA">Regra</option><option value="IA">IA</option></select></label>
        {temFiltro && <button type="button" className={botaoSecundario} onClick={() => trocarFiltro({ ...FILTRO_PADRAO, grupo: filtro.grupo })}>Limpar filtros</button>}
        <button type="button" className={botaoPrimario} disabled={!pode || !podeLote} title={!pode ? razao : "Marque casos na tabela, ou decida todos os casos em aberto do filtro"} onClick={() => setLote(true)}>Decidir em lote…</button>
      </div>
      {filtro.grupo && (
        <Aviso titulo="Recorte da visão geral" acao={<button type="button" className={botaoSecundario} onClick={() => trocarFiltro({ ...filtro, grupo: "" })}>Tirar o recorte</button>}>
          Grupo <strong>{filtro.grupo}</strong>{filtro.camada ? <> na camada <strong>{ROTULO_CAMADA[filtro.camada]}</strong></> : null}.
        </Aviso>
      )}
      {lote && <PainelDeLote projeto={projeto} ids={idsMarcados} filtro={filtro} descricao={descricaoLote} aoFechar={() => setLote(false)} aoMudou={() => { setMarcados(new Set()); recarregar(); }} />}
      {semProximo && <Aviso>Não há mais casos em aberto na lista.</Aviso>}

      {q.isError ? <EstadoErro erro={q.error} aoTentar={() => q.refetch()} texto="Não foi possível carregar os casos." />
        : q.isPending ? <EstadoCarregando texto="Carregando os casos…" />
          : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="min-w-0 space-y-2">
                {casos.length === 0 && !q.hasNextPage ? (
                  <EstadoVazio titulo={emAberto ? "Nenhum caso em aberto com este filtro" : "Nenhum caso com este filtro"}>Troque os filtros, ou rode as análises pela faixa de cobertura no alto da página.</EstadoVazio>
                ) : (
                  <TabelaDensa id="saneamento-estoques-casos-v2" ariaLabel="Casos" colunas={colunas} linhas={casos} chaveLinha={(c) => c.id} vazio="Nenhum caso com estes filtros." contador={contador}
                    aoClicarLinha={(c) => { setAberto(c.id); setSemProximo(false); }} linhaMarcada={(c) => c.id === aberto} selecao={{ marcadas: marcados, aoMudar: (m) => { setMarcados(m); setLote(false); } }}
                    aoChegarAoFim={carregarMais} rodape={q.isFetchingNextPage ? "Carregando mais casos…" : null} />
                )}
                {q.hasNextPage && <button type="button" className={botaoSecundario} onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>{q.isFetchingNextPage ? "Carregando…" : "Carregar mais casos"}</button>}
              </div>
              <div className="min-w-0">
                {aberto ? <CasoDetalhe key={aberto} projeto={projeto} casoId={aberto} aoIrAoProximo={irAoProximo} aoMudou={recarregar} grupoDoRecorte={filtro.grupo || null} />
                  : <EstadoVazio titulo="Escolha um caso">Clique numa linha para ver o item, o problema, a proposta e decidir.</EstadoVazio>}
              </div>
            </div>
          )}
    </div>
  );
}
