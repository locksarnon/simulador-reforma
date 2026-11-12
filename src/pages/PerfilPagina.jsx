import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "@/api/client";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import PageHeader from "@/components/PageHeader";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PAPEIS = { admin: "Administrador", user: "Consultor" };

/** Regras da senha nova, para a tela avisar antes de enviar (o servidor confere de novo). */
export function problemasDaSenha(atual, nova, confirmacao) {
  const p = [];
  if (nova.length > 0 && nova.length < 10) p.push("A senha nova precisa ter pelo menos 10 caracteres.");
  if (nova && atual && nova === atual) p.push("A senha nova precisa ser diferente da atual.");
  if (confirmacao && nova !== confirmacao) p.push("A confirmação não é igual à senha nova.");
  return p;
}

/** Meu perfil: o nome de cada pessoa e a troca da própria senha. */
export default function PerfilPagina() {
  const qc = useQueryClient();
  const { atualizarUsuario } = useAuth();
  const { data: perfil, isLoading, error } = useQuery({ queryKey: ["perfil"], queryFn: () => api.get("/perfil") });
  const [nome, setNome] = useState(null);
  const [s, setS] = useState({ atual: "", nova: "", confirmacao: "" });
  const mudar = (k, v) => setS((e) => ({ ...e, [k]: v }));
  const problemas = problemasDaSenha(s.atual, s.nova, s.confirmacao);
  const podeTrocar = s.atual && s.nova.length >= 10 && s.nova === s.confirmacao && s.nova !== s.atual;

  const salvarNome = useMutation({
    mutationFn: () => api.put("/perfil", { name: nome ?? perfil?.name ?? "" }),
    onSuccess: (salvo) => { atualizarUsuario?.({ name: salvo?.name ?? null }); toast({ title: "Nome salvo", description: "Já aparece no menu." }); qc.invalidateQueries({ queryKey: ["perfil"] }); },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  const trocar = useMutation({
    mutationFn: () => api.post("/perfil/senha", { atual: s.atual, nova: s.nova }),
    onSuccess: () => { setS({ atual: "", nova: "", confirmacao: "" }); toast({ title: "Senha trocada", description: "As outras sessões foram encerradas. Nesta, você continua até a próxima renovação do acesso." }); },
    onError: (e) => toast({ title: "Não foi possível trocar a senha", description: e.message, variant: "destructive" }),
  });

  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Meu perfil" }]} title="Meu perfil" />
      <div className="px-6 lg:px-8 py-6 max-w-xl space-y-6">
        {isLoading && <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
        {error && <p role="alert" className="text-sm">Não foi possível carregar o perfil.</p>}
        {perfil && (
          <>
            <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-labelledby="titulo-dados">
              <h2 id="titulo-dados" className="font-heading text-sm font-semibold">Seus dados</h2>
              <p className="text-sm text-muted-foreground">{perfil.email} · {PAPEIS[perfil.role] || perfil.role}</p>
              <form onSubmit={(e) => { e.preventDefault(); salvarNome.mutate(); }} className="flex items-end gap-2 text-sm">
                <label className="flex-1 space-y-1"><span className="block text-xs text-muted-foreground">Nome</span>
                  <input className={campo} value={nome ?? perfil.name ?? ""} maxLength={120} onChange={(e) => setNome(e.target.value)} /></label>
                <button type="submit" disabled={salvarNome.isPending} className="rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">Salvar</button>
              </form>
            </section>

            <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-labelledby="titulo-senha">
              <h2 id="titulo-senha" className="font-heading text-sm font-semibold">Trocar a senha</h2>
              <form onSubmit={(e) => { e.preventDefault(); if (podeTrocar) trocar.mutate(); }} className="space-y-3 text-sm">
                <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Senha atual</span><input type="password" autoComplete="current-password" className={campo} value={s.atual} onChange={(e) => mudar("atual", e.target.value)} /></label>
                <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Senha nova (mínimo 10 caracteres)</span><input type="password" autoComplete="new-password" className={campo} value={s.nova} onChange={(e) => mudar("nova", e.target.value)} /></label>
                <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Repita a senha nova</span><input type="password" autoComplete="new-password" className={campo} value={s.confirmacao} onChange={(e) => mudar("confirmacao", e.target.value)} /></label>
                {problemas.length > 0 && <ul role="alert" className="space-y-0.5 text-xs text-destructive">{problemas.map((p) => <li key={p}>{p}</li>)}</ul>}
                <button type="submit" disabled={!podeTrocar || trocar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">
                  {trocar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Trocar senha
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
