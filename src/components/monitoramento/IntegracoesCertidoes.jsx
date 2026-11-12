import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSearch, KeyRound, Loader2, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";

const quando = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
const falhar = (titulo) => (e) => toast({ title: titulo, description: e.message, variant: "destructive" });

/**
 * Administração > Integrações: certidões sem API oficial (CNDT e CRF do FGTS, pela Infosimples), usadas na pré-análise e nas
 * certidões dos clientes.
 */
export default function IntegracoesCertidoes() {
  const qc = useQueryClient();
  const info = useQuery({ queryKey: ["integracoes", "infosimples"], queryFn: () => api.get("/integracoes/infosimples") });
  const [token, setToken] = useState("");
  const salvar = useMutation({
    mutationFn: () => api.put("/integracoes/infosimples", { token }),
    onSuccess: (r) => { setToken(""); qc.setQueryData(["integracoes", "infosimples"], r); toast({ title: "Token da Infosimples guardado no cofre" }); },
    onError: falhar("Não foi possível guardar"),
  });
  const remover = useMutation({
    mutationFn: () => api.delete("/integracoes/infosimples"),
    onSuccess: (r) => { qc.setQueryData(["integracoes", "infosimples"], r); toast({ title: "Token removido" }); },
    onError: falhar("Não foi possível remover"),
  });
  const bx = useQuery({ queryKey: ["integracoes", "receitanetbx"], queryFn: () => api.get("/integracoes/receitanetbx"), refetchInterval: 60_000 });
  const i = info.data;
  const campo = "h-8 min-w-[260px] flex-1 rounded-md border border-input bg-background px-2 text-sm";
  const botao = "inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-60";
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-4 md:col-span-2 xl:col-span-3" aria-label="Certidões sem API oficial">
      <h2 className="font-heading text-sm font-semibold">Certidões sem API oficial (pré-análise e certidões dos clientes)</h2>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-medium">CNDT (TST) e CRF do FGTS (Caixa): Infosimples</h3>
          <span className={`rounded-full px-2 py-0.5 text-xs ${i?.configurado ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{i?.configurado ? "Configurada" : "Não configurada"}</span>
        </div>
        <p className="text-xs text-muted-foreground">O TST e a Caixa não oferecem API. A Infosimples emite a certidão no portal oficial e devolve a situação, a validade e o documento. Cada consulta é cobrada por ela. Crie a conta em infosimples.com e cole aqui o token (Área do cliente). O token fica cifrado no cofre.{i?.atualizado_em ? ` Último ajuste em ${quando(i.atualizado_em)}${i.atualizado_por ? ` por ${i.atualizado_por}` : ""}.` : ""}</p>
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (token.trim()) salvar.mutate(); }}>
          <input type="password" autoComplete="off" className={campo} value={token} onChange={(e) => setToken(e.target.value)} placeholder={i?.configurado ? "Colar um token novo para trocar" : "Token da Infosimples"} aria-label="Token da Infosimples" />
          <button type="submit" disabled={!token.trim() || salvar.isPending} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}Guardar</button>
          {i?.configurado && <button type="button" disabled={remover.isPending} onClick={() => { if (window.confirm("Remover o token da Infosimples? A CNDT e o CRF voltam a depender do anexo do PDF.")) remover.mutate(); }} className={botao}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Remover</button>}
        </form>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <FileSearch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-medium">SPED transmitido (EFD-Contribuições e EFD ICMS/IPI): ReceitanetBX</h3>
          <span className={`rounded-full px-2 py-0.5 text-xs ${bx.data?.configurado ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : bx.data?.disponivel ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>{bx.isLoading ? "Verificando…" : bx.data?.configurado ? "Configurado" : bx.data?.disponivel ? "Aguardando o certificado" : "Fora do ar"}</span>
        </div>
        <p className="text-xs text-muted-foreground">{bx.data?.mensagem} O InTAX usa o ReceitanetBX-Serviço, programa oficial da Receita, que roda no servidor com o certificado do escritório (procurador dos clientes) para saber o que foi transmitido e baixar o arquivo com o recibo. A senha do certificado é digitada só uma vez, na tela do próprio programa, aberta por túnel SSH.</p>
      </div>
    </section>
  );
}
