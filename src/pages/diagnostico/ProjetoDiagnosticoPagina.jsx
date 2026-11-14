import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, BarChart3, Loader2, Pencil, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { useConfirmar } from "@/components/ConfirmProvider";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import SolicitacoesConsultoria from "@/components/consultoria/SolicitacoesConsultoria";
import EscolhaDeEmpresas from "@/components/diagnostico/EscolhaDeEmpresas";
import { useCarteiras } from "@/lib/useCarteiras";
import { mascararDocumento, rotuloDoGrupo } from "@/lib/clientes";
import { CAMINHO_REPOSITORIO_XML } from "@/lib/bpoCaminhos";
import { fmtDataCurta } from "@/lib/servicos";
import { caminhoDaFerramenta, cobreGrupoInteiro, FERRAMENTAS, SITUACOES_PROJETO } from "@/lib/projetos";
import { plural } from "@/lib/plural";

const campo = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const dia = (v) => (v ? String(v).slice(0, 10) : "");

/** Diagnósticos > um projeto: o escopo, a situação, o prazo e, para cada empresa, as ferramentas do diagnóstico. */
export default function ProjetoDiagnosticoPagina() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const { user } = useAuth();
  const { empresas, grupos, carregando } = useCarteiras();
  const projeto = useQuery({ queryKey: ["projetos-diagnostico", id], queryFn: () => api.get(`/projetos-diagnostico/${id}`) });
  const [documentos, setDocumentos] = useState(false);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(null);
  const p = projeto.data;
  useEffect(() => { if (p && !editando) setRascunho({ nome: p.nome, escopo: p.escopo || "", prazo: dia(p.prazo), ...(p.servico_consultoria ? { periodo_inicio: dia(p.periodo_inicio), periodo_fim: dia(p.periodo_fim) } : {}), responsavel: p.responsavel || "", empresa_ids: p.empresa_ids }); }, [p, editando]);

  const salvar = useMutation({
    mutationFn: (dados) => api.put(`/projetos-diagnostico/${id}`, dados),
    onSuccess: (novo) => { qc.setQueryData(["projetos-diagnostico", id], novo); qc.invalidateQueries({ queryKey: ["projetos-diagnostico"] }); qc.invalidateQueries({ queryKey: ["servicos-contratados"] }); setEditando(false); toast({ title: "Diagnóstico atualizado" }); },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  const excluir = async () => {
    if (!(await confirmar({ titulo: `Excluir o projeto ${p.nome}?`, descricao: "O trabalho das empresas continua no lugar.", rotulo: "Excluir projeto" }))) return;
    try { await api.delete(`/projetos-diagnostico/${id}`); qc.invalidateQueries({ queryKey: ["projetos-diagnostico"] }); navigate("/diagnostico"); } catch (e) { toast({ title: "Não foi possível excluir", description: e.message, variant: "destructive" }); }
  };

  const crumbs = [{ label: "Início", to: "/inicio" }, { label: p?.servico_consultoria ? "Projetos de Consultoria" : "Diagnósticos", to: p?.servico_consultoria ? "/consultoria/projetos" : "/diagnostico" }, { label: p?.nome || "Projeto" }];
  if (projeto.isLoading || carregando) return <div><PageHeader crumbs={crumbs} title="Diagnóstico" /><p className="p-8 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p></div>;
  if (!p) return <div><PageHeader crumbs={crumbs} title="Diagnóstico não encontrado" /><p role="alert" className="p-8 text-sm">Este projeto não existe mais. <Link to="/diagnostico" className="text-primary hover:underline">Voltar aos diagnósticos</Link></p></div>;
  const daLista = p.empresa_ids.map((eid) => empresas.find((e) => e.id === eid)).filter(Boolean);
  const grupo = grupos.find((g) => g.numero === p.grupo_numero);
  const inteiro = cobreGrupoInteiro(p, empresas);

  return (
    <div>
      <PageHeader
        crumbs={crumbs}
        title={p.nome}
        subtitle={`${plural(daLista.length, "empresa", "empresas")}${grupo ? ` · ${rotuloDoGrupo(grupo)}${inteiro ? " (inteiro)" : " (parte)"}` : ""} · desde ${fmtDataCurta(p.inicio)}${p.prazo ? ` · prazo ${fmtDataCurta(p.prazo)}` : ""}`}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Situação do diagnóstico" value={p.situacao} onChange={(e) => salvar.mutate({ situacao: e.target.value })} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
              {Object.entries(SITUACOES_PROJETO).map(([k, s]) => <option key={k} value={k}>{s.rotulo}</option>)}
            </select>
            <button type="button" onClick={() => setEditando(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"><Pencil className="h-4 w-4" aria-hidden="true" /> Editar escopo</button>
            {user?.role === "admin" && <button type="button" onClick={excluir} className="rounded-md border border-destructive/50 p-1.5 text-destructive hover:bg-destructive/10" aria-label="Excluir projeto" title="Excluir projeto"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
          </div>
        )}
      />
      <div className="px-6 lg:px-8 py-5 space-y-4">
        {p.servico_consultoria === "simulador-reforma" && <section className="space-y-2 rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Simulador da Reforma Tributária</h2>
          <p className="text-sm text-muted-foreground">Período do projeto: {fmtDataCurta(p.periodo_inicio)} a {fmtDataCurta(p.periodo_fim)}. Selecione a empresa nas ferramentas de simulação.</p>
          <button className="text-sm text-primary hover:underline" onClick={() => setDocumentos(true)}>Documentos e solicitações</button>
          {documentos && <SolicitacoesConsultoria servico={{ id: p.servico_consultoria, nome: "Simulador da Reforma Tributária" }}
            clientes={daLista.map((e) => ({ id: e.id, nome: e.razao_social }))} deInicial={dia(p.periodo_inicio)} ateInicial={dia(p.periodo_fim)} aoFechar={() => setDocumentos(false)} />}
          <div className="flex flex-wrap gap-4 text-sm text-primary">
            <Link to="/cockpit">Painel Executivo</Link>
            <Link to="/reforma/regimes">Comparação de regimes na transição</Link>
            <Link to="/cenarios">Cenários e alíquotas</Link>
            <Link to="/transicao">Transição 2026–2033</Link>
          </div>
        </section>}
        {editando && rascunho ? (
          <section className="rounded-xl border border-primary/40 bg-card p-4 space-y-3 text-sm" aria-label="Editar escopo">
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Nome</span><input className={campo} value={rascunho.nome} onChange={(e) => setRascunho((r) => ({ ...r, nome: e.target.value }))} /></label>
            <div className="space-y-1"><span className="block text-xs text-muted-foreground">Empresas</span><EscolhaDeEmpresas empresas={empresas} grupos={grupos} valor={rascunho.empresa_ids} aoMudar={(v) => setRascunho((r) => ({ ...r, empresa_ids: v }))} /></div>
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Objetivo e escopo</span><textarea className={`${campo} min-h-[72px]`} value={rascunho.escopo} onChange={(e) => setRascunho((r) => ({ ...r, escopo: e.target.value }))} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              {p.servico_consultoria && [["periodo_inicio", "De"], ["periodo_fim", "Até"]].map(([chave, rotulo]) => <label key={chave} className="block space-y-1"><span className="block text-xs text-muted-foreground">{rotulo}</span><input type="date" className={campo} value={rascunho[chave]} onChange={(e) => setRascunho((r) => ({ ...r, [chave]: e.target.value }))} /></label>)}
              <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Prazo</span><input type="date" className={campo} value={rascunho.prazo} onChange={(e) => setRascunho((r) => ({ ...r, prazo: e.target.value }))} /></label>
              <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Responsável</span><input className={campo} value={rascunho.responsavel} onChange={(e) => setRascunho((r) => ({ ...r, responsavel: e.target.value }))} /></label>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={salvar.isPending || !rascunho.empresa_ids.length} onClick={() => salvar.mutate({ ...rascunho, prazo: rascunho.prazo || null })} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar</button>
              <button type="button" onClick={() => setEditando(false)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">Cancelar</button>
            </div>
          </section>
        ) : (p.escopo || p.responsavel) && (
          <section className="rounded-xl border border-border bg-card p-4 text-sm space-y-1">
            {p.escopo && <p className="whitespace-pre-line">{p.escopo}</p>}
            {p.responsavel && <p className="text-xs text-muted-foreground">Responsável: {p.responsavel}</p>}
          </section>
        )}
        {grupo && inteiro && (
          <Link to={`/cockpit?grupo=${encodeURIComponent(grupo.numero)}`} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-primary"><BarChart3 className="h-4 w-4" aria-hidden="true" /> Painel executivo do grupo inteiro</Link>
        )}
        <div className="grid gap-3 xl:grid-cols-2">
          {daLista.map((e) => (
            <section key={e.id} className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label={e.razao_social}>
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1"><Link to={`/clientes/${e.id}`} className="font-semibold hover:text-primary hover:underline">{e.razao_social}</Link><p className="text-xs text-muted-foreground tabular-nums">{mascararDocumento(e.cnpj_cpf)} · {e.regime_atual || "regime não informado"}</p></div>
                <Link to={`/cockpit?grupo=${encodeURIComponent(e.grupo || "")}&empresa=${encodeURIComponent(e.id_empresa)}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"><BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> Painel</Link>
                <Link to={`${CAMINHO_REPOSITORIO_XML}/${e.id}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted" title="Usar os XML já capturados no BPO"><Archive className="h-3.5 w-3.5" aria-hidden="true" /> XML do repositório</Link>
              </div>
              <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {FERRAMENTAS.map((f) => {
                  const to = caminhoDaFerramenta(e, grupos, f.caminho);
                  return <li key={f.id}>{to ? <Link to={to} className="block rounded-md border border-border px-2 py-1.5 text-xs hover:border-primary hover:bg-muted/40">{f.rotulo}</Link> : <span className="block rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground">{f.rotulo}</span>}</li>;
                })}
              </ul>
            </section>
          ))}
        </div>
        {daLista.length < p.empresa_ids.length && <p className="text-xs text-muted-foreground">{plural(p.empresa_ids.length - daLista.length, "empresa do escopo foi excluída", "empresas do escopo foram excluídas")} do cadastro.</p>}
      </div>
    </div>
  );
}
