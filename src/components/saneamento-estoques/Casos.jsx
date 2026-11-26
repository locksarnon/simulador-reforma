import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import TabelaPadrao from "@/components/TabelaPadrao";
import { san, chaves, atualizarTudo } from "./api";
import CasoDetalhe from "./CasoDetalhe";
import { Aviso, botaoPrimario, botaoSecundario, campoCls, EstadoCarregando, EstadoErro, EstadoVazio, Rotulo, usePodeAlterar } from "./comuns";
import {
  CAMADAS, corpoDoLote, idsDoLote, lerParecer, loteTemEscolha, mensagemDeErro, montarFiltroCasos, proximoCasoAberto, ROTULO_CAMADA, ROTULO_CONFIANCA, rotuloDoCampo,
  rotuloDoCaso, rotuloSituacaoCaso, SITUACOES_DO_CASO, versoesDaPrevia,
} from "./logica";

/** Aprovação em lote: o recorte é exatamente o que a tela mostra (ids marcados ou os casos em aberto listados). */
function PainelDeLote({ projeto, ids, descricao, casos, aoFechar, aoAprovado }) {
  const { pode, razao } = usePodeAlterar();
  const [fundamento, setFundamento] = useState("");
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const envio = { ...corpoDoLote({ ids }), ...(fundamento.trim() ? { fundamento: fundamento.trim() } : {}) };
  const previa = useMutation({ mutationFn: () => san.lotePrevia(projeto.id, envio), onError: (e) => setErro(mensagemDeErro(e)), onSuccess: () => { setErro(null); setResultado(null); } });
  const aprovar = useMutation({
    mutationFn: () => san.loteAprovar(projeto.id, { ...envio, versoes: versoesDaPrevia(previa.data) }),
    onSuccess: (r) => { setResultado(r); setErro(null); previa.reset(); aoAprovado(); }, onError: (e) => setErro(mensagemDeErro(e)),
  });
  const p = previa.data;
  const linhaDeExcecao = (x) => `${rotuloDoCaso(casos, x.casoId)} [${String(x.casoId).slice(0, 8)}]: ${x.motivo}`;
  return (
    <section aria-label="Aprovação em lote" className="space-y-3 border border-primary/40 bg-card p-4">
      <div className="flex items-center justify-between"><h3 className="font-semibold">Aprovar em lote</h3><button type="button" className={botaoSecundario} onClick={aoFechar}>Fechar</button></div>
      <p className="text-sm text-muted-foreground">{descricao} Primeiro veja a prévia: quais itens e campos mudam e quais casos ficam de fora. Só então aprove.</p>
      <label className="block"><Rotulo>Fundamento comum (opcional)</Rotulo><input className={campoCls} value={fundamento} onChange={(e) => setFundamento(e.target.value)} /></label>
      <button type="button" className={botaoSecundario} disabled={previa.isPending || !loteTemEscolha(envio)} onClick={() => previa.mutate()}>{previa.isPending ? "Calculando…" : "Ver a prévia"}</button>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {resultado && (
        <Aviso tom={resultado.restantes ? "alerta" : "ok"} titulo={`${resultado.aprovados} caso(s) aprovado(s)`}>
          {resultado.restantes > 0 && <p>Ainda restam {resultado.restantes.toLocaleString("pt-BR")} casos: repita a prévia e a aprovação.</p>}
          {resultado.excecoes?.length ? `${resultado.excecoes.length} ficaram de fora: veja os motivos abaixo.` : "Nenhuma exceção."}
          {resultado.excecoes?.length > 0 && <ul className="mt-1 list-disc pl-5">{resultado.excecoes.slice(0, 50).map((x, n) => <li key={`${n}-${x.casoId}`}>{linhaDeExcecao(x)}</li>)}</ul>}
        </Aviso>
      )}
      {p && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="border border-border p-2"><div className="text-xl font-semibold tabular-nums">{p.aprovaveis.length}</div>casos aprováveis</div>
            <div className="border border-border p-2"><div className="text-xl font-semibold tabular-nums">{p.excecoes.length}</div>exceções (ficam de fora)</div>
            <div className="border border-border p-2"><div className="text-xl font-semibold tabular-nums">{p.itensAfetados.toLocaleString("pt-BR")}</div>itens afetados</div>
            <div className="border border-border p-2"><div className="text-xl font-semibold tabular-nums">{p.camposAfetados.toLocaleString("pt-BR")}</div>campos alterados</div>
          </div>
          {p.restantes > 0 && <Aviso tom="alerta">Ainda restam {p.restantes.toLocaleString("pt-BR")} casos além do limite do lote: repita depois.</Aviso>}
          {p.aprovaveis.length > 0 && (
            <div className="max-h-64 overflow-auto border border-border">
              <table className="w-full text-xs" aria-label="Casos que serão aprovados">
                <thead className="sticky top-0 bg-muted text-left text-muted-foreground"><tr><th scope="col" className="px-2 py-1">Camada</th><th scope="col">Tipo</th><th scope="col" className="text-right">Itens</th><th scope="col">Campos afetados</th></tr></thead>
                <tbody>{p.aprovaveis.map((a) => <tr key={a.casoId} className="border-t border-border/60"><td className="px-2 py-1">{ROTULO_CAMADA[a.camada]}</td><td>{a.tipo}</td><td className="text-right tabular-nums">{a.itens}</td><td>{a.campos.length ? a.campos.map(rotuloDoCampo).join(", ") : "nenhum (só alerta)"}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {p.excecoes.length > 0 && (
            <div><h4 className="text-sm font-semibold">Exceções: decida estes casos à parte</h4>
              <ul className="max-h-40 list-disc overflow-auto pl-5 text-sm">{p.excecoes.map((x, n) => <li key={`${n}-${x.casoId}`}>{linhaDeExcecao(x)}</li>)}</ul></div>
          )}
          <button type="button" className={botaoPrimario} disabled={!pode || aprovar.isPending || p.aprovaveis.length === 0} title={razao} onClick={() => aprovar.mutate()}>{aprovar.isPending ? "Aprovando…" : `Aprovar ${p.aprovaveis.length} caso(s)`}</button>
        </div>
      )}
    </section>
  );
}

/** Casos: lista filtrada no servidor (o plano de ajustes é o filtro "em aberto"), detalhe do caso e aprovação em lote. */
export default function Casos({ projeto, recorte, casoInicial }) {
  const qc = useQueryClient();
  const { pode, razao } = usePodeAlterar();
  const [filtro, setFiltro] = useState(() => ({ camada: recorte?.camada || "", situacao: recorte?.situacao || "ABERTOS", tipo: "", origem: "", grupo: recorte?.grupo || "" }));
  const [aberto, setAberto] = useState(casoInicial || null);
  const [marcados, setMarcados] = useState(() => new Set());
  const [lote, setLote] = useState(false);
  const [semProximo, setSemProximo] = useState(false);
  const mudar = (k) => (e) => { setFiltro((f) => ({ ...f, [k]: e.target.value })); setMarcados(new Set()); };

  const q = useInfiniteQuery({
    queryKey: chaves.casos(projeto.id, filtro),
    queryFn: ({ pageParam }) => san.casos(projeto.id, montarFiltroCasos(filtro, { cursor: pageParam })),
    initialPageParam: undefined,
    getNextPageParam: (u) => u.proximo || undefined,
    gcTime: 60_000,
  });
  const casos = useMemo(() => (q.data ? q.data.pages.flatMap((p) => p.casos) : []), [q.data]);

  const colunas = useMemo(() => [
    { chave: "camada", rotulo: "Camada", valor: (c) => ROTULO_CAMADA[c.camada] },
    { chave: "tipo", rotulo: "Tipo" },
    { chave: "problema", rotulo: "Problema", quebrar: true },
    { chave: "qtdItens", rotulo: "Itens", tipo: "numero", alinhar: "direita" },
    { chave: "situacao", rotulo: "Situação", valor: (c) => rotuloSituacaoCaso(c.situacao) },
    { chave: "origem", rotulo: "Origem", valor: (c) => (c.origem === "IA" ? "IA" : "Regra") },
    { chave: "parecer", rotulo: "Parecer da IA", valor: (c) => { const p = lerParecer(c); return p?.confianca ? ROTULO_CONFIANCA[p.confianca] : p ? "Com parecer" : ""; } },
  ], []);

  const idsLote = idsDoLote(marcados, casos);
  const descricaoLote = marcados.size
    ? `${idsLote.length} caso(s) marcado(s).`
    : `Todos os ${idsLote.length} casos em aberto que a lista mostra${q.hasNextPage ? " (a lista ainda tem mais casos não carregados: o lote vale só para os mostrados)" : ""}.`;
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
        <label className="block"><Rotulo>Origem</Rotulo><select className={campoCls} value={filtro.origem} onChange={mudar("origem")}><option value="">Todas</option><option value="REGRA">Regra</option><option value="IA">IA</option></select></label>
        <label className="block"><Rotulo>Tipo (texto exato)</Rotulo><input className={`${campoCls} w-44`} value={filtro.tipo} onChange={mudar("tipo")} placeholder="Ex.: DUPLICIDADE_EXATA" /></label>
        <button type="button" className={botaoPrimario} disabled={!pode || idsLote.length === 0} title={!pode ? razao : "Marque casos na tabela, ou use todos os casos em aberto listados"} onClick={() => setLote(true)}>Aprovar em lote…</button>
      </div>
      {filtro.grupo && (
        <Aviso titulo="Recorte da visão geral" acao={<button type="button" className={botaoSecundario} onClick={() => { setFiltro((f) => ({ ...f, grupo: "" })); setMarcados(new Set()); }}>Tirar o recorte</button>}>
          Grupo <strong>{filtro.grupo}</strong>{filtro.camada ? <> na camada <strong>{ROTULO_CAMADA[filtro.camada]}</strong></> : null}.
        </Aviso>
      )}
      {lote && <PainelDeLote projeto={projeto} ids={idsLote} descricao={descricaoLote} casos={casos} aoFechar={() => setLote(false)} aoAprovado={() => { setMarcados(new Set()); recarregar(); }} />}
      {semProximo && <Aviso>Não há mais casos em aberto na lista.</Aviso>}

      {q.isError ? <EstadoErro erro={q.error} aoTentar={() => q.refetch()} texto="Não foi possível carregar os casos." />
        : q.isPending ? <EstadoCarregando texto="Carregando os casos…" />
          : (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="min-w-0 space-y-2">
                {casos.length === 0 && !q.hasNextPage ? (
                  <EstadoVazio titulo="Nenhum caso ainda">Rode as análises pela faixa de cobertura no alto da página, ou importe o cadastro de itens.</EstadoVazio>
                ) : (
                  <TabelaPadrao id="saneamento-estoques-casos" ariaLabel="Casos" colunas={colunas} linhas={casos} chaveLinha={(c) => c.id} vazio="Nenhum caso com estes filtros." tamanhoInicial={25}
                    ordemInicial={null} aoClicarLinha={(c) => { setAberto(c.id); setSemProximo(false); }} destaqueLinha={(c) => (c.id === aberto ? "bg-primary/10" : "")} selecao={{ marcadas: marcados, aoMudar: setMarcados }} />
                )}
                {q.hasNextPage && <button type="button" className={botaoSecundario} onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>{q.isFetchingNextPage ? "Carregando…" : "Carregar mais casos"}</button>}
              </div>
              <div className="min-w-0">
                {aberto ? <CasoDetalhe key={aberto} projeto={projeto} casoId={aberto} aoIrAoProximo={irAoProximo} aoMudou={recarregar} grupoDoRecorte={filtro.grupo || null} />
                  : <EstadoVazio titulo="Escolha um caso">Clique numa linha para ver o problema, a evidência, a proposta e decidir.</EstadoVazio>}
              </div>
            </div>
          )}
    </div>
  );
}
