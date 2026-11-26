import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Loader2, Play } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import TabelaPadrao from "@/components/TabelaPadrao";
import { dataHoraBr, duracaoDaRodada, ROTULO_GRUPO_NORMA, ROTULO_STATUS_RODADA, ROTULO_TIPO_NOVIDADE } from "@/lib/novidadesLegais";

const CLASSE_STATUS = {
  executando: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
  concluida: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  parcial: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  falhou: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
};

const Sim = ({ v }) => <b>{v ? "sim" : "não"}</b>;

/** Como a rotina está configurada no servidor. */
export function EstadoDaRotina({ estado }) {
  if (!estado) return null;
  return (
    <ul className="text-sm space-y-1" aria-label="Como a revisão semanal está configurada">
      <li>Rotina ligada: <Sim v={estado.ligada} /> — {estado.agenda}.</li>
      <li>Texto oficial atualizado sozinho (com a trava contra página que mudou de forma): <Sim v={estado.aplica_automaticamente} />.{!estado.aplica_automaticamente && " As mudanças viram avisos para o administrador aprovar."}</li>
      <li>Pesquisa semanal na web (fontes oficiais, sempre “a confirmar”): <Sim v={estado.pesquisa_na_web} />.</li>
      {estado.em_andamento && <li className="inline-flex items-center gap-1.5 text-sky-800 dark:text-sky-200"><Loader2 className="w-3.5 h-3.5 animate-spin" />Uma revisão está em andamento neste momento.</li>}
    </ul>
  );
}

export function TabelaDeRodadas({ rodadas, onAbrir = () => {}, selecionada = null }) {
  const colunas = [
    { chave: "semana", rotulo: "Semana" },
    { chave: "iniciado_em", rotulo: "Início", tipo: "data", render: (r) => dataHoraBr(r.iniciado_em) },
    { chave: "duracao", rotulo: "Duração", valor: (r) => duracaoDaRodada(r), ordenavel: false },
    { chave: "disparo", rotulo: "Disparo", valor: (r) => (r.disparo === "manual" ? "Manual" : "Agendada") },
    {
      chave: "status", rotulo: "Situação", valor: (r) => ROTULO_STATUS_RODADA[r.status] || r.status,
      render: (r) => <span className={`text-xs rounded px-2 py-0.5 whitespace-nowrap ${CLASSE_STATUS[r.status] || "bg-muted text-muted-foreground"}`}>{ROTULO_STATUS_RODADA[r.status] || r.status}</span>,
    },
    { chave: "resumo", rotulo: "O que a rodada fez", quebrar: true },
    { chave: "normas_verificadas", rotulo: "Normas", tipo: "numero", alinhar: "direita" },
    { chave: "dispositivos_alterados", rotulo: "Alterados", tipo: "numero", alinhar: "direita" },
    { chave: "dispositivos_revogados", rotulo: "Revogados", tipo: "numero", alinhar: "direita" },
    { chave: "atos_relacionados", rotulo: "Atos", tipo: "numero", alinhar: "direita" },
    { chave: "erros", rotulo: "Erros", tipo: "numero", alinhar: "direita", valor: (r) => (Array.isArray(r.erros) ? r.erros.length : 0) },
    {
      chave: "acoes", rotulo: "Detalhes", valor: () => "", ordenavel: false, filtravel: false,
      render: (r) => <button type="button" onClick={() => onAbrir(r.id)} aria-pressed={selecionada === r.id} className={`border border-border rounded px-2 py-0.5 text-xs hover:bg-muted ${selecionada === r.id ? "bg-muted" : ""}`}>{selecionada === r.id ? "Fechar" : "Abrir"}</button>,
    },
  ];
  return <TabelaPadrao id="base-legal:rodadas" ariaLabel="Rodadas da revisão semanal" linhas={rodadas} chaveLinha={(r) => r.id} colunas={colunas} />;
}

