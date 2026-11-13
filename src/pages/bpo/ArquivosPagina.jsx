import { useMemo, useRef, useState } from "react";
import TabelaPadrao from "@/components/TabelaPadrao";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Download, FileArchive, Folder, FolderPlus, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import SeletorDeEmpresa from "@/components/SeletorDeEmpresa";
import { useEmpresaEmFoco } from "@/lib/EmpresaEmFoco";
import { plural } from "@/lib/plural";
import { contarSituacoes, expiraEm, SITUACOES_DOC, tamanhoLegivel, trilhaDaPasta } from "@/lib/documentos";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const fmtData = (v) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

/** Escolhe o dono dos arquivos/documentos: uma empresa ou uma pessoa física. */
function SeletorDeDono({ empresas, pessoas, dono, aoMudar }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="De quem">
        {[["empresa", "Empresa"], ["pf", "Pessoa física"]].map(([v, r]) => <button key={v} type="button" aria-pressed={dono.tipo === v} onClick={() => aoMudar({ tipo: v, id: "" })} className={`rounded px-3 py-1 text-sm ${dono.tipo === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{r}</button>)}
      </div>
      <div className="w-72">
        {dono.tipo === "empresa"
          ? <SeletorDeEmpresa empresas={empresas} valor={dono.id} aoMudar={(id) => aoMudar({ tipo: "empresa", id })} rotulo="Empresa" opcional={false} />
          : <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Pessoa física</span><select className={campo} value={dono.id} onChange={(e) => aoMudar({ tipo: "pf", id: e.target.value })}><option value="">Escolha…</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.cpf})</option>)}</select></label>}
      </div>
    </div>
  );
}

const donoParams = (dono) => (dono.tipo === "empresa" ? { empresa_id: dono.id } : { pessoa_fisica_id: dono.id });

function AbaArquivos({ empresas, pessoas, donoInicial }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const entrada = useRef(null);
  const [dono, setDono] = useState(donoInicial);
  const [pasta, setPasta] = useState("");
  const [marcados, setMarcados] = useState(new Set());
  const [editar, setEditar] = useState(null);
  const ativo = !!dono.id;
  const chave = ["arquivos", dono.tipo, dono.id, pasta];
  const { data, isLoading, error } = useQuery({ queryKey: chave, queryFn: () => api.get("/documentos/arquivos", { ...donoParams(dono), pasta }), enabled: ativo });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["arquivos"] });
  const falha = (t) => (e) => toast({ title: t, description: e.message, variant: "destructive" });
  const enviar = useMutation({
    mutationFn: async (arquivos) => { for (const f of arquivos) await api.upload("/documentos/arquivos", f, { ...donoParams(dono), pasta }); return arquivos.length; },
    onSuccess: (n) => { recarregar(); toast({ title: plural(n, "arquivo enviado", "arquivos enviados") }); },
    onError: falha("Não foi possível enviar"),
  });
  const excluir = useMutation({ mutationFn: (id) => api.delete(`/documentos/arquivos/${id}`), onSuccess: () => { recarregar(); toast({ title: "Arquivo excluído" }); }, onError: falha("Não foi possível excluir") });
  const mover = useMutation({ mutationFn: ({ id, ...c }) => api.put(`/documentos/arquivos/${id}`, c), onSuccess: () => { setEditar(null); recarregar(); toast({ title: "Arquivo salvo" }); }, onError: falha("Não foi possível salvar") });
  const zip = useMutation({
    mutationFn: () => api.post("/downloads", { arquivo_ids: [...marcados], nome: `arquivos ${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}` }),
    onSuccess: async (l) => { setMarcados(new Set()); qc.invalidateQueries({ queryKey: ["downloads"] }); toast({ title: "ZIP pronto", description: "Em Meus downloads por 7 dias." }); await api.baixar("get", `/downloads/${l.id}/arquivo`, { nome: l.nome }); },
    onError: falha("Não foi possível montar o ZIP"),
  });
  const [nomePasta, setNomePasta] = useState(null); // campo da nova pasta aberto
  const criarPasta = () => { if (nomePasta && nomePasta.trim()) setPasta([pasta, nomePasta.trim().replace(/[\\/]+/g, "-")].filter(Boolean).join("/")); setNomePasta(null); };
  const alternar = (id) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-3">
      <SeletorDeDono empresas={empresas} pessoas={pessoas} dono={dono} aoMudar={(d) => { setDono(d); setPasta(""); setMarcados(new Set()); }} />
      {!ativo ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Escolha uma empresa ou pessoa física.</p> : (
        <div className="rounded-xl border border-border bg-card p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <nav aria-label="Pasta atual" className="flex flex-wrap items-center gap-1">
              <button type="button" onClick={() => setPasta("")} className="rounded px-1.5 hover:bg-muted">Início</button>
              {trilhaDaPasta(pasta).map((p) => <span key={p.pasta} className="flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /><button type="button" onClick={() => setPasta(p.pasta)} className="rounded px-1.5 hover:bg-muted">{p.nome}</button></span>)}
            </nav>
            <div className="ml-auto flex flex-wrap gap-2">
              {nomePasta === null
                ? <button type="button" onClick={() => setNomePasta("")} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-muted"><FolderPlus className="h-4 w-4" aria-hidden="true" /> Nova pasta</button>
                : (
                  <form onSubmit={(e) => { e.preventDefault(); criarPasta(); }} className="flex items-center gap-1">
                    <input autoFocus className="w-40 rounded-md border border-border bg-background px-2 py-1 text-sm" value={nomePasta} maxLength={60} onChange={(e) => setNomePasta(e.target.value)} placeholder="Nome da pasta" aria-label="Nome da nova pasta" onKeyDown={(e) => { if (e.key === "Escape") setNomePasta(null); }} />
                    <button type="submit" className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">Abrir</button>
                  </form>
                )}
              <button type="button" onClick={() => zip.mutate()} disabled={!marcados.size || zip.isPending} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-50"><FileArchive className="h-4 w-4" aria-hidden="true" /> Baixar marcados (ZIP){marcados.size ? ` · ${marcados.size}` : ""}</button>
              <button type="button" onClick={() => entrada.current?.click()} disabled={enviar.isPending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />} Enviar arquivos</button>
              <input ref={entrada} type="file" multiple className="hidden" aria-label="Escolher arquivos para enviar" onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ""; if (f.length) enviar.mutate(f); }} />
            </div>
          </div>
          {isLoading && <p className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
          {error && <p role="alert" className="py-6 text-center text-sm">Não foi possível carregar os arquivos.</p>}
          {data && data.subpastas.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Subpastas">
              {[...data.subpastas].sort((a, b) => a.localeCompare(b, "pt-BR")).map((s) => <li key={s}><button type="button" onClick={() => setPasta([pasta, s].filter(Boolean).join("/"))} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm font-medium hover:bg-muted hover:text-primary"><Folder className="h-4 w-4 text-amber-600" aria-hidden="true" /> {s}</button></li>)}
            </ul>
          )}
          {data && (
            <TabelaPadrao
              id="bpo-arquivos-pasta" ariaLabel="Arquivos da pasta" linhas={data.arquivos}
              vazio={data.subpastas.length ? "Nenhum arquivo nesta pasta." : pasta ? "Pasta nova: envie os arquivos para ela aparecer." : "Nenhum arquivo ainda. Use \"Enviar arquivos\" (até 25 MB cada)."}
              colunas={[
                { chave: "marcar", rotulo: "Marcar", ordenavel: false, filtravel: false, valor: () => "",
                  render: (a) => <input type="checkbox" checked={marcados.has(a.id)} onChange={() => alternar(a.id)} aria-label={`Marcar ${a.nome}`} /> },
                { chave: "nome", rotulo: "Arquivo", render: (a) => <span className="font-medium">{a.nome}</span> },
                { chave: "tamanho", rotulo: "Tamanho", alinhar: "direita", render: (a) => <span className="text-muted-foreground">{tamanhoLegivel(a.tamanho)}</span> },
                { chave: "createdAt", rotulo: "Enviado em", tipo: "data" },
                { chave: "enviado_por", rotulo: "Enviado por", render: (a) => <span className="text-muted-foreground">{a.enviado_por || "—"}</span> },
                { chave: "acoes", rotulo: "Ações", ordenavel: false, filtravel: false, alinhar: "direita", valor: () => "",
                  render: (a) => (
                    <>
                      <button type="button" onClick={() => api.baixar("get", `/documentos/arquivos/${a.id}/download`, { nome: a.nome }).catch(falha("Não foi possível baixar"))} className="rounded p-1 hover:bg-muted" aria-label={`Baixar ${a.nome}`}><Download className="h-3.5 w-3.5" aria-hidden="true" /></button>
                      <button type="button" onClick={() => setEditar({ id: a.id, nome: a.nome, pasta: a.pasta })} className="rounded p-1 hover:bg-muted" aria-label={`Renomear ou mover ${a.nome}`}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
                      <button type="button" onClick={async () => { if (await confirmar({ titulo: `Excluir "${a.nome}"?`, descricao: "O arquivo sai do InTAX e não volta.", rotulo: "Excluir" })) excluir.mutate(a.id); }} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label={`Excluir ${a.nome}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                    </>
                  ) },
              ]}
            />
          )}
        </div>
      )}
      {editar && (
        <Dialog open onOpenChange={(v) => { if (!v) setEditar(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Renomear ou mover</DialogTitle><DialogDescription>A pasta usa "/" para subpastas, por exemplo "Contratos/2026".</DialogDescription></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); mover.mutate(editar); }} className="space-y-3 text-sm">
              <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Nome</span><input className={campo} value={editar.nome} onChange={(e) => setEditar({ ...editar, nome: e.target.value })} /></label>
              <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Pasta</span><input className={campo} value={editar.pasta} onChange={(e) => setEditar({ ...editar, pasta: e.target.value })} placeholder="(raiz)" /></label>
              <DialogFooter><button type="button" onClick={() => setEditar(null)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button><button type="submit" className="rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground">Salvar</button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function DialogoDocumento({ doc, empresas, pessoas, tipos, aoFechar }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ tipo: doc?.pessoa_fisica_id ? "pf" : "empresa", dono: doc?.empresa_id || doc?.pessoa_fisica_id || "", tipo_id: doc?.tipo_id || "", descricao: doc?.descricao || "", numero: doc?.numero || "", emissao: doc?.emissao?.slice(0, 10) || "", validade: doc?.validade?.slice(0, 10) || "" });
  const [arquivo, setArquivo] = useState(null);
  const salvar = useMutation({
    mutationFn: async () => {
      const dono = f.tipo === "empresa" ? { empresa_id: f.dono } : { pessoa_fisica_id: f.dono };
      let arquivo_id;
      if (arquivo) arquivo_id = (await api.upload("/documentos/arquivos", arquivo, { ...dono, pasta: "Documentos" })).id;
      const corpo = { tipo_id: f.tipo_id || null, descricao: f.descricao || null, numero: f.numero || null, emissao: f.emissao || null, validade: f.validade || null, ...(arquivo_id ? { arquivo_id } : {}) };
      return doc ? api.put(`/documentos/${doc.id}`, corpo) : api.post("/documentos", { ...corpo, ...dono });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documentos"] }); qc.invalidateQueries({ queryKey: ["arquivos"] }); toast({ title: "Documento salvo" }); aoFechar(); },
    onError: (e) => toast({ title: "Não foi possível salvar o documento", description: e.message, variant: "destructive" }),
  });
  const mudar = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{doc ? "Editar documento" : "Novo documento"}</DialogTitle><DialogDescription>Com a validade preenchida, o InTAX avisa no sino antes de vencer (dias definidos no tipo).</DialogDescription></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="space-y-3 text-sm">
          {!doc && <SeletorDeDono empresas={empresas} pessoas={pessoas} dono={{ tipo: f.tipo, id: f.dono }} aoMudar={(d) => setF((x) => ({ ...x, tipo: d.tipo, dono: d.id }))} />}
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Tipo</span><select className={campo} value={f.tipo_id} onChange={(e) => mudar("tipo_id", e.target.value)}><option value="">Outro (use a descrição)</option>{tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Número</span><input className={campo} value={f.numero} maxLength={80} onChange={(e) => mudar("numero", e.target.value)} /></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Emissão</span><input type="date" className={campo} value={f.emissao} onChange={(e) => mudar("emissao", e.target.value)} /></label>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Validade</span><input type="date" className={campo} value={f.validade} onChange={(e) => mudar("validade", e.target.value)} /></label>
          </div>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Descrição</span><input className={campo} value={f.descricao} maxLength={300} onChange={(e) => mudar("descricao", e.target.value)} /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Arquivo (opcional; vai para a pasta Documentos)</span><input type="file" onChange={(e) => setArquivo(e.target.files?.[0] || null)} /></label>
          <DialogFooter><button type="button" onClick={aoFechar} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button><button type="submit" disabled={(!doc && !f.dono) || (!f.tipo_id && !f.descricao.trim()) || salvar.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AbaDocumentos({ empresas, pessoas, tipos }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const [situacao, setSituacao] = useState("");
  const [dialogo, setDialogo] = useState(null);
  const { data: docs = [], isLoading, error } = useQuery({ queryKey: ["documentos", "lista"], queryFn: () => api.get("/documentos") });
  const nomeEmpresa = useMemo(() => new Map(empresas.map((e) => [e.id, e.razao_social])), [empresas]);
  const nomePf = useMemo(() => new Map(pessoas.map((p) => [p.id, p.nome])), [pessoas]);
  const c = contarSituacoes(docs);
  const lista = docs.filter((d) => !situacao || d.situacao === situacao);
  const excluir = useMutation({ mutationFn: (id) => api.delete(`/documentos/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["documentos"] }); toast({ title: "Documento excluído" }); } });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["VENCIDO", c.VENCIDO], ["A_VENCER", c.A_VENCER], ["VALIDO", c.VALIDO], ["", docs.length]].map(([k, n]) => (
          <button key={k || "todos"} type="button" aria-pressed={situacao === k} onClick={() => setSituacao(situacao === k ? "" : k)} className={`rounded-xl border bg-card px-4 py-3 text-left hover:bg-muted/50 ${k === "VENCIDO" && n ? "border-red-400/60" : k === "A_VENCER" && n ? "border-amber-400/60" : "border-border"} ${situacao === k ? "ring-2 ring-primary" : ""}`}>
            <p className="text-xs text-muted-foreground">{k ? SITUACOES_DOC[k].rotulo : "Todos"}</p><p className="text-xl font-semibold tabular-nums">{n}</p>
          </button>
        ))}
      </div>
      {isLoading && <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
      {error && <p className="py-8 text-center text-sm" role="alert">Não foi possível carregar os documentos.</p>}
      {!isLoading && !error && (
        <TabelaPadrao
          id="bpo-documentos-validade" ariaLabel="Documentos com validade" titulo="Documentos com validade" linhas={lista} ordemInicial={{ chave: "validade", dir: 1 }}
          vazio={docs.length ? "Nenhum documento nessa situação." : "Nenhum documento ainda. Cadastre alvarás, licenças e certidões com a validade para receber o aviso antes de vencer."}
          acoes={<button type="button" onClick={() => setDialogo({ doc: null })} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Novo documento</button>}
          colunas={[
            { chave: "documento", rotulo: "Documento", valor: (d) => d.tipo?.nome || d.descricao || "", render: (d) => <span className="font-medium">{d.tipo?.nome || d.descricao}</span> },
            { chave: "descricao", rotulo: "Descrição", valor: (d) => (d.tipo ? d.descricao || "" : ""), render: (d) => (d.tipo && d.descricao ? <span className="block max-w-[24rem] truncate" title={d.descricao}>{d.descricao}</span> : <span className="text-muted-foreground">—</span>) },
            { chave: "numero", rotulo: "Número", render: (d) => d.numero || <span className="text-muted-foreground">—</span> },
            { chave: "orgao", rotulo: "Órgão", valor: (d) => d.tipo?.orgao || "", render: (d) => d.tipo?.orgao || <span className="text-muted-foreground">—</span> },
            { chave: "dono", rotulo: "De quem", valor: (d) => (d.empresa_id ? nomeEmpresa.get(d.empresa_id) : nomePf.get(d.pessoa_fisica_id)) || "" },
            { chave: "validade", rotulo: "Validade", tipo: "data", valor: (d) => (d.validade ? String(d.validade).slice(0, 10) : ""), render: (d) => <span className="tabular-nums">{fmtData(d.validade)}</span> },
            { chave: "situacao", rotulo: "Situação", valor: (d) => SITUACOES_DOC[d.situacao].rotulo, render: (d) => <span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${SITUACOES_DOC[d.situacao].tom}`}>{SITUACOES_DOC[d.situacao].rotulo}</span> },
            { chave: "acoes", rotulo: "Ações", ordenavel: false, filtravel: false, alinhar: "direita", valor: () => "",
              render: (d) => (
                <>
                  {d.arquivo_id && <button type="button" onClick={() => api.baixar("get", `/documentos/arquivos/${d.arquivo_id}/download`, { nome: `${d.tipo?.nome || "documento"}` }).catch(() => toast({ title: "Não foi possível baixar", variant: "destructive" }))} className="rounded p-1 hover:bg-muted" aria-label="Baixar o arquivo do documento"><Download className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                  <button type="button" onClick={() => setDialogo({ doc: d })} className="rounded p-1 hover:bg-muted" aria-label={`Editar ${d.tipo?.nome || d.descricao}`}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  <button type="button" onClick={async () => { if (await confirmar({ titulo: "Excluir este documento?", descricao: "O arquivo ligado a ele continua na pasta.", rotulo: "Excluir" })) excluir.mutate(d.id); }} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label={`Excluir ${d.tipo?.nome || d.descricao}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                </>
              ) },
          ]}
        />
      )}
      {dialogo && <DialogoDocumento doc={dialogo.doc} empresas={empresas} pessoas={pessoas} tipos={tipos} aoFechar={() => setDialogo(null)} />}
    </div>
  );
}

function AbaDownloads() {
  const { data = [], isLoading } = useQuery({ queryKey: ["downloads"], queryFn: () => api.get("/downloads") });
  return (
    <div className="max-w-2xl space-y-2">
      <p className="text-sm text-muted-foreground">ZIP guardados por 7 dias.</p>
      {isLoading ? <p className="p-4 text-center text-sm text-muted-foreground">Carregando…</p> : (
        <TabelaPadrao
          id="bpo-meus-downloads" ariaLabel="Meus downloads" linhas={data} simples vazio="Nenhum download guardado." ordemInicial={{ chave: "expira_em", dir: -1 }}
          colunas={[
            { chave: "nome", rotulo: "ZIP", render: (l) => <span className="inline-flex items-center gap-1.5 font-medium"><FileArchive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{l.nome}</span> },
            { chave: "arquivos", rotulo: "Arquivos", alinhar: "direita", render: (l) => plural(l.arquivos, "arquivo", "arquivos") },
            { chave: "tamanho", rotulo: "Tamanho", alinhar: "direita", render: (l) => tamanhoLegivel(l.tamanho) },
            { chave: "expira_em", rotulo: "Validade", tipo: "data", render: (l) => <span className="text-muted-foreground">{expiraEm(l.expira_em)}</span> },
            { chave: "acoes", rotulo: "Ações", ordenavel: false, filtravel: false, alinhar: "direita", valor: () => "",
              render: (l) => <button type="button" onClick={() => api.baixar("get", `/downloads/${l.id}/arquivo`, { nome: l.nome }).catch((e) => toast({ title: "Não foi possível baixar", description: e.message, variant: "destructive" }))} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted"><Download className="h-3.5 w-3.5" aria-hidden="true" /> Baixar</button> },
          ]}
        />
      )}
    </div>
  );
}

function AbaTipos({ ehAdmin, tipos }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const [novo, setNovo] = useState({ nome: "", orgao: "", alerta_dias: 30 });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["documentos", "tipos"] });
  const criar = useMutation({ mutationFn: () => api.post("/documentos/tipos", { ...novo, alerta_dias: Number(novo.alerta_dias) }), onSuccess: () => { setNovo({ nome: "", orgao: "", alerta_dias: 30 }); recarregar(); toast({ title: "Tipo criado" }); }, onError: (e) => toast({ title: "Não foi possível criar", description: e.message, variant: "destructive" }) });
  const apagar = useMutation({ mutationFn: (id) => api.delete(`/documentos/tipos/${id}`), onSuccess: recarregar });
  return (
    <div className="max-w-2xl space-y-3">
      {ehAdmin ? (
        <form onSubmit={(e) => { e.preventDefault(); if (novo.nome.trim()) criar.mutate(); }} className="grid gap-2 rounded-xl border border-border bg-card p-3 text-sm md:grid-cols-[1fr_1fr_120px_auto] md:items-end">
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Tipo de documento</span><input className={campo} value={novo.nome} maxLength={80} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: CAR, CCIR" /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Órgão expedidor</span><input className={campo} value={novo.orgao} maxLength={120} onChange={(e) => setNovo({ ...novo, orgao: e.target.value })} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">Avisar (dias antes)</span><input type="number" min={0} max={365} className={campo} value={novo.alerta_dias} onChange={(e) => setNovo({ ...novo, alerta_dias: e.target.value })} /></label>
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground">Criar</button>
        </form>
      ) : <p className="text-sm text-muted-foreground">Só administradores mudam os tipos de documento.</p>}
      <TabelaPadrao
        id="bpo-tipos-documento" ariaLabel="Tipos de documento" linhas={tipos} simples vazio="Nenhum tipo de documento."
        colunas={[
          { chave: "nome", rotulo: "Tipo de documento", render: (t) => <span className="font-medium">{t.nome}</span> },
          { chave: "orgao", rotulo: "Órgão expedidor", render: (t) => t.orgao || <span className="text-muted-foreground">—</span> },
          { chave: "alerta_dias", rotulo: "Aviso antes", tipo: "numero", alinhar: "direita", render: (t) => plural(t.alerta_dias, "dia", "dias") },
          ...(ehAdmin ? [{ chave: "acoes", rotulo: "Ações", ordenavel: false, filtravel: false, alinhar: "direita", valor: () => "",
            render: (t) => <button type="button" onClick={async () => { if (await confirmar({ titulo: `Apagar o tipo "${t.nome}"?`, descricao: "Os documentos desse tipo continuam, sem tipo.", rotulo: "Apagar" })) apagar.mutate(t.id); }} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label={`Apagar o tipo ${t.nome}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button> }] : []),
        ]}
      />
    </div>
  );
}

/** BPO Fiscal > Arquivos e documentos. */
export default function ArquivosPagina() {
  const { user } = useAuth();
  const { empresaId: emFoco } = useEmpresaEmFoco();
  const emp = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list() });
  const { data: pessoas = [] } = useQuery({ queryKey: ["pessoas-fisicas"], queryFn: () => api.get("/pessoas-fisicas") });
  const { data: tipos = [] } = useQuery({ queryKey: ["documentos", "tipos"], queryFn: () => api.get("/documentos/tipos") });
  const empresas = useMemo(() => [...(emp.data || [])].sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR")), [emp.data]);
  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "BPO Fiscal", to: "/area/bpo" }, { label: "Arquivos e documentos" }]} title="Arquivos e documentos" />
      <div className="px-6 lg:px-8 py-6">
        <Tabs defaultValue="documentos" className="space-y-4">
          <TabsList><TabsTrigger value="documentos">Documentos com validade</TabsTrigger><TabsTrigger value="arquivos">Arquivos</TabsTrigger><TabsTrigger value="downloads">Meus downloads</TabsTrigger><TabsTrigger value="tipos">Tipos de documento</TabsTrigger></TabsList>
          <TabsContent value="documentos"><AbaDocumentos empresas={empresas} pessoas={pessoas} tipos={tipos} /></TabsContent>
          <TabsContent value="arquivos"><AbaArquivos empresas={empresas} pessoas={pessoas} donoInicial={{ tipo: "empresa", id: emFoco || "" }} /></TabsContent>
          <TabsContent value="downloads"><AbaDownloads /></TabsContent>
          <TabsContent value="tipos"><AbaTipos ehAdmin={user?.role === "admin"} tipos={tipos} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export { AbaArquivos, AbaDocumentos, AbaDownloads, AbaTipos };
