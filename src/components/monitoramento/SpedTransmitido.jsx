import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, Loader2, RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TabelaPadrao from "@/components/TabelaPadrao";
import { BotoesDocumento } from "@/components/monitoramento/CartaoServico";
import EnvioDocumentos, { tamanhoTexto } from "@/components/monitoramento/EnvioDocumentos";
import { toast } from "@/components/ui/use-toast";
import { quandoConsultou } from "@/lib/monitoramento";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SITUACAO = {
  TRANSMITIDA: { rotulo: "Transmitida", tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  NAO_ENCONTRADA: { rotulo: "Não encontrada", tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  NO_PRAZO: { rotulo: "No prazo", tom: "bg-muted text-muted-foreground" },
  NA_FILA: { rotulo: "Chegando", tom: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  FUTURA: { rotulo: "No prazo", tom: "bg-muted text-muted-foreground" },
  SEM_CONSULTA: { rotulo: "Sem consulta", tom: "bg-muted text-muted-foreground" },
};
const comp = (c) => (c.length === 4 ? `Ano ${c}` : `${MESES[Number(c.slice(5, 7)) - 1]}/${c.slice(0, 4)}`);

/** Linhas da tabela de uma escrituração: uma por competência (mês nas EFD, ano na ECD e na ECF). */
export function linhasDaEscrituracao(e) {
  return (e?.meses || []).map((m) => ({
    id: `${e.id}-${m.competencia}`, escrituracao: e.id, competencia: m.competencia, situacao: m.situacao, transmissoes: m.transmissoes,
    periodo: m.ultima?.periodo_inicio ? `${dataBr(m.ultima.periodo_inicio)} a ${dataBr(m.ultima.periodo_fim)}` : "",
    tipo: m.ultima ? (m.ultima.retificadora ? "Retificadora" : "Original") : "",
    ultima: m.ultima, arquivos: arquivosDa(e.id, m),
  }));
}
/** Arquivos guardados da competência (escrituração e recibo), com o tamanho, prontos para baixar ou enviar. */
function arquivosDa(esc, m) {
  const u = m.ultima;
  const l = Array.isArray(u?.arquivos) ? u.arquivos : u?.arquivo_id ? [{ id: u.arquivo_id, nome: `${esc} ${m.competencia}`, tipo: "ESCRITURACAO" }] : [];
  return l.map((a) => ({ ...a, item: { tipo: "arquivo", arquivo_id: a.id } }));
}
const dataBr = (d) => (d ? d.split("-").reverse().join("/") : "");

/** Os arquivos guardados da competência: a escrituração transmitida e o recibo (Ver e Baixar). */
function ArquivosSped({ linha }) {
  if (!linha.arquivos.length) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      {linha.arquivos.map((a) => (
        <span key={a.id} className="inline-flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">{a.tipo === "RECIBO" ? "Recibo" : "Arquivo"}</span>
          <BotoesDocumento url={`/documentos/arquivos/${a.id}/download`} nome={a.nome} rotulo={a.nome} />
        </span>
      ))}
    </span>
  );
}

/**
 * Monitoramento > Declarações > SPED e EFD: abre com o que já está guardado no InTAX (arquivo transmitido e recibo, prontos para
 * ver, baixar e enviar por e-mail). "Consultar na Receita" pergunta ao ReceitanetBX e pede os arquivos novos.
 */
export default function SpedTransmitido({ empresaId, competencia }) {
  const [ano, setAno] = useState(() => Number(competencia?.slice(0, 4)) || new Date().getFullYear());
  const qc = useQueryClient();
  const chave = ["monitoramento", "sped", empresaId, ano];
  const q = useQuery({ queryKey: chave, queryFn: () => api.get(`/monitoramento/empresas/${empresaId}/sped`, { ano }), retry: false,
    // Enquanto há arquivos chegando, relê o que está guardado a cada minuto (sem ir à Receita).
    refetchInterval: (x) => ((x.state.data?.escrituracoes || []).some((e) => e.na_fila > 0) ? 60_000 : false) });
  const consultar = useMutation({
    mutationFn: () => api.get(`/monitoramento/empresas/${empresaId}/sped`, { ano, consultar: 1 }),
    onSuccess: (r) => qc.setQueryData(chave, r),
    onError: (e) => toast({ title: "Não foi possível consultar a Receita", description: e.message, variant: "destructive" }),
  });
  const [marcadas, setMarcadas] = useState(new Set());
  const pedidos = useQuery({ queryKey: ["monitoramento", "sped-pedidos", empresaId], queryFn: () => api.get(`/monitoramento/empresas/${empresaId}/sped/downloads`), refetchInterval: 60_000 });
  const ROTULO_ESC = Object.fromEntries((q.data?.escrituracoes || []).map((e) => [e.id, e.rotulo.split(" (")[0]]));
  const SIT_PEDIDO = { SOLICITADO: "Pedido à Receita", PROCESSANDO: "Baixando", DISPONIVEL: "Baixando", GUARDADO: "Guardado no InTAX", ERRO: "Com erro" };
  const colunasPedidos = [
    { chave: "escrituracao", rotulo: "Escrituração", valor: (l) => ROTULO_ESC[l.escrituracao] || l.escrituracao },
    { chave: "competencia", rotulo: "Competência", valor: (l) => l.competencia, render: (l) => (/^\d{4}(-\d{2})?$/.test(l.competencia) ? comp(l.competencia) : "—") },
    { chave: "situacao", rotulo: "Situação", valor: (l) => SIT_PEDIDO[l.situacao] || l.situacao },
    { chave: "servico", rotulo: "Certificado", valor: (l) => (l.servico === "primario" ? "Primário (empresa)" : "Secundário (sócio)") },
    { chave: "id_pedido", rotulo: "Pedido" },
    { chave: "createdAt", rotulo: "Pedido em", tipo: "data", render: (l) => quandoConsultou(l.createdAt) },
    { chave: "mensagem", rotulo: "Mensagem", quebrar: true },
  ];
  const colunas = [
    { chave: "competencia", rotulo: "Competência", valor: (l) => l.competencia, render: (l) => comp(l.competencia) },
    { chave: "situacao", rotulo: "Situação", valor: (l) => (SITUACAO[l.situacao] || SITUACAO.NO_PRAZO).rotulo, render: (l) => <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${(SITUACAO[l.situacao] || SITUACAO.NO_PRAZO).tom}`}>{(SITUACAO[l.situacao] || SITUACAO.NO_PRAZO).rotulo}</span> },
    { chave: "periodo", rotulo: "Período" },
    { chave: "tipo", rotulo: "Original ou retificadora" },
    { chave: "transmissoes", rotulo: "Transmissões", tipo: "numero", alinhar: "direita", valor: (l) => l.transmissoes || null },
    { chave: "tamanho", rotulo: "Tamanho", tipo: "numero", alinhar: "direita", valor: (l) => l.arquivos.reduce((s2, a) => s2 + (a.tamanho || 0), 0) || null, render: (l) => { const b = l.arquivos.reduce((s2, a) => s2 + (a.tamanho || 0), 0); return b ? tamanhoTexto(b) : "—"; } },
  ];
  const todasLinhas = (q.data?.escrituracoes || []).flatMap(linhasDaEscrituracao);
  const marcados = todasLinhas.filter((l) => marcadas.has(l.id)).flatMap((l) => l.arquivos.map((a) => ({ item: a.item, nome: a.nome, tamanho: a.tamanho })));
  const escrituracoes = q.data?.escrituracoes || [];
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="SPED transmitido">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex flex-1 items-center gap-1.5 text-sm font-semibold"><FileCheck2 className="h-4 w-4 text-primary" aria-hidden="true" />SPED e EFD: o que a Receita recebeu</h3>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">Ano
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="rounded border border-border bg-background px-1.5 py-1 text-xs">
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <button type="button" disabled={consultar.isPending} onClick={() => consultar.mutate()} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted disabled:opacity-60">{consultar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}Consultar na Receita</button>
      </div>
      <p className="text-xs text-muted-foreground">
        {q.data ? (q.data.consultado_em ? `Última consulta à Receita em ${quandoConsultou(q.data.consultado_em)}${q.data.certificados?.length ? ` com ${q.data.certificados.join(" e ")}` : ""}.` : `Ano ${ano} ainda não consultado na Receita.`) : ""}
      </p>
      {(q.isLoading || consultar.isPending) && <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden="true" />{consultar.isPending ? "Consultando a Receita…" : "Carregando…"}</p>}
      {q.error && <p role="alert" className="text-sm">{q.error.message}</p>}
      {escrituracoes.length > 0 && (
        <Tabs defaultValue={escrituracoes[0].id}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            {[...escrituracoes, { id: "REINF", rotulo: "EFD-Reinf", meses: [] }, { id: "PEDIDOS", rotulo: `Pedidos à Receita (${(pedidos.data || []).length})`, meses: [] }].map((e) => {
              const falta = e.meses.filter((m) => m.situacao === "NAO_ENCONTRADA").length;
              return <TabsTrigger key={e.id} value={e.id} className="gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">{e.rotulo.split(" (")[0]}{(falta > 0 || e.erro) && <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-label="com pendência" />}</TabsTrigger>;
            })}
          </TabsList>
          {escrituracoes.map((e) => (
            <TabsContent key={e.id} value={e.id} className="mt-3 space-y-2">
              <p className="text-xs font-medium">{e.rotulo}</p>
              {e.encontrados > 0 && <p className="text-xs text-muted-foreground">{e.encontrados} na Receita · {e.baixados} no InTAX{e.na_fila ? ` · ${e.na_fila} chegando` : ""}</p>}
              {e.erro && <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{e.erro}</p>}
              <TabelaPadrao id={`monit:sped:${e.id}`} colunas={colunas} linhas={linhasDaEscrituracao(e).filter((l) => !competencia || Number(competencia.slice(0, 4)) !== ano || l.competencia === competencia || l.competencia === String(ano))} ariaLabel={`${e.rotulo} por competência`} tamanhoInicial={25} vazio="Nada para mostrar."
                ordemInicial={{ chave: "competencia", dir: 1 }}
                selecao={{ marcadas, aoMudar: setMarcadas }}
                acoes={<EnvioDocumentos empresaId={empresaId} marcados={marcados} aoConcluir={() => setMarcadas(new Set())} />}
                documentos={(l) => <ArquivosSped linha={l} />} />
            </TabsContent>
          ))}
          <TabsContent value="PEDIDOS" className="mt-3 space-y-2">
            <TabelaPadrao id="monit:sped:pedidos" colunas={colunasPedidos} linhas={pedidos.data || []} ariaLabel="Pedidos de arquivos à Receita" ordemInicial={{ chave: "createdAt", dir: -1 }} vazio="Nenhum pedido." tamanhoInicial={25} />
          </TabsContent>
          <TabsContent value="REINF" className="mt-3 space-y-2">
            <p className="text-xs font-medium">EFD-Reinf (Escrituração Fiscal Digital de Retenções e Outras Informações Fiscais)</p>
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs">Entrega da Reinf: veja a DCTFWeb (aba Declarações).</p>
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
