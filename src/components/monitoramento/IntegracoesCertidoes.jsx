import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";

const quando = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
const trimestre = (t) => String(t || "").replace(/^(\d{4})_trimestre_0?(\d)$/, "$2º trimestre de $1");
const falhar = (titulo) => (e) => toast({ title: titulo, description: e.message, variant: "destructive" });

/**
 * Administração > Integrações: certidões sem API oficial (CNDT e CRF do FGTS, pela Infosimples) e a base aberta da Dívida Ativa
 * da União (PGFN), usadas na pré-análise e nas certidões dos clientes.
 */
export default function IntegracoesCertidoes() {
  const qc = useQueryClient();
  const info = useQuery({ queryKey: ["integracoes", "infosimples"], queryFn: () => api.get("/integracoes/infosimples") });
  const base = useQuery({
    queryKey: ["integracoes", "divida-ativa"],
    queryFn: () => api.get("/integracoes/divida-ativa"),
    refetchInterval: (q) => (q.state.data?.em_andamento ? 10_000 : false),
  });
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
  const atualizar = useMutation({
    mutationFn: () => api.post("/integracoes/divida-ativa/atualizar", {}),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["integracoes", "divida-ativa"] }); toast({ title: `Carregando a base da PGFN (${trimestre(r.trimestre)})`, description: "Leva de 30 minutos a algumas horas; a consulta continua usando a base anterior até terminar." }); },
    onError: falhar("Não foi possível atualizar"),
  });
  const i = info.data;
  const b = base.data;
  const campo = "h-8 min-w-[260px] flex-1 rounded-md border border-input bg-background px-2 text-sm";
  const botao = "inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-60";
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-4 md:col-span-2 xl:col-span-3" aria-label="Certidões e dívida ativa">
      <h2 className="font-heading text-sm font-semibold">Certidões e Dívida Ativa (pré-análise e certidões dos clientes)</h2>

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
          <Database className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-medium">Dívida Ativa da União: base aberta da PGFN</h3>
          <span className={`rounded-full px-2 py-0.5 text-xs ${b?.vigente ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{b?.vigente ? `Carregada: ${trimestre(b.vigente.trimestre)}` : "Não carregada"}</span>
          {b?.em_andamento && <span className="inline-flex items-center gap-1 text-xs text-sky-700 dark:text-sky-300"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Carregando{b.ultima?.linhas ? `: ${b.ultima.linhas.toLocaleString("pt-BR")} inscrições até agora` : ""}</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          Oficial e gratuita: a PGFN publica a cada trimestre todas as inscrições em Dívida Ativa da União (geral, previdenciária e FGTS). O InTAX guarda as de pessoas jurídicas e consulta pela raiz do CNPJ. Ela é usada quando a API Consulta Dívida Ativa do Serpro não está contratada. A posição é a do fim do trimestre publicado. Todo dia 10 o servidor confere se há trimestre novo e carrega sozinho.
          {b?.vigente ? ` ${b.vigente.linhas.toLocaleString("pt-BR")} inscrições, carregadas em ${quando(b.vigente.concluido_em)}.` : ""}
          {b?.ultima?.status === "ERRO" ? ` A última carga falhou: ${b.ultima.mensagem}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={atualizar.isPending || b?.em_andamento} onClick={() => atualizar.mutate()} className={botao}>{atualizar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}Carregar o trimestre mais recente agora</button>
          {b?.fonte && <a href={b.fonte} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Dados abertos da PGFN</a>}
        </div>
      </div>
    </section>
  );
}
