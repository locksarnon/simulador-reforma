import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Globe, Loader2, Search, Sparkles, X } from "lucide-react";
import { api } from "@/api/client";
import { Troca } from "@/components/assistente/AssistenteGlobal";
import { Trecho } from "@/components/base-legal/Trecho";
import { MAXIMO_PERGUNTA } from "@/lib/assistente";
import { decidirIa, etiquetasDoAchado, limparConsulta, MOTIVO_SEM_IA, normasConsultaveis } from "@/lib/consultaLegal";

const CLASSE_ETIQUETA = {
  vermelho: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  ambar: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
};

const Etiquetas = ({ achado }) => etiquetasDoAchado(achado).map((e) => (
  <span key={e.chave} className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${CLASSE_ETIQUETA[e.classe]}`}>{e.rotulo}</span>
));

/** Os dispositivos que a busca achou em todas as normas, com o que está revogado marcado (e por último). */
export function ResultadosDaBusca({ busca, termo, carregando = false }) {
  const exatos = busca?.exatos ?? [];
  const lista = busca?.resultados ?? [];
  return (
    <section aria-label="Dispositivos encontrados nas normas" className="space-y-3">
      <h2 className="text-sm font-medium">Dispositivos encontrados nas normas{busca ? ` (${lista.length}${lista.length >= 40 ? " ou mais" : ""})` : ""}</h2>
      {carregando && !busca && <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Buscando em todas as normas…</p>}
      {exatos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {exatos.map((e) => <Link key={e.norma.chave + e.caminho} to={`/base-legal/${e.norma.chave}/${e.caminho}`} className="botao-acao rounded-md px-3 py-[5px] text-sm text-primary hover:bg-primary/5">{e.norma.numero} — {e.rotulo}<Etiquetas achado={{ revogado: e.revogado, norma_situacao: e.norma.situacao }} /></Link>)}
        </div>
      )}
      {busca && lista.length === 0 && exatos.length === 0 && <p className="text-sm text-muted-foreground">Nada encontrado nas normas carregadas para “{termo}”. Tente outras palavras ou o número do artigo.</p>}
      {busca?.parcial && lista.length > 0 && <p className="text-xs text-muted-foreground">Poucos dispositivos trazem todas as palavras; entram também os que trazem alguma delas.</p>}
      <ul className="divide-y divide-border">
        {lista.map((r) => (
          <li key={r.chave + r.caminho} className="py-2.5">
            <Link to={`/base-legal/${r.chave}/${r.caminho}`} className={`text-sm font-medium text-primary hover:underline ${r.revogado ? "line-through opacity-70" : ""}`}>{r.numero} — {r.rotulo}</Link>
            <Etiquetas achado={r} />
            {r.secao && <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{r.secao}</p>}
            <p className="mt-1 text-sm text-muted-foreground"><Trecho texto={r.trecho} /></p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Chave({ ligada, aoMudar, desabilitada = false, titulo, icone = null, children }) {
  return (
    <button type="button" role="switch" aria-checked={ligada} onClick={aoMudar} disabled={desabilitada} title={titulo}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${ligada ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
      {icone}<span>{children}: {ligada ? "ligada" : "desligada"}</span>
    </button>
  );
}

/**
 * Consulta das Bases legais: uma caixa só que procura o texto em TODAS as normas carregadas e, com a IA ligada, também pergunta ao
 * assistente (só o texto das normas, citando o artigo; a pesquisa aprofundada acrescenta fontes oficiais da internet). A resposta
 * da IA fica guardada enquanto a pessoa navega (voltar da leitura de um artigo não pergunta de novo).
 */
export default function ConsultaBasesLegais({ inicial = "", normas = [], emailPadrao = "", sugestoes = [], aoConsultar, pedido = null }) {
  const [texto, setTexto] = useState(inicial);
  const [norma, setNorma] = useState("");
  const [usarIa, setUsarIa] = useState(true);
  const [aprofundar, setAprofundar] = useState(false);
  const [enviado, setEnviado] = useState(() => (limparConsulta(inicial).length >= 2 ? { texto: limparConsulta(inicial), norma: "", ia: true, aprofundar: false, em: Date.now() } : null));

  const consultar = (bruto, aprofundarAgora = aprofundar) => {
    const t = limparConsulta(bruto);
    if (t.length < 2) return;
    setTexto(t);
    setEnviado({ texto: t, norma, ia: usarIa, aprofundar: usarIa && aprofundarAgora, em: Date.now() });
    aoConsultar?.(t);
  };
  // Pedido de fora (o botão "Buscar dispositivos sobre o setor") preenche a caixa e consulta.
  useEffect(() => { if (pedido?.texto) consultar(pedido.texto); }, [pedido?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const ia = enviado ? decidirIa(enviado.texto, enviado.ia) : { roda: false, motivo: null };
  const { data: busca, isFetching: buscando } = useQuery({
    queryKey: ["bases-legais-busca", enviado?.texto, enviado?.norma ?? ""],
    queryFn: () => api.get("/base-legal/busca", { q: enviado.texto, ...(enviado.norma ? { norma: enviado.norma } : {}) }),
    enabled: Boolean(enviado), staleTime: 5 * 60_000,
  });
  const { data: revisados } = useQuery({
    queryKey: ["bases-legais-cartoes", enviado?.texto],
    queryFn: () => api.get("/base-legal/cartoes/busca", { q: enviado.texto }),
    enabled: Boolean(enviado) && ia.roda, staleTime: 5 * 60_000,
  });
  const resposta = useQuery({
    queryKey: ["bases-legais-ia", enviado?.texto, Boolean(enviado?.aprofundar)],
    queryFn: () => api.post(enviado.aprofundar ? "/base-legal/perguntar-aprofundado" : "/base-legal/perguntar", { pergunta: enviado.texto }),
    enabled: Boolean(enviado) && ia.roda, staleTime: Infinity, gcTime: 30 * 60_000, retry: false, refetchOnWindowFocus: false,
  });

  const consultaveis = normasConsultaveis(normas);
  const item = enviado && ia.roda ? {
    id: `consulta-${enviado.em}`, pergunta: enviado.texto, aprofundada: enviado.aprofundar, inicio: enviado.em, revisados,
    estado: resposta.isError ? "erro" : resposta.data ? "ok" : "carregando", resultado: resposta.data, erro: resposta.error?.message,
  } : null;

  return (
    <section aria-label="Consulta às bases legais" className="space-y-4 rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-4 lg:p-5">
      <div>
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Consultar as bases legais</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Uma caixa só: procura o texto em todas as normas carregadas ({consultaveis.length}) e, com a IA ligada, responde com o artigo citado. O que foi revogado aparece marcado.</p>
      </div>

      <form role="search" onSubmit={(e) => { e.preventDefault(); consultar(texto); }} className="space-y-2.5">
        <div className="flex items-stretch gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input value={texto} onChange={(e) => setTexto(e.target.value.slice(0, MAXIMO_PERGUNTA))} aria-label="Consultar as bases legais"
              placeholder="Pergunte ou busque em todas as normas"
              className="h-11 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm outline-none focus:border-primary/60" />
          </div>
          <button type="submit" disabled={limparConsulta(texto).length < 2} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {buscando || resposta.isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />} Consultar
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">Exemplos: “ouro paga IBS?”, “produtor rural limite” ou “art 164” (busca por artigo não usa a IA).</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">Em
            <select value={norma} onChange={(e) => setNorma(e.target.value)} aria-label="Norma da busca" className="h-8 max-w-[16rem] rounded-md border border-input bg-background px-2 text-xs text-foreground">
              <option value="">todas as normas</option>
              {consultaveis.map((n) => <option key={n.chave} value={n.chave}>{n.numero}</option>)}
            </select>
          </label>
          <Chave ligada={usarIa} aoMudar={() => setUsarIa((v) => !v)} titulo="O assistente responde com o artigo das normas carregadas">Resposta com IA</Chave>
          <Chave ligada={usarIa && aprofundar} aoMudar={() => setAprofundar((v) => !v)} desabilitada={!usarIa} icone={<Globe className="h-3.5 w-3.5" aria-hidden="true" />} titulo="Pesquisa também em fontes oficiais da internet (Receita, CGIBS, Planalto, tribunais). Demora mais.">
            Pesquisa aprofundada com fontes externas
          </Chave>
        </div>
      </form>

      {!enviado ? (
        sugestoes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Comece por aqui</p>
            <div className="flex flex-wrap gap-2">
              {sugestoes.map((s) => <button key={s} type="button" onClick={() => consultar(s)} className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs hover:border-primary/50 hover:bg-primary/5">{s}</button>)}
            </div>
          </div>
        )
      ) : (
        <div className="space-y-5" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">Resultados para <b>“{enviado.texto}”</b>{enviado.norma ? <> em <b>{consultaveis.find((n) => n.chave === enviado.norma)?.numero ?? enviado.norma}</b></> : " em todas as normas"}</p>
            <button type="button" onClick={() => { setEnviado(null); setTexto(""); aoConsultar?.(""); }} className="botao-acao inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-xs hover:bg-muted"><X className="h-3 w-3" aria-hidden="true" />Limpar</button>
          </div>
          {item && <Troca item={item} aoRepetir={() => resposta.refetch()} emailPadrao={emailPadrao} />}
          {!ia.roda && MOTIVO_SEM_IA[ia.motivo] && <p className="text-xs text-muted-foreground">{MOTIVO_SEM_IA[ia.motivo]}</p>}
          <ResultadosDaBusca busca={busca} termo={enviado.texto} carregando={buscando} />
        </div>
      )}
    </section>
  );
}
