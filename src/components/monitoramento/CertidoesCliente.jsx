import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Eye, FileCheck2, Loader2, Paperclip } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";

const dia = (v) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");
const SITUACAO = {
  VALIDO: { rotulo: "Válida", tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  A_VENCER: { rotulo: "Vence em breve", tom: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  VENCIDO: { rotulo: "Vencida", tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  SEM_VALIDADE: { rotulo: "Sem validade informada", tom: "bg-muted text-muted-foreground" },
};

function Cartao({ c, empresaId, automatica, aoMudar }) {
  const input = useRef(null);
  const [validade, setValidade] = useState("");
  const falhar = (t) => (e) => toast({ title: t, description: e.message, variant: "destructive" });
  const anexar = useMutation({
    mutationFn: (f) => api.upload(`/certidoes/empresas/${empresaId}/${c.tipo}/anexar`, f, validade ? { validade } : {}),
    onSuccess: (r) => { aoMudar(); setValidade(""); toast({ title: "Certidão guardada", description: [r.leitura.resumo, ...r.avisos].join(" ") }); },
    onError: falhar("Não foi possível anexar"),
  });
  const emitir = useMutation({
    mutationFn: () => api.post(`/certidoes/empresas/${empresaId}/FEDERAL/emitir`, {}),
    onSuccess: (r) => { aoMudar(); toast({ title: r.emitida ? "CND federal emitida e guardada" : "A certidão não foi emitida", description: r.resumo, variant: r.emitida ? undefined : "destructive" }); },
    onError: falhar("Não foi possível emitir"),
  });
  const a = c.atual;
  const s = a ? SITUACAO[a.situacao] ?? SITUACAO.SEM_VALIDADE : null;
  const url = a?.arquivo ? `/documentos/arquivos/${a.arquivo.id}/download` : null;
  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-4" aria-label={c.rotulo}>
      <div className="flex items-start gap-2">
        <h4 className="flex-1 text-sm font-semibold">{c.rotulo}</h4>
        {s ? <span className={`rounded px-1.5 text-[11px] leading-5 ${s.tom}`}>{s.rotulo}</span> : <span className="rounded bg-muted px-1.5 text-[11px] leading-5 text-muted-foreground">Nenhuma guardada</span>}
      </div>
      {a ? (
        <dl className="mt-2 space-y-0.5 text-xs">
          {a.descricao && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Situação</dt><dd>{a.descricao.split(": ").slice(1).join(": ") || a.descricao}</dd></div>}
          <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Validade</dt><dd className="tabular-nums">{a.validade ? dia(a.validade) : "não informada"}</dd></div>
          {a.emissao && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Emissão</dt><dd className="tabular-nums">{dia(a.emissao)}</dd></div>}
          {a.numero && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Número</dt><dd className="break-all">{a.numero}</dd></div>}
          {c.anteriores > 0 && <p className="pt-1 text-muted-foreground">{c.anteriores} anterior(es) em <Link to="/bpo/arquivos" className="text-primary hover:underline">Arquivos e documentos</Link>.</p>}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{c.como}</p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
        {url && (
          <>
            <button type="button" onClick={() => api.visualizar("GET", url).catch(falhar("Não foi possível abrir"))} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"><Eye className="h-3.5 w-3.5" aria-hidden="true" />Ver</button>
            <button type="button" onClick={() => api.baixar("GET", url, { nome: a.arquivo.nome }).catch(falhar("Não foi possível baixar"))} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"><Download className="h-3.5 w-3.5" aria-hidden="true" />Baixar</button>
          </>
        )}
        {c.tipo === "FEDERAL" && automatica && (
          <button type="button" disabled={emitir.isPending} onClick={() => emitir.mutate()} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60">
            {emitir.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />}Emitir agora
          </button>
        )}
        {c.portal && <a href={c.portal} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Portal oficial</a>}
        <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-label={`Anexar PDF: ${c.rotulo}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) anexar.mutate(f); }} />
        <button type="button" disabled={anexar.isPending} onClick={() => input.current?.click()} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-60 ${c.tipo === "FEDERAL" && automatica ? "border border-border hover:bg-muted" : "bg-primary text-primary-foreground"}`}>
          {anexar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />}{a ? "Anexar nova" : "Anexar PDF"}
        </button>
      </div>
      <details className="mt-2 text-[11px] text-muted-foreground">
        <summary className="cursor-pointer">Informar a validade ao anexar (PDF escaneado)</summary>
        <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} aria-label={`Validade da ${c.rotulo}`} className="mt-1 rounded border border-border bg-background px-2 py-1 text-xs" />
      </details>
    </article>
  );
}

/** Aba Certidões do cliente: as já emitidas, em PDF, com situação e validade; a federal pela API e as demais por anexo. */
export default function CertidoesCliente({ empresaId }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["certidoes", empresaId], queryFn: () => api.get(`/certidoes/empresas/${empresaId}`) });
  const aoMudar = () => { qc.invalidateQueries({ queryKey: ["certidoes", empresaId] }); qc.invalidateQueries({ queryKey: ["documentos"] }); };
  if (isLoading) return <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden="true" />Carregando as certidões…</p>;
  if (error) return <p role="alert" className="text-sm">Não foi possível carregar as certidões: {error.message}</p>;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.certidoes.map((c) => <Cartao key={c.tipo} c={c} empresaId={empresaId} automatica={data.emissao_automatica_federal} aoMudar={aoMudar} />)}
      </div>
      <p className="text-xs text-muted-foreground">
        {data.emissao_automatica_federal
          ? "A CND federal é emitida pela API Consulta CND do Serpro. "
          : "Para a CND federal sair sozinha, informe as chaves da API Consulta CND em Administração > Integrações (contrato à parte do Integra Contador, em produção). "}
        Os portais estaduais, municipais, do TST e da Caixa exigem verificação humana e não oferecem API: emita lá e anexe o PDF; o InTAX lê a situação, a validade e o CNPJ, e guarda em Arquivos e documentos (pasta Certidões), com aviso no sino antes de vencer.
        {data.empresa.uf ? ` Este cliente é de ${data.empresa.municipio ? `${data.empresa.municipio}/` : ""}${data.empresa.uf}.` : ""}
      </p>
    </div>
  );
}
