import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import SeletorMes, { mesDeHoje, mesValido } from "@/components/SeletorMes";
import BotoesDocumento from "@/components/documentos/BotoesDocumento";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brl4 = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
const num = (v) => Number(v).toLocaleString("pt-BR");
const campo = "h-8 rounded-md border border-input bg-background px-2 text-sm tabular-nums";
const dataBr = (iso) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const diaMes = (d) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const tamanho = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const somaPorIntegracao = (linhas, nome) => linhas.reduce((s, l) => s + (l.por_integracao.find((g) => g.integracao === nome)?.total ?? 0), 0);

/** Colunas comuns de "por cliente" e "por usuário": uma por integração (valor, e as chamadas na dica) e o total. */
function colunasDeCusto(integracoes) {
  return [
    { chave: "chamadas", rotulo: "Chamadas", tipo: "numero", alinhar: "direita" },
    ...integracoes.map((nome) => ({
      chave: `int:${nome}`, rotulo: nome, tipo: "numero", alinhar: "direita",
      valor: (l) => l.por_integracao.find((g) => g.integracao === nome)?.total || null,
      render: (l) => {
        const g = l.por_integracao.find((x) => x.integracao === nome);
        if (!g?.chamadas) return <span className="text-muted-foreground">—</span>;
        const detalhe = l.itens.filter((i) => i.integracao === nome && i.quantidade).map((i) => `${i.rotulo}: ${i.quantidade} × ${brl4(i.preco)}`).join("\n");
        return <span className="tabular-nums" title={detalhe}>{brl(g.total)} <span className="text-[11px] text-muted-foreground">({g.chamadas})</span></span>;
      },
    })),
    { chave: "total", rotulo: "Total", tipo: "numero", alinhar: "direita", render: (l) => <span className="font-semibold tabular-nums">{brl(l.total)}</span> },
  ];
}

function Resumo({ rotulo, valor, dica }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2" title={dica}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
    </div>
  );
}

const COLUNAS_FAIXA = [
  { chave: "faixa", rotulo: "Faixa", tipo: "numero", render: (l) => <span className="inline-flex items-center gap-1.5 tabular-nums">{String(l.faixa).padStart(2, "0")}{l.atual && <span className="rounded bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">mês atual</span>}</span> },
  { chave: "de", rotulo: "De", tipo: "numero", alinhar: "direita", render: (l) => num(l.de) },
  { chave: "ate", rotulo: "Até", tipo: "numero", alinhar: "direita", valor: (l) => l.ate ?? Infinity, render: (l) => (l.ate == null ? "acima" : num(l.ate)) },
  { chave: "preco", rotulo: "Preço unitário", tipo: "numero", alinhar: "direita", render: (l) => <span className="font-medium tabular-nums">{brl4(l.preco)}</span> },
];

