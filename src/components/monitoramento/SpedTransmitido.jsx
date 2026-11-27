import { useEffect, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TabelaPadrao from "@/components/TabelaPadrao";
import FiltroMultiplo from "@/components/FiltroMultiplo";
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
 * ver, baixar e enviar por e-mail), numa lista só por escrituração com todos os anos e filtros de Ano e Situação. "Pedir vários anos"
 * pergunta ao ReceitanetBX e pede os arquivos novos.
 */
const ESCRITURACOES_PEDIDO = [
  ["EFD_ICMS_IPI", "EFD ICMS/IPI"], ["EFD_CONTRIBUICOES", "EFD Contribuições"], ["ECD", "ECD"], ["ECF", "ECF"],
];

/** Pedido de vários anos à Receita: o usuário escolhe o período e as escriturações; os arquivos chegam em "Pedidos à Receita". */
function PedidoPeriodo({ empresaId, aoConcluir }) {
  const atual = new Date().getFullYear();
  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState(atual - 5);
  const [ate, setAte] = useState(atual);
  const [esc, setEsc] = useState(new Set(ESCRITURACOES_PEDIDO.map(([id]) => id)));
  const url = `/monitoramento/empresas/${empresaId}/sped/pedir-periodo`;
  const andamento = useQuery({ queryKey: ["monitoramento", "sped-periodo", empresaId], queryFn: () => api.get(url), refetchInterval: (x) => (x.state.data?.situacao === "ANDAMENTO" ? 10_000 : false) });
  const pedir = useMutation({
    mutationFn: () => api.post(url, { de, ate, escrituracoes: [...esc] }),
    onSuccess: () => { andamento.refetch(); setAberto(false); },
    onError: (e) => toast({ title: "Pedido não iniciado", description: e.message, variant: "destructive" }),
  });
  const a = andamento.data;
  const fim = a?.situacao === "CONCLUIDO" ? a.iniciado_em : null;
  useEffect(() => { if (fim) aoConcluir?.(); }, [fim]);
  const anos = Array.from({ length: atual - 2009 + 1 }, (_, i) => atual - i);
  return (
    <div className="rounded-md border border-border p-2 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="botao-acao inline-flex h-7 items-center rounded-md px-2 hover:bg-muted">Pedir vários anos</button>
        {a && (
          <span className="text-muted-foreground">
            {a.situacao === "ANDAMENTO" ? <><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />Pedindo {a.de}–{a.ate}: {a.anos_feitos} de {a.anos} anos pesquisados</> : `Último pedido ${a.de}–${a.ate} concluído (${a.escrituracoes.length} escriturações)${a.erros.length ? `; com erro: ${a.erros.join(" · ")}` : ""}. Os arquivos chegam em "Pedidos à Receita".`}
          </span>
        )}
      </div>
      {aberto && (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); pedir.mutate(); }}>
          <label className="grid gap-0.5">De
            <select value={de} onChange={(e) => setDe(Number(e.target.value))} className="rounded border border-border bg-background px-1.5 py-1">{anos.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </label>
          <label className="grid gap-0.5">Até
            <select value={ate} onChange={(e) => setAte(Number(e.target.value))} className="rounded border border-border bg-background px-1.5 py-1">{anos.filter((x) => x >= de).map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </label>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Escriturações</legend>
            {ESCRITURACOES_PEDIDO.map(([id, rot]) => (
              <label key={id} className="inline-flex items-center gap-1"><input type="checkbox" checked={esc.has(id)} onChange={() => setEsc((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })} />{rot}</label>
            ))}
          </fieldset>
          <button type="submit" disabled={!esc.size || pedir.isPending || a?.situacao === "ANDAMENTO"} className="botao-acao inline-flex h-7 items-center rounded-md bg-primary px-2 text-primary-foreground disabled:opacity-60">Pedir à Receita</button>
          <span className="text-muted-foreground">Sem custo de API. Arquivos já pedidos ou guardados não são pedidos de novo.</span>
        </form>
      )}
    </div>
  );
}

const ANO_ATUAL = new Date().getFullYear();
const ANOS_PADRAO = Array.from({ length: 6 }, (_, i) => ANO_ATUAL - i);
const OPCOES_ANO = Array.from({ length: ANO_ATUAL - 2009 + 1 }, (_, i) => ({ valor: ANO_ATUAL - i, rotulo: String(ANO_ATUAL - i) }));
const OPCOES_SITUACAO = [["TRANSMITIDA", "Transmitida"], ["NAO_ENCONTRADA", "Não encontrada"], ["NA_FILA", "Chegando"], ["NO_PRAZO", "No prazo"], ["SEM_CONSULTA", "Sem consulta"]].map(([valor, rotulo]) => ({ valor, rotulo }));

/**
 * Junta o que está guardado de vários anos numa lista só por escrituração: as competências de todos os anos, os totais somados e
 * o aviso da consulta mais recente à Receita.
 */
export function juntarAnos(respostas) {
  const validas = respostas.filter(Boolean);
  const porId = new Map();
  const recente = [...validas].sort((a, b) => String(b.consultado_em || "").localeCompare(String(a.consultado_em || "")))[0];
  for (const r of validas) {
    for (const e of r.escrituracoes || []) {
      const atual = porId.get(e.id) || { ...e, meses: [], encontrados: 0, baixados: 0, na_fila: 0, erro: null };
      const vistos = new Set(atual.meses.map((m) => m.competencia));
      atual.meses = [...atual.meses, ...(e.meses || []).filter((m) => !vistos.has(m.competencia))];
      atual.encontrados += e.encontrados || 0;
      atual.baixados += e.baixados || 0;
      atual.na_fila = Math.max(atual.na_fila, e.na_fila || 0);
      porId.set(e.id, atual);
    }
  }
  for (const e of recente?.escrituracoes || []) if (porId.has(e.id)) porId.get(e.id).erro = e.erro || null;
  return { escrituracoes: [...porId.values()], consultado_em: recente?.consultado_em || null, certificados: recente?.certificados || [] };
}

