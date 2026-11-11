import { useMemo, useState } from "react";
import BotaoExportar from "@/components/BotaoExportar";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import SeletorDeEmpresa from "@/components/SeletorDeEmpresa";
import { hojeBR } from "@/lib/tarefas";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Situação do certificado da pessoa: vencido, vence em até 30 dias, válido ou sem informação. */
export function situacaoDoCertificado(validade, hoje = hojeBR()) {
  if (!validade) return { rotulo: "Sem certificado informado", tom: "bg-muted text-muted-foreground" };
  const dias = Math.round((Date.parse(String(validade).slice(0, 10)) - Date.parse(hoje)) / 86_400_000);
  if (dias < 0) return { rotulo: `Vencido há ${-dias} dia(s)`, tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" };
  if (dias <= 30) return { rotulo: `Vence em ${dias} dia(s)`, tom: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" };
  return { rotulo: `Válido até ${String(validade).slice(8, 10)}/${String(validade).slice(5, 7)}/${String(validade).slice(0, 4)}`, tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" };
}

function DialogoPessoa({ pessoa, empresas, aoFechar }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ nome: pessoa?.nome || "", cpf: pessoa?.cpf || "", email: pessoa?.email || "", telefone: pessoa?.telefone || "", empresa_id: pessoa?.empresa_id || "", grupo: pessoa?.grupo || "", certificado_tipo: pessoa?.certificado_tipo || "", certificado_validade: pessoa?.certificado_validade?.slice(0, 10) || "", observacao: pessoa?.observacao || "" });
  const mudar = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const salvar = useMutation({
    mutationFn: () => { const c = { ...f, empresa_id: f.empresa_id || null, certificado_tipo: f.certificado_tipo || null, certificado_validade: f.certificado_validade || null }; return pessoa ? api.put(`/pessoas-fisicas/${pessoa.id}`, c) : api.post("/pessoas-fisicas", c); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pessoas-fisicas"] }); toast({ title: "Pessoa física salva" }); aoFechar(); },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{pessoa ? "Editar pessoa física" : "Nova pessoa física"}</DialogTitle><DialogDescription>O CPF é conferido. O certificado guarda só o tipo e a validade, para o aviso de vencimento.</DialogDescription></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 block space-y-1"><span className="block text-xs text-muted-foreground">Nome</span><input className={campo} value={f.nome} maxLength={200} onChange={(e) => mudar("nome", e.target.value)} required /></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">CPF</span><input className={campo} value={f.cpf} maxLength={14} onChange={(e) => mudar("cpf", e.target.value)} required inputMode="numeric" /></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Telefone</span><input className={campo} value={f.telefone} maxLength={30} onChange={(e) => mudar("telefone", e.target.value)} /></label>
            <label className="col-span-2 block space-y-1"><span className="block text-xs text-muted-foreground">E-mail</span><input type="email" className={campo} value={f.email} onChange={(e) => mudar("email", e.target.value)} /></label>
          </div>
          <SeletorDeEmpresa empresas={empresas} valor={f.empresa_id} aoMudar={(v) => mudar("empresa_id", v)} rotulo="Empresa ligada (sócio, produtor)" />
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Certificado digital</span><select className={campo} value={f.certificado_tipo} onChange={(e) => mudar("certificado_tipo", e.target.value)}><option value="">Não tem / não informado</option><option>A1</option><option>A3</option><option>e-CPF em nuvem</option></select></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Validade do certificado</span><input type="date" className={campo} value={f.certificado_validade} onChange={(e) => mudar("certificado_validade", e.target.value)} /></label>
          </div>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Observação</span><textarea className={`${campo} min-h-[56px]`} value={f.observacao} maxLength={2000} onChange={(e) => mudar("observacao", e.target.value)} /></label>
          <DialogFooter><button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button><button type="submit" disabled={salvar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Clientes > Pessoas físicas: CPFs da carteira, ligados às empresas, com o vencimento do certificado digital. */
export default function PessoasFisicasPagina() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const [busca, setBusca] = useState("");
  const [dialogo, setDialogo] = useState(null);
  const { data = [], isLoading, error } = useQuery({ queryKey: ["pessoas-fisicas"], queryFn: () => api.get("/pessoas-fisicas") });
  const emp = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list() });
  const empresas = useMemo(() => [...(emp.data || [])].sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR")), [emp.data]);
  const nomeEmpresa = useMemo(() => new Map(empresas.map((e) => [e.id, e.razao_social])), [empresas]);
  const t = semAcento(busca).trim();
  const lista = data.filter((p) => !t || semAcento(p.nome).includes(t) || p.cpf.replace(/\D/g, "").includes(t.replace(/\D/g, "") || "§"));
  const excluir = useMutation({ mutationFn: (id) => api.delete(`/pessoas-fisicas/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["pessoas-fisicas"] }); toast({ title: "Pessoa física excluída" }); }, onError: (e) => toast({ title: "Não foi possível excluir", description: e.message, variant: "destructive" }) });
  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Clientes", to: "/area/clientes" }, { label: "Pessoas físicas" }]} title="Pessoas físicas" subtitle="Sócios e produtores rurais pessoa física, com CPF, a empresa ligada e o vencimento do certificado digital. Os arquivos de cada pessoa ficam em Arquivos e documentos." />
      <div className="px-6 lg:px-8 py-6 space-y-3">
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1 flex-1 min-w-[200px]"><span className="block text-xs text-muted-foreground">Buscar (nome ou CPF)</span><input type="search" className={campo} value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
          <BotaoExportar titulo="Pessoas físicas" linhas={lista} colunas={[
            { chave: "nome", rotulo: "Nome" }, { chave: "cpf", rotulo: "CPF" }, { chave: "email", rotulo: "E-mail" }, { chave: "telefone", rotulo: "Telefone" },
            { chave: "empresa", rotulo: "Empresa ligada", valor: (p) => nomeEmpresa.get(p.empresa_id) || "" },
            { chave: "certificado", rotulo: "Certificado", valor: (p) => `${p.certificado_tipo ? `${p.certificado_tipo} · ` : ""}${situacaoDoCertificado(p.certificado_validade).rotulo}` },
          ]} />
          <button type="button" onClick={() => setDialogo({ pessoa: null })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Nova pessoa física</button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-[13px] leading-5" aria-label="Pessoas físicas">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-3 py-2">Nome</th><th className="px-3 py-2">CPF</th><th className="px-3 py-2">Empresa ligada</th><th className="px-3 py-2">Certificado</th><th className="px-3 py-2"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</td></tr>}
              {error && <tr><td colSpan={5} className="py-8 text-center" role="alert">Não foi possível carregar.</td></tr>}
              {!isLoading && !error && lista.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">{data.length ? "Ninguém com essa busca." : "Nenhuma pessoa física ainda."}</td></tr>}
              {lista.map((p) => {
                const s = situacaoDoCertificado(p.certificado_validade);
                return (
                  <tr key={p.id} className="border-b border-border/60 hover:bg-muted/40">
                    <td className="px-3 py-2"><p className="font-medium">{p.nome}</p><p className="text-[11px] text-muted-foreground">{[p.email, p.telefone].filter(Boolean).join(" · ")}</p></td>
                    <td className="px-3 py-2 tabular-nums">{p.cpf}</td>
                    <td className="px-3 py-2">{nomeEmpresa.get(p.empresa_id) || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2"><span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${s.tom}`}>{p.certificado_tipo ? `${p.certificado_tipo} · ` : ""}{s.rotulo}</span></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Link to="/bpo/arquivos" className="mr-2 text-xs text-primary hover:underline">Arquivos</Link>
                      <button type="button" onClick={() => setDialogo({ pessoa: p })} className="rounded p-1.5 hover:bg-muted" aria-label={`Editar ${p.nome}`}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
                      {user?.role === "admin" && <button type="button" onClick={async () => { if (await confirmar({ titulo: `Excluir ${p.nome}?`, descricao: "Os documentos e os arquivos dela saem junto.", rotulo: "Excluir" })) excluir.mutate(p.id); }} className="rounded p-1.5 text-destructive hover:bg-destructive/10" aria-label={`Excluir ${p.nome}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Procurações eletrônicas e o monitoramento da pessoa física (e-CAC, CND, mensagens) dependem do Integra Contador e entram com o Monitoramento fiscal.</p>
      </div>
      {dialogo && <DialogoPessoa key={dialogo.pessoa?.id || "nova"} pessoa={dialogo.pessoa} empresas={empresas} aoFechar={() => setDialogo(null)} />}
    </div>
  );
}
