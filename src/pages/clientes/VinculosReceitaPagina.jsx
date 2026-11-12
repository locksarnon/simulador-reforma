import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, UserPlus } from "lucide-react";
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
  const colunas = [
    { chave: "marcar", rotulo: "Cadastrar", valor: (l) => (l.cliente ? "" : "sim"), render: (l) => (l.cliente ? null : <input type="checkbox" aria-label={`Cadastrar ${l.cnpj}`} checked={marcados.includes(l.cnpj)} onChange={() => setMarcados((m) => (m.includes(l.cnpj) ? m.filter((x) => x !== l.cnpj) : [...m, l.cnpj]))} />) },
    ...COLUNAS_VINCULOS,
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
    </div>
  );
}
