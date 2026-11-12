import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Loader2, RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TabelaPadrao from "@/components/TabelaPadrao";
import { formatarCelula, NIVEIS, quandoConsultou, SEM_CONSULTA } from "@/lib/monitoramento";

const campo = "rounded-md border border-border bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const falhar = (t) => (e) => toast({ title: t, description: e.message, variant: "destructive" });
const nomeSeguro = (s) => String(s || "Consulta").replace(/[\\/:*?"<>|]/g, "-");

export function SeloNivel({ nivel }) {
  const n = NIVEIS[nivel] || SEM_CONSULTA;
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 ${n.tom}`}><span className={`h-1.5 w-1.5 rounded-full ${n.ponto}`} aria-hidden="true" />{n.rotulo}</span>;
}

/** Botões Ver e Baixar de um arquivo (sempre no fim da linha). */
export function BotoesDocumento({ url, nome, ver = true, rotulo }) {
  return (
    <span className="inline-flex items-center gap-1">
      {ver && <button type="button" onClick={() => api.visualizar("GET", `${url}${url.includes("?") ? "&" : "?"}ver=1`).catch(falhar("Não foi possível abrir"))} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-muted" aria-label={`Ver ${rotulo || nome}`} title="Visualizar"><Eye className="h-3 w-3" aria-hidden="true" /> Ver</button>}
      <button type="button" onClick={() => api.baixar("GET", url, { nome }).catch(falhar("Não foi possível baixar"))} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-muted" aria-label={`Baixar ${rotulo || nome}`} title="Baixar"><Download className="h-3 w-3" aria-hidden="true" /> Baixar</button>
    </span>
  );
}

/** Documentos de uma consulta: os PDF oficiais do Serpro/Receita e o relatório do InTAX em PDF e Excel. */
export function documentosDaConsulta(consulta, rotulo) {
  if (!consulta?.id) return [];
  const data = String(consulta.createdAt).slice(0, 10);
  const oficiais = (consulta.arquivos || []).map((a) => ({
    id: `${consulta.id}-${a.indice}`, documento: a.nome, tipo: /retific/i.test(a.nome) ? "Oficial (retificadora)" : /original/i.test(a.nome) ? "Oficial (original)" : "Oficial (Receita/Serpro)", formato: "PDF",
    data: consulta.createdAt, url: `/monitoramento/consultas/${consulta.id}/arquivos/${a.indice}`, nome: a.nome, ver: true,
  }));
  const relatorios = consulta.sucesso === false && !consulta.resumo ? [] : [
    { id: `${consulta.id}-pdf`, documento: `Relatório da consulta: ${rotulo}`, tipo: "Relatório do InTAX", formato: "PDF", data: consulta.createdAt, url: `/monitoramento/consultas/${consulta.id}/relatorio`, nome: `${nomeSeguro(rotulo)} ${data}.pdf`, ver: true },
    ...(consulta.resumo?.tabela?.linhas?.length ? [{ id: `${consulta.id}-xlsx`, documento: `Tabela completa: ${rotulo}`, tipo: "Relatório do InTAX", formato: "Excel", data: consulta.createdAt, url: `/monitoramento/consultas/${consulta.id}/relatorio?formato=xlsx`, nome: `${nomeSeguro(rotulo)} ${data}.xlsx`, ver: false }] : []),
  ];
  return [...oficiais, ...relatorios];
}

const COLUNAS_DOCUMENTOS = [
  { chave: "documento", rotulo: "Documento" },
  { chave: "tipo", rotulo: "Origem" },
  { chave: "formato", rotulo: "Formato", quebrar: false },
  { chave: "data", rotulo: "Consultado em", tipo: "data", render: (l) => quandoConsultou(l.data), quebrar: false },
];

function Destaques({ resumo }) {
  if (!resumo?.destaques?.length) return null;
  return (
    <dl className="flex flex-wrap gap-1.5 text-xs">
      {resumo.destaques.map((d, i) => <div key={i} className="rounded-md border border-border bg-muted/30 px-2 py-0.5"><dt className="inline text-muted-foreground">{d.rotulo}: </dt><dd className="inline font-medium">{d.valor}</dd></div>)}
    </dl>
  );
}

/** O resultado de uma consulta: frase, destaques e a tabela (padrão do InTAX). */
export function Resultado({ consulta, id }) {
  const r = consulta?.resumo;
  if (!r) return null;
  const colunas = (r.tabela?.colunas || []).map((c) => ({ chave: c.chave, rotulo: c.rotulo, tipo: c.tipo === "moeda" ? "moeda" : undefined, alinhar: c.tipo === "moeda" ? "direita" : undefined, valor: (l) => l[c.chave], render: (l) => formatarCelula(l[c.chave], c.tipo) }));
  return (
    <div className="space-y-2">
      <p className="text-sm">{r.titulo}</p>
      <Destaques resumo={r} />
      {colunas.length > 0 && <TabelaPadrao id={id} colunas={colunas} linhas={r.tabela.linhas} chaveLinha={(_, i) => i} ariaLabel={`Resultado: ${r.titulo}`} vazio="A consulta não trouxe registros." />}
    </div>
  );
}

/**
 * Um serviço do monitoramento para um cliente, no padrão de tabelas: consulta na hora (com os parâmetros), e as subabas
 * Resultado, Documentos (PDF oficial, relatório e Excel, com Ver e Baixar no fim da linha) e Histórico.
 * `base` é "/monitoramento/empresas/ID" ou "/monitoramento/pessoas/ID".
 */
export default function CartaoServico({ servico, ultima, base, desligado, aoConsultar }) {
  const qc = useQueryClient();
  const [params, setParams] = useState(() => Object.fromEntries(servico.parametros.map((p) => [p.nome, p.padrao || ""])));
  const [atual, setAtual] = useState(null);
  const [aba, setAba] = useState(null);
  const empresa = base.includes("/empresas/");
  const historico = useQuery({ queryKey: ["monitoramento", "historico", base, servico.chave], queryFn: () => api.get(`${base}/historico/${servico.chave}`), enabled: empresa && aba === "historico" });
  const consultar = useMutation({
    mutationFn: () => api.post(`${base}/consultar`, { chave: servico.chave, parametros: params }),
    onSuccess: (c) => {
      setAtual(c);
      qc.invalidateQueries({ queryKey: ["monitoramento"] });
      aoConsultar?.(c);
      if (!c.sucesso) toast({ title: `${servico.rotulo}: o Serpro não trouxe o resultado`, description: c.resumo?.titulo, variant: "destructive" });
    },
    onError: falhar("Não foi possível consultar"),
  });
  const mostrada = atual || ultima;
  const docs = documentosDaConsulta(mostrada, servico.rotulo);
  const temTabela = !!mostrada?.resumo?.tabela?.linhas?.length;
  const abaAtiva = aba || "resultado";
  const colunasHistorico = [
    { chave: "createdAt", rotulo: "Consultado em", tipo: "data", render: (l) => quandoConsultou(l.createdAt), quebrar: false },
    { chave: "nivel", rotulo: "Situação", valor: (l) => (NIVEIS[l.nivel] || SEM_CONSULTA).rotulo, render: (l) => <SeloNivel nivel={l.nivel} /> },
    { chave: "titulo", rotulo: "Resultado", valor: (l) => l.resumo?.titulo || "" },
    { chave: "parametros", rotulo: "Parâmetros", valor: (l) => Object.entries(l.parametros || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ") },
    { chave: "solicitado_por", rotulo: "Feita por" },
    { chave: "origem", rotulo: "Origem", valor: (l) => ({ MANUAL: "Na tela", ROTINA: "Rotina automática", LOTE: "Atualizar tudo" }[l.origem] || l.origem || "") },
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label={servico.rotulo}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{servico.rotulo}</h3>
          <p className="text-xs text-muted-foreground">{servico.descricao}</p>
        </div>
        <SeloNivel nivel={mostrada?.nivel} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {servico.parametros.map((p) => (
          <label key={p.nome} className="space-y-0.5">
            <span className="block text-[11px] text-muted-foreground">{p.rotulo}</span>
            <input className={`${campo} w-40`} type={p.tipo === "data" ? "date" : "text"} inputMode={p.tipo === "texto" ? "text" : "numeric"} value={params[p.nome] ?? ""} onChange={(e) => setParams((x) => ({ ...x, [p.nome]: e.target.value }))} placeholder={p.tipo === "periodo" ? "AAAAMM" : p.tipo === "ano" ? "AAAA" : ""} />
          </label>
        ))}
        <button type="button" disabled={desligado || consultar.isPending} onClick={() => consultar.mutate()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60" title={desligado ? "O monitoramento está desligado" : undefined}>
          {consultar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />} {mostrada ? "Consultar de novo" : "Consultar"}
        </button>
        <span className="text-[11px] text-muted-foreground">{mostrada ? `Consultado em ${quandoConsultou(mostrada.createdAt)}${mostrada.solicitado_por ? ` por ${mostrada.solicitado_por}` : ""}${mostrada.simulado ? " · demonstração" : ""}` : "Ainda não consultado."}</span>
      </div>
      {(mostrada || empresa) && (
        <Tabs value={abaAtiva} onValueChange={setAba}>
          <TabsList className="h-8">
            <TabsTrigger value="resultado" className="text-xs">Resultado</TabsTrigger>
            <TabsTrigger value="documentos" className="text-xs">Documentos{docs.length ? ` (${docs.length})` : ""}</TabsTrigger>
            {empresa && <TabsTrigger value="historico" className="text-xs">Histórico</TabsTrigger>}
          </TabsList>
          <TabsContent value="resultado" className="mt-2">
            {mostrada ? <Resultado consulta={mostrada} id={`monit:${servico.chave}`} /> : <p className="text-xs text-muted-foreground">Ainda não consultado.</p>}
            {mostrada && !temTabela && docs.length > 0 && (
              <div className="mt-2"><TabelaPadrao id="monit:documentos" colunas={COLUNAS_DOCUMENTOS} linhas={docs} ariaLabel={`Documentos: ${servico.rotulo}`} tamanhoInicial={10} documentos={(l) => <BotoesDocumento url={l.url} nome={l.nome} ver={l.ver} rotulo={l.documento} />} /></div>
            )}
          </TabsContent>
          <TabsContent value="documentos" className="mt-2">
            <TabelaPadrao id="monit:documentos" colunas={COLUNAS_DOCUMENTOS} linhas={docs} ariaLabel={`Documentos: ${servico.rotulo}`} vazio="Nenhum documento: consulte primeiro." tamanhoInicial={10}
              documentos={(l) => <BotoesDocumento url={l.url} nome={l.nome} ver={l.ver} rotulo={l.documento} />} />
          </TabsContent>
          {empresa && (
            <TabsContent value="historico" className="mt-2">
              {historico.isLoading ? <p className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />Carregando…</p> : (
                <TabelaPadrao id="monit:historico" colunas={colunasHistorico} linhas={historico.data || []} ariaLabel={`Histórico: ${servico.rotulo}`} vazio="Sem histórico." tamanhoInicial={10}
                  documentos={(h) => (
                    <span className="inline-flex flex-wrap justify-end gap-1">
                      {(h.arquivos || []).map((a) => <BotoesDocumento key={a.indice} url={`/monitoramento/consultas/${h.id}/arquivos/${a.indice}`} nome={a.nome} rotulo={a.nome} />)}
                      <BotoesDocumento url={`/monitoramento/consultas/${h.id}/relatorio`} nome={`${nomeSeguro(servico.rotulo)} ${String(h.createdAt).slice(0, 10)}.pdf`} rotulo="relatório do InTAX" />
                      <button type="button" onClick={() => { setAtual(h); setAba("resultado"); }} className="rounded px-1.5 py-0.5 text-[11px] text-primary hover:underline">Abrir</button>
                    </span>
                  )} />
              )}
            </TabsContent>
          )}
        </Tabs>
      )}
    </section>
  );
}
