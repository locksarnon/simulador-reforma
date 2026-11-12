import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileCheck2, Loader2, Paperclip } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TabelaPadrao from "@/components/TabelaPadrao";
import { BotoesDocumento } from "@/components/monitoramento/CartaoServico";
import { PdfDoRelatorio, useLeituraSitfis } from "@/components/monitoramento/LeituraSitfis";

const ESFERA = { FEDERAL: "Federal", ESTADUAL: "Estadual", MUNICIPAL: "Municipal", TRABALHISTA: "Trabalhista", FGTS: "FGTS" };
const SITUACAO = {
  VALIDO: { rotulo: "Válida", tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  A_VENCER: { rotulo: "Vence em breve", tom: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  VENCIDO: { rotulo: "Vencida", tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  SEM_VALIDADE: { rotulo: "Sem validade", tom: "bg-muted text-muted-foreground" },
};
const brParaIso = (s) => { const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
export const situacaoPelaValidade = (iso, agora = Date.now()) => { if (!iso) return "SEM_VALIDADE"; const dias = (Date.parse(`${iso}T23:59:59-03:00`) - agora) / 86_400_000; return dias < 0 ? "VENCIDO" : dias <= 15 ? "A_VENCER" : "VALIDO"; };

const COLUNAS = [
  { chave: "situacao", rotulo: "Vigência", valor: (l) => SITUACAO[l.situacao]?.rotulo ?? l.situacao, render: (l) => <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${SITUACAO[l.situacao]?.tom ?? SITUACAO.SEM_VALIDADE.tom}`}>{SITUACAO[l.situacao]?.rotulo ?? l.situacao}</span> },
  { chave: "regularidade", rotulo: "Regularidade" },
  { chave: "emissao", rotulo: "Emissão", tipo: "data", quebrar: false },
  { chave: "validade", rotulo: "Validade", tipo: "data", quebrar: false },
  { chave: "numero", rotulo: "Número / código" },
  { chave: "origem", rotulo: "Origem" },
  { chave: "guardada", rotulo: "Guardada por", valor: (l) => l.criado_por || "" },
];

/** As linhas de uma esfera: as certidões guardadas e, na federal, a certidão que consta no relatório de situação fiscal. */
export function linhasDaEsfera(c, sitfis) {
  const linhas = (c.historico || []).map((h) => ({ ...h, regularidade: (h.descricao || "").split(": ").slice(1).join(": ").replace(/ \(API Consulta CND\)$/, "") || h.descricao || "" }));
  if (c.tipo === "FEDERAL" && sitfis?.leitura?.certidao) {
    const ct = sitfis.leitura.certidao;
    const validadeIso = brParaIso(ct.validade);
    linhas.push({ id: "sitfis", situacao: situacaoPelaValidade(validadeIso), regularidade: ct.tipo, emissao: brParaIso(ct.emissao), validade: validadeIso, numero: ct.codigo, origem: "Relatório de situação fiscal (Receita e PGFN)", criado_por: "InTAX (leitura automática)", doSitfis: true });
  }
  return linhas;
}

function Esfera({ c, empresaId, automatica, aoMudar, sitfis }) {
  const input = useRef(null);
  const [validade, setValidade] = useState("");
  const falhar = (t) => (e) => toast({ title: t, description: e.message, variant: "destructive" });
  const anexar = useMutation({
    mutationFn: (f) => api.upload(`/certidoes/empresas/${empresaId}/${c.tipo}/anexar`, f, validade ? { validade } : {}),
    onSuccess: (r) => { aoMudar(); setValidade(""); toast({ title: "Certidão guardada", description: [r.leitura.resumo, ...r.avisos].join(" ") }); },
    onError: falhar("Não foi possível anexar"),
  });
  const emitir = useMutation({
    mutationFn: () => api.post(`/certidoes/empresas/${empresaId}/${c.tipo}/emitir`, {}),
    onSuccess: (r) => { aoMudar(); toast({ title: r.emitida ? `${c.rotulo}: emitida e guardada` : "A certidão não foi emitida", description: r.resumo, variant: r.emitida ? undefined : "destructive" }); },
    onError: falhar("Não foi possível emitir"),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto min-w-[240px] flex-1 text-xs text-muted-foreground">{c.como}</p>
        {automatica && (
          <button type="button" disabled={emitir.isPending} onClick={() => emitir.mutate()} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60">
            {emitir.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />}Emitir agora
          </button>
        )}
        {c.portal && <a href={c.portal} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Portal oficial</a>}
        <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-label={`Anexar PDF: ${c.rotulo}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) anexar.mutate(f); }} />
        <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">Validade (PDF escaneado)<input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className="rounded border border-border bg-background px-1.5 py-1 text-xs" /></label>
        <button type="button" disabled={anexar.isPending} onClick={() => input.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-60">
          {anexar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />}Anexar PDF
        </button>
      </div>
      <TabelaPadrao id="monit:certidoes" colunas={COLUNAS} linhas={linhasDaEsfera(c, sitfis)} ariaLabel={`Certidões: ${c.rotulo}`} vazio="Nenhuma certidão desta esfera guardada." tamanhoInicial={10}
        documentos={(l) => (l.doSitfis ? <PdfDoRelatorio dados={sitfis} /> : l.arquivo ? <BotoesDocumento url={`/documentos/arquivos/${l.arquivo.id}/download`} nome={l.arquivo.nome} rotulo={`${c.rotulo} ${l.validade ? String(l.validade).slice(0, 10) : ""}`} /> : <span className="text-[11px] text-muted-foreground">sem PDF</span>)} />
    </div>
  );
}

/** Aba Certidões do cliente: uma subaba por esfera (Federal, Estadual, Municipal, Trabalhista, FGTS), cada uma em tabela. */
export default function CertidoesCliente({ empresaId }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["certidoes", empresaId], queryFn: () => api.get(`/certidoes/empresas/${empresaId}`) });
  const sitfis = useLeituraSitfis(empresaId).data;
  const aoMudar = () => { qc.invalidateQueries({ queryKey: ["certidoes", empresaId] }); qc.invalidateQueries({ queryKey: ["documentos"] }); };
  if (isLoading) return <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden="true" />Carregando as certidões…</p>;
  if (error) return <p role="alert" className="text-sm">Não foi possível carregar as certidões: {error.message}</p>;
  const ponto = (c) => {
    const s = c.atual?.situacao ?? (c.tipo === "FEDERAL" && sitfis?.leitura?.certidao ? situacaoPelaValidade(brParaIso(sitfis.leitura.certidao.validade)) : null);
    return s === "VALIDO" ? "bg-emerald-500" : s === "A_VENCER" ? "bg-amber-500" : s === "VENCIDO" ? "bg-red-500" : "bg-muted-foreground/30";
  };
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Certidões do cliente">
      <Tabs defaultValue="FEDERAL">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          {data.certidoes.map((c) => (
            <TabsTrigger key={c.tipo} value={c.tipo} className="gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <span className={`h-1.5 w-1.5 rounded-full ${ponto(c)}`} aria-hidden="true" />{ESFERA[c.tipo] ?? c.rotulo}
            </TabsTrigger>
          ))}
        </TabsList>
        {data.certidoes.map((c) => (
          <TabsContent key={c.tipo} value={c.tipo} className="mt-3">
            <Esfera c={c} empresaId={empresaId} automatica={!!(data.emissao_automatica?.[c.tipo] ?? (c.tipo === "FEDERAL" && data.emissao_automatica_federal))} aoMudar={aoMudar} sitfis={sitfis} />
          </TabsContent>
        ))}
      </Tabs>
      <p className="text-xs text-muted-foreground">
        {data.emissao_automatica_federal ? "A CND federal é emitida sozinha pela API Consulta CND do Serpro (toda manhã, quando falta ou vence em 15 dias). " : "A CND federal aparece pelo relatório de situação fiscal; para o PDF da própria certidão sair sozinho, contrate a API Consulta CND e informe as chaves em Administração > Integrações. "}
        {data.emissao_automatica?.TRABALHISTA ? "A CNDT e o CRF do FGTS saem sozinhos pela Infosimples (toda manhã, quando faltam ou vencem). " : "A CNDT e o CRF do FGTS saem sozinhos quando a Infosimples estiver configurada em Administração > Integrações. "}As certidões estaduais e municipais entram pelo PDF baixado no portal, que o InTAX lê (situação, validade e CNPJ) e guarda em Arquivos e documentos, com aviso antes de vencer.
        {data.empresa.uf ? ` Cliente de ${data.empresa.municipio ? `${data.empresa.municipio}/` : ""}${data.empresa.uf}.` : ""}
      </p>
    </section>
  );
}
