import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import BotaoExportar from "@/components/BotaoExportar";
import AvisoDoModo from "@/components/monitoramento/AvisoDoModo";
import { SeloNivel } from "@/components/monitoramento/CartaoServico";
import { mascararDocumento } from "@/lib/clientes";
import { CAMINHO_REPOSITORIO_XML } from "@/lib/bpoCaminhos";
import { quandoConsultou, useEstadoMonitoramento } from "@/lib/monitoramento";
import { useCarteiras } from "@/lib/useCarteiras";
import { naCarteira } from "@/lib/servicos";

const CAMINHOS = {
  TERMO_A1: { rotulo: "Pelo A1 do cliente", tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", ajuda: "O InTAX assina o termo de autorização com o certificado do cliente: não precisa de procuração." },
  PROCURACAO: { rotulo: "Pela procuração", tom: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300", ajuda: "O cliente deu procuração eletrônica ao escritório no e-CAC." },
  SEM_ACESSO: { rotulo: "Sem acesso", tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", ajuda: "Guarde o A1 do cliente (Captura de XML) ou peça a procuração eletrônica no e-CAC." },
};
const SIT_CERT = { VALIDO: "Válido", VENCENDO: "Vence em até 30 dias", VENCIDO: "Vencido" };

/** Clientes > Procurações e certificados: por qual caminho o InTAX consulta a Receita de cada cliente, e o que falta. */
export default function ProcuracoesPagina() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const estado = useEstadoMonitoramento();
  const dados = useQuery({ queryKey: ["monitoramento", "procuracoes"], queryFn: () => api.get("/monitoramento/procuracoes") });
  const [filtro, setFiltro] = useState("");
  const { mapa } = useCarteiras();
  // Só os clientes do BPO fiscal: o acesso à Receita serve ao monitoramento.
  const doBpo = useMemo(() => (dados.data || []).filter((l) => naCarteira(mapa.get(l.empresa_id)?.BPO_FISCAL)), [dados.data, mapa]);
  const lista = useMemo(() => doBpo.filter((l) => !filtro || l.caminho === filtro), [doBpo, filtro]);
  const conta = useMemo(() => Object.fromEntries(Object.keys(CAMINHOS).map((k) => [k, doBpo.filter((l) => l.caminho === k).length])), [doBpo]);
  const consultar = useMutation({
    mutationFn: () => api.post("/monitoramento/lote", { empresa_ids: lista.map((l) => l.empresa_id), chaves: ["procuracao"] }),
    onSuccess: (l) => { toast({ title: "Consultando as procurações", description: `${lista.length} cliente(s). A lista atualiza sozinha.` }); const fim = async () => { const s = await api.get(`/monitoramento/lote/${l.id}`).catch(() => null); qc.invalidateQueries({ queryKey: ["monitoramento", "procuracoes"] }); if (s && !s.fim) setTimeout(fim, 3000); }; setTimeout(fim, 2000); },
    onError: (e) => toast({ title: "Não foi possível consultar", description: e.message, variant: "destructive" }),
  });
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "Clientes", to: "/area/clientes" }, { label: "Procurações e certificados" }]}
        title="Procurações e certificados"
        subtitle="Clientes do BPO fiscal: como o InTAX consulta a Receita de cada um, pelo A1 do próprio cliente (termo de autorização assinado) ou pela procuração eletrônica dada ao escritório."
        actions={<><button type="button" disabled={consultar.isPending || estado.data?.modo === "DESLIGADO" || !lista.length} onClick={() => consultar.mutate()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60">{consultar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />} Consultar as procurações da lista</button><Link to="/clientes/vinculos-receita" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Vínculos na Receita (Redesim)</Link></>}
      />
      <div className="px-6 lg:px-8 py-5 space-y-4">
        <AvisoDoModo modo={estado.data?.modo} ehAdmin={user?.role === "admin"} />
        <div className="grid gap-3 md:grid-cols-3">
          {Object.entries(CAMINHOS).map(([k, c]) => (
            <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(filtro === k ? "" : k)} className={`rounded-xl border bg-card p-3 text-left hover:bg-muted/50 ${filtro === k ? "ring-2 ring-primary" : "border-border"}`}>
              <p className="text-xs text-muted-foreground">{c.rotulo}</p><p className="text-xl font-semibold tabular-nums">{conta[k] ?? 0}</p><p className="text-[11px] text-muted-foreground">{c.ajuda}</p>
            </button>
          ))}
        </div>
        <div className="flex justify-end"><BotaoExportar titulo="Procurações e certificados" linhas={lista} colunas={[
          { chave: "razao_social", rotulo: "Cliente" }, { chave: "cnpj_cpf", rotulo: "CNPJ/CPF" },
          { chave: "caminho", rotulo: "Acesso", valor: (l) => CAMINHOS[l.caminho]?.rotulo },
          { chave: "cert", rotulo: "Certificado A1", valor: (l) => (l.certificado ? `${SIT_CERT[l.certificado.situacao]} (até ${new Date(l.certificado.valido_ate).toLocaleDateString("pt-BR")})` : "Não guardado") },
          { chave: "proc", rotulo: "Procuração", valor: (l) => l.procuracao?.titulo || "Não consultada" },
        ]} /></div>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-[13px]" aria-label="Procurações e certificados por cliente">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-3 py-2">Cliente</th><th className="px-2 py-2">Acesso à Receita</th><th className="px-2 py-2">Certificado A1</th><th className="px-2 py-2">Procuração eletrônica</th></tr></thead>
            <tbody>
              {dados.isLoading && <tr><td colSpan={4} className="py-10 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</td></tr>}
              {!dados.isLoading && lista.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">Nenhum cliente neste filtro.</td></tr>}
              {lista.map((l) => (
                <tr key={l.empresa_id} className="border-b border-border/60 last:border-0 align-top">
                  <td className="px-3 py-2"><Link to={`/clientes/${l.empresa_id}`} className="font-medium hover:text-primary hover:underline">{l.razao_social}</Link><p className="text-[11px] text-muted-foreground tabular-nums">{mascararDocumento(l.cnpj_cpf) || "sem CNPJ"}</p></td>
                  <td className="px-2 py-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CAMINHOS[l.caminho].tom}`}>{CAMINHOS[l.caminho].rotulo}</span></td>
                  <td className="px-2 py-2">{l.certificado ? <span className={l.certificado.situacao === "VALIDO" ? "" : "text-amber-700 dark:text-amber-400"}>{SIT_CERT[l.certificado.situacao]} · até {new Date(l.certificado.valido_ate).toLocaleDateString("pt-BR")}</span> : <Link to={`${CAMINHO_REPOSITORIO_XML}/${l.empresa_id}`} className="text-xs text-primary hover:underline">Guardar o A1</Link>}</td>
                  <td className="px-2 py-2">{l.procuracao ? <div className="space-y-0.5"><SeloNivel nivel={l.procuracao.nivel} /><p className="text-xs">{l.procuracao.titulo}</p><p className="text-[11px] text-muted-foreground">{quandoConsultou(l.procuracao.consultado_em)}{l.procuracao.simulado ? " · demonstração" : ""}</p></div> : <span className="text-xs text-muted-foreground">Não consultada</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">O caminho "Pelo A1 do cliente" usa o termo de autorização do Integra Contador (documentação oficial do Serpro, Autentica Procurador); a validação do Serpro só acontece com o contrato em produção.</p>
      </div>
    </div>
  );
}
