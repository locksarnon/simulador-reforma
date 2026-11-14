import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import AvisoDoModo from "@/components/monitoramento/AvisoDoModo";
import ParcelamentosPgfn from "@/components/monitoramento/ParcelamentosPgfn";
import CertidoesCliente from "@/components/monitoramento/CertidoesCliente";
import LeituraSitfis, { ResumoSitfis } from "@/components/monitoramento/LeituraSitfis";
import SpedTransmitido from "@/components/monitoramento/SpedTransmitido";
import SimplesNacional from "@/components/monitoramento/SimplesNacional";
import CartaoServico from "@/components/monitoramento/CartaoServico";
import LegendaNiveis from "@/components/monitoramento/LegendaNiveis";
import { mascararDocumento } from "@/lib/clientes";
import { plural } from "@/lib/plural";
import { piorNivel, servicosDoGrupo, tomDaNota, useEstadoMonitoramento } from "@/lib/monitoramento";

/** Onde emitir as certidões que não vêm pela API (os portais exigem captcha); a validade fica em Arquivos e documentos. */
export const PORTAIS_DE_CERTIDAO = [
  { nome: "CND federal (Receita e PGFN)", url: "https://servicos.receitafederal.gov.br/servico/certidoes/" },
  { nome: "CNDT (débitos trabalhistas, TST)", url: "https://cndt-certidao.tst.jus.br/inicio.faces" },
  { nome: "CRF do FGTS (Caixa)", url: "https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf" },
];

function Dispensas({ empresaId, obrigacoes, dispensas }) {
  const qc = useQueryClient();
  const alternar = useMutation({
    mutationFn: ({ id, ativa }) => ativa ? api.delete(`/monitoramento/empresas/${empresaId}/dispensas/${id}`) : api.post(`/monitoramento/empresas/${empresaId}/dispensas`, { obrigacao: id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["monitoramento", "empresa", empresaId] }); },
    onError: (e) => toast({ title: "Não foi possível mudar", description: e.message, variant: "destructive" }),
  });
  const dispensadas = new Set((dispensas || []).map((d) => d.obrigacao));
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-2">
      <h3 className="text-sm font-semibold">Obrigações que este cliente não tem</h3>
      <div className="flex flex-wrap gap-4">
        {(obrigacoes || []).map((o) => (
          <label key={o.id} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={dispensadas.has(o.id)} onChange={() => alternar.mutate({ id: o.id, ativa: dispensadas.has(o.id) })} /> Não tem {o.rotulo}</label>
        ))}
      </div>
    </section>
  );
}

