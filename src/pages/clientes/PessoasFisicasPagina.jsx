import { useMemo, useState } from "react";
import TabelaPadrao from "@/components/TabelaPadrao";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import ServicosConsultoria from "@/components/clientes/ServicosConsultoria";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import SeletorDeEmpresa from "@/components/SeletorDeEmpresa";
import { hojeBR } from "@/lib/tarefas";
import { plural } from "@/lib/plural";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Situação do certificado da pessoa: vencido, vence em até 30 dias, válido ou sem informação. */
export function situacaoDoCertificado(validade, hoje = hojeBR()) {
  if (!validade) return { rotulo: "Sem certificado informado", tom: "bg-muted text-muted-foreground" };
  const dias = Math.round((Date.parse(String(validade).slice(0, 10)) - Date.parse(hoje)) / 86_400_000);
  if (dias < 0) return { rotulo: `Vencido há ${plural(-dias, "dia", "dias")}`, tom: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" };
  if (dias <= 30) return { rotulo: `Vence em ${plural(dias, "dia", "dias")}`, tom: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" };
  return { rotulo: `Válido até ${String(validade).slice(8, 10)}/${String(validade).slice(5, 7)}/${String(validade).slice(0, 4)}`, tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" };
}

export function DialogoPessoa({ pessoa, empresas, aoFechar, servicoInicial }) {
  const [consultoria, setConsultoria] = useState(servicoInicial ? [servicoInicial] : []);
  const qc = useQueryClient();
  const [f, setF] = useState({ nome: pessoa?.nome || "", cpf: pessoa?.cpf || "", email: pessoa?.email || "", telefone: pessoa?.telefone || "", empresa_id: pessoa?.empresa_id || "", grupo: pessoa?.grupo || "", certificado_tipo: pessoa?.certificado_tipo || "", certificado_validade: pessoa?.certificado_validade?.slice(0, 10) || "", observacao: pessoa?.observacao || "" });
  const mudar = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const salvar = useMutation({
    mutationFn: () => { const c = { ...f, empresa_id: f.empresa_id || null, certificado_tipo: f.certificado_tipo || null, certificado_validade: f.certificado_validade || null }; return pessoa ? api.put(`/pessoas-fisicas/${pessoa.id}`, c) : api.post("/pessoas-fisicas", { ...c, servicos_consultoria: consultoria }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pessoas-fisicas"] }); qc.invalidateQueries({ queryKey: ["consultoria", "vinculos"] }); toast({ title: "Pessoa física salva" }); aoFechar(); },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{pessoa ? "Editar pessoa física" : "Nova pessoa física"}</DialogTitle><DialogDescription className="sr-only">Dados da pessoa física</DialogDescription></DialogHeader>
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
          <ServicosConsultoria publico="PF" selecao={consultoria} mudar={setConsultoria} clienteId={pessoa?.id} />
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
  const [dialogo, setDialogo] = useState(null);
  const { data = [], isLoading, error } = useQuery({ queryKey: ["pessoas-fisicas"], queryFn: () => api.get("/pessoas-fisicas") });
  const emp = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list() });
  const empresas = useMemo(() => [...(emp.data || [])].sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR")), [emp.data]);
  const nomeEmpresa = useMemo(() => new Map(empresas.map((e) => [e.id, e.razao_social])), [empresas]);
  const excluir = useMutation({ mutationFn: (id) => api.delete(`/pessoas-fisicas/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["pessoas-fisicas"] }); toast({ title: "Pessoa física excluída" }); }, onError: (e) => toast({ title: "Não foi possível excluir", description: e.message, variant: "destructive" }) });
  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Clientes", to: "/area/clientes" }, { label: "Pessoas físicas" }]} title="Pessoas físicas" />
      <div className="px-6 lg:px-8 py-6 space-y-3">
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
        {error && <p className="py-8 text-center text-sm" role="alert">Não foi possível carregar.</p>}
        {!isLoading && !error && (
          <TabelaPadrao
            id="pessoas-fisicas" ariaLabel="Pessoas físicas" titulo="Pessoas físicas" linhas={data} vazio="Nenhuma pessoa física ainda."
            acoes={<button type="button" onClick={() => setDialogo({ pessoa: null })} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Nova pessoa física</button>}
            colunas={[
              { chave: "nome", rotulo: "Nome", render: (p) => <span className="font-medium">{p.nome}</span> },
              { chave: "cpf", rotulo: "CPF", render: (p) => <span className="tabular-nums">{p.cpf}</span> },
              { chave: "email", rotulo: "E-mail", render: (p) => p.email || <span className="text-muted-foreground">—</span> },
              { chave: "telefone", rotulo: "Telefone", render: (p) => p.telefone || <span className="text-muted-foreground">—</span> },
              { chave: "empresa", rotulo: "Empresa ligada", valor: (p) => nomeEmpresa.get(p.empresa_id) || "", render: (p) => nomeEmpresa.get(p.empresa_id) || <span className="text-muted-foreground">—</span> },
              { chave: "certificado", rotulo: "Certificado", valor: (p) => `${p.certificado_tipo ? `${p.certificado_tipo} · ` : ""}${situacaoDoCertificado(p.certificado_validade).rotulo}`,
                render: (p) => { const s = situacaoDoCertificado(p.certificado_validade); return <span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${s.tom}`}>{p.certificado_tipo ? `${p.certificado_tipo} · ` : ""}{s.rotulo}</span>; } },
              { chave: "validade", rotulo: "Validade", tipo: "data", valor: (p) => p.certificado_validade?.slice(0, 10) || "" },
              { chave: "acoes", rotulo: "Ações", ordenavel: false, filtravel: false, alinhar: "direita", valor: () => "",
                render: (p) => (
                  <>
                    <Link to={`/bpo/monitoramento/pf/${p.id}`} className="mr-2 text-xs text-primary hover:underline">Monitoramento</Link><Link to="/bpo/arquivos" className="mr-2 text-xs text-primary hover:underline">Arquivos</Link>
                    <button type="button" onClick={() => setDialogo({ pessoa: p })} className="rounded p-1 hover:bg-muted" aria-label={`Editar ${p.nome}`}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
                    {user?.role === "admin" && <button type="button" onClick={async () => { if (await confirmar({ titulo: `Excluir ${p.nome}?`, descricao: "Os documentos e os arquivos dela saem junto.", rotulo: "Excluir" })) excluir.mutate(p.id); }} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label={`Excluir ${p.nome}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                  </>
                ) },
            ]}
          />
        )}
      </div>
      {dialogo && <DialogoPessoa key={dialogo.pessoa?.id || "nova"} pessoa={dialogo.pessoa} empresas={empresas} aoFechar={() => setDialogo(null)} />}
    </div>
  );
}
