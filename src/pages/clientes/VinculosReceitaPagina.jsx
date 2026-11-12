import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, RefreshCw, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import { BotoesDocumento } from "@/components/monitoramento/CartaoServico";
import { mascararDocumento } from "@/lib/clientes";

const COLUNAS_VINCULOS = [
  { chave: "cnpj", rotulo: "CNPJ", render: (l) => <span className="tabular-nums">{mascararDocumento(l.cnpj)}</span>, quebrar: false },
  { chave: "tipo", rotulo: "Estabelecimento" },
  { chave: "situacao", rotulo: "Situação cadastral" },
  { chave: "uf", rotulo: "UF" },
  { chave: "municipio", rotulo: "Município" },
  { chave: "cliente", rotulo: "No InTAX", valor: (l) => (l.cliente ? `${l.cliente.razao_social}${l.cliente.arquivado ? " (arquivado)" : ""}` : "Não é cliente"), render: (l) => (l.cliente ? <Link to={`/clientes/${l.cliente.id}`} className="text-primary hover:underline">{l.cliente.razao_social}{l.cliente.arquivado ? " (arquivado)" : ""}</Link> : <span className="text-amber-700 dark:text-amber-400">Não é cliente</span>) },
];
const COLUNAS_RENUNCIAS = [
  { chave: "id", rotulo: "Renúncia", quebrar: false },
  { chave: "cnpj", rotulo: "CNPJ", render: (l) => <span className="tabular-nums">{mascararDocumento(l.cnpj)}</span> },
  { chave: "data", rotulo: "Data", tipo: "data" },
  { chave: "situacao", rotulo: "Situação" },
  { chave: "solicitante", rotulo: "Solicitante" },
];