/** BPO Fiscal > Monitoramento > um cliente (empresa ou pessoa física): as consultas ao e-CAC por assunto, com o resultado e os PDF. */
export default function MonitoramentoEmpresaPagina({ pessoaFisica = false }) {
  const { empresaId } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const ehAdmin = user?.role === "admin";
  const base = pessoaFisica ? `/monitoramento/pessoas/${empresaId}` : `/monitoramento/empresas/${empresaId}`;
  const estado = useEstadoMonitoramento();
  const dono = useQuery({
    queryKey: [pessoaFisica ? "pessoa" : "empresa", empresaId],
    queryFn: () => pessoaFisica ? api.get("/pessoas-fisicas").then((l) => l.find((p) => p.id === empresaId)) : api.entities.Empresa.get(empresaId),
  });
  const dados = useQuery({ queryKey: ["monitoramento", "empresa", empresaId], queryFn: () => api.get(base) });
  const novidades = useQuery({ queryKey: ["monitoramento", "novidades", empresaId], queryFn: () => api.get(`/monitoramento/empresas/${empresaId}/novidades`), enabled: !pessoaFisica });
  const [lote, setLote] = useState(null);
  // Aba escolhida; até a pessoa escolher, a primeira do cliente (só depois de carregar os serviços indicados).
  const [params] = useSearchParams();
  const confirmar = useConfirmar();
  const [aba, setAba] = useState(() => params.get("aba"));
  const ultimas = dados.data?.ultimas || {};
  const indicados = dados.data?.servicos_indicados || [];
  const servicos = estado.data?.servicos || [];
  // Parcelamentos aparece para toda empresa: a PGFN (Sispar) vale para qualquer regime.
  const grupos = useMemo(() => (estado.data?.grupos || []).filter((g) => (g.id === "parcelamentos" && !pessoaFisica) || servicos.some((s) => s.grupo === g.id && indicados.includes(s.chave))), [estado.data, servicos, indicados, pessoaFisica]);
  const desligado = estado.data?.modo === "DESLIGADO";
  const abaAtiva = aba || (dados.isLoading ? "" : grupos[0]?.id || "situacao");
  const nome = pessoaFisica ? dono.data?.nome : dono.data?.razao_social;
  const doc = pessoaFisica ? dono.data?.cpf : dono.data?.cnpj_cpf;
  const nivelDoGrupo = (g) => piorNivel(servicos.filter((s) => s.grupo === g && indicados.includes(s.chave)).map((s) => (ultimas[s.chave]?.sucesso ? ultimas[s.chave].nivel : undefined)));

  const atualizarTudo = useMutation({
    mutationFn: () => api.post("/monitoramento/lote", { empresa_ids: [empresaId] }),
    onSuccess: (l) => {
      setLote(l);
      const passo = async () => {
        const s = await api.get(`/monitoramento/lote/${l.id}`).catch(() => null);
        if (!s) return;
        setLote(s);
        qc.invalidateQueries({ queryKey: ["monitoramento", "empresa", empresaId] });
        if (!s.fim) setTimeout(passo, 2500); else toast({ title: "Atualização concluída", description: `${plural(s.feitas - s.erros, "consulta feita", "consultas feitas")}${s.erros ? `, ${s.erros} com erro ou sem resultado` : ""}.` });
      };
      setTimeout(passo, 1500);
    },
    onError: (e) => toast({ title: "Não foi possível atualizar", description: e.message, variant: "destructive" }),
  });

  const crumbs = [{ label: "Início", to: "/inicio" }, { label: "BPO Fiscal", to: "/area/bpo" }, { label: "Monitoramento fiscal", to: "/bpo/monitoramento" }, { label: nome || "Cliente" }];
  if (dono.isLoading || estado.isLoading) return <div><PageHeader crumbs={crumbs} title="Monitoramento" /><p className="p-8 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p></div>;
  if (!dono.data) return <div><PageHeader crumbs={crumbs} title="Cliente não encontrado" /><p role="alert" className="p-8 text-sm">Este cliente não existe mais. <Link to="/bpo/monitoramento" className="text-primary hover:underline">Voltar</Link></p></div>;
  const pontos = (estado.data?.grupos || []).map((g) => nivelDoGrupo(g.id)).filter(Boolean);
  const nota = Math.max(0, 100 - pontos.filter((n) => n === "CRITICO").length * 25 - pontos.filter((n) => n === "ATENCAO").length * 8);

  return (
    <div>
      <PageHeader
        crumbs={crumbs}
        title={nome}
        subtitle={[mascararDocumento(doc), pessoaFisica ? "Pessoa física" : dono.data.regime_atual || "Regime não informado"].filter(Boolean).join(" · ")}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {pontos.length > 0 && <span className={`text-sm font-semibold tabular-nums ${tomDaNota(nota)}`} title="Saúde fiscal">Saúde fiscal {nota}</span>}
            {!pessoaFisica && <button type="button" disabled={desligado || atualizarTudo.isPending || (lote && !lote.fim)} onClick={async () => { if (await confirmar({ titulo: "Este serviço tem custo. Confirma o avanço mesmo assim?", descricao: "Serão feitas todas as consultas deste cliente, e cada consulta é cobrada. Avalie atualizar só o serviço necessário.", rotulo: "Atualizar mesmo assim", perigoso: false })) atualizarTudo.mutate(); }} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
              {lote && !lote.fim ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {lote.feitas} de {lote.total || "…"}</> : <><RefreshCw className="h-4 w-4" aria-hidden="true" /> Atualizar tudo</>}
            </button>}
            {!pessoaFisica && <Link to={`/clientes/${empresaId}`} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Ficha do cliente</Link>}
          </div>
        )}
      />
      <div className="px-6 lg:px-8 py-5 space-y-4">
        <AvisoDoModo modo={estado.data?.modo} ehAdmin={ehAdmin} />
        {!pessoaFisica && (novidades.data || []).length > 0 && (
          <div role="status" className="flex flex-wrap items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-xs dark:border-sky-900 dark:bg-sky-950/30">
            <span className="font-medium">Novidades da Receita (eventos de atualização):</span>
            {novidades.data.map((n) => <span key={n.id} className="rounded-full border border-border bg-background px-2 py-0.5">{n.rotulo} em {new Date(n.data_evento).toLocaleDateString("pt-BR", { timeZone: "UTC" })}{n.atendido_em ? " · consultado" : ""}</span>)}
          </div>
        )}
        {!pessoaFisica && !dono.data.regime_atual && <p role="status" className="text-xs text-amber-700 dark:text-amber-400">Sem regime no cadastro: aparecem todos os serviços. <Link to={`/clientes/${empresaId}`} className="underline">Ficha do cliente</Link></p>}
        <Tabs value={abaAtiva} onValueChange={setAba} className="space-y-4">
          <TabsList className="flex h-auto flex-wrap justify-start">
            {grupos.map((g) => <TabsTrigger key={g.id} value={g.id} className="gap-1.5">{g.rotulo}{nivelDoGrupo(g.id) && <span className={`h-2 w-2 rounded-full ${nivelDoGrupo(g.id) === "CRITICO" ? "bg-red-500" : nivelDoGrupo(g.id) === "ATENCAO" ? "bg-amber-500" : nivelDoGrupo(g.id) === "OK" ? "bg-emerald-500" : "bg-sky-500"}`} aria-label={nivelDoGrupo(g.id)} />}</TabsTrigger>)}
            {!pessoaFisica && <TabsTrigger value="certidoes">Certidões</TabsTrigger>}
          </TabsList>
          {grupos.map((g) => {
            const { indicados: lista, outros } = servicosDoGrupo(servicos, g.id, indicados);
            const cartao = (s) => <CartaoServico key={s.chave} servico={s} ultima={ultimas[s.chave]} base={base} desligado={desligado} />;
            // Subabas: o que é lido sozinho do relatório de situação fiscal, cada serviço do assunto e os demais.
            const subabas = [
              ...(g.id === "situacao" && !pessoaFisica ? [{ id: "lido", rotulo: "Situação fiscal", conteudo: <ResumoSitfis empresaId={empresaId} /> }] : []),
              ...(g.id === "parcelamentos" && !pessoaFisica ? [{ id: "lido", rotulo: "Receita Federal e PGFN", conteudo: <LeituraSitfis empresaId={empresaId} titulo="Parcelamentos na Receita Federal e na PGFN" filtro={(s) => s.assunto === "PARCELAMENTO"} vazio="Nenhum parcelamento na Receita Federal nem na PGFN." /> }] : []),
              ...(g.id === "declaracoes" && !pessoaFisica ? [{ id: "lido", rotulo: "Omissões apontadas pela Receita", conteudo: <LeituraSitfis empresaId={empresaId} titulo="Declarações não entregues (omissões apontadas pela Receita)" filtro={(s) => s.tipo === "OMISSAO"} vazio="Nenhuma omissão de declaração." /> }, { id: "sped", rotulo: "SPED e EFD", conteudo: <SpedTransmitido empresaId={empresaId} /> }] : []),
              ...(g.id === "declaracoes" && !pessoaFisica && /simples/i.test(dono.data.regime_atual || "") ? [{ id: "simples", rotulo: "Simples: sublimite, faturamento e Fator R", conteudo: <SimplesNacional empresaId={empresaId} /> }] : []),
              ...lista.map((s) => ({ id: s.chave, rotulo: s.rotulo, nivel: ultimas[s.chave]?.sucesso ? ultimas[s.chave].nivel : undefined, conteudo: cartao(s) })),
              ...(g.id === "parcelamentos" && !pessoaFisica ? [{ id: "estado-municipio", rotulo: "Estado e município", conteudo: <ParcelamentosPgfn empresaId={empresaId} /> }] : []),
              ...(g.id === "declaracoes" && !pessoaFisica ? [{ id: "dispensas", rotulo: "Obrigações que não tem", conteudo: <Dispensas empresaId={empresaId} obrigacoes={estado.data?.obrigacoes} dispensas={dados.data?.dispensas} /> }] : []),
              ...(outros.length ? [{ id: "outros", rotulo: `Outros serviços (${outros.length})`, conteudo: <div className="space-y-3">{outros.map(cartao)}</div> }] : []),
            ];
            return (
              <TabsContent key={g.id} value={g.id} className="space-y-3">
                <Tabs defaultValue={subabas[0]?.id}>
                  <TabsList className="flex h-auto flex-wrap justify-start bg-transparent p-0 gap-1">
                    {subabas.map((sa) => (
                      <TabsTrigger key={sa.id} value={sa.id} className="gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">
                        {sa.rotulo}{sa.nivel && <span className={`h-1.5 w-1.5 rounded-full ${sa.nivel === "CRITICO" ? "bg-red-500" : sa.nivel === "ATENCAO" ? "bg-amber-500" : sa.nivel === "OK" ? "bg-emerald-500" : "bg-sky-500"}`} aria-label={sa.nivel} />}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {subabas.map((sa) => <TabsContent key={sa.id} value={sa.id} className="mt-3">{sa.conteudo}</TabsContent>)}
                </Tabs>
              </TabsContent>
            );
          })}
          {!pessoaFisica && (
            <TabsContent value="certidoes" className="space-y-3">
              <CertidoesCliente empresaId={empresaId} />
            </TabsContent>
          )}
        </Tabs>
        {dados.data && Object.keys(ultimas).length === 0 && <p className="text-xs text-muted-foreground">Nenhuma consulta.</p>}
        <LegendaNiveis />
      </div>
    </div>
  );
}
