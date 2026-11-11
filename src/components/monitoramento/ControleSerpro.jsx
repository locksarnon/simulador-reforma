import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { MODOS, useEstadoMonitoramento } from "@/lib/monitoramento";

/** Administração > Integrações: o modo do Integra Contador (desligado, demonstração, produção) e o que falta para a produção. */
export default function ControleSerpro() {
  const qc = useQueryClient();
  const estado = useEstadoMonitoramento();
  const mudar = useMutation({
    mutationFn: (modo) => api.put("/monitoramento/modo", { modo }),
    onSuccess: (e) => { qc.setQueryData(["monitoramento", "estado"], e); qc.invalidateQueries({ queryKey: ["integracoes"] }); toast({ title: `Monitoramento: ${MODOS[e.modo].rotulo}` }); },
    onError: (e) => toast({ title: "Não foi possível mudar", description: e.message, variant: "destructive" }),
  });
  const e = estado.data;
  if (!e) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3 md:col-span-2 xl:col-span-3" aria-label="Monitoramento fiscal (Integra Contador)">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-heading text-sm font-semibold">Monitoramento fiscal: Integra Contador (Serpro)</h2>
        <div className="inline-flex rounded-md border border-border p-0.5" role="radiogroup" aria-label="Modo do monitoramento">
          {Object.entries(MODOS).map(([id, m]) => (
            <button key={id} type="button" role="radio" aria-checked={e.modo === id} disabled={mudar.isPending || (id === "PRODUCAO" && !e.contrato)} onClick={() => mudar.mutate(id)} title={id === "PRODUCAO" && !e.contrato ? "Falta o contrato no servidor" : undefined} className={`rounded px-3 py-1 text-xs ${e.modo === id ? "bg-primary text-primary-foreground" : "hover:bg-muted disabled:opacity-50"}`}>{m.rotulo}</button>
          ))}
        </div>
        {mudar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      </div>
      <p className="text-sm">{MODOS[e.modo].texto}</p>
      <p className="text-xs text-muted-foreground">{e.consultas_24h} consulta(s) nas últimas 24 horas{e.ultima_consulta ? `; a última em ${new Date(e.ultima_consulta).toLocaleString("pt-BR")}` : ""}.</p>
      {e.contrato ? (
        <p className="text-xs">Contrato configurado no servidor: {e.contratante?.nome} ({e.contratante?.cnpj}).</p>
      ) : (
        <details className="text-xs">
          <summary className="cursor-pointer text-primary">O que falta para a produção</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Contratar o Integra Contador na Loja Serpro com o e-CNPJ do escritório (cobrança por consulta).</li>
            <li>Na Área do Cliente Serpro, copiar a Consumer Key e a Consumer Secret.</li>
            <li>Colocar no servidor (arquivo .env): SERPRO_CONSUMER_KEY, SERPRO_CONSUMER_SECRET, SERPRO_CONTRATANTE_CNPJ, SERPRO_CONTRATANTE_NOME, o certificado do escritório (SERPRO_CERT_PFX_BASE64 ou SERPRO_CERT_PFX_ARQUIVO) e SERPRO_CERT_SENHA. As chaves nunca aparecem nesta tela.</li>
            <li>Para cada cliente: com o A1 dele guardado na Captura de XML, o InTAX assina sozinho o termo de autorização e consulta sem procuração. Sem o A1, o cliente precisa dar procuração eletrônica ao escritório no e-CAC.</li>
          </ol>
        </details>
      )}
    </section>
  );
}
