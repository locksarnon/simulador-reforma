import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Eye, Loader2, RotateCcw, X } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import TabelaPadrao from "@/components/TabelaPadrao";
import {
  CLASSE_TIPO_NOVIDADE, dataHoraBr, dispositivosDaNovidade, fraseDoResumo, linksDaNovidade, ROTULO_ORIGEM_NOVIDADE, ROTULO_STATUS_NOVIDADE, ROTULO_TIPO_NOVIDADE,
} from "@/lib/novidadesLegais";

const STATUS = [["abertas", "Abertas (novas e vistas)"], ["nova", "Só as novas"], ["vista", "Vistas"], ["resolvida", "Resolvidas"], ["descartada", "Descartadas"], ["todas", "Todas"]];

function useDebounced(v, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function Selo({ valor, rotulo, destaque }) {
  return (
    <div className={`rounded-lg border p-3 ${destaque && valor > 0 ? "border-amber-500/60 bg-amber-50/60 dark:bg-amber-950/10" : "border-border bg-card"}`}>
      <p className="text-2xl font-semibold tabular-nums">{valor ?? "—"}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </div>
  );
}

/** O que a novidade diz, com os dispositivos que dá para abrir e os documentos novos de um portal. */
function Conteudo({ n }) {
  const disp = dispositivosDaNovidade(n);
  const docs = linksDaNovidade(n);
  return (
    <div className="space-y-1 min-w-[16rem]">
      <p className="font-medium text-sm">{n.titulo}</p>
      {n.resumo && <p className="text-xs text-muted-foreground">{n.resumo}</p>}
      {disp.itens.length > 0 && (
        <p className="text-xs flex flex-wrap gap-x-2 gap-y-0.5">
          {disp.itens.map((d) => <Link key={d.caminho} to={`/base-legal/${n.norma_chave}/${d.caminho}`} className="text-primary underline">{d.rotulo}</Link>)}
          {disp.restantes > 0 && <span className="text-muted-foreground">e mais {disp.restantes}</span>}
        </p>
      )}
      {docs.itens.length > 0 && (
        <ul className="text-xs space-y-0.5">
          {docs.itens.map((d) => <li key={d.url}><a href={d.url} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />{d.rotulo || d.url}</a></li>)}
          {docs.restantes > 0 && <li className="text-muted-foreground">e mais {docs.restantes}</li>}
        </ul>
      )}
    </div>
  );
}

function Acoes({ n, onAgir, ocupado }) {
  const aberta = n.status === "nova" || n.status === "vista";
  const btn = "inline-flex items-center gap-1 border border-border rounded px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-50";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {n.status === "nova" && <button type="button" className={btn} disabled={ocupado} onClick={() => onAgir(n, "visto")}><Eye className="w-3 h-3" />Vista</button>}
      {!n.confirmada && n.status !== "descartada" && <button type="button" className={btn} disabled={ocupado} onClick={() => onAgir(n, "confirmar")}><CheckCircle2 className="w-3 h-3" />Confirmar</button>}
      {aberta && <button type="button" className={btn} disabled={ocupado} onClick={() => onAgir(n, "descartar")}><X className="w-3 h-3" />Descartar</button>}
      {!aberta && <button type="button" className={btn} disabled={ocupado} onClick={() => onAgir(n, "reabrir")}><RotateCcw className="w-3 h-3" />Reabrir</button>}
    </span>
  );
}

