import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Loader2, Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PAPEIS = { admin: "Administrador", user: "Consultor" };
const quando = (v) => (v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "Nunca entrou");

/** Mostra a senha provisória uma única vez, com botão de copiar. */
function SenhaProvisoria({ dados, aoFechar }) {
  const copiar = async () => {
    try { await navigator.clipboard.writeText(dados.senha); toast({ title: "Senha copiada" }); } catch { toast({ title: "Não foi possível copiar", description: "Selecione a senha e copie à mão.", variant: "destructive" }); }
  };
  return (
    <Dialog open={!!dados} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Senha provisória de {dados?.email}</DialogTitle>
          <DialogDescription>Ela só aparece agora. Passe para a pessoa por um canal seguro; ela pode trocar em Meu perfil.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <code className="flex-1 select-all text-base tracking-wide" aria-label="Senha provisória">{dados?.senha}</code>
          <button type="button" onClick={copiar} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-muted"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copiar</button>
        </div>
        <DialogFooter><button type="button" onClick={aoFechar} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">Já anotei</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoUsuario({ alvo, aoFechar, aoSalvar }) {
  const novo = alvo?.tipo === "novo";
  const u = alvo?.usuario;
  const [f, setF] = useState({ email: u?.email || "", name: u?.name || "", role: u?.role || "user", senha: "" });
  const mudar = (k, v) => setF((e) => ({ ...e, [k]: v }));
  const salvar = useMutation({
    mutationFn: () => (novo ? api.post("/usuarios", { email: f.email, name: f.name, role: f.role, senha: f.senha || undefined }) : api.put(`/usuarios/${u.id}`, { name: f.name, role: f.role })),
    onSuccess: (r) => aoSalvar(r, novo),
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={!!alvo} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{novo ? "Nova conta" : `Editar ${u?.email}`}</DialogTitle>
          <DialogDescription>{novo ? "A pessoa entra com o e-mail e a senha. Sem senha, o sistema gera uma provisória." : "O e-mail não muda. Para trocar a senha, use Redefinir senha."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="space-y-3 text-sm">
          {novo && <label className="block space-y-1"><span className="block text-xs text-muted-foreground">E-mail</span><input type="email" required className={campo} value={f.email} onChange={(e) => mudar("email", e.target.value)} /></label>}
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Nome</span><input className={campo} value={f.name} maxLength={120} onChange={(e) => mudar("name", e.target.value)} /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Papel</span>
            <select className={campo} value={f.role} onChange={(e) => mudar("role", e.target.value)}>{Object.entries(PAPEIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <span className="block text-[11px] text-muted-foreground">Administrador envia certificado, ativa a captura, exclui e gerencia usuários. Consultor trabalha nas empresas.</span></label>
          {novo && <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Senha (opcional, mínimo 10 caracteres)</span><input type="password" autoComplete="new-password" className={campo} value={f.senha} onChange={(e) => mudar("senha", e.target.value)} /></label>}
          <DialogFooter>
            <button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={salvar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Administração > Usuários e acessos: quem usa o InTAX, com papel, situação e último acesso. Só administradores. */
export default function UsuariosPagina() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const [dialogo, setDialogo] = useState(null);
  const [senha, setSenha] = useState(null);
  const { data: usuarios, isLoading, error, refetch } = useQuery({ queryKey: ["usuarios"], queryFn: () => api.get("/usuarios"), enabled: user?.role === "admin" });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["usuarios"] });
  const situacao = useMutation({
    mutationFn: ({ id, ativo }) => api.put(`/usuarios/${id}`, { ativo }),
    onSuccess: (_r, v) => { toast({ title: v.ativo ? "Conta reativada" : "Conta desativada", description: v.ativo ? undefined : "As sessões dela foram encerradas." }); recarregar(); },
    onError: (e) => toast({ title: "Não foi possível mudar a situação", description: e.message, variant: "destructive" }),
  });
  const redefinir = useMutation({
    mutationFn: (u) => api.post(`/usuarios/${u.id}/redefinir-senha`, {}).then((r) => ({ email: u.email, senha: r.senha_provisoria })),
    onSuccess: (r) => { setSenha(r); recarregar(); },
    onError: (e) => toast({ title: "Não foi possível redefinir", description: e.message, variant: "destructive" }),
  });

  const aoSalvar = (r, novo) => {
    setDialogo(null);
    recarregar();
    if (novo && r.senha_provisoria) setSenha({ email: r.usuario.email, senha: r.senha_provisoria });
    else toast({ title: novo ? "Conta criada" : "Alterações salvas" });
  };
  const alternar = async (u) => {
    if (u.ativo && !(await confirmar({ titulo: `Desativar ${u.email}?`, descricao: "A pessoa perde o acesso agora e as sessões abertas dela são encerradas. Você pode reativar depois.", rotulo: "Desativar" }))) return;
    situacao.mutate({ id: u.id, ativo: !u.ativo });
  };
  const trocarSenha = async (u) => {
    if (await confirmar({ titulo: `Redefinir a senha de ${u.email}?`, descricao: "O sistema gera uma senha provisória, mostrada uma única vez, e encerra as sessões abertas dela.", rotulo: "Redefinir", perigoso: false })) redefinir.mutate(u);
  };

  if (user?.role !== "admin") {
    return (
      <div><PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Usuários e acessos" }]} title="Usuários e acessos" />
        <p role="alert" className="p-8 text-sm">Somente administradores gerenciam usuários.</p></div>
    );
  }
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Usuários e acessos" }]}
        title="Usuários e acessos"
        subtitle="Quem usa o InTAX, com o papel e a situação de cada conta. O histórico de entradas fica em Registro de acesso e IPs."
        actions={<button type="button" onClick={() => setDialogo({ tipo: "novo" })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Nova conta</button>}
      />
      <div className="px-6 lg:px-8 py-6">
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-[13px] leading-5" aria-label="Usuários do sistema">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">Pessoa</th><th className="px-3 py-2">Papel</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Último acesso</th><th className="px-3 py-2 text-right">Empresas</th><th className="px-3 py-2"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</td></tr>}
              {error && <tr><td colSpan={6} className="py-8 text-center" role="alert">Não foi possível carregar. <button type="button" onClick={() => refetch()} className="text-primary hover:underline">Tentar de novo</button></td></tr>}
              {(usuarios || []).map((u) => (
                <tr key={u.id} className="border-b border-border/60 hover:bg-muted/40">
                  <td className="px-3 py-2"><p className="font-medium">{u.name || u.email}{u.id === user.id && <span className="ml-2 rounded bg-primary/10 px-1.5 text-[10px] font-semibold uppercase text-primary">você</span>}</p>{u.name && <p className="text-[11px] text-muted-foreground">{u.email}</p>}</td>
                  <td className="px-3 py-2">{PAPEIS[u.role] || u.role}</td>
                  <td className="px-3 py-2"><span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${u.ativo ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{u.ativo ? "Ativa" : "Desativada"}</span></td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{quando(u.lastLoginAt)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.empresas}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => setDialogo({ tipo: "editar", usuario: u })} className="rounded p-1.5 hover:bg-muted" aria-label={`Editar ${u.email}`} title="Editar"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
                      <button type="button" onClick={() => trocarSenha(u)} className="rounded p-1.5 hover:bg-muted" aria-label={`Redefinir a senha de ${u.email}`} title="Redefinir senha"><KeyRound className="h-3.5 w-3.5" aria-hidden="true" /></button>
                      {u.id !== user.id && (
                        <button type="button" onClick={() => alternar(u)} className="rounded p-1.5 hover:bg-muted" aria-label={`${u.ativo ? "Desativar" : "Reativar"} ${u.email}`} title={u.ativo ? "Desativar" : "Reativar"}>
                          {u.ativo ? <UserX className="h-3.5 w-3.5 text-destructive" aria-hidden="true" /> : <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Conta desativada perde o acesso na hora. O sistema sempre mantém pelo menos um administrador ativo.</p>
      </div>
      {dialogo && <DialogoUsuario key={dialogo.usuario?.id || "novo"} alvo={dialogo} aoFechar={() => setDialogo(null)} aoSalvar={aoSalvar} />}
      <SenhaProvisoria dados={senha} aoFechar={() => setSenha(null)} />
    </div>
  );
}