/** Clientes > Vínculos na Receita: os CNPJs em que o escritório é o contador na Receita (Redesim), com o cadastro dos que faltam. */
export default function VinculosReceitaPagina() {
  const qc = useQueryClient();
  const vinculos = useQuery({ queryKey: ["redesim", "vinculos"], queryFn: () => api.get("/monitoramento/escritorio/vinculos"), retry: false });
  const renuncias = useQuery({ queryKey: ["redesim", "renuncias"], queryFn: () => api.get("/monitoramento/escritorio/renuncias"), retry: false });
  const [marcados, setMarcados] = useState([]);
  const faltam = (vinculos.data?.vinculos || []).filter((v) => !v.cliente);
  const importar = useMutation({
    mutationFn: async (cnpjs) => {
      let feitos = 0;
      const erros = [];
      for (const cnpj of cnpjs) {
        try {
          const d = await api.get(`/cnpj/${cnpj}`).catch(() => null);
          await api.post("/clientes", { razao_social: d?.razao_social || `CNPJ ${mascararDocumento(cnpj)}`, cnpj_cpf: cnpj, servicos: ["BPO_FISCAL"] });
          feitos++;
        } catch (e) { erros.push(`${mascararDocumento(cnpj)}: ${e.message}`); }
      }
      return { feitos, erros };
    },
    onSuccess: (r) => { setMarcados([]); qc.invalidateQueries({ queryKey: ["redesim"] }); qc.invalidateQueries({ queryKey: ["empresas"] }); toast({ title: `${r.feitos} cliente(s) cadastrado(s) no BPO fiscal`, description: r.erros.join(" · ") || undefined, variant: r.erros.length ? "destructive" : undefined }); },
  });
  const demo = vinculos.data?.demonstracao || renuncias.data?.demonstracao;
  const [renunciar, setRenunciar] = useState(null);
  const colunas = [
    { chave: "marcar", rotulo: "Cadastrar", valor: (l) => (l.cliente ? "" : "sim"), render: (l) => (l.cliente ? null : <input type="checkbox" aria-label={`Cadastrar ${l.cnpj}`} checked={marcados.includes(l.cnpj)} onChange={() => setMarcados((m) => (m.includes(l.cnpj) ? m.filter((x) => x !== l.cnpj) : [...m, l.cnpj]))} />) },
    ...COLUNAS_VINCULOS,
    { chave: "renunciar", rotulo: "Renúncia", valor: () => "", ordenavel: false, render: (l) => <button type="button" onClick={() => setRenunciar(l)} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted"><LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Renunciar</button> },
  ];
  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Clientes", to: "/area/clientes" }, { label: "Vínculos na Receita" }]} title="Vínculos na Receita (Redesim)"
        subtitle="Os CNPJs em que o escritório é o contador responsável na Receita Federal, pelo Integra Contador. Cadastre os que ainda não são clientes em um clique." />
      <div className="px-6 lg:px-8 py-6 space-y-3">
        {demo && <p role="status" className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">Modo demonstração: dados fictícios do Serpro. Não cadastre clientes a partir deles.</p>}
        <Tabs defaultValue="vinculos">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="vinculos" className="rounded-md border border-border px-2.5 py-1 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">Vínculos{vinculos.data ? ` (${vinculos.data.vinculos.length})` : ""}</TabsTrigger>
            <TabsTrigger value="renuncias" className="rounded-md border border-border px-2.5 py-1 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none">Renúncias</TabsTrigger>
          </TabsList>
          <TabsContent value="vinculos" className="mt-3">
            {vinculos.isLoading ? <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden="true" />Consultando a Receita…</p> : vinculos.error ? <p role="alert" className="text-sm">{vinculos.error.message}</p> : (
              <TabelaPadrao id="redesim:vinculos" colunas={colunas} linhas={vinculos.data.vinculos} chaveLinha={(l, i) => `${l.cnpj}-${i}`} ariaLabel="Vínculos do escritório na Receita" vazio="A Receita não aponta nenhum CNPJ com o escritório como contador."
                acoes={(
                  <>
                    {faltam.length > 0 && <button type="button" onClick={() => setMarcados(marcados.length === faltam.length ? [] : faltam.map((v) => v.cnpj))} className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs hover:bg-muted">{marcados.length === faltam.length ? "Desmarcar todos" : `Marcar os ${faltam.length} que não são clientes`}</button>}
                    <button type="button" disabled={!marcados.length || importar.isPending || demo} onClick={() => importar.mutate(marcados)} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-60">{importar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />} Cadastrar {marcados.length || ""} no BPO fiscal</button>
                    <button type="button" onClick={() => vinculos.refetch()} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Consultar de novo</button>
                  </>
                )} />
            )}
          </TabsContent>
          <TabsContent value="renuncias" className="mt-3">
            {renuncias.isLoading ? <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden="true" />Consultando a Receita…</p> : renuncias.error ? <p role="alert" className="text-sm">{renuncias.error.message}</p> : (
              <TabelaPadrao id="redesim:renuncias" colunas={COLUNAS_RENUNCIAS} linhas={renuncias.data.renuncias} ariaLabel="Renúncias de vínculo" vazio="Nenhuma renúncia nos últimos 12 meses."
                documentos={(l) => <BotoesDocumento url={`/monitoramento/escritorio/renuncias/${l.id}/comprovante`} nome={`Comprovante de renúncia ${l.id}.pdf`} rotulo={`comprovante da renúncia ${l.id}`} />} />
            )}
          </TabsContent>
        </Tabs>
      </div>
      {renunciar && <DialogoRenuncia vinculo={renunciar} aoFechar={() => setRenunciar(null)} aoEnviar={() => qc.invalidateQueries({ queryKey: ["redesim"] })} />}
    </div>
  );
}

const ROTULOS_SITUACAO = { resultado: "Renúncia efetuada", mensagemRetorno: "Mensagem da Receita", situacao: "Situação", idSolicitacao: "Solicitação" };
const so = (v) => String(v || "").replace(/\D/g, "");
const cpfMascara = (v) => so(v).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");

/** Pedido de renúncia do escritório como contador responsável (Redesim, SOLICRENUNCIA262) e a situação do pedido (SITSOLICRENUNCIA265). */
function DialogoRenuncia({ vinculo, aoFechar, aoEnviar }) {
  const [cpfContador, setCpfContador] = useState("");
  const [cpfPreenchedor, setCpfPreenchedor] = useState("");
  const [ciencia, setCiencia] = useState(false);
  const [pedido, setPedido] = useState(null);
  const enviar = useMutation({
    mutationFn: () => api.post("/monitoramento/escritorio/renuncias", { empresaId: vinculo.cliente?.id, cnpj: vinculo.cnpj, cpfContador, cpfPreenchedor, ciencia }),
    onSuccess: (r) => { setPedido(r); aoEnviar?.(); toast({ title: "Renúncia pedida na Receita", description: r.idSolicitacao ? `Solicitação ${r.idSolicitacao}` : undefined }); },
    onError: (e) => toast({ title: "A renúncia não foi enviada", description: e.message, variant: "destructive" }),
  });
  const situacao = useMutation({
    mutationFn: () => api.get(`/monitoramento/escritorio/solicitacoes/${encodeURIComponent(pedido.idSolicitacao)}`),
    onError: (e) => toast({ title: "Não foi possível consultar a solicitação", description: e.message, variant: "destructive" }),
  });
  const pronto = so(cpfContador).length === 11 && so(cpfPreenchedor).length === 11 && ciencia;
  const campo = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm tabular-nums";
  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Renunciar como contador</DialogTitle>
          <DialogDescription>
            {vinculo.cliente?.razao_social || "CNPJ"} · <span className="tabular-nums">{mascararDocumento(vinculo.cnpj)}</span>. O pedido vai à Receita pela Redesim e o escritório deixa de ser o contador responsável deste CNPJ.
          </DialogDescription>
        </DialogHeader>
        {pedido ? (
          <div className="space-y-2 text-sm">
            <p>Solicitação enviada{pedido.demonstracao ? " (demonstração)" : ""}: <span className="font-medium tabular-nums">{pedido.idSolicitacao || "sem número"}</span></p>
            {pedido.idSolicitacao && (
              <button type="button" disabled={situacao.isPending} onClick={() => situacao.mutate()} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-60">
                {situacao.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />} Consultar a situação
              </button>
            )}
            {situacao.data && (
              <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
                {Object.entries(situacao.data).filter(([k, v]) => k !== "demonstracao" && v !== null && typeof v !== "object").flatMap(([k, v]) => [
                  <dt key={`${k}-r`} className="text-muted-foreground">{ROTULOS_SITUACAO[k] || k}</dt>, <dd key={`${k}-v`}>{v === true ? "Sim" : v === false ? "Não" : String(v)}</dd>,
                ])}
              </dl>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1 text-sm"><span className="text-xs text-muted-foreground">CPF do contador responsável</span><input className={campo} inputMode="numeric" value={cpfMascara(cpfContador)} onChange={(e) => setCpfContador(e.target.value)} placeholder="000.000.000-00" /></label>
            <label className="block space-y-1 text-sm"><span className="text-xs text-muted-foreground">CPF de quem preenche o pedido</span><input className={campo} inputMode="numeric" value={cpfMascara(cpfPreenchedor)} onChange={(e) => setCpfPreenchedor(e.target.value)} placeholder="000.000.000-00" /></label>
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={ciencia} onChange={(e) => setCiencia(e.target.checked)} /> <span>Estou ciente e de acordo com as declarações exigidas pela Receita para o pedido de renúncia do contador responsável.</span></label>
          </div>
        )}
        <DialogFooter>
          <button type="button" onClick={aoFechar} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted">{pedido ? "Fechar" : "Cancelar"}</button>
          {!pedido && (
            <button type="button" disabled={!pronto || enviar.isPending} onClick={() => enviar.mutate()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-amber-600 px-3 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60">
              {enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />} Enviar a renúncia
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