/** A tabela das novidades; separada da busca dos dados para ser testada sem a rede. */
export function TabelaDeNovidades({ itens, admin = false, onAgir = () => {}, ocupadoId = null }) {
  const colunas = [
    { chave: "detectada_em", rotulo: "Detectada", tipo: "data", render: (n) => dataHoraBr(n.detectada_em) },
    {
      chave: "tipo", rotulo: "Tipo", valor: (n) => ROTULO_TIPO_NOVIDADE[n.tipo] || n.tipo,
      render: (n) => <span className={`text-xs rounded px-2 py-0.5 whitespace-nowrap ${CLASSE_TIPO_NOVIDADE[n.tipo] || "bg-muted text-muted-foreground"}`}>{ROTULO_TIPO_NOVIDADE[n.tipo] || n.tipo}</span>,
    },
    {
      chave: "norma_numero", rotulo: "Norma", valor: (n) => n.norma_numero || "",
      render: (n) => (n.norma_chave ? <Link to={`/base-legal/${n.norma_chave}`} className="text-primary underline whitespace-nowrap">{n.norma_numero || n.norma_chave}</Link> : <span>{n.norma_numero || "—"}</span>),
    },
    { chave: "titulo", rotulo: "Novidade", quebrar: true, valor: (n) => `${n.titulo} ${n.resumo || ""}`, render: (n) => <Conteudo n={n} /> },
    { chave: "ato", rotulo: "Ato", render: (n) => n.ato || "—" },
    {
      chave: "origem", rotulo: "Fonte", valor: (n) => `${ROTULO_ORIGEM_NOVIDADE[n.origem] || n.origem}${n.confirmada ? "" : " a confirmar"}`,
      render: (n) => (
        <span className="space-y-0.5 block">
          <span className="block text-xs">{ROTULO_ORIGEM_NOVIDADE[n.origem] || n.origem}</span>
          {!n.confirmada && <span className="block text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">a confirmar</span>}
          {n.url && <a href={n.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline"><ExternalLink className="w-3 h-3" />Fonte oficial</a>}
        </span>
      ),
    },
    { chave: "status", rotulo: "Situação", valor: (n) => ROTULO_STATUS_NOVIDADE[n.status] || n.status },
  ];
  if (admin) colunas.push({ chave: "acoes", rotulo: "Ações", valor: () => "", ordenavel: false, filtravel: false, render: (n) => <Acoes n={n} onAgir={onAgir} ocupado={ocupadoId === n.id} /> });
  return <TabelaPadrao id="base-legal:novidades" ariaLabel="Novidades da base de conhecimento legal" linhas={itens} chaveLinha={(n) => n.id} colunas={colunas} />;
}

/**
 * Novidades da base de conhecimento legal: o que a revisão semanal e as atualizações das normas descobriram (alteração, revogação,
 * ato novo, regulamentação, aplicação). As achadas na web ficam "a confirmar" até um administrador conferir a fonte.
 */
export default function NovidadesLegais({ admin = false, normaInicial = "" }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState("abertas");
  const [tipo, setTipo] = useState("");
  const [norma, setNorma] = useState(normaInicial);
  const [soAConfirmar, setSoAConfirmar] = useState(false);
  const [q, setQ] = useState("");
  const busca = useDebounced(q.trim());
  const [ocupadoId, setOcupadoId] = useState(null);

  const params = { status, ...(tipo ? { tipo } : {}), ...(norma ? { norma } : {}), ...(soAConfirmar ? { confirmada: "nao" } : {}), ...(busca ? { busca } : {}), limite: 200 };
  const { data, isLoading } = useQuery({ queryKey: ["base-legal-novidades", params], queryFn: () => api.get("/base-legal/novidades", params) });
  const { data: resumo } = useQuery({ queryKey: ["base-legal-novidades-resumo"], queryFn: () => api.get("/base-legal/novidades/resumo") });
  const itens = data?.itens ?? [];

  const agir = async (n, acao) => {
    setOcupadoId(n.id);
    try {
      await api.post(`/base-legal/novidades/${n.id}/${acao}`, {});
      toast({ title: { visto: "Marcada como vista", confirmar: "Fonte confirmada", descartar: "Novidade descartada", reabrir: "Novidade reaberta" }[acao] });
      qc.invalidateQueries({ queryKey: ["base-legal-novidades"] });
      qc.invalidateQueries({ queryKey: ["base-legal-novidades-resumo"] });
    } catch (e) {
      toast({ title: "Não foi possível concluir", description: e.message, variant: "destructive" });
    } finally { setOcupadoId(null); }
  };

  return (
    <section aria-label="Novidades da base de conhecimento legal" className="space-y-4">
      <div>
        <h2 className="text-sm font-medium">O que mudou na legislação</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Alterações e revogações lidas do texto oficial, atos novos da lista oficial do Senado, documentos novos nos portais da Receita, do CGIBS, da NF-e, da NFS-e, do eSocial, do Confaz e do CARF e o que a pesquisa semanal na web achou. {fraseDoResumo(resumo)}</p>
      </div>

      <div role="group" aria-label="Resumo" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Selo valor={resumo?.novas} rotulo="novidades novas" />
        <Selo valor={resumo?.a_confirmar} rotulo="achadas na web, a confirmar" destaque />
        <Selo valor={resumo?.nao_consolidadas} rotulo="alterações ainda não consolidadas no texto compilado" destaque />
        <Selo valor={resumo ? resumo.normas_revogadas + resumo.normas_parcialmente_revogadas : undefined} rotulo={`normas revogadas ou com parte revogada${resumo ? ` (${resumo.normas_revogadas} por inteiro)` : ""}`} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs space-y-1">Situação
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="block h-9 rounded-md border border-input bg-background px-2 text-sm">{STATUS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
        </label>
        <label className="text-xs space-y-1">Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="block h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Todos os tipos</option>
            {Object.entries(ROTULO_TIPO_NOVIDADE).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
        <label className="text-xs space-y-1 flex-1 min-w-[12rem] max-w-md">Buscar
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Norma, ato ou assunto" className="block w-full h-9 rounded-md border border-input bg-background px-2 text-sm" />
        </label>
        <label className="text-xs inline-flex items-center gap-1.5 h-9"><input type="checkbox" checked={soAConfirmar} onChange={(e) => setSoAConfirmar(e.target.checked)} />Só as a confirmar</label>
        {norma && <button type="button" onClick={() => setNorma("")} className="h-9 inline-flex items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted"><X className="w-3 h-3" />Só da norma {norma}</button>}
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Carregando…</p>
        : itens.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma novidade com estes filtros. A revisão semanal roda toda segunda-feira, às 5h.</p>
          : <TabelaDeNovidades itens={itens} admin={admin} onAgir={agir} ocupadoId={ocupadoId} />}
      {data && data.total > itens.length && <p className="text-xs text-muted-foreground">Mostrando {itens.length} de {data.total}. Refine os filtros para ver as demais.</p>}
      {!admin && <p className="text-xs text-muted-foreground">Novidade marcada “a confirmar” veio da pesquisa na web: confira a fonte oficial antes de usar. Só administradores marcam como vista, confirmam ou descartam.</p>}
    </section>
  );
}