export default function SpedTransmitido({ empresaId }) {
  const qc = useQueryClient();
  const [anos, setAnos] = useState(ANOS_PADRAO);
  const [situacoes, setSituacoes] = useState([]);
  const [aba, setAba] = useState("");
  const anosVistos = (anos.length ? anos : ANOS_PADRAO).slice().sort((a, b) => b - a);
  const consultas = useQueries({
    queries: anosVistos.map((ano) => ({
      queryKey: ["monitoramento", "sped", empresaId, ano], queryFn: () => api.get(`/monitoramento/empresas/${empresaId}/sped`, { ano }), retry: false,
      // Enquanto há arquivos chegando, relê o que está guardado a cada minuto (sem ir à Receita).
      refetchInterval: (x) => ((x.state.data?.escrituracoes || []).some((e) => e.na_fila > 0) ? 60_000 : false),
    })),
  });
  const carregando = consultas.some((c) => c.isLoading);
  const erro = consultas.find((c) => c.error)?.error;
  const dados = juntarAnos(consultas.map((c) => c.data));
  const [marcadas, setMarcadas] = useState(new Set());
  const pedidos = useQuery({ queryKey: ["monitoramento", "sped-pedidos", empresaId], queryFn: () => api.get(`/monitoramento/empresas/${empresaId}/sped/downloads`), refetchInterval: 60_000 });
  const ROTULO_ESC = Object.fromEntries(dados.escrituracoes.map((e) => [e.id, e.rotulo.split(" (")[0]]));
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
  const situacaoDe = (s) => (s === "FUTURA" ? "NO_PRAZO" : s);
  const colunas = [
    { chave: "competencia", rotulo: "Competência", valor: (l) => l.competencia, render: (l) => comp(l.competencia) },
    { chave: "situacao", rotulo: "Situação", valor: (l) => (SITUACAO[l.situacao] || SITUACAO.NO_PRAZO).rotulo, render: (l) => <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${(SITUACAO[l.situacao] || SITUACAO.NO_PRAZO).tom}`}>{(SITUACAO[l.situacao] || SITUACAO.NO_PRAZO).rotulo}</span> },
    { chave: "periodo", rotulo: "Período" },
    { chave: "tipo", rotulo: "Original ou retificadora" },
    { chave: "transmissoes", rotulo: "Transmissões", tipo: "numero", alinhar: "direita", valor: (l) => l.transmissoes || null },
    { chave: "tamanho", rotulo: "Tamanho", tipo: "numero", alinhar: "direita", valor: (l) => l.arquivos.reduce((s2, a) => s2 + (a.tamanho || 0), 0) || null, render: (l) => { const b = l.arquivos.reduce((s2, a) => s2 + (a.tamanho || 0), 0); return b ? tamanhoTexto(b) : "—"; } },
  ];
  const filtrarLinhas = (linhas) => linhas.filter((l) => !situacoes.length || situacoes.includes(situacaoDe(l.situacao)));
  const todasLinhas = dados.escrituracoes.flatMap(linhasDaEscrituracao);
  const marcados = todasLinhas.filter((l) => marcadas.has(l.id)).flatMap((l) => l.arquivos.map((a) => ({ item: a.item, nome: a.nome, tamanho: a.tamanho })));
  const escrituracoes = dados.escrituracoes;
  const abaAtual = aba || escrituracoes[0]?.id || "PEDIDOS";
  const filtros = (
    <>
      <FiltroMultiplo rotulo="Ano" opcoes={OPCOES_ANO} marcados={anos} mudar={(v) => setAnos(v.length ? v : ANOS_PADRAO)} />
      <FiltroMultiplo rotulo="Situação" opcoes={OPCOES_SITUACAO} marcados={situacoes} mudar={setSituacoes} />
    </>
  );
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="SPED transmitido">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex flex-1 items-center gap-1.5 text-sm font-semibold"><FileCheck2 className="h-4 w-4 text-primary" aria-hidden="true" />SPED e EFD: o que a Receita recebeu</h3>
      </div>
      <PedidoPeriodo empresaId={empresaId} aoConcluir={() => { qc.invalidateQueries({ queryKey: ["monitoramento", "sped", empresaId] }); qc.invalidateQueries({ queryKey: ["monitoramento", "sped-pedidos", empresaId] }); }} />
      <p className="text-xs text-muted-foreground">
        {dados.consultado_em ? `Última consulta à Receita em ${quandoConsultou(dados.consultado_em)}${dados.certificados?.length ? ` com ${dados.certificados.join(" e ")}` : ""}.` : carregando ? "" : "Anos escolhidos ainda não consultados na Receita: use Pedir vários anos."}
      </p>
      {carregando && !escrituracoes.length && <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden="true" />Carregando…</p>}
      {erro && <p role="alert" className="text-sm">{erro.message}</p>}
      {(escrituracoes.length > 0 || !carregando) && (
        <Tabs value={abaAtual} onValueChange={setAba}>
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
              <TabelaPadrao id={`monit:sped:${e.id}`} colunas={colunas} linhas={filtrarLinhas(linhasDaEscrituracao(e))} ariaLabel={`${e.rotulo} por competência`} tamanhoInicial={25} vazio="Nada para mostrar com esses filtros."
                ordemInicial={{ chave: "competencia", dir: -1 }} filtrosExtras={filtros}
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
