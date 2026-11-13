import { useMemo, useState } from "react";
import TabelaPadrao from "@/components/TabelaPadrao";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileDown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { useConfirmar } from "@/components/ConfirmProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import EditorProposta from "@/components/propostas/EditorProposta";
import { baixarPdfDaProposta } from "@/lib/propostaPdf";
import { brl, COMPLEXIDADES, MODULOS_HONORARIO, REGIMES_HONORARIO, SERVICOS, STATUS, TOM_DO_STATUS } from "@/lib/propostas";

const campo = "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function AbaPropostas({ usuario, empresas }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const [filtro, setFiltro] = useState({ status: "", busca: "" });
  const [editor, setEditor] = useState(null);
  const { data = [], isLoading, error } = useQuery({ queryKey: ["propostas", "lista"], queryFn: () => api.get("/propostas") });
  const lista = useMemo(() => data.filter((p) => (!filtro.status || p.status === filtro.status) && (!filtro.busca || semAcento(p.cliente_nome).includes(semAcento(filtro.busca)) || String(p.numero) === filtro.busca.trim())), [data, filtro]);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["propostas"] });
  const falha = (t) => (e) => toast({ title: t, description: e.message, variant: "destructive" });
  const status = useMutation({
    mutationFn: ({ id, s }) => api.post(`/propostas/${id}/status`, { status: s }),
    onSuccess: (r) => { recarregar(); toast({ title: `Proposta ${STATUS[r.status].toLowerCase()}`, description: r.servico_ativado ? `O serviço contratado (${SERVICOS[r.servico_ativado]}) da empresa foi marcado como ativo.` : undefined }); if (r.servico_ativado) qc.invalidateQueries({ queryKey: ["servicos-contratados"] }); },
    onError: falha("Não foi possível mudar a situação"),
  });
  const duplicar = useMutation({ mutationFn: (id) => api.post(`/propostas/${id}/duplicar`, {}), onSuccess: () => { recarregar(); toast({ title: "Proposta duplicada", description: "A cópia está como rascunho." }); }, onError: falha("Não foi possível duplicar") });
  const excluir = useMutation({ mutationFn: (id) => api.delete(`/propostas/${id}`), onSuccess: () => { recarregar(); toast({ title: "Proposta excluída" }); }, onError: falha("Não foi possível excluir") });
  const pdf = async (p) => { try { await baixarPdfDaProposta(p); } catch (e) { toast({ title: "Não foi possível gerar o PDF", description: e.message, variant: "destructive" }); } };
  const aceitar = async (p) => {
    const extra = p.empresa_id && p.servico !== "OUTRO" ? ` O serviço contratado (${SERVICOS[p.servico]}) da empresa passa a ativo.` : "";
    if (await confirmar({ titulo: `Marcar a proposta nº ${p.numero} como aceita?`, descricao: `Depois de aceita ela não muda mais (dá para duplicar).${extra}`, rotulo: "Aceita", perigoso: false })) status.mutate({ id: p.id, s: "ACEITA" });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1 flex-1 min-w-[200px]"><span className="block text-xs text-muted-foreground">Buscar (cliente ou número)</span><input type="search" className={`${campo} w-full`} value={filtro.busca} onChange={(e) => setFiltro((f) => ({ ...f, busca: e.target.value }))} /></label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">Situação</span><select className={campo} value={filtro.status} onChange={(e) => setFiltro((f) => ({ ...f, status: e.target.value }))}><option value="">Todas</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <button type="button" onClick={() => setEditor({ proposta: null })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Nova proposta</button>
      </div>
      {isLoading && <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
      {error && <p className="py-8 text-center text-sm" role="alert">Não foi possível carregar as propostas.</p>}
      {!isLoading && !error && (
        <TabelaPadrao
          id="propostas-lista" ariaLabel="Propostas" titulo="Propostas" linhas={lista} ordemInicial={{ chave: "numero", dir: -1 }}
          vazio={data.length ? "Nenhuma proposta com esses filtros." : "Nenhuma proposta ainda. Crie a primeira; a calculadora sugere o honorário do BPO."}
          colunas={[
            { chave: "numero", rotulo: "Nº", tipo: "numero", alinhar: "direita" },
            { chave: "cliente_nome", rotulo: "Cliente", render: (p) => <span className="font-medium">{p.cliente_nome}</span> },
            { chave: "createdAt", rotulo: "Criada em", tipo: "data" },
            { chave: "validade", rotulo: "Válida até", tipo: "data", valor: (p) => (p.validade ? String(p.validade).slice(0, 10) : ""), render: (p) => (p.validade ? new Date(p.validade).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : <span className="text-muted-foreground">—</span>) },
            { chave: "servico", rotulo: "Serviço", valor: (p) => SERVICOS[p.servico] || p.servico },
            { chave: "honorario_mensal", rotulo: "Mensal", tipo: "moeda", alinhar: "direita", valor: (p) => p.honorario_mensal || "", render: (p) => (p.honorario_mensal ? brl(p.honorario_mensal) : "—") },
            { chave: "valor_total", rotulo: "Único", tipo: "moeda", alinhar: "direita", valor: (p) => p.valor_total || "", render: (p) => (p.valor_total ? brl(p.valor_total) : "—") },
            { chave: "status", rotulo: "Situação", valor: (p) => STATUS[p.status], render: (p) => <span className={`inline-block rounded px-1.5 text-[11px] leading-4 ${TOM_DO_STATUS[p.status]}`}>{STATUS[p.status]}</span> },
            { chave: "mudar", rotulo: "Marcar como", ordenavel: false, filtravel: false, valor: () => "",
              render: (p) => (p.status === "ACEITA" ? <span className="text-muted-foreground">—</span> : (
                <span className="inline-flex gap-1.5 text-[11px]">
                  {p.status === "RASCUNHO" && <button type="button" onClick={() => status.mutate({ id: p.id, s: "ENVIADA" })} className="text-primary hover:underline">enviada</button>}
                  <button type="button" onClick={() => aceitar(p)} className="text-emerald-700 hover:underline dark:text-emerald-400">aceita</button>
                  {p.status !== "RECUSADA" && <button type="button" onClick={() => status.mutate({ id: p.id, s: "RECUSADA" })} className="text-red-700 hover:underline dark:text-red-400">recusada</button>}
                </span>
              )) },
            { chave: "acoes", rotulo: "Ações", ordenavel: false, filtravel: false, alinhar: "direita", valor: () => "",
              render: (p) => (
                <div className="flex items-center justify-end gap-0.5">
                  <button type="button" onClick={() => pdf(p)} className="rounded p-1 hover:bg-muted" aria-label={`Baixar o PDF da proposta ${p.numero}`} title="PDF"><FileDown className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  {p.status !== "ACEITA" && <button type="button" onClick={() => setEditor({ proposta: p })} className="rounded p-1 hover:bg-muted" aria-label={`Editar a proposta ${p.numero}`} title="Editar"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                  <button type="button" onClick={() => duplicar.mutate(p.id)} className="rounded p-1 hover:bg-muted" aria-label={`Duplicar a proposta ${p.numero}`} title="Duplicar"><Copy className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  {p.status !== "ACEITA" && (p.criado_por === usuario?.id || usuario?.role === "admin") && <button type="button" onClick={async () => { if (await confirmar({ titulo: `Excluir a proposta nº ${p.numero}?`, descricao: p.cliente_nome, rotulo: "Excluir" })) excluir.mutate(p.id); }} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label={`Excluir a proposta ${p.numero}`} title="Excluir"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                </div>
              ) },
          ]}
        />
      )}
      {editor && <EditorProposta key={editor.proposta?.id || "nova"} proposta={editor.proposta} empresas={empresas} aoFechar={() => setEditor(null)} />}
    </div>
  );
}

export function AbaModelos({ ehAdmin }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const { data: modelos = [] } = useQuery({ queryKey: ["propostas", "modelos"], queryFn: () => api.get("/propostas/modelos") });
  const vazio = { nome: "", servico: "BPO_FISCAL", escopo: "", condicoes: "", itens: [{ descricao: "Honorário mensal do BPO fiscal", quantidade: 1, valor_unitario: 0, recorrente: true }] };
  const [f, setF] = useState(null);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["propostas", "modelos"] });
  const salvar = useMutation({
    mutationFn: () => (f.id ? api.put(`/propostas/modelos/${f.id}`, f) : api.post("/propostas/modelos", f)),
    onSuccess: () => { setF(null); recarregar(); toast({ title: "Modelo salvo" }); },
    onError: (e) => toast({ title: "Não foi possível salvar o modelo", description: e.message, variant: "destructive" }),
  });
  const apagar = useMutation({ mutationFn: (id) => api.delete(`/propostas/modelos/${id}`), onSuccess: () => { recarregar(); toast({ title: "Modelo apagado" }); } });
  return (
    <div className="max-w-3xl space-y-3">
      {!ehAdmin && <p className="text-sm text-muted-foreground">Só administradores mudam modelos.</p>}
      {ehAdmin && !f && <button type="button" onClick={() => setF(vazio)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" aria-hidden="true" /> Novo modelo</button>}
      {f && (
        <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }} className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Nome</span><input className={`${campo} w-full`} value={f.nome} maxLength={120} onChange={(e) => setF({ ...f, nome: e.target.value })} required /></label>
            <label className="space-y-1"><span className="block text-xs text-muted-foreground">Serviço</span><select className={`${campo} w-full`} value={f.servico} onChange={(e) => setF({ ...f, servico: e.target.value })}>{Object.entries(SERVICOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Escopo</span><textarea className={`${campo} w-full min-h-[80px]`} value={f.escopo || ""} onChange={(e) => setF({ ...f, escopo: e.target.value })} /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Condições</span><textarea className={`${campo} w-full min-h-[56px]`} value={f.condicoes || ""} onChange={(e) => setF({ ...f, condicoes: e.target.value })} /></label>
          <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Item principal (descrição)</span><input className={`${campo} w-full`} value={f.itens[0]?.descricao || ""} onChange={(e) => setF({ ...f, itens: [{ ...f.itens[0], descricao: e.target.value }, ...f.itens.slice(1)] })} /></label>
          <div className="flex gap-2"><button type="submit" disabled={salvar.isPending} className="rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground">Salvar</button><button type="button" onClick={() => setF(null)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button></div>
        </form>
      )}
      <TabelaPadrao
        id="propostas-modelos" ariaLabel="Modelos de proposta" linhas={modelos} vazio="Nenhum modelo ainda." simples
        colunas={[
          { chave: "nome", rotulo: "Modelo", render: (m) => <span className="font-medium">{m.nome}</span> },
          { chave: "servico", rotulo: "Serviço", valor: (m) => SERVICOS[m.servico] || m.servico },
          ...(ehAdmin ? [{ chave: "acoes", rotulo: "Ações", ordenavel: false, filtravel: false, alinhar: "direita", valor: () => "",
            render: (m) => (
              <>
                <button type="button" onClick={() => setF({ ...m })} className="rounded p-1 hover:bg-muted" aria-label={`Editar o modelo ${m.nome}`}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
                <button type="button" onClick={async () => { if (await confirmar({ titulo: `Apagar o modelo "${m.nome}"?`, descricao: "As propostas feitas com ele continuam.", rotulo: "Apagar" })) apagar.mutate(m.id); }} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label={`Apagar o modelo ${m.nome}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </>
            ) }] : []),
        ]}
      />
    </div>
  );
}

function CampoDaTabela({ rotulo, grupo, chave, passo = 1, atual, mudar, ehAdmin }) {
  return (
    <label className="space-y-1"><span className="block text-xs text-muted-foreground">{rotulo}</span><input type="number" min={0} step={passo} disabled={!ehAdmin} className={`${campo} w-full`} value={chave ? atual[grupo][chave] : atual[grupo]} onChange={(e) => mudar(grupo, chave, e.target.value)} /></label>
  );
}

export function AbaTabela({ ehAdmin }) {
  const qc = useQueryClient();
  const { data: tabela } = useQuery({ queryKey: ["propostas", "tabela"], queryFn: () => api.get("/propostas/tabela") });
  const [t, setT] = useState(null);
  const atual = t || tabela;
  const salvar = useMutation({ mutationFn: () => api.put("/propostas/tabela", atual), onSuccess: () => { setT(null); qc.invalidateQueries({ queryKey: ["propostas", "tabela"] }); toast({ title: "Tabela de honorários salva" }); }, onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }) });
  if (!atual) return <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p>;
  const mudar = (grupo, chave, v) => setT({ ...atual, ...(chave ? { [grupo]: { ...atual[grupo], [chave]: Number(v) } } : { [grupo]: Number(v) }) });
  return (
    <div className="max-w-3xl space-y-3 text-sm">
      {atual.exemplo && <p role="status" className="rounded-md border border-amber-400/60 bg-card p-3 text-xs">Valores de exemplo: ajuste e salve.</p>}
      {!ehAdmin && <p className="text-xs text-muted-foreground">Só administradores mudam a tabela.</p>}
      <fieldset className="grid gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-4"><legend className="px-1 text-xs font-medium">Base mensal por regime (R$)</legend>{REGIMES_HONORARIO.map((r) => <CampoDaTabela atual={atual} mudar={mudar} ehAdmin={ehAdmin} key={r} rotulo={r} grupo="base" chave={r} passo={50} />)}</fieldset>
      <fieldset className="grid gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-4"><legend className="px-1 text-xs font-medium">Volume e estrutura</legend>
        <CampoDaTabela atual={atual} mudar={mudar} ehAdmin={ehAdmin} rotulo="Franquia de notas por mês" grupo="franquia_notas" /><CampoDaTabela atual={atual} mudar={mudar} ehAdmin={ehAdmin} rotulo="Por nota acima da franquia (R$)" grupo="por_nota" passo={0.1} /><CampoDaTabela atual={atual} mudar={mudar} ehAdmin={ehAdmin} rotulo="Por estabelecimento a mais (R$)" grupo="por_estabelecimento" passo={50} /><CampoDaTabela atual={atual} mudar={mudar} ehAdmin={ehAdmin} rotulo="Hora do diagnóstico (R$)" grupo="valor_hora" passo={10} />
      </fieldset>
      <fieldset className="grid gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-5"><legend className="px-1 text-xs font-medium">Por módulo do BPO (R$/mês)</legend>{Object.entries(MODULOS_HONORARIO).map(([k, v]) => <CampoDaTabela atual={atual} mudar={mudar} ehAdmin={ehAdmin} key={k} rotulo={v} grupo="modulos" chave={k} passo={50} />)}</fieldset>
      <fieldset className="grid gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-3"><legend className="px-1 text-xs font-medium">Multiplicador pela complexidade</legend>{Object.entries(COMPLEXIDADES).map(([k, v]) => <CampoDaTabela atual={atual} mudar={mudar} ehAdmin={ehAdmin} key={k} rotulo={v} grupo="complexidade" chave={k} passo={0.05} />)}</fieldset>
      {ehAdmin && <button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending} className="rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">Salvar a tabela</button>}
    </div>
  );
}

/** Comercial > Propostas e honorários. */
export default function PropostasPagina() {
  const { user } = useAuth();
  const emp = useQuery({ queryKey: ["empresas", "carteiras"], queryFn: () => api.entities.Empresa.list() });
  const empresas = useMemo(() => [...(emp.data || [])].sort((a, b) => a.razao_social.localeCompare(b.razao_social, "pt-BR")), [emp.data]);
  const ehAdmin = user?.role === "admin";
  return (
    <div>
      <PageHeader crumbs={[{ label: "Início", to: "/inicio" }, { label: "Comercial", to: "/area/comercial" }, { label: "Propostas e honorários" }]} title="Propostas e honorários" />
      <div className="px-6 lg:px-8 py-6">
        <Tabs defaultValue="propostas" className="space-y-4">
          <TabsList><TabsTrigger value="propostas">Propostas</TabsTrigger><TabsTrigger value="modelos">Modelos</TabsTrigger><TabsTrigger value="tabela">Tabela de honorários</TabsTrigger></TabsList>
          <TabsContent value="propostas"><AbaPropostas usuario={user} empresas={empresas} /></TabsContent>
          <TabsContent value="modelos"><AbaModelos ehAdmin={ehAdmin} /></TabsContent>
          <TabsContent value="tabela"><AbaTabela ehAdmin={ehAdmin} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
