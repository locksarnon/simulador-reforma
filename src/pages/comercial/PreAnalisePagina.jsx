import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, CheckCircle2, Clock, Download, ExternalLink, Eye, FileText, Info, Loader2, Paperclip, RefreshCw, Search, Trash2, XCircle } from "lucide-react";
import TabelaPadrao from "@/components/TabelaPadrao";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/api/client";
import PageHeader from "@/components/PageHeader";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";

const digitos = (s) => String(s || "").replace(/\D/g, "");
const fmtCnpj = (d) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
const fmtCnae = (c) => String(c || "").replace(/^(\d{4})(\d)(\d{2})$/, "$1-$2/$3");
const brl = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const quando = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

/** Status de cada consulta: rótulo, cor e ícone (a forma acompanha a cor, para quem não distingue cores). */
export const STATUS = {
  PROCESSANDO: { rotulo: "Processando", tom: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300", ponto: "bg-sky-500 animate-pulse", Icone: Loader2, girar: true },
  CONCLUIDO: { rotulo: "Concluído", tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", ponto: "bg-emerald-500", Icone: CheckCircle2 },
  IRREGULAR: { rotulo: "Irregular", tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", ponto: "bg-red-500", Icone: XCircle },
  DEBITOS: { rotulo: "Débitos", tom: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300", ponto: "bg-amber-500", Icone: AlertTriangle },
  INDISPONIVEL: { rotulo: "Indisponível", tom: "bg-muted text-muted-foreground", ponto: "bg-muted-foreground/40", Icone: Ban },
  MANUAL: { rotulo: "Aguardando certidão", tom: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300", ponto: "bg-violet-500", Icone: Clock },
};

export function SeloStatus({ status, className = "" }) {
  const s = STATUS[status] ?? STATUS.INDISPONIVEL;
  const { Icone } = s;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.tom} ${className}`}><Icone className={`h-3.5 w-3.5 ${s.girar ? "animate-spin" : ""}`} aria-hidden="true" />{s.rotulo}</span>;
}

/**
 * Leitura inicial para a conversa comercial, a partir da divisão do CNAE (dois primeiros dígitos). É uma sugestão do InTAX para
 * orientar a reunião, não um enquadramento: o regime e os benefícios só se confirmam com as notas da empresa.
 */
export function leituraDoCnae(cnae) {
  const d = Number(String(cnae || "").slice(0, 2));
  if (d >= 1 && d <= 3) return { setor: "Agropecuária, produção florestal ou pesca", temas: ["Produtor rural contribuinte ou não do IBS/CBS (receita até R$ 3,6 milhões)", "Crédito presumido para quem compra do produtor", "Insumos agropecuários com redução de alíquota"] };
  if (d >= 10 && d <= 12) return { setor: "Indústria de alimentos, bebidas ou fumo", temas: ["Cesta básica e alíquota zero/reduzida por NCM", "Crédito amplo nas compras", "Imposto Seletivo em bebidas e fumo"] };
  if (d >= 5 && d <= 9) return { setor: "Indústria extrativa", temas: ["Imposto Seletivo na extração", "Exportação desonerada com manutenção de créditos"] };
  if (d >= 13 && d <= 33) return { setor: "Indústria de transformação", temas: ["Crédito amplo nas compras", "Fim do IPI na maior parte dos produtos e saldos credores"] };
  if (d === 45 || d === 46) return { setor: "Comércio atacadista ou de veículos", temas: ["Fim do ICMS-ST e estoque na transição", "Crédito presumido do estoque", "Clientes empresas valorizam o crédito"] };
  if (d === 47) return { setor: "Comércio varejista", temas: ["Consumidor final não aproveita crédito: preço e margem", "Split payment no cartão e no Pix"] };
  if (d >= 49 && d <= 53) return { setor: "Transporte, armazenagem e correio", temas: ["Transportador autônomo e crédito presumido", "CT-e com IBS/CBS", "Combustível e manutenção passam a gerar crédito"] };
  if (d >= 62 && d <= 63) return { setor: "Tecnologia da informação", temas: ["Serviço com alíquota cheia e pouco crédito", "Tributação no destino"] };
  if (d >= 64 && d <= 66) return { setor: "Serviços financeiros e seguros", temas: ["Regime específico de serviços financeiros"] };
  if (d >= 69 && d <= 75) return { setor: "Serviços profissionais e técnicos", temas: ["Profissões regulamentadas com redução de alíquota", "Simples Nacional × regime regular para clientes empresa"] };
  return { setor: "Outras atividades", temas: ["Mapear a cadeia de fornecedores e o crédito de cada um", "Simular a carga na transição"] };
}

/** Linhas chave/valor da ficha pública do CNPJ (dados da BrasilAPI). */
export function linhasDaPreAnalise(d) {
  const l = [
    ["CNPJ", fmtCnpj(d.cnpj)], ["Razão social", d.razao_social], ["Nome fantasia", d.nome_fantasia], ["Situação cadastral", d.situacao],
    ["Município/UF", `${d.municipio}/${d.uf}`], ["Natureza jurídica", d.natureza_juridica], ["Porte", d.porte], ["Início de atividade", d.data_inicio_atividade],
    ["Capital social", brl(d.capital_social)], ["Optante do Simples", d.opcao_pelo_simples === null ? "não informado" : d.opcao_pelo_simples ? "sim" : "não"],
    ["MEI", d.opcao_pelo_mei === null ? "não informado" : d.opcao_pelo_mei ? "sim" : "não"], ["CNAE principal", `${fmtCnae(d.cnae_codigo)} ${d.cnae_descricao}`],
    ...d.cnaes_secundarios.slice(0, 20).map((c, i) => [i === 0 ? "CNAEs secundários" : "", `${fmtCnae(c.codigo)} ${c.descricao}`]),
    ...d.socios.map((s, i) => [i === 0 ? "Sócios" : "", `${s.nome} (${s.qualificacao})`]),
  ];
  return l.map(([campo, valor]) => ({ campo, valor: valor ?? "" }));
}

/** CNAE principal tirado da Consulta Empresa (para a leitura da Reforma). */
export function cnaeDaPreAnalise(p) {
  const e = p?.processos?.find((x) => x.chave === "EMPRESA");
  const l = e?.detalhes?.find((d) => d.rotulo === "CNAE principal");
  return l ? digitos(String(l.valor).split(" ")[0]) : "";
}

/** Validade da certidão, quando a consulta traz (lida do PDF, da API ou da Infosimples). */
export function validadeDoProcesso(p) {
  const l = (p.detalhes || []).find((d) => /^(validade|válido até)$/i.test(d.rotulo));
  return l?.valor || "";
}

/** Ações da linha: detalhes, ver e baixar o documento, portal oficial e anexo do PDF. */
function AcoesProcesso({ p, def, preAnaliseId, onAnexado, onDetalhes }) {
  const input = useRef(null);
  const url = `/pre-analises/${preAnaliseId}/arquivos/${p.chave}`;
  const falhar = (e) => toast({ title: "Não foi possível abrir", description: e.message, variant: "destructive" });
  const anexar = useMutation({
    mutationFn: (f) => api.upload(`/pre-analises/${preAnaliseId}/certidoes/${p.chave}`, f),
    onSuccess: (r) => { onAnexado(r); toast({ title: "Certidão anexada", description: r.processos.find((x) => x.chave === p.chave)?.resumo }); },
    onError: (e) => toast({ title: "Não foi possível anexar", description: e.message, variant: "destructive" }),
  });
  const temDetalhes = p.detalhes.some((d) => d.rotulo !== "Portal oficial");
  const mostrarPortal = def.portal && p.status !== "PROCESSANDO" && (p.status === "MANUAL" || p.status === "INDISPONIVEL");
  const botao = "inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted disabled:opacity-60";
  return (
    <div className="flex flex-nowrap items-center gap-1">
      {temDetalhes && <button type="button" onClick={onDetalhes} className={botao}><Info className="h-3.5 w-3.5" aria-hidden="true" />Detalhes</button>}
      {p.arquivo && (
        <>
          <button type="button" onClick={() => api.visualizar("GET", `${url}?ver=1`).catch(falhar)} className={botao} aria-label={`Ver ${p.arquivo.nome}`}><Eye className="h-3.5 w-3.5" aria-hidden="true" />Ver</button>
          <button type="button" onClick={() => api.baixar("GET", url, { nome: p.arquivo.nome }).catch(falhar)} className={botao} aria-label={`Baixar ${p.arquivo.nome}`}><Download className="h-3.5 w-3.5" aria-hidden="true" />Baixar</button>
        </>
      )}
      {mostrarPortal && <a href={def.portal} target="_blank" rel="noreferrer" className={botao}><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Portal</a>}
      {def.aceitaCertidao && p.status !== "PROCESSANDO" && !(p.arquivo && !p.arquivo.enviado_por) && (
        <>
          <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-label={`Anexar PDF: ${def.rotulo}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) anexar.mutate(f); }} />
          <button type="button" disabled={anexar.isPending} onClick={() => input.current?.click()} className={botao} title="Anexar o PDF emitido no portal oficial">
            {anexar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />}{p.arquivo?.enviado_por ? "Trocar" : "Anexar"}
          </button>
        </>
      )}
    </div>
  );
}

