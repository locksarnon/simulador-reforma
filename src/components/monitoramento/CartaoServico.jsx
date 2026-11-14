import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TabelaPadrao from "@/components/TabelaPadrao";
import TabelaDeDocumentos from "@/components/documentos/TabelaDeDocumentos";
import BotoesDocumento from "@/components/documentos/BotoesDocumento";
import EnvioDocumentos from "@/components/monitoramento/EnvioDocumentos";
import { NIVEIS, quandoConsultou, SEM_CONSULTA } from "@/lib/monitoramento";

const campo = "rounded-md border border-border bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const falhar = (t) => (e) => toast({ title: t, description: e.message, variant: "destructive" });
const nomeSeguro = (s) => String(s || "Consulta").replace(/[\\/:*?"<>|]/g, "-");

export function SeloNivel({ nivel }) {
  const n = NIVEIS[nivel] || SEM_CONSULTA;
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 ${n.tom}`}><span className={`h-1.5 w-1.5 rounded-full ${n.ponto}`} aria-hidden="true" />{n.rotulo}</span>;
}

export { BotoesDocumento };

/** Documentos de uma consulta: os PDF oficiais do Serpro/Receita e o relatório do InTAX em PDF e Excel. */
export function documentosDaConsulta(consulta, rotulo) {
  if (!consulta?.id) return [];
  const data = String(consulta.createdAt).slice(0, 10);
  const oficiais = (consulta.arquivos || []).map((a) => ({
    id: `${consulta.id}-${a.indice}`, documento: a.nome, tipo: /retific/i.test(a.nome) ? "Oficial (retificadora)" : /original/i.test(a.nome) ? "Oficial (original)" : "Oficial (Receita/Serpro)", formato: "PDF",
    data: consulta.createdAt, url: `/monitoramento/consultas/${consulta.id}/arquivos/${a.indice}`, nome: a.nome, ver: true,
    tamanho: a.tamanho, item: { tipo: "consulta", consulta_id: consulta.id, indice: a.indice },
  }));
  const relatorios = consulta.sucesso === false && !consulta.resumo ? [] : [
    { id: `${consulta.id}-pdf`, documento: `Relatório da consulta: ${rotulo}`, tipo: "Relatório do InTAX", formato: "PDF", data: consulta.createdAt, url: `/monitoramento/consultas/${consulta.id}/relatorio`, nome: `${nomeSeguro(rotulo)} ${data}.pdf`, ver: true, item: { tipo: "consulta", consulta_id: consulta.id } },
    ...(consulta.resumo?.tabela?.linhas?.length ? [{ id: `${consulta.id}-xlsx`, documento: `Tabela completa: ${rotulo}`, tipo: "Relatório do InTAX", formato: "Excel", data: consulta.createdAt, url: `/monitoramento/consultas/${consulta.id}/relatorio?formato=xlsx`, nome: `${nomeSeguro(rotulo)} ${data}.xlsx`, ver: false, item: { tipo: "consulta", consulta_id: consulta.id, formato: "xlsx" } }] : []),
  ];
  return [...oficiais, ...relatorios].map((d) => ({ ...d, origem: d.tipo }));
}


/** Último envio ou download registrado de uma consulta (para a coluna do histórico). */
const ultimoRegistro = (h) => { const r = h.registros?.[0]; return r ? `${r.tipo} ${quandoConsultou(r.quando)}${r.tipo === "E-mail" ? ` para ${r.destinatario}${r.status === "FALHA" ? " (falhou)" : ""}` : ""}` : ""; };

function Destaques({ resumo }) {
  if (!resumo?.destaques?.length) return null;
  return (
    <dl className="flex flex-wrap gap-1.5 text-xs">
      {resumo.destaques.map((d, i) => <div key={i} className="rounded-md border border-border bg-muted/30 px-2 py-0.5"><dt className="inline text-muted-foreground">{d.rotulo}: </dt><dd className="inline font-medium">{d.valor}</dd></div>)}
    </dl>
  );
}

/**
 * Um serviço do monitoramento para um cliente, no padrão de tabelas: consulta na hora (com os parâmetros), o resultado em uma
 * frase e as subabas Documentos (PDF oficial, relatório e Excel) e Histórico, com Ver e Baixar no fim da linha e, para os
 * marcados, Baixar (ZIP) e Enviar por e-mail; cada envio e download fica registrado no histórico.
 * `base` é "/monitoramento/empresas/ID" ou "/monitoramento/pessoas/ID".
 */
export default function CartaoServico({ servico, ultima, base, desligado, aoConsultar, competencia }) {
  const qc = useQueryClient();
  const [params, setParams] = useState(() => Object.fromEntries(servico.parametros.map((p) => [p.nome, (p.nome === "periodo" && competencia ? competencia.replace("-", "") : p.nome === "ano" && competencia && servico.grupo === "declaracoes" ? competencia.slice(0, 4) : p.padrao) || ""])));
  const [atual, setAtual] = useState(null);
  const [aba, setAba] = useState("documentos");
  const [marcadosHist, setMarcadosHist] = useState(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const empresa = base.includes("/empresas/");
  const historico = useQuery({ queryKey: ["monitoramento", "historico", base, servico.chave, competencia], queryFn: () => api.get(`${base}/historico/${servico.chave}`, { competencia }), enabled: empresa && aba === "historico" });
  const consultar = useMutation({
    mutationFn: (extra) => api.post(`${base}/consultar`, { chave: servico.chave, parametros: { ...params, ...(extra || {}) } }),
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
  const chaveHistorico = ["monitoramento", "historico", base, servico.chave, competencia];
  const linhasHistorico = historico.data || [];
  const docsDoHistorico = (h) => documentosDaConsulta(h, servico.rotulo).filter((d) => d.formato === "PDF");
  const colunasHistorico = [
    { chave: "createdAt", rotulo: "Consultado em", tipo: "data", render: (l) => quandoConsultou(l.createdAt) },
    { chave: "nivel", rotulo: "Situação", valor: (l) => (NIVEIS[l.nivel] || SEM_CONSULTA).rotulo, render: (l) => <SeloNivel nivel={l.nivel} /> },
    { chave: "titulo", rotulo: "Resultado", valor: (l) => l.resumo?.titulo || "" },
    { chave: "parametros", rotulo: "Parâmetros", valor: (l) => Object.entries(l.parametros || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ") },
    { chave: "solicitado_por", rotulo: "Feita por" },
    { chave: "origem", rotulo: "Origem", valor: (l) => ({ MANUAL: "Na tela", ROTINA: "Rotina automática", LOTE: "Atualizar tudo" }[l.origem] || l.origem || "") },
    { chave: "registro", rotulo: "Último envio ou download", valor: ultimoRegistro, render: (l) => <span title={(l.registros || []).map((r) => `${r.tipo} ${quandoConsultou(r.quando)} ${r.destinatario}`).join("\n")}>{ultimoRegistro(l) || "—"}</span> },
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label={servico.rotulo}>
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-semibold">{servico.rotulo}</h3>
        <SeloNivel nivel={mostrada?.nivel} />
      </div>
      {mostrada?.resumo?.titulo && <p className="text-sm">{mostrada.resumo.titulo}</p>}
      <Destaques resumo={mostrada?.resumo} />
      <div className="flex flex-wrap items-end gap-2">
        {servico.parametros.map((p) => (
          <label key={p.nome} className="space-y-0.5">
            <span className="block text-[11px] text-muted-foreground">{p.rotulo}</span>
            {p.opcoes?.length ? (
              <select className={`${campo} w-40`} value={params[p.nome] ?? ""} onChange={(e) => setParams((x) => ({ ...x, [p.nome]: e.target.value }))}>
                <option value="">Escolha…</option>
                {p.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
            ) : (
              <input className={`${campo} w-40`} type={p.tipo === "data" ? "date" : "text"} inputMode={p.tipo === "texto" ? "text" : "numeric"} value={params[p.nome] ?? ""} onChange={(e) => setParams((x) => ({ ...x, [p.nome]: e.target.value }))} placeholder={p.tipo === "periodo" ? "AAAAMM" : p.tipo === "ano" ? "AAAA" : ""} />
            )}
          </label>
        ))}
        {servico.acao ? (
          <button type="button" disabled={desligado || consultar.isPending} onClick={() => setConfirmando(true)} className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60" title={desligado ? "Monitoramento desligado" : "Pede confirmação"}>
            {consultar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />} Executar na Receita
          </button>
        ) : (
          <button type="button" disabled={desligado || consultar.isPending} onClick={() => consultar.mutate()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60" title={desligado ? "Monitoramento desligado" : undefined}>
            {consultar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />} {mostrada ? "Consultar de novo" : "Consultar"}
          </button>
        )}
        {servico.acao && (
          <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{servico.rotulo}</AlertDialogTitle>
                <AlertDialogDescription>{servico.acao}</AlertDialogDescription>
              </AlertDialogHeader>
              <ul className="space-y-0.5 text-sm">
                {servico.parametros.map((p) => (
                  <li key={p.nome}><span className="text-muted-foreground">{p.rotulo}:</span> {p.opcoes?.find((o) => o.valor === params[p.nome])?.rotulo || params[p.nome] || "—"}</li>
                ))}
              </ul>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => consultar.mutate({ confirmar: "sim" })}>Confirmar e executar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <span className="text-[11px] text-muted-foreground">{mostrada ? `Consultado em ${quandoConsultou(mostrada.createdAt)}${mostrada.solicitado_por ? ` por ${mostrada.solicitado_por}` : ""}${mostrada.simulado ? " · demonstração" : ""}` : "Ainda não consultado."}</span>
      </div>
      {(mostrada || empresa) && (
        <Tabs value={empresa ? aba : "documentos"} onValueChange={setAba}>
          <TabsList className="h-8">
            <TabsTrigger value="documentos" className="text-xs">Documentos{docs.length ? ` (${docs.length})` : ""}</TabsTrigger>
            {empresa && <TabsTrigger value="historico" className="text-xs">Histórico</TabsTrigger>}
          </TabsList>
          <TabsContent value="documentos" className="mt-2">
            <TabelaDeDocumentos id="monit:documentos" linhas={docs} ariaLabel={`Documentos: ${servico.rotulo}`} vazio={competencia && (servico.parametros.some((p) => p.nome === "periodo") || ["mit-apuracao", "pgdasd-declaracao"].includes(servico.chave)) ? "Sem dados para esta competência." : "Nenhum documento: consulte primeiro."} tamanhoInicial={10}
              ordemInicial={null} rotuloData="Consultado em" envioBase={base} invalidar={[chaveHistorico]} />
          </TabsContent>
          {empresa && (
            <TabsContent value="historico" className="mt-2">
              {historico.isLoading ? <p className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />Carregando…</p> : (
                <TabelaPadrao id="monit:historico" colunas={colunasHistorico} linhas={linhasHistorico} ariaLabel={`Histórico: ${servico.rotulo}`} vazio="Sem histórico." tamanhoInicial={10}
                  ordemInicial={{ chave: "createdAt", dir: -1 }}
                  selecao={{ marcadas: marcadosHist, aoMudar: setMarcadosHist }}
                  acoes={<EnvioDocumentos base={base} marcados={linhasHistorico.filter((h) => marcadosHist.has(h.id)).flatMap(docsDoHistorico)} aoConcluir={() => setMarcadosHist(new Set())} invalidar={[chaveHistorico]} />}
                  documentos={(h) => (
                    <span className="inline-flex justify-end gap-1">
                      {(h.arquivos || []).map((a) => <BotoesDocumento key={a.indice} url={`/monitoramento/consultas/${h.id}/arquivos/${a.indice}`} nome={a.nome} rotulo={a.nome} />)}
                      <BotoesDocumento url={`/monitoramento/consultas/${h.id}/relatorio`} nome={`${nomeSeguro(servico.rotulo)} ${String(h.createdAt).slice(0, 10)}.pdf`} rotulo="relatório do InTAX" />
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
