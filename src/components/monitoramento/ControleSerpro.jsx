import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { MODOS, useEstadoMonitoramento } from "@/lib/monitoramento";
import ContratoSerpro from "./ContratoSerpro";

/** Administração > Integrações: o modo do Integra Contador (desligado, demonstração, produção) e o que falta para a produção. */
export default function ControleSerpro() {
  const qc = useQueryClient();
  const estado = useEstadoMonitoramento();
  const mudar = useMutation({
    mutationFn: (modo) => api.put("/monitoramento/modo", { modo }),
    onSuccess: (e) => { qc.setQueryData(["monitoramento", "estado"], e); qc.invalidateQueries({ queryKey: ["integracoes"] }); toast({ title: `Monitoramento: ${MODOS[e.modo].rotulo}` }); },
    onError: (e) => toast({ title: "Não foi possível mudar", description: e.message, variant: "destructive" }),
  });
  const eventos = useMutation({
    mutationFn: () => api.post("/monitoramento/eventos/atualizar", {}),
    onSuccess: (r) => toast({ title: r.demonstracao ? "Eventos: teste na demonstração" : "Novidades da Receita buscadas", description: r.demonstracao ? `O Serpro devolveu o exemplo oficial (${r.linhas.length} CNPJ fictícios). Em produção, a busca vale para os clientes do BPO.` : `${r.clientes} cliente(s), ${r.novidades} novidade(s), ${r.consultas} consulta(s) feitas.` }),
    onError: (er) => toast({ title: "Não foi possível buscar os eventos", description: er.message, variant: "destructive" }),
  });
  const e = estado.data;
  if (!e) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3 md:col-span-2 xl:col-span-3" aria-label="Monitoramento fiscal (Integra Contador)">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-heading text-sm font-semibold">Monitoramento fiscal: Integra Contador (Serpro)</h2>
        <div className="inline-flex rounded-md border border-border p-0.5" role="radiogroup" aria-label="Modo do monitoramento">
          {Object.entries(MODOS).map(([id, m]) => (
            <button key={id} type="button" role="radio" aria-checked={e.modo === id} disabled={mudar.isPending || (id === "PRODUCAO" && !e.contrato)} onClick={() => mudar.mutate(id)} title={id === "PRODUCAO" && !e.contrato ? "Configure o contrato do escritório abaixo" : undefined} className={`rounded px-3 py-1 text-xs ${e.modo === id ? "bg-primary text-primary-foreground" : "hover:bg-muted disabled:opacity-50"}`}>{m.rotulo}</button>
          ))}
        </div>
        {mudar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      </div>
      <p className="text-sm">{MODOS[e.modo].texto}</p>
      <p className="text-xs text-muted-foreground">{e.consultas_24h} consulta(s) nas últimas 24 horas{e.ultima_consulta ? `; a última em ${new Date(e.ultima_consulta).toLocaleString("pt-BR")}` : ""}.</p>
      <ContratoSerpro />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Eventos de atualização da Receita (DCTFWeb, caixa postal e pagamentos): a rotina das 06:10 consulta sozinha os clientes com novidade.</span>
        <button type="button" disabled={eventos.isPending || e.modo === "DESLIGADO"} onClick={() => eventos.mutate()} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-60">{eventos.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}Buscar novidades agora</button>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-primary">Como funciona para cada cliente</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>O contrato acima é o do escritório: o Serpro cobra por consulta nele.</li>
          <li>Com o A1 do cliente guardado no cofre (Captura de XML), o InTAX assina sozinho o termo de autorização e consulta sem procuração.</li>
          <li>Sem o A1, o cliente precisa dar procuração eletrônica ao escritório no e-CAC.</li>
        </ol>
      </details>
    </section>
  );
}
