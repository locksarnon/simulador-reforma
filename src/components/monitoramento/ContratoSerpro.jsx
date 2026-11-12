import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { mascararDocumento } from "@/lib/clientes";

const data = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");

/**
 * Contrato do Integra Contador do escritório: o administrador sobe o e-CNPJ A1, a senha e as chaves do Serpro.
 * Tudo vai cifrado para o cofre; a tela nunca mostra as chaves nem a senha de volta.
 */
export default function ContratoSerpro() {
  const qc = useQueryClient();
  const contrato = useQuery({ queryKey: ["monitoramento", "contrato"], queryFn: () => api.get("/monitoramento/contrato") });
  const [editando, setEditando] = useState(false);
  const [arquivo, setArquivo] = useState(null);
  const [senha, setSenha] = useState("");
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [teste, setTeste] = useState(null);
  const [extra, setExtra] = useState({ cnd_key: "", cnd_secret: "", divida_key: "", divida_secret: "" });

  const atualizar = (e) => {
    qc.setQueryData(["monitoramento", "contrato"], e);
    qc.invalidateQueries({ queryKey: ["monitoramento", "estado"] });
    qc.invalidateQueries({ queryKey: ["integracoes"] });
  };
  const limpar = () => { setArquivo(null); setSenha(""); setKey(""); setSecret(""); setExtra({ cnd_key: "", cnd_secret: "", divida_key: "", divida_secret: "" }); setEditando(false); };

  const salvar = useMutation({
    mutationFn: () => {
      const campos = { senha, consumer_key: key.trim(), consumer_secret: secret.trim(), ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)) };
      return arquivo ? api.upload("/monitoramento/contrato", arquivo, campos) : api.post("/monitoramento/contrato", campos);
    },
    onSuccess: (e) => { atualizar(e); limpar(); setTeste(null); toast({ title: "Contrato guardado no cofre", description: "Teste a conexão." }); },
    onError: (e) => toast({ title: "Não foi possível guardar", description: e.message, variant: "destructive" }),
  });
  const testar = useMutation({
    mutationFn: () => api.post("/monitoramento/contrato/testar", {}),
    onSuccess: (r) => setTeste(r),
    onError: (e) => setTeste({ ok: false, mensagem: e.message }),
  });
  const remover = useMutation({
    mutationFn: () => api.delete("/monitoramento/contrato"),
    onSuccess: (e) => { atualizar(e); setTeste(null); toast({ title: "Contrato removido" }); },
    onError: (e) => toast({ title: "Não foi possível remover", description: e.message, variant: "destructive" }),
  });

  const c = contrato.data;
  if (contrato.isLoading) return <p className="text-xs text-muted-foreground">Carregando o contrato…</p>;
  if (contrato.isError) return null;
  const temTela = c?.origem === "TELA";
  const mostrarForm = !c?.configurado || editando;
  const vencido = c?.valido_ate && new Date(c.valido_ate) < new Date();
  const temExtra = Object.values(extra).some((v) => v.trim());
  const podeSalvar = temTela ? (arquivo ? true : key.trim() || secret.trim() || temExtra) : arquivo && key.trim() && secret.trim();

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3" aria-label="Contrato do Integra Contador">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="flex-1 text-sm font-semibold">Contrato do escritório</h3>
        {c?.configurado && !editando && (
          <>
            <Button size="sm" variant="outline" onClick={() => testar.mutate()} disabled={testar.isPending}>
              {testar.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1 h-3.5 w-3.5" />}Testar conexão com o Serpro
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(true)}>{temTela ? "Trocar" : "Configurar pela tela"}</Button>
            {temTela && (
              <Button size="sm" variant="ghost" className="text-destructive" disabled={remover.isPending} onClick={() => { if (window.confirm("Remover o certificado e as chaves do Serpro? O monitoramento em produção para até você configurar de novo.")) remover.mutate(); }}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />Remover
              </Button>
            )}
          </>
        )}
      </div>

      {c?.configurado && (
        <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          <div><dt className="inline text-muted-foreground">Titular: </dt><dd className="inline font-medium">{c.titular}</dd></div>
          <div><dt className="inline text-muted-foreground">CNPJ: </dt><dd className="inline tabular-nums">{mascararDocumento(c.cnpj)}</dd></div>
          {c.valido_ate && <div><dt className="inline text-muted-foreground">Certificado válido até: </dt><dd className={`inline tabular-nums ${vencido ? "text-destructive font-medium" : ""}`}>{data(c.valido_ate)}{vencido ? " (vencido)" : ""}</dd></div>}
          {temTela && <div><dt className="inline text-muted-foreground">Pré-análise: </dt><dd className="inline">Consulta CND {c.cnd ? "configurada" : "não configurada"} · Dívida Ativa {c.divida_ativa ? "configurada" : "não configurada"}</dd></div>}
          <div><dt className="inline text-muted-foreground">Onde está: </dt><dd className="inline">{temTela ? `cofre do InTAX${c.atualizado_por ? `, por ${c.atualizado_por} em ${data(c.atualizado_em)}` : ""}` : "arquivo de configuração do servidor"}</dd></div>
        </dl>
      )}

      {teste && (
        <p role="status" className={`flex items-start gap-1.5 text-xs ${teste.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
          {teste.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}{teste.mensagem}
        </p>
      )}

      {mostrarForm && (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(ev) => { ev.preventDefault(); salvar.mutate(); }} autoComplete="off">
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            {temTela ? "Para trocar só as chaves, deixe o certificado em branco." : "e-CNPJ A1 do contrato do Integra Contador e chaves da Área do Cliente Serpro."}
          </p>
          <div className="space-y-1">
            <Label htmlFor="serpro-pfx">Certificado A1 do escritório (.pfx ou .p12)</Label>
            <Input id="serpro-pfx" type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={(ev) => setArquivo(ev.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="serpro-senha">Senha do certificado</Label>
            <Input id="serpro-senha" type="password" autoComplete="new-password" value={senha} onChange={(ev) => setSenha(ev.target.value)} disabled={!arquivo && temTela} placeholder={!arquivo && temTela ? "Só ao trocar o certificado" : ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="serpro-key">Consumer Key</Label>
            <Input id="serpro-key" type="password" autoComplete="off" value={key} onChange={(ev) => setKey(ev.target.value)} placeholder={temTela ? "Em branco = manter a atual" : ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="serpro-secret">Consumer Secret</Label>
            <Input id="serpro-secret" type="password" autoComplete="off" value={secret} onChange={(ev) => setSecret(ev.target.value)} placeholder={temTela ? "Em branco = manter a atual" : ""} />
          </div>
          <details className="sm:col-span-2 rounded-md border border-border p-3 text-xs" open={temExtra}>
            <summary className="cursor-pointer font-medium">Outras APIs do Serpro para a pré-análise (opcional)</summary>
            <p className="mt-2 text-muted-foreground">Contratos à parte na Loja Serpro.{temTela ? " Em branco = manter as atuais." : ""}</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {[["cnd_key", "Consulta CND: Consumer Key"], ["cnd_secret", "Consulta CND: Consumer Secret"], ["divida_key", "Dívida Ativa: Consumer Key"], ["divida_secret", "Dívida Ativa: Consumer Secret"]].map(([k, rot]) => (
                <div key={k} className="space-y-1">
                  <Label htmlFor={`serpro-${k}`}>{rot}</Label>
                  <Input id={`serpro-${k}`} type="password" autoComplete="off" value={extra[k]} onChange={(ev) => setExtra((x) => ({ ...x, [k]: ev.target.value }))} />
                </div>
              ))}
            </div>
          </details>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={!podeSalvar || salvar.isPending}>
              {salvar.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Guardar no cofre
            </Button>
            {editando && <Button type="button" size="sm" variant="ghost" onClick={limpar}>Cancelar</Button>}
          </div>
        </form>
      )}
    </div>
  );
}