/** Um contrato: a regra de cobrança, a tabela de cada serviço (faixa a faixa, com a faixa do mês), o preço negociado e o PDF. */
function CartaoContrato({ tabela, itens, precos, setPrecos, oficiais, contratos, aoAnexar, enviando, aoExcluir }) {
  const entrada = useRef(null);
  const itensDoContrato = itens.filter((i) => i.integracao === tabela.integracao);
  const anexos = contratos.filter((c) => c.integracao === tabela.integracao);
  return (
    <article className="rounded-xl border border-border bg-card" aria-label={`Contrato ${tabela.integracao}`}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3">
        <h3 className="font-heading text-sm font-semibold">{tabela.integracao}</h3>
        <span className="text-xs text-muted-foreground">{tabela.contrato ? `Contrato Serpro nº ${tabela.contrato}` : "Sem contrato: tabela da conta do escritório"}</span>
        <p className="basis-full text-xs text-muted-foreground">{tabela.regra}</p>
      </header>
      <div className="space-y-4 p-4">
        <div className={`grid gap-4 ${tabela.servicos.length > 1 ? "lg:grid-cols-2 2xl:grid-cols-3" : ""}`}>
          {tabela.servicos.map((sv) => (
            <section key={sv.nome} className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-medium">{sv.nome}</h4>
                <span className="text-xs text-muted-foreground tabular-nums">{sv.unidade} · volume do mês: {num(sv.volume)}</span>
              </div>
              <TabelaPadrao simples id={`admin:custos:faixas:${tabela.integracao}:${sv.nome}`} ariaLabel={`Faixas: ${sv.nome}`} colunas={COLUNAS_FAIXA} ordemInicial={null}
                linhas={sv.faixas.map((f) => ({ ...f, id: f.faixa, atual: f.faixa === sv.faixa_atual && sv.faixas.length > 1 }))}
                destaqueLinha={(l) => (l.atual ? "!bg-primary/10 font-medium" : "")} />
              {sv.nota && <p className="text-[11px] text-muted-foreground">{sv.nota}</p>}
            </section>
          ))}
        </div>

        {itensDoContrato.length > 0 && (
          <details className="rounded-md border border-border px-3 py-2 text-sm">
            <summary className="cursor-pointer text-xs font-medium">Preço negociado diferente do contrato (opcional)</summary>
            <p className="mt-1 text-xs text-muted-foreground">Em branco vale a tabela acima, pela faixa do volume do mês (o valor em cinza).</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {itensDoContrato.map((i) => (
                <label key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{i.rotulo}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">R$<input type="number" min="0" step="0.0001" value={precos[i.id] || ""} placeholder={oficiais?.[i.id] != null ? String(oficiais[i.id]).replace(".", ",") : ""} onChange={(e) => setPrecos((p) => ({ ...p, [i.id]: e.target.value }))} className={`${campo} w-24 text-right`} aria-label={`Preço negociado: ${i.rotulo}`} /></span>
                </label>
              ))}
            </div>
          </details>
        )}

        <section className="space-y-1" aria-label={`Contrato anexado: ${tabela.integracao}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="flex flex-1 items-center gap-1.5 text-sm font-medium"><FileText className="h-4 w-4 text-primary" aria-hidden="true" />Contrato</h4>
            <input ref={entrada} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) aoAnexar(f, tabela.integracao); }} />
            <button type="button" disabled={enviando} onClick={() => entrada.current?.click()} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-60">
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}{anexos.length ? "Anexar outro PDF" : "Anexar o contrato (PDF)"}
            </button>
          </div>
          {anexos.length ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {anexos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm">
                  <span className="font-medium">{c.numero ? `Nº ${c.numero}` : c.nome}</span>
                  {c.objeto && <span className="text-muted-foreground">{c.objeto}</span>}
                  {c.vigencia && <span className="text-xs text-muted-foreground">Vigência {c.vigencia}</span>}
                  <span className="flex-1 text-xs text-muted-foreground">{tamanho(c.tamanho)} · anexado em {dataBr(c.enviado_em)}{c.enviado_por ? ` por ${c.enviado_por}` : ""}</span>
                  <BotoesDocumento url={`/custos/contratos/${c.id}/arquivo`} nome={c.nome} rotulo={`contrato ${c.numero || c.nome}`} />
                  <button type="button" onClick={() => aoExcluir(c)} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label={`Excluir contrato ${c.numero || c.nome}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted-foreground">{tabela.contrato ? `Anexe o PDF do contrato nº ${tabela.contrato}: o sistema lê o número, o produto e a vigência da capa.` : "Anexe o comprovante ou os termos da conta, se quiser guardá-los aqui."}</p>}
        </section>
      </div>
    </article>
  );
}

/** Administração > Custos das ferramentas: o mês por cliente e por usuário; abaixo, a tabela de cada contrato com o PDF. */
export default function CustosPagina() {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const [params, setParams] = useSearchParams();
  const mes = mesValido(params.get("mes")) ? params.get("mes") : mesDeHoje();
  const mudarMes = (m) => setParams((p) => { const n = new URLSearchParams(p); n.set("mes", m); return n; }, { replace: true });
  const q = useQuery({ queryKey: ["custos", "geral", mes], queryFn: () => api.get("/custos", { mes }) });
  const contratos = useQuery({ queryKey: ["custos", "contratos"], queryFn: () => api.get("/custos/contratos") });
  const [precos, setPrecos] = useState({});
  const [fixos, setFixos] = useState([]);
  useEffect(() => { if (q.data) { setPrecos(q.data.precos || {}); setFixos(q.data.fixos || []); } }, [q.data]);
  const salvar = useMutation({
    mutationFn: () => api.put("/custos/precos", { precos, fixos }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["custos"] }); toast({ title: "Preços salvos" }); },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  const anexar = useMutation({
    mutationFn: ({ arquivo, integracao }) => api.upload("/custos/contratos", arquivo, { integracao }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["custos", "contratos"] }); toast({ title: `Contrato ${r.numero ? `nº ${r.numero} ` : ""}anexado` }); },
    onError: (e) => toast({ title: "Contrato não anexado", description: e.message, variant: "destructive" }),
  });
  const excluir = useMutation({
    mutationFn: (id) => api.delete(`/custos/contratos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custos", "contratos"] }),
    onError: (e) => toast({ title: "Não foi possível excluir", description: e.message, variant: "destructive" }),
  });
  const d = q.data;
  const integracoes = d?.integracoes || [];
  const clientes = (d?.clientes || []).map((c) => ({ ...c, id: c.empresa_id || "sem-cliente" }));
  const usuarios = (d?.usuarios || []).map((u) => ({ ...u, id: u.usuario }));
  const colunasCliente = [
    { chave: "cliente", rotulo: "Cliente", render: (l) => <span className={l.empresa_id ? "font-medium" : "text-muted-foreground"}>{l.cliente}</span> },
    { chave: "documento", rotulo: "CNPJ/CPF", valor: (l) => l.documento || "" },
    ...colunasDeCusto(integracoes),
  ];
  const colunasUsuario = [{ chave: "usuario", rotulo: "Usuário" }, ...colunasDeCusto(integracoes)];
  const ciclo = d?.ciclo_serpro ? `${diaMes(d.ciclo_serpro.de)} a ${diaMes(new Date(d.ciclo_serpro.ate).getTime() - 86_400_000)}` : "";

  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Custos das ferramentas" }]} title="Custos das ferramentas externas" />
      <div className="px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <SeletorMes valor={mes} mudar={mudarMes} ariaLabel="Mês dos custos" />
          {ciclo && <span className="text-xs text-muted-foreground">Serpro: ciclo de faturamento de {ciclo} · Infosimples: mês do calendário</span>}
        </div>

        {q.isLoading && <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden="true" />Calculando…</p>}
        {q.error && <p role="alert" className="text-sm">{q.error.message}</p>}

        {d && (
          <>
            <section aria-label="Resumo do mês" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Resumo rotulo="Total do escritório" valor={brl(d.total)} />
              <Resumo rotulo="Variável (chamadas)" valor={brl(d.variavel)} />
              <Resumo rotulo="Fixos" valor={brl(d.fixo)} dica={(d.fixos_do_mes || []).map((f) => `${f.rotulo}: ${brl(f.valor)}`).join("\n")} />
              {integracoes.filter((n) => somaPorIntegracao(usuarios, n) > 0).map((n) => <Resumo key={n} rotulo={n} valor={brl(somaPorIntegracao(usuarios, n))} />)}
            </section>

            <Tabs defaultValue="clientes">
              <TabsList>
                <TabsTrigger value="clientes">Por cliente</TabsTrigger>
                <TabsTrigger value="usuarios">Por usuário</TabsTrigger>
              </TabsList>
              <TabsContent value="clientes" className="mt-3 space-y-1">
                <p className="text-xs text-muted-foreground">Do cliente que mais gerou custo para o que menos: base para cobrar adicionais. Passe o mouse sobre um valor para ver as chamadas e o preço unitário.</p>
                <TabelaPadrao id="admin:custos:clientes" colunas={colunasCliente} linhas={clientes} ariaLabel="Custos do mês por cliente" ordemInicial={{ chave: "total", dir: -1 }} vazio="Nenhuma chamada paga neste mês." />
              </TabsContent>
              <TabsContent value="usuarios" className="mt-3">
                <TabelaPadrao id="admin:custos" colunas={colunasUsuario} linhas={usuarios} ariaLabel="Custos do mês por usuário" ordemInicial={{ chave: "total", dir: -1 }} vazio="Nenhuma chamada paga neste mês." />
              </TabsContent>
            </Tabs>

            <section className="space-y-3" aria-label="Tabelas de preços e contratos">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1">
                  <h2 className="font-heading text-base font-semibold">Tabelas de preços e contratos</h2>
                  <p className="text-xs text-muted-foreground">Uma tabela por contrato, serviço a serviço e faixa a faixa, como no Anexo I de cada um; a faixa do mês fica destacada. O PDF do contrato fica logo abaixo da tabela.</p>
                </div>
                <button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate()} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Salvar preços e custos fixos</button>
              </div>
              {(d.tabelas || []).map((tb) => (
                <CartaoContrato key={tb.integracao} tabela={tb} itens={d.itens || []} precos={precos} setPrecos={setPrecos} oficiais={d.oficiais} contratos={contratos.data || []}
                  enviando={anexar.isPending} aoAnexar={(arquivo, integracao) => anexar.mutate({ arquivo, integracao })}
                  aoExcluir={async (c) => { if (await confirmar({ titulo: `Excluir o contrato ${c.numero || c.nome}?`, descricao: "O PDF sai do InTAX. A tabela de preços não muda.", rotulo: "Excluir" })) excluir.mutate(c.id); }} />
              ))}

              <article className="rounded-xl border border-border bg-card p-4 space-y-2" aria-label="Custos fixos do mês">
                <h3 className="font-heading text-sm font-semibold">Custos fixos do mês</h3>
                <p className="text-xs text-muted-foreground">Mensalidades e outros valores fixos. O complemento da franquia mínima da Infosimples entra sozinho quando o consumo do mês não chega a R$ 100,00.</p>
                {fixos.map((f, k) => (
                  <div key={k} className="flex flex-wrap items-center gap-2">
                    <input value={f.rotulo} onChange={(e) => setFixos((x) => x.map((y, j) => (j === k ? { ...y, rotulo: e.target.value } : y)))} placeholder="Descrição" className={`${campo} min-w-[220px] flex-1`} aria-label="Descrição do custo fixo" />
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">R$<input type="number" min="0" step="0.01" value={f.valor} onChange={(e) => setFixos((x) => x.map((y, j) => (j === k ? { ...y, valor: e.target.value } : y)))} className={`${campo} w-28 text-right`} aria-label="Valor mensal" /></span>
                    <button type="button" onClick={() => setFixos((x) => x.filter((_, j) => j !== k))} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Remover custo fixo"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setFixos((x) => [...x, { rotulo: "", valor: 0 }])} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted"><Plus className="h-3.5 w-3.5" aria-hidden="true" />Custo fixo</button>
              </article>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
