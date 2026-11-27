import { useCatalogoConsultoria } from "@/components/clientes/ServicosConsultoria";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, BarChart3, Loader2, Pencil, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { porDataBase, rotuloPeriodo, tituloPeriodo, valorPeriodo } from "@/lib/dataBase";
import { useAuth } from "@/lib/AuthContext";
import { useConfirmar } from "@/components/ConfirmProvider";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import SolicitacoesConsultoria from "@/components/consultoria/SolicitacoesConsultoria";
import AnalisarComIa from "@/components/consultoria/AnalisarComIa";
import HomologacaoErp from "@/components/consultoria/HomologacaoErp";
import EscolhaDeEmpresas from "@/components/diagnostico/EscolhaDeEmpresas";
import { useCarteiras } from "@/lib/useCarteiras";
import { mascararDocumento, rotuloDoGrupo } from "@/lib/clientes";
import { CAMINHO_REPOSITORIO_XML } from "@/lib/bpoCaminhos";
import { fmtDataCurta } from "@/lib/servicos";
import { caminhoDaFerramenta, cobreGrupoInteiro, FERRAMENTAS, SITUACOES_PROJETO } from "@/lib/projetos";
import { plural } from "@/lib/plural";
import { trilhaDoProjeto } from "@/lib/trilhas";
import { useClienteDoProjeto } from "@/lib/useClienteDoProjeto";

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
  const catalogo = useCatalogoConsultoria(Boolean(p?.servico_consultoria));
  const pessoas = useQuery({ queryKey: ["pessoas-fisicas"], queryFn: () => api.get("/pessoas-fisicas"), enabled: Boolean(p?.pessoa_fisica_id) });
  const pessoa = pessoas.data?.find((c) => c.id === p?.pessoa_fisica_id);
  const servico = catalogo.data?.find((c) => c.id === p?.servico_consultoria);
  useEffect(() => { if (p && !editando) setRascunho({ nome: p.nome, escopo: p.escopo || "", prazo: dia(p.prazo), ...(p.servico_consultoria ? { periodo_inicio: dia(p.periodo_inicio), periodo_fim: dia(p.periodo_fim) } : {}), responsavel: p.responsavel || "", ...(!p.pessoa_fisica_id && (!p.servico_consultoria || p.empresa_ids.length > 1) ? { empresa_ids: p.empresa_ids } : {}) }); }, [p, editando]);

  const salvar = useMutation({
    mutationFn: (dados) => api.put(`/projetos-diagnostico/${id}`, dados),
    onSuccess: (novo) => { qc.setQueryData(["projetos-diagnostico", id], novo); qc.invalidateQueries({ queryKey: ["projetos-diagnostico"] }); qc.invalidateQueries({ queryKey: ["servicos-contratados"] }); setEditando(false); toast({ title: "Diagnóstico atualizado" }); },
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });
  const admin = user?.role === "admin";
  const pendente = Boolean(p?.exclusao_solicitada_em);
  const acaoExclusao = admin ? (pendente ? "Aprovar e excluir" : "Excluir projeto") : "Solicitar exclusão";
  const atualizarProjeto = (novo) => {
    qc.setQueryData(["projetos-diagnostico", id], novo);
    qc.invalidateQueries({ queryKey: ["projetos-diagnostico"] });
  };
  const exclusao = useMutation({
    mutationFn: (recusar) => {
      if (!recusar && admin && pendente) return api.post(`/projetos-diagnostico/${id}/solicitacao-exclusao/aprovar`, {});
      return api.delete(`/projetos-diagnostico/${id}${recusar ? "/solicitacao-exclusao" : ""}`);
    },
    onSuccess: (resposta, recusar) => {
      if (recusar || resposta.pendente) {
        atualizarProjeto(recusar ? resposta : resposta.projeto);
        toast({ title: recusar ? "Solicitação recusada" : "Solicitação enviada ao administrador" });
        return;
      }
      qc.invalidateQueries({ queryKey: ["projetos-diagnostico"] });
      navigate(p.servico_consultoria ? "/consultoria/projetos" : "/diagnostico");
    },
    onError: (e) => toast({ title: "Não foi possível concluir a ação", description: e.message, variant: "destructive" }),
  });
  const excluir = async () => {
    if (await confirmar({
      titulo: `${acaoExclusao}: ${p.nome}?`,
      descricao: admin ? "O projeto será excluído. Os trabalhos das empresas permanecem disponíveis." : "O projeto permanece ativo até um administrador autorizar a exclusão.",
      rotulo: acaoExclusao,
    })) exclusao.mutate(false);
  };

  const cliente = useClienteDoProjeto(p?.servico_consultoria ? p : null);
  const crumbs = trilhaDoProjeto({ projeto: p, cliente });
  if (projeto.isLoading || carregando) return <div><PageHeader crumbs={crumbs} title="Diagnóstico" /><p className="p-8 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…</p></div>;
  if (!p) return <div><PageHeader crumbs={crumbs} title="Diagnóstico não encontrado" /><p role="alert" className="p-8 text-sm">Este projeto não existe mais. <Link to="/diagnostico" className="text-primary hover:underline">Voltar aos diagnósticos</Link></p></div>;
  const daLista = p.empresa_ids.map((eid) => empresas.find((e) => e.id === eid)).filter(Boolean);
  const clientesDocumentos = p.pessoa_fisica_id ? (pessoa ? [{ id: pessoa.id, nome: pessoa.nome }] : []) : daLista.map((e) => ({ id: e.id, nome: e.razao_social }));
  const grupo = grupos.find((g) => g.numero === p.grupo_numero);
  const inteiro = cobreGrupoInteiro(p, empresas);

  return (
    <div>
      <PageHeader
        crumbs={crumbs}
        title={p.nome}
        subtitle={p.servico_consultoria ? `${clientesDocumentos.map((c) => c.nome).join(", ") || "Cliente do projeto"} · ${rotuloPeriodo(p, fmtDataCurta)}${p.responsavel ? ` · ${p.responsavel}` : ""}` : `${plural(daLista.length, "empresa", "empresas")}${grupo ? ` · ${rotuloDoGrupo(grupo)}${inteiro ? " (inteiro)" : " (parte)"}` : ""} · desde ${fmtDataCurta(p.inicio)}${p.prazo ? ` · prazo ${fmtDataCurta(p.prazo)}` : ""}`}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {servico && <button type="button" className="botao-acao rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground" onClick={() => setDocumentos(true)}>Documentos e solicitações</button>}
            <select aria-label="Situação do diagnóstico" value={p.situacao} onChange={(e) => salvar.mutate({ situacao: e.target.value })} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
              {Object.entries(SITUACOES_PROJETO).map(([k, s]) => <option key={k} value={k}>{servico && !servico.projeto && k === "EM_ANDAMENTO" ? "Em coleta de documentos" : s.rotulo}</option>)}
            </select>
            <button type="button" onClick={() => setEditando(true)} className="botao-acao inline-flex items-center gap-1.5 rounded-md px-3 py-[5px] text-sm hover:bg-muted"><Pencil className="h-4 w-4" aria-hidden="true" /> Editar escopo</button>
            {(admin || !pendente) && <button type="button" onClick={excluir} disabled={exclusao.isPending} className="botao-acao botao-acao-perigo inline-flex items-center gap-1.5 rounded-md px-3 py-[5px] text-sm text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" aria-hidden="true" /> {acaoExclusao}</button>}
          </div>
        )}
      />
      <div className="px-6 lg:px-8 py-5 space-y-4">
        {pendente && <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted p-3 text-sm" aria-label="Solicitação de exclusão">
          <p><strong>Exclusão aguardando autorização.</strong> Solicitada por {p.exclusao_solicitada_por} em {fmtDataCurta(p.exclusao_solicitada_em)}.</p>
          {admin && <button type="button" disabled={exclusao.isPending} className="botao-acao rounded-md bg-background px-3 py-[5px] hover:bg-muted" onClick={() => exclusao.mutate(true)}>Recusar exclusão</button>}
        </section>}
        {servico && <AnalisarComIa projetoId={p.id} servico={servico} />}
        {documentos && servico && <SolicitacoesConsultoria servico={servico}
          clientes={clientesDocumentos} deInicial={dia(p.periodo_inicio)} ateInicial={dia(p.periodo_fim)} aoFechar={() => setDocumentos(false)} />}
        {(catalogo.isError || pessoas.isError) && p.servico_consultoria && <p role="alert" className="text-sm">Não foi possível carregar os dados do serviço. Atualize para tentar novamente.</p>}
        {servico && !servico.projeto && <p className="rounded-md border bg-card p-3 text-sm">Coleta de documentos disponível. Roteiro fiscal em desenvolvimento.</p>}
        {p.servico_consultoria === "pj-homologacao" && <HomologacaoErp projetoId={p.id} />}
        {p.servico_consultoria === "saneamento-estoques" && <section className="space-y-2 rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Saneamento de estoques</h2>
          <p className="text-sm text-muted-foreground">{tituloPeriodo(p)}: {valorPeriodo(p, fmtDataCurta)}. Todas as etapas deste projeto, da importação dos arquivos à política de uso, ficam no Saneamento de estoques e cadastro de produtos.</p>
          <Link to={`/diagnostico/projetos/${p.id}/saneamento`} className="botao-acao inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Abrir o Saneamento de estoques e cadastro de produtos</Link>
        </section>}
        {p.servico_consultoria === "simulador-reforma" && <section className="space-y-2 rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Simulador da Reforma Tributária</h2>
          <p className="text-sm text-muted-foreground">{tituloPeriodo(p)}: {valorPeriodo(p, fmtDataCurta)}. Selecione a empresa nas ferramentas de simulação.</p>
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
            {rascunho.empresa_ids && <div className="space-y-1"><span className="block text-xs text-muted-foreground">Empresas</span><EscolhaDeEmpresas empresas={empresas} grupos={grupos} valor={rascunho.empresa_ids} aoMudar={(v) => setRascunho((r) => ({ ...r, empresa_ids: v }))} /></div>}
            <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Objetivo e escopo</span><textarea className={`${campo} min-h-[72px]`} value={rascunho.escopo} onChange={(e) => setRascunho((r) => ({ ...r, escopo: e.target.value }))} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              {p.servico_consultoria && (porDataBase(p.servico_consultoria) ? [["periodo_inicio", "Data-base"]] : [["periodo_inicio", "De"], ["periodo_fim", "Até"]]).map(([chave, rotulo]) => <label key={chave} className="block space-y-1"><span className="block text-xs text-muted-foreground">{rotulo}</span><input type="date" style={{ maxWidth: "11rem" }} className={campo} value={rascunho[chave]} onChange={(e) => setRascunho((r) => ({ ...r, [chave]: e.target.value, ...(porDataBase(p.servico_consultoria) ? { periodo_fim: e.target.value } : {}) }))} /></label>)}
              <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Prazo</span><input type="date" className={campo} value={rascunho.prazo} onChange={(e) => setRascunho((r) => ({ ...r, prazo: e.target.value }))} /></label>
              <label className="block space-y-1"><span className="block text-xs text-muted-foreground">Responsável</span><input className={campo} value={rascunho.responsavel} onChange={(e) => setRascunho((r) => ({ ...r, responsavel: e.target.value }))} /></label>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={salvar.isPending || rascunho.empresa_ids?.length === 0} onClick={() => salvar.mutate({ ...rascunho, prazo: rascunho.prazo || null })} className="botao-acao inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1 font-medium text-primary-foreground disabled:opacity-60">{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Salvar</button>
              <button type="button" onClick={() => setEditando(false)} className="botao-acao rounded-md px-3 py-[5px] hover:bg-muted">Cancelar</button>
            </div>
          </section>
        ) : (p.escopo || p.responsavel) && (
          <section className="rounded-xl border border-border bg-card p-4 text-sm space-y-1">
            {p.escopo && <p className="whitespace-pre-line">{p.escopo}</p>}
            {p.responsavel && <p className="text-xs text-muted-foreground">Responsável: {p.responsavel}</p>}
          </section>
        )}
        {!p.servico_consultoria && grupo && inteiro && (
          <Link to={`/cockpit?grupo=${encodeURIComponent(grupo.numero)}`} className="botao-acao inline-flex items-center gap-1.5 rounded-md bg-card px-3 py-[7px] text-sm"><BarChart3 className="h-4 w-4" aria-hidden="true" /> Painel executivo do grupo inteiro</Link>
        )}
        {!p.servico_consultoria && <div className="grid gap-3 xl:grid-cols-2">
          {daLista.map((e) => (
            <section key={e.id} className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label={e.razao_social}>
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1"><Link to={`/clientes/${e.id}`} className="font-semibold hover:text-primary hover:underline">{e.razao_social}</Link><p className="text-xs text-muted-foreground tabular-nums">{mascararDocumento(e.cnpj_cpf)} · {e.regime_atual || "regime não informado"}</p></div>
                <Link to={`/cockpit?grupo=${encodeURIComponent(e.grupo || "")}&empresa=${encodeURIComponent(e.id_empresa)}`} className="botao-acao inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-xs hover:bg-muted"><BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> Painel</Link>
                <Link to={`${CAMINHO_REPOSITORIO_XML}/${e.id}`} className="botao-acao inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-xs hover:bg-muted" title="Usar os XML já capturados no BPO"><Archive className="h-3.5 w-3.5" aria-hidden="true" /> XML do repositório</Link>
              </div>
              <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {FERRAMENTAS.map((f) => {
                  const to = caminhoDaFerramenta(e, grupos, f.caminho);
                  return <li key={f.id}>{to ? <Link to={to} className="block rounded-md border border-border px-2 py-1.5 text-xs hover:border-primary hover:bg-muted/40">{f.rotulo}</Link> : <span className="block rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground">{f.rotulo}</span>}</li>;
                })}
              </ul>
            </section>
          ))}
        </div>}
        {daLista.length < p.empresa_ids.length && <p className="text-xs text-muted-foreground">{plural(p.empresa_ids.length - daLista.length, "empresa do escopo foi excluída", "empresas do escopo foram excluídas")} do cadastro.</p>}
      </div>
    </div>
  );
}
