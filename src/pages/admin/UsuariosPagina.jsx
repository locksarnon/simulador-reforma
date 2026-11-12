import { useState } from "react";
import BotaoExportar from "@/components/BotaoExportar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Loader2, Mail, Pencil, Send, UserCheck, UserPlus, UserX } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PAPEIS = { admin: "Administrador", user: "Consultor" };
const quando = (v) => (v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "Nunca entrou");
const dia = (v) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

/** Situação da conta, com o convite: o texto vai junto da cor. */
export function situacaoDaConta(u) {
  const s = u.situacao || (u.ativo ? "ATIVO" : "INATIVO");
  if (s === "INATIVO") return { rotulo: "Desativada", tom: "bg-muted text-muted-foreground" };
  if (s === "CONVITE_PENDENTE") return { rotulo: `Convite enviado${u.convite?.expira_em ? `, vale até ${dia(u.convite.expira_em)}` : ""}`, tom: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" };
  if (s === "CONVITE_VENCIDO") return { rotulo: "Convite vencido", tom: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" };
  return { rotulo: "Ativa", tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" };
}

async function copiarTexto(texto, rotulo) {
  try { await navigator.clipboard.writeText(texto); toast({ title: `${rotulo} copiado` }); } catch { toast({ title: "Não foi possível copiar", description: "Selecione o texto e copie à mão.", variant: "destructive" }); }
}

/** Mostra a senha provisória uma única vez, com botão de copiar. */
function SenhaProvisoria({ dados, aoFechar }) {
  return (
    <Dialog open={!!dados} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Senha provisória de {dados?.email}</DialogTitle>
          <DialogDescription>Ela só aparece agora.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <code className="flex-1 select-all text-base tracking-wide" aria-label="Senha provisória">{dados?.senha}</code>
          <button type="button" onClick={() => copiarTexto(dados.senha, "Senha")} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-muted"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copiar</button>
        </div>
        <DialogFooter><button type="button" onClick={aoFechar} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">Já anotei</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Resultado do convite ou da redefinição: se o e-mail saiu, e o link para copiar (para mandar por outro canal, se preciso). */
function LinkEnviado({ dados, aoFechar }) {
  const convite = dados?.tipo === "convite";
  return (
    <Dialog open={!!dados} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{dados?.enviado ? (convite ? `Convite enviado para ${dados.email}` : `Link de redefinição enviado para ${dados?.email}`) : "O e-mail não saiu"}</DialogTitle>
          <DialogDescription>
            {dados?.enviado
              ? `Link válido até ${quando(dados.expira_em)}, uso único.`
              : `Copie o link e mande por outro canal${dados?.motivo ? ` (${dados.motivo})` : ""}. Válido até ${quando(dados?.expira_em)}, uso único.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <code className="min-w-0 flex-1 select-all break-all text-xs" aria-label="Link">{dados?.link}</code>
          <button type="button" onClick={() => copiarTexto(dados.link, "Link")} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-muted"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copiar link</button>
        </div>
        <DialogFooter><button type="button" onClick={aoFechar} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">Fechar</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoUsuario({ alvo, aoFechar, aoSalvar }) {
  const novo = alvo?.tipo === "novo";
  const u = alvo?.usuario;
  const [f, setF] = useState({ email: u?.email || "", name: u?.name || "", role: u?.role || "user", senha: "", modo: "convite" });
  const mudar = (k, v) => setF((e) => ({ ...e, [k]: v }));
  const convite = novo && f.modo === "convite";
  const salvar = useMutation({
    mutationFn: () => (novo
      ? api.post("/usuarios", { email: f.email, name: f.name, role: f.role, convite, senha: convite ? undefined : f.senha || undefined })
      : api.put(`/usuarios/${u.id}`, { name: f.name, role: f.role })),
    onSuccess: (r) => aoSalvar(r, novo),
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={!!alvo} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{novo ? "Convidar pessoa" : `Editar ${u?.email}`}</DialogTitle>
          <DialogDescription>{novo ? "Ela recebe o link para criar a senha." : "O e-mail não muda."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="space-y-3 text-sm">
          {novo && <label className="block space-y-1"><span className="block text-xs text-muted-foreground">E-mail</span><input type="email" required autoFocus className={campo} value={f.email} onChange={(e) => mudar("email", e.target.value)} /></label>}
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Nome</span><input className={campo} value={f.name} maxLength={120} onChange={(e) => mudar("name", e.target.value)} /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Papel</span>
            <select className={campo} value={f.role} onChange={(e) => mudar("role", e.target.value)}>{Object.entries(PAPEIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
</label>
          {novo && (
            <fieldset className="space-y-1.5">
              <legend className="text-xs text-muted-foreground">Como a pessoa vai entrar</legend>
              <label className="flex items-start gap-2"><input type="radio" name="modo" className="mt-1" checked={f.modo === "convite"} onChange={() => mudar("modo", "convite")} /><span><span className="font-medium">Enviar convite por e-mail</span></span></label>
              <label className="flex items-start gap-2"><input type="radio" name="modo" className="mt-1" checked={f.modo === "senha"} onChange={() => mudar("modo", "senha")} /><span><span className="font-medium">Definir a senha agora</span> <span className="text-xs text-muted-foreground">(em branco, o InTAX gera uma provisória)</span></span></label>
              {f.modo === "senha" && <input type="password" autoComplete="new-password" aria-label="Senha (mínimo 10 caracteres)" placeholder="Mínimo 10 caracteres" className={campo} value={f.senha} onChange={(e) => mudar("senha", e.target.value)} />}
            </fieldset>
          )}
          <DialogFooter>
            <button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={salvar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {convite ? "Enviar convite" : novo ? "Criar conta" : "Salvar"}</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Administração > Usuários e acessos: quem usa o InTAX, com papel, situação (e convite) e último acesso. Só administradores. */
export default function UsuariosPagina() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const [dialogo, setDialogo] = useState(null);
  const [senha, setSenha] = useState(null);
  const [link, setLink] = useState(null);
  const { data: usuarios, isLoading, error, refetch } = useQuery({ queryKey: ["usuarios"], queryFn: () => api.get("/usuarios"), enabled: user?.role === "admin" });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["usuarios"] });
  const falhar = (titulo) => (e) => toast({ title: titulo, description: e.message, variant: "destructive" });
  const situacao = useMutation({
    mutationFn: ({ id, ativo }) => api.put(`/usuarios/${id}`, { ativo }),
    onSuccess: (_r, v) => { toast({ title: v.ativo ? "Conta reativada" : "Conta desativada", description: v.ativo ? undefined : "As sessões dela foram encerradas." }); recarregar(); },
    onError: falhar("Não foi possível mudar a situação"),
  });
  const provisoria = useMutation({
    mutationFn: (u) => api.post(`/usuarios/${u.id}/redefinir-senha`, {}).then((r) => ({ email: u.email, senha: r.senha_provisoria })),
    onSuccess: (r) => { setSenha(r); recarregar(); },
    onError: falhar("Não foi possível gerar a senha"),
  });
  const reenviar = useMutation({
    mutationFn: (u) => api.post(`/usuarios/${u.id}/reenviar-convite`, {}).then((r) => ({ ...r, email: u.email, tipo: "convite" })),
    onSuccess: (r) => { setLink(r); recarregar(); },
    onError: falhar("Não foi possível reenviar o convite"),
  });
  const redefinicao = useMutation({
    mutationFn: (u) => api.post(`/usuarios/${u.id}/enviar-redefinicao`, {}).then((r) => ({ ...r, email: u.email, tipo: "redefinicao" })),
    onSuccess: (r) => { setLink(r); recarregar(); },
    onError: falhar("Não foi possível enviar o link"),
  });

  const aoSalvar = (r, novo) => {
    setDialogo(null);
    recarregar();
    if (novo && r.convite) setLink({ ...r.convite, email: r.usuario.email, tipo: "convite" });
    else if (novo && r.senha_provisoria) setSenha({ email: r.usuario.email, senha: r.senha_provisoria });
    else toast({ title: novo ? "Conta criada" : "Alterações salvas" });
  };
  const alternar = async (u) => {
    if (u.ativo && !(await confirmar({ titulo: `Desativar ${u.email}?`, descricao: "Perde o acesso agora. Pode ser reativada depois.", rotulo: "Desativar" }))) return;
    situacao.mutate({ id: u.id, ativo: !u.ativo });
  };
  const pedirRedefinicao = async (u) => {
    if (await confirmar({ titulo: `Enviar link para ${u.email} criar uma senha nova?`, descricao: "Link por e-mail, válido por 24 horas.", rotulo: "Enviar link", perigoso: false })) redefinicao.mutate(u);
  };
  const pedirProvisoria = async (u) => {
    if (await confirmar({ titulo: `Gerar senha provisória para ${u.email}?`, descricao: "A senha atual deixa de valer agora. A provisória aparece uma única vez.", rotulo: "Gerar senha", perigoso: false })) provisoria.mutate(u);
  };
  const ocupado = reenviar.isPending || redefinicao.isPending || provisoria.isPending;

  if (user?.role !== "admin") {
    return (
      <div><PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Usuários e acessos" }]} title="Usuários e acessos" />
        <p role="alert" className="p-8 text-sm">Somente administradores gerenciam usuários.</p></div>
    );
  }
  const icone = "rounded p-1.5 hover:bg-muted disabled:opacity-50";
  return (
    <div>
      <PageHeader
        crumbs={[{ label: "Início", to: "/inicio" }, { label: "Administração", to: "/area/admin" }, { label: "Usuários e acessos" }]}
        title="Usuários e acessos"
        subtitle="Quem usa o InTAX, com o papel e a situação de cada conta. Convide por e-mail, reenvie o convite ou mande o link para a pessoa criar uma senha nova. O histórico de entradas fica em Registro de acesso e IPs."
        actions={<><BotaoExportar titulo="Usuários" linhas={usuarios || []} colunas={[
          { chave: "name", rotulo: "Nome" }, { chave: "email", rotulo: "E-mail" }, { chave: "role", rotulo: "Papel", valor: (u) => PAPEIS[u.role] || u.role },
          { chave: "situacao", rotulo: "Situação", valor: (u) => situacaoDaConta(u).rotulo }, { chave: "ultimo", rotulo: "Último acesso", valor: (u) => quando(u.lastLoginAt) },
          { chave: "empresas", rotulo: "Empresas na carteira" },
        ]} /><button type="button" onClick={() => setDialogo({ tipo: "novo" })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"><UserPlus className="h-4 w-4" aria-hidden="true" /> Convidar pessoa</button></>}
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
              {(usuarios || []).map((u) => {
                const s = situacaoDaConta(u);
                const semEntrar = u.ativo && !u.lastLoginAt;
                return (
                  <tr key={u.id} className="border-b border-border/60 hover:bg-muted/40">
                    <td className="px-3 py-2"><p className="font-medium">{u.name || u.email}{u.id === user.id && <span className="ml-2 rounded bg-primary/10 px-1.5 text-[10px] font-semibold uppercase text-primary">você</span>}</p>{u.name && <p className="text-[11px] text-muted-foreground">{u.email}</p>}</td>
                    <td className="px-3 py-2">{PAPEIS[u.role] || u.role}</td>
                    <td className="px-3 py-2"><span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${s.tom}`}>{s.rotulo}</span></td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{quando(u.lastLoginAt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{u.empresas}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => setDialogo({ tipo: "editar", usuario: u })} className={icone} aria-label={`Editar ${u.email}`} title="Editar"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
                        {semEntrar && <button type="button" disabled={ocupado} onClick={() => reenviar.mutate(u)} className={icone} aria-label={`Reenviar convite para ${u.email}`} title="Reenviar convite por e-mail"><Send className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                        {u.ativo && <button type="button" disabled={ocupado} onClick={() => pedirRedefinicao(u)} className={icone} aria-label={`Redefinir a senha de ${u.email}`} title="Enviar link por e-mail para criar senha nova"><Mail className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                        {u.ativo && <button type="button" disabled={ocupado} onClick={() => pedirProvisoria(u)} className={icone} aria-label={`Gerar senha provisória para ${u.email}`} title="Gerar senha provisória (sem e-mail)"><KeyRound className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                        {u.id !== user.id && (
                          <button type="button" onClick={() => alternar(u)} className={icone} aria-label={`${u.ativo ? "Desativar" : "Reativar"} ${u.email}`} title={u.ativo ? "Desativar" : "Reativar"}>
                            {u.ativo ? <UserX className="h-3.5 w-3.5 text-destructive" aria-hidden="true" /> : <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Convite vale 7 dias; senha nova, 24 horas.</p>
      </div>
      {dialogo && <DialogoUsuario key={dialogo.usuario?.id || "novo"} alvo={dialogo} aoFechar={() => setDialogo(null)} aoSalvar={aoSalvar} />}
      <SenhaProvisoria dados={senha} aoFechar={() => setSenha(null)} />
      <LinkEnviado dados={link} aoFechar={() => setLink(null)} />
    </div>
  );
}