/** Comercial > Pré-análise por CNPJ: sete consultas com status (empresa, CCC, certificado CCC, PGFN, trabalhista, FGTS e dívida ativa) e relatório em PDF. */
export default function PreAnalisePagina() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [texto, setTexto] = useState(params.get("cnpj") ? fmtCnpj(digitos(params.get("cnpj"))) : "");
  const id = params.get("id") || "";
  const historico = useQuery({ queryKey: ["pre-analises"], queryFn: () => api.get("/pre-analises") });
  const atual = useQuery({
    queryKey: ["pre-analises", id],
    queryFn: () => api.get(`/pre-analises/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.geral?.status === "PROCESSANDO" ? 2000 : false),
  });
  const p = atual.data;
  const emp = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list() });
  const jaCliente = useMemo(() => (p ? (emp.data || []).find((e) => digitos(e.cnpj_cpf) === p.cnpj) : null), [emp.data, p]);
  const definicoes = useMemo(() => new Map((p?.definicoes || []).map((d) => [d.chave, d])), [p]);
  const cnae = cnaeDaPreAnalise(p);
  const leitura = cnae ? leituraDoCnae(cnae) : null;
  const processando = p?.geral?.status === "PROCESSANDO";
  const [detalhe, setDetalhe] = useState(null);
  const aberto = detalhe ? p?.processos?.find((x) => x.chave === detalhe) : null;
  const colunas = [
    { chave: "consulta", rotulo: "Consulta", valor: (x) => definicoes.get(x.chave)?.rotulo || x.chave, render: (x) => <span className="font-medium">{definicoes.get(x.chave)?.rotulo}</span> },
    { chave: "status", rotulo: "Status", valor: (x) => STATUS[x.status]?.rotulo || x.status, render: (x) => <SeloStatus status={x.status} /> },
    { chave: "resumo", rotulo: "Resultado", quebrar: true, valor: (x) => x.resumo + (x.demonstracao ? " (demonstração)" : "") },
    { chave: "validade", rotulo: "Validade", valor: (x) => validadeDoProcesso(x), tipo: "data" },
    { chave: "consultado_em", rotulo: "Consultado em", valor: (x) => quando(x.consultado_em), tipo: "data" },
    { chave: "fonte", rotulo: "Fonte", valor: (x) => definicoes.get(x.chave)?.fonte || "" },
  ];

  useEffect(() => { if (p && !processando) qc.invalidateQueries({ queryKey: ["pre-analises"], exact: true }); }, [p?.id, processando]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = (novoId) => setParams(novoId ? { id: novoId } : {});
  const falhar = (titulo) => (e) => toast({ title: titulo, description: e.message, variant: "destructive" });
  const criar = useMutation({
    mutationFn: (cnpj) => api.post("/pre-analises", { cnpj }),
    onSuccess: (r) => { qc.setQueryData(["pre-analises", r.id], r); qc.invalidateQueries({ queryKey: ["pre-analises"], exact: true }); abrir(r.id); },
    onError: falhar("Não foi possível iniciar"),
  });
  const reprocessar = useMutation({ mutationFn: () => api.post(`/pre-analises/${id}/reprocessar`, {}), onSuccess: (r) => qc.setQueryData(["pre-analises", id], r), onError: falhar("Não foi possível consultar de novo") });
  const excluir = useMutation({ mutationFn: () => api.delete(`/pre-analises/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["pre-analises"] }); abrir(null); toast({ title: "Pré-análise excluída" }); }, onError: falhar("Não foi possível excluir") });
  const iniciar = (e) => { e.preventDefault(); const d = digitos(texto); if (d.length === 14) criar.mutate(d); };
  const nomeRelatorio = p ? `Pré-análise ${fmtCnpj(p.cnpj).replace(/\//g, "-")}.pdf` : "";

  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Comercial", to: "/area/comercial" }, { label: "Pré-análise por CNPJ" }]} title="Pré-análise por CNPJ" />
      <div className="px-6 lg:px-8 py-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4 min-w-0">
          <form onSubmit={iniciar} className="flex flex-wrap items-end gap-2 text-sm">
            <label className="space-y-1 flex-1 min-w-[220px]"><span className="block text-xs text-muted-foreground">CNPJ do prospect ou cliente</span><input className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="00.000.000/0000-00" inputMode="numeric" /></label>
            <button type="submit" disabled={digitos(texto).length !== 14 || criar.isPending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />} Iniciar pré-análise</button>
          </form>

          {atual.isError && <p role="alert" className="rounded-md border border-red-400/60 p-3 text-sm">{atual.error.message}</p>}
          {id && atual.isLoading && <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden="true" />Carregando…</p>}

          {p && (
            <>
              <section className="rounded-xl border border-border bg-card p-4" aria-label="Situação geral">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-[220px] flex-1">
                    <h2 className="font-heading text-base font-semibold">{p.razao_social || fmtCnpj(p.cnpj)}</h2>
                    <p className="text-xs text-muted-foreground tabular-nums">{fmtCnpj(p.cnpj)}{p.uf ? ` · ${p.uf}` : ""} · {quando(p.createdAt)}{p.criado_por ? ` · ${p.criado_por}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={processando} onClick={() => api.visualizar("GET", `/pre-analises/${p.id}/relatorio?ver=1`).catch(falhar("Não foi possível abrir"))} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"><FileText className="h-3.5 w-3.5" aria-hidden="true" />Relatório em PDF</button>
                    <button type="button" disabled={processando} onClick={() => api.baixar("GET", `/pre-analises/${p.id}/relatorio`, { nome: nomeRelatorio }).catch(falhar("Não foi possível baixar"))} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"><Download className="h-3.5 w-3.5" aria-hidden="true" />Baixar</button>
                    <button type="button" disabled={processando || reprocessar.isPending} onClick={() => reprocessar.mutate()} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Consultar de novo</button>
                    {user?.role === "admin" && <button type="button" disabled={processando || excluir.isPending} onClick={() => { if (window.confirm("Excluir esta pré-análise e as certidões anexadas?")) excluir.mutate(); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-destructive hover:bg-muted disabled:opacity-60" aria-label="Excluir pré-análise"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" role="status" aria-live="polite"><SeloStatus status={p.geral.status} /><span>{p.geral.texto}</span></div>
                {jaCliente ? (
                  <p className="mt-3 text-xs">Já é cliente: <Link className="text-primary hover:underline" to={`/clientes/${jaCliente.id}`}>{jaCliente.razao_social}</Link>.</p>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">Ainda não é cliente. <Link className="text-primary hover:underline" to="/">Cadastrar em Clientes</Link> ou <Link className="text-primary hover:underline" to="/comercial/propostas">fazer uma proposta</Link>.</p>
                )}
              </section>

              <TabelaPadrao id="pre-analise:consultas" ariaLabel="Consultas da pré-análise" colunas={colunas} linhas={p.processos.filter((x) => definicoes.get(x.chave))} chaveLinha={(l) => l.chave} tamanhoInicial={10}
                documentos={(x) => <AcoesProcesso p={x} def={definicoes.get(x.chave)} preAnaliseId={p.id} onAnexado={(r) => qc.setQueryData(["pre-analises", p.id], r)} onDetalhes={() => setDetalhe(x.chave)} />} />
              {aberto && (
                <Dialog open onOpenChange={(v) => !v && setDetalhe(null)}>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">{definicoes.get(aberto.chave)?.rotulo} <SeloStatus status={aberto.status} /></DialogTitle>
                      <DialogDescription>{aberto.resumo}</DialogDescription>
                    </DialogHeader>
                    <dl className="max-h-[60vh] overflow-y-auto text-sm">
                      {aberto.detalhes.filter((d) => d.rotulo !== "Portal oficial").map((d, i) => <div key={i} className="grid grid-cols-[minmax(0,12rem)_1fr] gap-3 border-b border-border/50 py-1 last:border-0"><dt className="break-words text-muted-foreground">{d.rotulo}</dt><dd className="min-w-0 break-words">{d.valor}</dd></div>)}
                    </dl>
                    <p className="text-xs text-muted-foreground">{definicoes.get(aberto.chave)?.fonte}{aberto.consultado_em ? ` · ${quando(aberto.consultado_em)}` : ""}</p>
                  </DialogContent>
                </Dialog>
              )}

              {leitura && (
                <section className="rounded-xl border border-border bg-card p-4 space-y-2" aria-label="Leitura para a Reforma">
                  <h2 className="font-heading text-sm font-semibold">Para a primeira conversa: {leitura.setor}</h2>
                  <ul className="list-disc pl-5 text-sm">{leitura.temas.map((t) => <li key={t}>{t}</li>)}</ul>
                  <p className="text-xs text-muted-foreground">Sugestão pelo CNAE; confirme com as notas e os produtos.</p>
                  <div className="flex flex-wrap gap-3 text-sm"><Link to="/reforma/regimes" className="text-primary hover:underline">Comparar os regimes</Link><Link to="/comercial/propostas" className="text-primary hover:underline">Fazer uma proposta</Link></div>
                </section>
              )}
            </>
          )}

          {!id && <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Digite o CNPJ e inicie.</p>}
        </div>

        <aside className="space-y-2" aria-label="Pré-análises feitas">
          <h2 className="font-heading text-sm font-semibold">Pré-análises feitas</h2>
          {historico.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
          {historico.data?.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma ainda.</p>}
          <ul className="space-y-1.5">
            {(historico.data || []).map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => abrir(h.id)} aria-current={h.id === id ? "true" : undefined} className={`w-full rounded-lg border px-3 py-2 text-left text-xs hover:bg-muted ${h.id === id ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                  <span className="block truncate font-medium">{h.razao_social || fmtCnpj(h.cnpj)}</span>
                  <span className="mt-0.5 flex items-center justify-between gap-2 text-muted-foreground"><span className="tabular-nums">{quando(h.createdAt)}</span><SeloStatus status={h.geral.status} /></span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
