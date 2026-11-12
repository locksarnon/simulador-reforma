import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSearch, KeyRound, Loader2, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";

const quando = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
/** Logo depois de configurar, o serviço reinicia por alguns segundos para ler a senha nova: não é "fora do ar". */
const reiniciando = (s) => !s.disponivel && s.ultima_configuracao?.ok && Date.now() - new Date(s.ultima_configuracao.em).getTime() < 3 * 60_000;
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
  const bx = useQuery({ queryKey: ["integracoes", "receitanetbx"], queryFn: () => api.get("/integracoes/receitanetbx"), refetchInterval: (q) => ((q.state.data || []).some((x) => x.configurando || reiniciando(x)) ? 5000 : 60_000) });
  const i = info.data;
  const campo = "h-8 min-w-[260px] flex-1 rounded-md border border-input bg-background px-2 text-sm";
  const botao = "inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted disabled:opacity-60";
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-4 md:col-span-2 xl:col-span-3" aria-label="Certidões sem API oficial">
      <h2 className="font-heading text-sm font-semibold">Certidões sem API oficial</h2>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-medium">CNDT (TST) e CRF do FGTS (Caixa): Infosimples</h3>
          <span className={`rounded-full px-2 py-0.5 text-xs ${i?.configurado ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{i?.configurado ? "Configurada" : "Não configurada"}</span>
        </div>
        {i?.atualizado_em && <p className="text-xs text-muted-foreground">Último ajuste em {quando(i.atualizado_em)}{i.atualizado_por ? ` por ${i.atualizado_por}` : ""}.</p>}
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (token.trim()) salvar.mutate(); }}>
          <input type="password" autoComplete="off" className={campo} value={token} onChange={(e) => setToken(e.target.value)} placeholder={i?.configurado ? "Colar um token novo para trocar" : "Token da Infosimples"} aria-label="Token da Infosimples" />
          <button type="submit" disabled={!token.trim() || salvar.isPending} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}Guardar</button>
          {i?.configurado && <button type="button" disabled={remover.isPending} onClick={() => { if (window.confirm("Remover o token da Infosimples?")) remover.mutate(); }} className={botao}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Remover</button>}
        </form>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <FileSearch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-medium">SPED transmitido (EFD-Contribuições e EFD ICMS/IPI): ReceitanetBX</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(bx.data || []).map((s) => <CertificadoBx key={s.id} s={s} aoMudar={() => bx.refetch()} />)}
        </div>
      </div>
    </section>
  );
}

/** Um certificado do ReceitanetBX (primário ou secundário): situação, titular e o envio do arquivo com a senha. */
function CertificadoBx({ s, aoMudar }) {
  const [arquivo, setArquivo] = useState(null);
  const [senha, setSenha] = useState("");
  const enviar = useMutation({
    mutationFn: () => api.upload(`/integracoes/receitanetbx/${s.id}`, arquivo, { senha }),
    onSuccess: () => { setArquivo(null); setSenha(""); aoMudar(); toast({ title: `${s.rotulo}: certificado enviado`, description: "Configurando (cerca de 1 minuto)." }); },
    onError: falhar("Não foi possível enviar o certificado"),
  });
  const ultima = s.ultima_configuracao;
  const situacao = s.configurando || reiniciando(s) ? [s.configurando ? "Configurando…" : "Reiniciando…", "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"]
    : ultima && !ultima.ok ? ["Falhou", "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"]
    : s.configurado ? ["Configurado", "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"]
    : s.disponivel ? ["Aguardando o certificado", "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"]
    : ["Fora do ar", "bg-muted text-muted-foreground"];
  const t = s.titular;
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="flex-1 text-sm font-medium">{s.rotulo}</h4>
        <span className={`rounded-full px-2 py-0.5 text-xs ${situacao[1]}`}>{situacao[0]}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t ? <>Certificado de <strong className="text-foreground">{t.titular}</strong>, válido até {new Date(t.valido_ate).toLocaleDateString("pt-BR")}; enviado em {quando(t.enviado_em)}{t.enviado_por ? ` por ${t.enviado_por}` : ""}.</> : "Nenhum certificado."}
        {ultima && !ultima.ok ? ` ${ultima.mensagem}` : ""}
      </p>
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (arquivo && senha) enviar.mutate(); }}>
        <input type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="max-w-[220px] text-xs" aria-label={`Certificado A1: ${s.rotulo}`} />
        <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha do certificado" className="h-8 min-w-[160px] flex-1 rounded-md border border-input bg-background px-2 text-sm" aria-label={`Senha do certificado: ${s.rotulo}`} />
        <button type="submit" disabled={!arquivo || !senha || enviar.isPending || s.configurando} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60">{enviar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}{t ? "Trocar certificado" : "Enviar"}</button>
      </form>
    </div>
  );
}