/** O que uma rodada achou e o que não conseguiu conferir. */
export function DetalheDaRodada({ rodada }) {
  if (!rodada) return null;
  const erros = Array.isArray(rodada.erros) ? rodada.erros : [];
  const novidades = Array.isArray(rodada.novidades) ? rodada.novidades : [];
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label={`Detalhes da rodada ${rodada.semana}`}>
      <h3 className="text-sm font-medium">Rodada {rodada.semana} · {dataHoraBr(rodada.iniciado_em)}</h3>
      <p className="text-sm">{rodada.resumo || "Em andamento."}</p>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {[["Normas conferidas", rodada.normas_verificadas], ["Normas atualizadas", rodada.normas_atualizadas], ["Normas novas", rodada.normas_novas], ["Dispositivos alterados", rodada.dispositivos_alterados],
          ["Dispositivos revogados", rodada.dispositivos_revogados], ["Atos relacionados", rodada.atos_relacionados], ["Fontes oficiais lidas", rodada.fontes_verificadas], ["Fontes com novidade", rodada.fontes_alteradas]]
          .map(([r, v]) => <div key={r} className="rounded border border-border p-2"><dt className="text-muted-foreground">{r}</dt><dd className="text-base font-semibold tabular-nums">{v ?? 0}</dd></div>)}
      </dl>
      {erros.length > 0 && (
        <div className="rounded-lg border border-red-300/60 bg-red-50/60 dark:bg-red-950/10 p-3">
          <p className="text-sm font-medium flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Não foi possível conferir ({erros.length})</p>
          <ul className="mt-1 text-xs list-disc pl-5 space-y-0.5">{erros.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {novidades.length > 0 && (
        <div>
          <p className="text-sm font-medium">O que a rodada registrou ({novidades.length})</p>
          <ul className="mt-1 text-xs space-y-1">
            {novidades.slice(0, 60).map((n) => (
              <li key={n.id}><span className="font-semibold">{ROTULO_TIPO_NOVIDADE[n.tipo] || n.tipo}:</span> {n.norma_chave ? <Link to={`/base-legal/${n.norma_chave}`} className="underline">{n.titulo}</Link> : n.titulo}{!n.confirmada && <span className="ml-1 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">a confirmar</span>}</li>
            ))}
            {novidades.length > 60 && <li className="text-muted-foreground">e mais {novidades.length - 60} na aba Novidades.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export function TabelaDeFontes({ fontes }) {
  const colunas = [
    { chave: "titulo", rotulo: "Portal ou lista", quebrar: true },
    { chave: "grupo", rotulo: "Bloco", valor: (f) => ROTULO_GRUPO_NORMA[f.grupo] || f.grupo },
    { chave: "verificada_em", rotulo: "Última leitura", tipo: "data", render: (f) => dataHoraBr(f.verificada_em) },
    { chave: "alterada_em", rotulo: "Última novidade", tipo: "data", render: (f) => dataHoraBr(f.alterada_em) },
    { chave: "erro", rotulo: "Situação", valor: (f) => (f.erro ? "Com erro" : f.verificada_em ? "Lida" : "Ainda não lida"), render: (f) => (f.erro ? <span className="text-xs text-red-700 dark:text-red-300" title={f.erro}>Com erro: {String(f.erro).slice(0, 80)}</span> : <span className="text-xs">{f.verificada_em ? "Lida" : "Ainda não lida"}</span>) },
    { chave: "url", rotulo: "Endereço", valor: () => "", ordenavel: false, filtravel: false, render: (f) => <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline"><ExternalLink className="w-3 h-3" />Abrir</a> },
  ];
  return <TabelaPadrao id="base-legal:fontes" ariaLabel="Portais oficiais acompanhados" linhas={fontes} chaveLinha={(f) => f.id} colunas={colunas} />;
}

/** Revisão semanal: o histórico das rodadas, o botão para rodar agora (administrador) e os portais oficiais acompanhados. */
export default function RevisaoSemanalPainel({ admin = false }) {
  const qc = useQueryClient();
  const [aberta, setAberta] = useState(null);
  const [iniciando, setIniciando] = useState(false);

  const { data } = useQuery({
    queryKey: ["base-legal-revisao-semanal"], queryFn: () => api.get("/base-legal/revisao-semanal"),
    refetchInterval: (q) => (q.state.data?.estado?.em_andamento || q.state.data?.rodadas?.some((r) => r.status === "executando") ? 5000 : false),
  });
  const { data: fontes = [] } = useQuery({ queryKey: ["base-legal-fontes"], queryFn: () => api.get("/base-legal/revisao-semanal/fontes") });
  const { data: detalhe } = useQuery({ queryKey: ["base-legal-rodada", aberta], queryFn: () => api.get(`/base-legal/revisao-semanal/${aberta}`), enabled: Boolean(aberta) });

  const rodar = async () => {
    setIniciando(true);
    try {
      const r = await api.post("/base-legal/revisao-semanal/executar", {});
      toast({ title: r.ja_em_andamento ? "Já há uma revisão em andamento" : "Revisão iniciada", description: "Leva alguns minutos. A lista abaixo atualiza sozinha e o resultado também chega por e-mail, se houver novidade." });
      qc.invalidateQueries({ queryKey: ["base-legal-revisao-semanal"] });
    } catch (e) {
      toast({ title: "Não foi possível iniciar", description: e.message, variant: "destructive" });
    } finally { setIniciando(false); }
  };

  const rodadas = data?.rodadas ?? [];
  return (
    <section aria-label="Revisão semanal" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 max-w-3xl">
          <h2 className="text-sm font-medium">Revisão semanal das bases legais</h2>
          <p className="text-xs text-muted-foreground">Uma vez por semana o sistema relê o texto oficial de cada norma (guardando a redação anterior de tudo o que mudou), confere a lista oficial de leis, decretos e medidas provisórias novas, cruza o que os atos novos alteram com o texto compilado das normas, lê os portais da Receita, do CGIBS, da NF-e, da NFS-e, do eSocial, do Confaz e do CARF e faz uma pesquisa na web só em fontes oficiais. O que cita um dispositivo alterado volta para revisão; nada é republicado sozinho.</p>
        </div>
        {admin && (
          <button type="button" onClick={rodar} disabled={iniciando || data?.estado?.em_andamento} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">
            {iniciando || data?.estado?.em_andamento ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}Rodar a revisão agora
          </button>
        )}
      </div>
      <EstadoDaRotina estado={data?.estado} />
      {rodadas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma rodada ainda. A primeira roda na próxima segunda-feira, às 5h{admin ? ", ou agora, pelo botão acima (a primeira carrega todas as normas e leva mais tempo)" : ""}.</p>
        : <TabelaDeRodadas rodadas={rodadas} selecionada={aberta} onAbrir={(id) => setAberta(aberta === id ? null : id)} />}
      {aberta && <DetalheDaRodada rodada={detalhe} />}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Portais e listas oficiais acompanhados</h3>
        {fontes.length === 0 ? <p className="text-sm text-muted-foreground">Aparecem aqui depois da primeira rodada.</p> : <TabelaDeFontes fontes={fontes} />}
      </div>
    </section>
  );
}
