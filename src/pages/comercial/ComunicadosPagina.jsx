import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Paperclip, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import TabelaPadrao from "@/components/TabelaPadrao";
import SeletorDeEmpresa from "@/components/SeletorDeEmpresa";
import FiltroPorTags from "@/components/clientes/FiltroPorTags";
import { useTags } from "@/lib/useTags";
import { tamanhoLegivel } from "@/lib/documentos";
import ListaDePrevistas from "@/components/ListaDePrevistas";
import { palavra, plural } from "@/lib/plural";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const STATUS_COMUNICADO = { RASCUNHO: "Rascunho", ENVIANDO: "Enviando", ENVIADO: "Enviado", ERRO: "Não enviado" };
const TOM = { RASCUNHO: "bg-muted text-muted-foreground", ENVIANDO: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300", ENVIADO: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", ERRO: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" };

function Editor({ comunicado, empresas, aoFechar }) {
  const qc = useQueryClient();
  const entrada = useRef(null);
  const { tags } = useTags();
  const filtroInicial = comunicado?.filtro || { carteira: "bpo", tags: [], tagModo: "qualquer", empresa_ids: [] };
  const [f, setF] = useState({ assunto: comunicado?.assunto || "", corpo: comunicado?.corpo || "", filtro: { carteira: "", tags: [], tagModo: "qualquer", empresa_ids: [], ...filtroInicial } });
  const [id, setId] = useState(comunicado?.id || null);
  const [anexos, setAnexos] = useState(comunicado?.anexos || []);
  const mudarFiltro = (p) => setF((x) => ({ ...x, filtro: { ...x.filtro, ...p } }));
  const previa = useQuery({ queryKey: ["comunicados", "previa", f.filtro], queryFn: () => api.post("/comunicados/destinatarios", { filtro: f.filtro }) });
  const nomeEmpresa = useMemo(() => new Map(empresas.map((e) => [e.id, e.razao_social])), [empresas]);
  const salvar = useMutation({
    mutationFn: () => (id ? api.put(`/comunicados/${id}`, f) : api.post("/comunicados", f)),
    onSuccess: (c) => { setId(c.id); qc.invalidateQueries({ queryKey: ["comunicados"] }); toast({ title: "Rascunho salvo" }); },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  const anexar = useMutation({
    mutationFn: async (arquivo) => { let alvo = id; if (!alvo) { const c = await api.post("/comunicados", f); alvo = c.id; setId(c.id); } return api.upload(`/comunicados/${alvo}/anexos`, arquivo); },
    onSuccess: (c) => { setAnexos(c.anexos || []); qc.invalidateQueries({ queryKey: ["comunicados"] }); },
    onError: (e) => toast({ title: "Não foi possível anexar", description: e.message, variant: "destructive" }),
  });
  const tirar = useMutation({ mutationFn: (i) => api.delete(`/comunicados/${id}/anexos/${i}`), onSuccess: (c) => setAnexos(c.anexos || []) });
  const r = previa.data;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{id ? "Editar comunicado" : "Novo comunicado"}</DialogTitle><DialogDescription>Vai para o e-mail de contato do cadastro.</DialogDescription></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="space-y-3 text-sm">
          <fieldset className="space-y-2 rounded-md border border-border p-3"><legend className="px-1 text-xs font-medium">Para quem</legend>
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1"><span className="block text-xs text-muted-foreground">Carteira</span><select className={campo} value={f.filtro.carteira} onChange={(e) => mudarFiltro({ carteira: e.target.value })}><option value="">Qualquer</option><option value="bpo">BPO fiscal</option><option value="diagnostico">Diagnóstico pontual</option></select></label>
              <FiltroPorTags tags={tags} escolhidas={f.filtro.tags} modo={f.filtro.tagModo} aoMudar={(p) => mudarFiltro(p)} />
            </div>
            <div className="w-80"><SeletorDeEmpresa empresas={empresas} valor="" aoMudar={(eid) => eid && !f.filtro.empresa_ids.includes(eid) && mudarFiltro({ empresa_ids: [...f.filtro.empresa_ids, eid] })} rotulo="Só estas empresas (opcional)" opcional={false} placeholder="Acrescentar uma empresa" /></div>
            {f.filtro.empresa_ids.length > 0 && <div className="flex flex-wrap gap-1">{f.filtro.empresa_ids.map((eid) => <span key={eid} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">{nomeEmpresa.get(eid) || eid}<button type="button" onClick={() => mudarFiltro({ empresa_ids: f.filtro.empresa_ids.filter((x) => x !== eid) })} aria-label={`Tirar ${nomeEmpresa.get(eid)}`}><X className="h-3 w-3" aria-hidden="true" /></button></span>)}</div>}
            <div role="status" className="text-xs">
              {previa.isLoading ? "Calculando os destinatários…" : r?.aviso ? <span className="text-muted-foreground">{r.aviso}</span> : r ? (
                <>
                  <span className="font-medium">{r.incluidos.length} {palavra(r.incluidos.length, "recebe", "recebem")}</span>{r.fora.length ? <span className="text-muted-foreground"> · {r.fora.length} fora: {r.fora.slice(0, 4).map((x) => `${x.razao_social} (${x.motivo})`).join("; ")}{r.fora.length > 4 ? "…" : ""}</span> : null}
                </>
              ) : null}
            </div>
          </fieldset>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Assunto</span><input className={campo} value={f.assunto} maxLength={200} onChange={(e) => setF({ ...f, assunto: e.target.value })} required /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Texto (uma linha em branco separa os parágrafos)</span><textarea className={`${campo} min-h-[180px]`} value={f.corpo} maxLength={20000} onChange={(e) => setF({ ...f, corpo: e.target.value })} required /></label>
          <div className="space-y-1">
            <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Anexos (até 5, 15 MB juntos)</span><button type="button" onClick={() => entrada.current?.click()} disabled={anexar.isPending || anexos.length >= 5} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-50"><Paperclip className="h-3.5 w-3.5" aria-hidden="true" /> Anexar</button><input ref={entrada} type="file" className="hidden" aria-label="Escolher o anexo" onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ""; if (a) anexar.mutate(a); }} /></div>
            {anexos.map((a, i) => <p key={a.storage_key} className="flex items-center gap-2 text-xs"><Paperclip className="h-3 w-3" aria-hidden="true" />{a.nome} <span className="text-muted-foreground">{tamanhoLegivel(a.tamanho)}</span><button type="button" onClick={() => tirar.mutate(i)} className="text-destructive" aria-label={`Tirar o anexo ${a.nome}`}><X className="h-3 w-3" aria-hidden="true" /></button></p>)}
          </div>
          <DialogFooter><button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Fechar</button><button type="submit" disabled={!f.assunto.trim() || !f.corpo.trim() || salvar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar rascunho</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Comercial > Comunicados: e-mails para grupos de clientes, com anexos, registro de envio e link de saída. */
export default function ComunicadosPagina() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const [editor, setEditor] = useState(null);
  const { data = [], isLoading, error } = useQuery({ queryKey: ["comunicados", "lista"], queryFn: () => api.get("/comunicados"), refetchInterval: (q) => ((q.state.data || []).some((c) => c.status === "ENVIANDO") ? 2000 : false) });
  const emp = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list() });
  const empresas = useMemo(() => [...(emp.data || [])].sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR")), [emp.data]);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["comunicados"] });
  const falha = (t) => (e) => toast({ title: t, description: e.message, variant: "destructive" });
  const enviar = useMutation({ mutationFn: (id) => api.post(`/comunicados/${id}/enviar`, {}), onSuccess: (r) => { recarregar(); toast({ title: "Envio começou", description: plural(r.total, "e-mail", "e-mails") }); }, onError: falha("Não foi possível enviar") });
  const duplicar = useMutation({ mutationFn: (id) => api.post(`/comunicados/${id}/duplicar`, {}), onSuccess: () => { recarregar(); toast({ title: "Comunicado duplicado como rascunho" }); } });
  const excluir = useMutation({ mutationFn: (id) => api.delete(`/comunicados/${id}`), onSuccess: () => { recarregar(); toast({ title: "Rascunho excluído" }); }, onError: falha("Não foi possível excluir") });
  const confirmarEnvio = async (c) => {
    let total = 0;
    try { total = (await api.post("/comunicados/destinatarios", { filtro: c.filtro })).incluidos.length; } catch { /* a confirmação diz "os destinatários" */ }
    if (await confirmar({ titulo: `Enviar "${c.assunto}"?`, descricao: `${total ? `${plural(total, "e-mail sai", "e-mails saem")} agora` : "Os e-mails saem agora"}. Depois de enviado, não muda.`, rotulo: "Enviar", perigoso: false })) enviar.mutate(c.id);
  };
  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Comercial", to: "/area/comercial" }, { label: "Comunicados" }]} title="Comunicados" />
      <div className="px-6 lg:px-8 py-6 space-y-3">
        <div className="flex justify-end"><button type="button" onClick={() => setEditor({ comunicado: null })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Novo comunicado</button></div>
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
        {error && <p className="py-8 text-center text-sm" role="alert">Não foi possível carregar.</p>}
        {!isLoading && !error && (
          <TabelaPadrao
            id="comunicados-lista" ariaLabel="Comunicados" titulo="Comunicados" linhas={data} vazio="Nenhum comunicado." ordemInicial={{ chave: "createdAt", dir: -1 }}
            colunas={[
              { chave: "assunto", rotulo: "Assunto", render: (c) => <span className="font-medium">{c.assunto}</span> },
              { chave: "anexos", rotulo: "Anexos", valor: (c) => (c.anexos || []).length, alinhar: "direita", render: (c) => ((c.anexos || []).length ? plural(c.anexos.length, "anexo", "anexos") : <span className="text-muted-foreground">—</span>) },
              { chave: "createdAt", rotulo: "Criado em", tipo: "data" },
              { chave: "enviado_em", rotulo: "Enviado em", tipo: "data", render: (c) => (c.enviado_em ? new Date(c.enviado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : <span className="text-muted-foreground">—</span>) },
              { chave: "status", rotulo: "Situação", valor: (c) => STATUS_COMUNICADO[c.status], render: (c) => <span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${TOM[c.status]}`}>{STATUS_COMUNICADO[c.status]}</span> },
              { chave: "enviados", rotulo: "Enviados", valor: (c) => (c.status === "RASCUNHO" ? "" : c.enviados), render: (c) => <span className="tabular-nums">{c.status === "RASCUNHO" ? "—" : `${c.enviados} de ${c.total}${c.falhas ? ` · ${plural(c.falhas, "falha", "falhas")}` : ""}`}</span> },
              { chave: "acoes", rotulo: "Ações", ordenavel: false, filtravel: false, alinhar: "direita", valor: () => "",
                render: (c) => (
                  <>
                    {c.status === "RASCUNHO" && <button type="button" onClick={() => setEditor({ comunicado: c })} className="rounded p-1 hover:bg-muted" aria-label={`Editar ${c.assunto}`}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                    {c.status === "RASCUNHO" && user?.role === "admin" && <button type="button" onClick={() => confirmarEnvio(c)} className="rounded p-1 text-primary hover:bg-muted" aria-label={`Enviar ${c.assunto}`}><Send className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                    <button type="button" onClick={() => duplicar.mutate(c.id)} className="rounded p-1 hover:bg-muted" aria-label={`Duplicar ${c.assunto}`}><Copy className="h-3.5 w-3.5" aria-hidden="true" /></button>
                    {c.status === "RASCUNHO" && <button type="button" onClick={async () => { if (await confirmar({ titulo: "Excluir este rascunho?", descricao: c.assunto, rotulo: "Excluir" })) excluir.mutate(c.id); }} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label={`Excluir ${c.assunto}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                  </>
                ) },
            ]}
          />
        )}
        {user?.role !== "admin" && <p className="text-xs text-muted-foreground">O envio é feito por um administrador.</p>}
        <ListaDePrevistas moduloId="comunicados" />
      </div>
      {editor && <Editor key={editor.comunicado?.id || "novo"} comunicado={editor.comunicado} empresas={empresas} aoFechar={() => setEditor(null)} />}
    </div>
  );
}
